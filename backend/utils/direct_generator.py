"""
Direct Generator - Generate images using diffusers directly
Fallback when ComfyUI is not available
"""

import logging
import os
import weakref
try:
    import torch
except ImportError:  # torch is optional and absent in the lightweight CI/test env
    torch = None
from typing import Optional, Callable, Dict, Any, List
from pathlib import Path
from PIL import Image, ImageOps
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack

# These imports will fail if torch/diffusers not installed
# The app should handle this gracefully
try:
    import diffusers
    from diffusers import (
        DPMSolverMultistepScheduler,
        EulerDiscreteScheduler,
        EulerAncestralDiscreteScheduler,
        DDIMScheduler,
        UniPCMultistepScheduler,
    )
    DIFFUSERS_AVAILABLE = True
except ImportError as e:
    diffusers = None  # type: ignore[assignment]
    DIFFUSERS_AVAILABLE = False
    logging.getLogger(__name__).warning(
        "diffusers import failed: %s. Direct image generation disabled.", e)

# M9 acceleration seam (import-safe: accelerator imports no torch at module load).
from foundry.accelerator import DEFAULT_ACCELERATION_SETTINGS, accelerate_pipeline
from foundry.lora import loras_applied
from utils.device import free_accelerator_memory, is_out_of_memory, resolve_device
from utils.gpu_gate import gpu_work
from utils.job_manager import GenerationCancelled
from utils.pipeline_cache import register_pipeline_owner, release_other_pipeline_caches

# #34 guided passes (all modules import with no torch/diffusers).
from guided.controlnet_registry import resolve_controlnet_stack
from guided.ip_adapter import (
    LOADER_FLUX as IP_LOADER_FLUX,
    ip_adapter_applied,
    ip_adapter_mask_tensor,
    resolve_ip_reference_stack,
)
from guided.masks import mask_coverage, rasterize_mask
from guided.outpaint import expand_canvas
from guided.passes import GuidedValidationError, resolve_guided_pass
from guided.pipelines import (
    combine_controlnets,
    controlnets_attached,
    derive_variant,
    filter_call_kwargs,
)
from guided.preprocessors import produce_control_image

# #33 live step preview (imports no torch/diffusers at module load).
from preview.step_preview import step_preview_service

logger = logging.getLogger(__name__)


class ModelLoadRefusedError(RuntimeError):
    """The runtime plan refused to load this model (security or capability).

    The generation request itself was fine - the model cannot be loaded as
    asked (409-style). Carries the plan's refusal string verbatim; refusal
    messages never contain filesystem paths or tokens.
    """


def resolve_plan(model_id: str, overrides: Optional[Dict[str, Any]] = None):
    """Resolve the runtime plan for model_id on THIS machine (lazy imports
    avoid the main<->generator circular import). overrides may carry
    precision/offload/vae_tiling from the request's advanced settings -
    applied AFTER resolution; security refusals are NEVER overridable.

    Module-level so tests patch ONE seam: ``utils.direct_generator.resolve_plan``.

    Besides the wire-format RuntimePlan fields, the returned plan carries
    loader-facing source attributes derived from the registry record (these
    never travel over the API):

    - ``load_source``      local diffusers snapshot dir or the record's repo_id
    - ``checkpoint_path``  local .safetensors checkpoint (single-file plans)
    - ``config_repo_id``   repo_id of ``plan.config_catalog_id`` - the pinned
                           ``config=`` for from_single_file, never key-sniffed
    - ``adapter_repo_id``  the record's aux repo (AnimateDiff motion adapter)
    """
    from main import MODELS_DIR, consent_store, model_registry, probe_hardware
    from foundry.runtime_resolver import resolve_model_runtime

    record = model_registry.get_record(model_id)
    if record is None:
        raise ModelLoadRefusedError(f"Model '{model_id}' is not in the library")
    profile = probe_hardware(MODELS_DIR)
    plan = resolve_model_runtime(record, profile, consent_store.get(model_id))
    # Loader-facing attribute (never serialized) so the M9 accel layer can
    # resolve without re-probing - mirrors load_source/checkpoint_path below.
    plan.hardware_profile = profile
    if overrides and not plan.refusal:
        for key in ("precision", "offload", "vae_tiling"):
            value = overrides.get(key)
            if value is not None:
                setattr(plan, key, value)

    locations = record.get("locations") or []
    plan.checkpoint_path = next(
        (loc for loc in locations if os.path.isfile(loc) and loc.endswith(".safetensors")),
        None,
    )
    plan.load_source = next(
        (loc for loc in locations if os.path.isdir(loc)), None
    ) or record.get("repo_id")
    plan.config_repo_id = None
    if plan.config_catalog_id:
        config_record = model_registry.get_record(plan.config_catalog_id)
        plan.config_repo_id = (config_record or {}).get("repo_id")
    plan.adapter_repo_id = record.get("aux_repo_id")
    return plan


def _resolve_lora_record(model_id: str):
    """Registry record for an installed LoRA id (lazy main import, like resolve_plan)."""
    from main import model_registry
    return model_registry.get_record(model_id)


def _resolve_record(model_id: str):
    """Registry record for any installed model id (lazy main import)."""
    from main import model_registry
    return model_registry.get_record(model_id)


# plan.precision -> torch dtype. Anything else is a plan bug we refuse loudly.
def dtype_for_precision(precision) -> Any:
    dtype = {
        "bf16": torch.bfloat16,
        "fp16": torch.float16,
        "fp32": torch.float32,
    }.get(precision)
    if dtype is None:
        raise ModelLoadRefusedError(f"unsupported precision '{precision}' in runtime plan")
    return dtype


def pipeline_class_for(plan) -> Any:
    """Resolve plan.pipeline_class on the diffusers module - never name-sniffed."""
    pipeline_cls = getattr(diffusers, str(plan.pipeline_class), None)
    if pipeline_cls is None:
        raise ModelLoadRefusedError(
            f"pipeline class '{plan.pipeline_class}' is not available in this diffusers build"
        )
    return pipeline_cls


class UnknownSchedulerError(ValueError):
    """The requested sampler name is not one this backend can build.

    A request-validation error (422), never a silent fallback: an unknown
    name used to fall through to Euler Ancestral and produce a different
    image than the one the user asked for.
    """


# Sampler name (normalized: stripped, lower-case) -> (diffusers scheduler
# class name, constructor overrides). Karras sigmas and the SDE solver are
# constructor arguments - setting the config field after construction leaves
# the already-built sigma schedule untouched. "DPM++ SDE" is the SDE variant
# of the multistep solver (algorithm_type="sde-dpmsolver++"), which needs no
# torchsde, unlike DPMSolverSDEScheduler.
_SCHEDULER_SPECS: Dict[str, Any] = {
    "euler": ("EulerDiscreteScheduler", {}),
    "euler a": ("EulerAncestralDiscreteScheduler", {}),
    "euler_a": ("EulerAncestralDiscreteScheduler", {}),
    "euler ancestral": ("EulerAncestralDiscreteScheduler", {}),
    "dpm++ 2m": ("DPMSolverMultistepScheduler", {}),
    "dpm++ 2m karras": ("DPMSolverMultistepScheduler", {"use_karras_sigmas": True}),
    "dpm++ sde": ("DPMSolverMultistepScheduler", {"algorithm_type": "sde-dpmsolver++"}),
    "dpm++ sde karras": (
        "DPMSolverMultistepScheduler",
        {"algorithm_type": "sde-dpmsolver++", "use_karras_sigmas": True},
    ),
    "ddim": ("DDIMScheduler", {}),
    "unipc": ("UniPCMultistepScheduler", {}),
}

#: Every accepted sampler name, normalized (strip + lower-case). The request
#: schema validates against this set so an unknown name is a 422 up front.
SUPPORTED_SCHEDULERS = frozenset(_SCHEDULER_SPECS)


def normalize_scheduler_name(name: Any) -> str:
    return str(name or "").strip().lower()


def is_supported_scheduler(name: Any) -> bool:
    return normalize_scheduler_name(name) in SUPPORTED_SCHEDULERS


def scheduler_spec(name: Any):
    """(diffusers class name, constructor overrides) or UnknownSchedulerError."""
    spec = _SCHEDULER_SPECS.get(normalize_scheduler_name(name))
    if spec is None:
        raise UnknownSchedulerError(
            f"Unknown scheduler '{name}'. Choose one of: Euler, Euler a, DPM++ 2M, "
            "DPM++ 2M Karras, DPM++ SDE, DPM++ SDE Karras, DDIM, UniPC."
        )
    class_name, overrides = spec
    return class_name, dict(overrides)


def _acceleration_payload(applied) -> Optional[Dict[str, Any]]:
    """AppliedAcceleration -> JSON-safe dict for the job result, or None."""
    if applied is None:
        return None
    return {
        "applied": list(applied.applied),
        "skipped": list(applied.skipped),
        "fell_back": list(applied.fell_back),
    }


def apply_fallback_rung(plan, rung: str) -> bool:
    """Apply one OOM-recovery rung onto the plan (spec 6.6).

    Returns True when the rung requests max attention slicing (applied
    post-load rather than on the plan itself).
    """
    if rung == "precision:fp16":
        plan.precision = "fp16"
    elif rung == "offload:cpu":
        plan.offload = True
    elif rung == "vae:tiling":
        plan.vae_tiling = True
    elif rung == "attention:slicing-max":
        return True
    return False


class DirectGenerator:
    """Direct image generation using diffusers"""
    
    def __init__(self, models_dir: str, output_dir: str):
        self.models_dir = models_dir
        self.output_dir = output_dir
        self.pipelines: Dict[str, Any] = {}
        self.applied_acceleration: Dict[str, Any] = {}
        # Acceleration settings the cached pipeline was built with, per model.
        # A changed request must evict+rebuild (in-place accel is irreversible).
        self._loaded_acceleration: Dict[str, Any] = {}
        # Scheduler config each cached pipeline was loaded with; weak keys so
        # an unloaded pipeline's entry goes with it.
        self._scheduler_origins: "weakref.WeakKeyDictionary[Any, Any]" = weakref.WeakKeyDictionary()
        self.device = resolve_device(torch)
        self.executor = ThreadPoolExecutor(max_workers=1)

        from foundry.accelerator import configure_inductor_cache
        configure_inductor_cache(os.path.join(models_dir, ".cache", "inductor"))

        if not DIFFUSERS_AVAILABLE:
            raise RuntimeError("diffusers library not available")

        # The video generator releases this cache before it loads (and this
        # one releases the video cache) - see utils.pipeline_cache.
        register_pipeline_owner("image", self.unload_all)

        if self.device == "cuda":
            logger.info(
                "DirectGenerator using device: cuda (%s, %.1f GB VRAM)",
                torch.cuda.get_device_name(0),
                torch.cuda.get_device_properties(0).total_memory / 1e9,
            )
        elif self.device == "mps":
            logger.info(
                "DirectGenerator using device: mps (Apple Silicon, %.1f GB unified memory budget)",
                torch.mps.recommended_max_memory() / 1e9,
            )
        else:
            logger.info("DirectGenerator using device: %s", self.device)

    def _evict_for_load(self) -> None:
        """Free accelerator memory before a new pipeline is measured and loaded.

        Drops this generator's resident pipeline, asks every other registered
        cache (the video generator, guided-pass and edit-tool model caches)
        to release, then collects garbage and empties the allocator cache -
        in that order, so the VRAM probe that follows sees the memory the old
        pipeline actually gave back.
        """
        self.unload_all()
        release_other_pipeline_caches("image")
        free_accelerator_memory(torch)

    def load_model(self, model_name: str, overrides: Optional[Dict[str, Any]] = None,
                   acceleration_settings=None):
        """Resolve the runtime plan for model_name, then load exactly what it says.

        Replaces the legacy name-substring branching and hardcoded model map:
        pipeline class, dtype, offload, tiling and the single-file path all
        come from resolve_model_runtime via the resolve_plan seam. On CUDA
        OOM the plan's fallback_ladder is consumed rung by rung; the OOM is
        re-raised honestly when the ladder is exhausted.

        Order (B4): the refusal check runs first and leaves the resident
        pipeline alone; then the old pipelines are unloaded and memory freed;
        only THEN is VRAM measured (a fresh plan) to choose precision/offload
        - measuring with the previous multi-GB pipeline still resident made
        every model switch plan against memory that was about to be freed.
        Runs under the process-wide GPU gate (re-entrant from generation).
        """
        with gpu_work(f"load image model {model_name}"):
            return self._load_model_locked(model_name, overrides, acceleration_settings)

    def _load_model_locked(self, model_name: str, overrides: Optional[Dict[str, Any]],
                           acceleration_settings):
        requested_acceleration = acceleration_settings or DEFAULT_ACCELERATION_SETTINGS
        cached = self.pipelines.get(model_name)
        if cached is not None:
            if self._loaded_acceleration.get(model_name) == requested_acceleration:
                return cached
            # The Performance-panel acceleration request changed since this
            # model was cached. compile/quantization/slicing mutate the pipeline
            # in place and cannot be cleanly reverted, so evict and rebuild to
            # honor (and honestly report) the new settings.
            logger.info("Acceleration settings changed for %s; reloading", model_name)
        # Drop the local reference so the eviction below can actually free it.
        cached = None

        logger.info("Loading model: %s", model_name)
        # 1. Refusal first: security/capability refusals are hardware-free,
        #    so a refused load never evicts the pipeline the user has now.
        plan = resolve_plan(model_name, overrides)
        if plan.refusal:
            raise ModelLoadRefusedError(plan.refusal)

        # 2. One resident pipeline per generator, none in any other cache:
        #    unload, release, gc.collect + empty_cache.
        self._evict_for_load()

        # 3. Measure + plan against the memory that is actually free now.
        plan = resolve_plan(model_name, overrides)
        if plan.refusal:
            raise ModelLoadRefusedError(plan.refusal)

        ladder = list(plan.fallback_ladder)
        slicing_max = False
        while True:
            try:
                pipeline = self._load_from_plan(model_name, plan, slicing_max)
                break
            # CUDA raises torch.cuda.OutOfMemoryError; MPS raises a plain
            # RuntimeError - is_out_of_memory tells OOM apart from real
            # failures (ModelLoadRefusedError et al. re-raise untouched).
            except RuntimeError as exc:
                if not is_out_of_memory(exc):
                    raise
                if not ladder:
                    logger.warning("OOM loading %s: fallback ladder exhausted", model_name)
                    raise
                rung = ladder.pop(0)
                logger.warning("OOM loading %s: stepping fallback rung '%s'", model_name, rung)
                slicing_max = apply_fallback_rung(plan, rung) or slicing_max
                free_accelerator_memory(torch)

        applied = accelerate_pipeline(
            pipeline, plan, requested_acceleration, slicing_max=slicing_max)
        self.applied_acceleration[model_name] = applied
        self._loaded_acceleration[model_name] = requested_acceleration

        self.pipelines[model_name] = pipeline
        logger.info("Model loaded: %s (%s, %s)", model_name, plan.pipeline_class, plan.precision)
        return pipeline

    def _load_from_plan(self, model_name: str, plan, slicing_max: bool):
        """One load attempt driven entirely by the plan (no name-sniffing)."""
        dtype = dtype_for_precision(plan.precision)
        pipeline_cls = pipeline_class_for(plan)

        if plan.single_file:
            checkpoint = getattr(plan, "checkpoint_path", None)
            if not checkpoint:
                raise ModelLoadRefusedError(
                    f"Model '{model_name}' has no local safetensors checkpoint to load"
                )
            # config= pinned from the catalog entry (Spike D adj. 3) - the
            # checkpoint's keys are NEVER sniffed to guess a config repo.
            pipeline = pipeline_cls.from_single_file(
                checkpoint,
                config=getattr(plan, "config_repo_id", None),
                torch_dtype=dtype,
            )
        else:
            source = getattr(plan, "load_source", None)
            if not source:
                raise ModelLoadRefusedError(
                    f"Model '{model_name}' has no repo or local snapshot to load from"
                )
            # use_safetensors=True is NON-NEGOTIABLE: never fall back from
            # safetensors to pickle weights (M4 gate residual).
            pipeline = pipeline_cls.from_pretrained(
                source,
                torch_dtype=dtype,
                use_safetensors=True,
            )

        if plan.offload and self.device != "cpu":
            # Offload manages device placement itself - no manual .to(device).
            # The accelerator device is passed explicitly: diffusers defaults
            # to CUDA, which would break the MPS bundle. On a cpu-only box
            # offload is meaningless - plain .to("cpu") below.
            pipeline.enable_model_cpu_offload(device=self.device)
        else:
            pipeline = pipeline.to(self.device)

        if plan.vae_tiling and hasattr(pipeline, "vae"):
            pipeline.vae.enable_tiling()

        # Memory optimizations (attention slicing + fused attention) and
        # torch.compile are now owned by the M9 accel layer, applied once in
        # load_model after this returns. slicing_max stays a parameter for
        # signature stability and is threaded into accelerate_pipeline there.
        return pipeline

    def _configure_scheduler(self, pipeline, scheduler_name: str):
        """Swap the sampler on an eps/v-prediction pipeline (SD 1.5 / SDXL).

        Flow-matching pipelines (FLUX, FLUX Fill, SD 3.5) ship a
        FlowMatch*Scheduler and break - or silently produce noise - under
        Euler/DPM/DDIM/UniPC, so they always keep their own scheduler. Every
        swap derives from the scheduler the pipeline was LOADED with, never
        from a previous swap, so switching samplers back and forth on a
        cached pipeline cannot accumulate config drift.

        An unknown name raises UnknownSchedulerError on every pipeline - even
        one that keeps its own scheduler - so the contract is the same no
        matter which model was picked.
        """
        class_name, overrides = scheduler_spec(scheduler_name)
        current = getattr(pipeline, "scheduler", None)
        if current is None or type(current).__name__.startswith("FlowMatch"):
            return pipeline
        try:
            original_config = self._scheduler_origins.get(pipeline)
            if original_config is None:
                original_config = current.config
                self._scheduler_origins[pipeline] = original_config
        except TypeError:  # not weak-referenceable/hashable: swap from current
            original_config = current.config

        # Resolved on this module so tests can patch the diffusers classes.
        scheduler_cls = globals()[class_name]
        pipeline.scheduler = scheduler_cls.from_config(original_config, **overrides)
        return pipeline
    
    async def generate_image(
        self,
        job_id: str,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        steps: int = 25,
        cfg_scale: float = 7.5,
        seed: Optional[int] = None,
        model_name: str = "sdxl",
        scheduler: str = "Euler a",
        progress_callback: Optional[Callable[[float], None]] = None,
        acceleration_settings=None,
        loras: Optional[List[Dict[str, Any]]] = None,
        guided: Optional[Dict[str, Any]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> Dict[str, Any]:
        """Generate an image.

        should_cancel is polled at the end of every denoising step; once it
        returns True the run stops there with GenerationCancelled.
        """
        
        output_dir = os.path.join(self.output_dir, job_id)
        os.makedirs(output_dir, exist_ok=True)
        
        # Set seed
        if seed is None:
            import random
            seed = random.randint(0, 2**32 - 1)
        
        # Progress tracking. Capture the running loop HERE (async context, main
        # thread). progress_callback_fn runs inside the ThreadPoolExecutor
        # worker, where asyncio.get_event_loop() raises on Python 3.12 ("no
        # current event loop in thread ..." - worker threads have no loop);
        # call_soon_threadsafe hops the progress update back onto this loop.
        loop = asyncio.get_running_loop()

        # #33: family for the step-preview decoder; None disables previews
        # (the service fail-softs on unsupported families).
        preview_family = (_resolve_record(model_name) or {}).get("base_architecture")

        def progress_callback_fn(step, timestep, latents):
            # Raising here, in the worker thread, unwinds the diffusers call:
            # the remaining steps never run.
            if should_cancel is not None and should_cancel():
                raise GenerationCancelled(job_id)
            # #33: decode + store the latest step frame (throttled, fail-soft,
            # runs here in the worker thread so it never blocks the loop).
            step_preview_service.submit(
                job_id=job_id, step=step + 1, total_steps=steps,
                latents=latents, family=preview_family,
                width=width, height=height)
            if progress_callback:
                progress = (step + 1) / steps * 100
                loop.call_soon_threadsafe(progress_callback, progress)

        # Run generation in thread pool (to not block the event loop). The
        # worker queues for the process-wide GPU gate first; a job cancelled
        # while it waits never starts.
        try:
            result = await loop.run_in_executor(
                self.executor,
                self._generate_gated,
                job_id,
                should_cancel,
                prompt,
                negative_prompt,
                width,
                height,
                steps,
                cfg_scale,
                seed,
                model_name,
                scheduler,
                progress_callback_fn,
                output_dir,
                acceleration_settings,
                loras,
                guided,
            )

            return result

        except GenerationCancelled:
            raise
        except Exception as e:
            logger.error("Generation failed: %s", e)
            raise

    def _generate_gated(self, job_id: str, should_cancel: Optional[Callable[[], bool]],
                        *args: Any) -> Dict[str, Any]:
        """_generate_sync under the GPU gate (runs on the executor worker).

        The whole pass - load, guided-model attach, denoise, save - holds the
        gate, so no unload/release can interleave with it.
        """
        with gpu_work(f"image job {job_id}", should_cancel=should_cancel,
                      on_cancel=lambda: GenerationCancelled(job_id)):
            return self._generate_sync(*args)

    def _background_replace_mask(self, image):
        """#34 PR2: inverted U2-Net subject alpha = the background inpaint mask.

        Lazy edit_tools imports keep the module attribute the seam tests
        monkeypatch; refusals convert to the guided error contract verbatim.
        """
        from edit_tools import background as edit_background
        from edit_tools import weights as edit_weights

        try:
            u2net_path = edit_weights.require_edit_weights(
                "edit-u2net", _resolve_record, self.models_dir,
                "background removal")
            cutout = edit_background.remove_background(
                image, 0, model_path=u2net_path)
        except edit_weights.EditModelUnavailable as exc:
            raise GuidedValidationError(str(exc))
        return ImageOps.invert(cutout.split()[-1])

    def _generate_sync(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        cfg_scale: float,
        seed: int,
        model_name: str,
        scheduler: str,
        progress_callback_fn: Callable,
        output_dir: str,
        acceleration_settings=None,
        loras: Optional[List[Dict[str, Any]]] = None,
        guided: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Synchronous generation (runs in thread pool)"""

        # #34: one validated pass plan (same seam the endpoint 422s through).
        pass_plan = resolve_guided_pass(
            (guided or {}).get("controlnet"),
            (guided or {}).get("reference_images"),
            (guided or {}).get("inpaint"),
            (guided or {}).get("denoising_strength", 0.75),
            outpaint=(guided or {}).get("outpaint"),
            background_replace=(guided or {}).get("background_replace"),
        )

        # FLUX inpaint runs on the dedicated FLUX.1 Fill model (a naive
        # from_pipe latent blend on flux-dev is measurably worse - design
        # decision in the PR1 spec). The endpoint pre-flighted availability.
        model_for_pass = model_name
        if pass_plan.kind == "inpaint":
            record = _resolve_record(model_name) or {}
            if record.get("base_architecture") == "flux":
                model_for_pass = "flux-fill"

        # #34 PR2/PR3: resolve the ControlNet stack through the same seam the
        # endpoint 422s through, and build the control images on CPU before
        # any weights move. Union stacks resolve to ONE record - dedupe dirs
        # so the shared weights load exactly once.
        cn_stack = []
        cn_model_dirs: List[str] = []
        control_images: List[Any] = []
        cn_loader = "controlnet"
        if pass_plan.controlnet:
            base_record = _resolve_record(model_name) or {}
            cn_stack = resolve_controlnet_stack(
                pass_plan.controlnet, base_record.get("base_architecture"),
                _resolve_record, model_id=model_name, kind=pass_plan.kind,
            )
            cn_loader = cn_stack[0].loader
            for item in cn_stack:
                model_dir = os.path.join(self.models_dir, "controlnet", item.record_id)
                if not os.path.isdir(model_dir):
                    raise GuidedValidationError(
                        f"The ControlNet model '{item.record_id}' looks incomplete "
                        "on disk - reinstall it from the Foundry."
                    )
                if model_dir not in cn_model_dirs:
                    cn_model_dirs.append(model_dir)
            annotators_dir = os.path.join(self.models_dir, "annotators")
            control_images = [
                produce_control_image(item.layer, width, height, annotators_dir)
                for item in cn_stack
            ]

        # #34 PR4: resolve 2+ reference layers through the IP-Adapter seam
        # (same GuidedValidationError contract the endpoint 422s through),
        # and prepare images + masks on CPU before any weights move.
        ip_stack = None
        ip_adapter_dir = ""
        ip_encoder_dir = ""
        ip_images: List[Any] = []
        ip_masks: List[Any] = []
        if pass_plan.ip_references:
            base_record = _resolve_record(model_name) or {}
            ip_stack = resolve_ip_reference_stack(
                pass_plan.ip_references, base_record.get("base_architecture"),
                _resolve_record, model_id=model_name)
            ip_adapter_dir = os.path.join(
                self.models_dir, "ip-adapter", ip_stack.adapter_record_id)
            encoder_root = os.path.join(
                self.models_dir, "ip-adapter", ip_stack.encoder_record_id)
            ip_encoder_dir = (
                os.path.join(encoder_root, ip_stack.encoder_subpath)
                if ip_stack.encoder_subpath else encoder_root)
            for record_id, model_dir in (
                    (ip_stack.adapter_record_id, ip_adapter_dir),
                    (ip_stack.encoder_record_id, ip_encoder_dir)):
                if not os.path.isdir(model_dir):
                    raise GuidedValidationError(
                        f"The IP-Adapter model '{record_id}' looks incomplete "
                        "on disk - reinstall it from the Foundry."
                    )
            for ref in ip_stack.references:
                ip_images.append(Image.open(ref.get("source_path")).convert("RGB"))
                if ip_stack.masked:
                    mask_image = rasterize_mask(ref.get("mask") or {}, width, height)
                    if mask_coverage(mask_image) == 0.0:
                        name = ref.get("layer_name") or ref.get("layer_id") or "reference"
                        raise GuidedValidationError(
                            f"The mask on reference layer '{name}' is empty - "
                            "draw a mask region on the canvas first."
                        )
                    ip_masks.append(mask_image)

        # Load pipeline
        pipeline = self.load_model(model_for_pass, acceleration_settings=acceleration_settings)
        pipeline = self._configure_scheduler(pipeline, scheduler)

        # Set generator for reproducibility
        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Generate
        logger.info("Generating: %sx%s, %s steps, seed=%s", width, height, steps, seed)

        # callback_on_step_end is the only progress hook diffusers >=0.37
        # supports on every shipped pipeline: SD3/Flux/LTX removed the legacy
        # callback=/callback_steps= kwargs entirely (passing them - even as
        # None - raises TypeError), and SD/SDXL only tolerate them behind a
        # deprecation shim slated for removal in 1.0.0.
        def _on_step_end(_pipe, step, timestep, callback_kwargs):
            progress_callback_fn(step, timestep, callback_kwargs.get("latents"))
            return callback_kwargs

        effective_prompt = pass_plan.prompt_override or prompt
        effective_negative = (
            pass_plan.negative_prompt_override
            if pass_plan.negative_prompt_override is not None
            else (negative_prompt if negative_prompt else None)
        )
        call_kwargs: Dict[str, Any] = {
            "prompt": effective_prompt,
            "negative_prompt": effective_negative,
            "num_inference_steps": steps,
            "guidance_scale": cfg_scale,
            "generator": generator,
            "callback_on_step_end": _on_step_end,
        }

        guided_report: Optional[Dict[str, Any]] = None
        if pass_plan.kind == "none":
            call_kwargs["width"] = width
            call_kwargs["height"] = height
        else:
            init_image = Image.open(pass_plan.image_path).convert("RGB")
            computed_mask = None
            if pass_plan.outpaint:
                # #34 PR2 AI Expand: grow the canvas; the computed border mask
                # replaces the drawn vector mask and the pass is plain inpaint
                # from here on.
                init_image, computed_mask = expand_canvas(
                    init_image,
                    pass_plan.outpaint["directions"],
                    pass_plan.outpaint["pixels"],
                )
            elif pass_plan.background_replace:
                # #34 PR2 background replacement: the mask is the inverted
                # U2-Net subject alpha - keep the subject, repaint the rest.
                computed_mask = self._background_replace_mask(init_image)
            base_size = init_image.size
            init_image = init_image.resize((width, height), Image.Resampling.LANCZOS)
            call_kwargs["image"] = init_image
            call_kwargs["strength"] = pass_plan.strength
            if pass_plan.kind == "inpaint":
                if computed_mask is not None:
                    mask_image = computed_mask
                else:
                    mask_image = rasterize_mask(
                        pass_plan.mask or {}, base_size[0], base_size[1])
                    if mask_coverage(mask_image) == 0.0:
                        raise GuidedValidationError(
                            "The inpaint mask is empty - draw a mask region on the canvas first."
                        )
                call_kwargs["mask_image"] = mask_image.resize(
                    (width, height), Image.Resampling.LANCZOS)
                call_kwargs["width"] = width
                call_kwargs["height"] = height

        if cn_stack:
            # Dedicated SD/SDXL txt2img variants take the control map as
            # `image`; every other ControlNet pipeline (img2img/inpaint
            # variants, union, FLUX, SD3) takes `control_image`.
            if pass_plan.kind == "none" and cn_loader == "controlnet":
                call_kwargs["image"] = control_images
            else:
                call_kwargs["control_image"] = control_images
            call_kwargs["controlnet_conditioning_scale"] = [
                float(item.layer.get("strength", 1.0)) for item in cn_stack]
            call_kwargs["control_guidance_start"] = [
                float(item.layer.get("start_step", 0.0)) for item in cn_stack]
            call_kwargs["control_guidance_end"] = [
                float(item.layer.get("end_step", 1.0)) for item in cn_stack]
            modes = [item.control_mode for item in cn_stack]
            if all(mode is not None for mode in modes):
                call_kwargs["control_mode"] = modes

        if ip_stack:
            if ip_stack.loader == IP_LOADER_FLUX:
                # One image per adapter instance; masks are not supported on
                # FLUX (the stack carries the explicit notice).
                call_kwargs["ip_adapter_image"] = ip_images
            else:
                # ONE adapter with a list of images + per-image masks.
                call_kwargs["ip_adapter_image"] = [ip_images]
                call_kwargs["cross_attention_kwargs"] = {
                    "ip_adapter_masks": ip_adapter_mask_tensor(ip_masks, height, width)
                }

        with ExitStack() as stack:
            if cn_stack:
                cn_models = stack.enter_context(controlnets_attached(
                    cn_model_dirs, getattr(pipeline, "dtype", None), self.device,
                    loader=cn_loader))
                run_pipeline = derive_variant(
                    pipeline, pass_plan.kind,
                    controlnet=combine_controlnets(cn_models, cn_loader),
                    loader=cn_loader)
            elif pass_plan.kind == "none":
                run_pipeline = pipeline
            else:
                # flux-fill IS the inpaint pipeline - only derive for base models.
                run_pipeline = (
                    pipeline if model_for_pass != model_name
                    else derive_variant(pipeline, pass_plan.kind)
                )

            if ip_stack:
                stack.enter_context(ip_adapter_applied(
                    run_pipeline, ip_stack, ip_adapter_dir, ip_encoder_dir,
                    self.device))

            call_kwargs, dropped_params = filter_call_kwargs(run_pipeline, call_kwargs)
            if ip_stack and "ip_adapter_image" in dropped_params:
                # The registry is the primary gate; this backstop keeps a
                # signature drift from silently degrading to unguided output.
                raise GuidedValidationError(
                    "This pipeline cannot accept IP-Adapter reference images - "
                    "hide the extra reference layers or switch checkpoints."
                )
            if pass_plan.kind != "none" or cn_stack or ip_stack:
                guided_report = {
                    "pass": (
                        "outpaint" if pass_plan.outpaint
                        else "background-replace" if pass_plan.background_replace
                        else pass_plan.kind
                    ),
                    "notices": list(pass_plan.notices) + (ip_stack.notices if ip_stack else []),
                    "dropped_params": dropped_params,
                    "controlnet": [
                        {"layer_id": item.layer.get("layer_id"),
                         "preprocessor": item.layer.get("preprocessor"),
                         "record_id": item.record_id,
                         "control_mode": item.control_mode}
                        for item in cn_stack
                    ],
                    "references": [
                        {"layer_id": ref.get("layer_id"),
                         "record_id": ip_stack.adapter_record_id,
                         "masked": ip_stack.masked,
                         "strength": float(ref.get("strength", 1.0))}
                        for ref in (ip_stack.references if ip_stack else [])
                    ],
                }
                if pass_plan.outpaint:
                    guided_report["outpaint"] = dict(pass_plan.outpaint)

            with loras_applied(pipeline, loras or [], _resolve_lora_record) as lora_result:
                with torch.inference_mode():
                    output = run_pipeline(**call_kwargs)

            # Save the image before the ControlNet weights are released.
            image = output.images[0]
            output_path = os.path.join(output_dir, "generated.png")
            image.save(output_path, "PNG")

        logger.info("Saved: %s", output_path)
        
        return {
            "images": [f"/outputs/{os.path.basename(output_dir)}/generated.png"],
            "seed": seed,
            "width": width,
            "height": height,
            "prompt": prompt,
            "model": model_name,
            "acceleration": _acceleration_payload(self.applied_acceleration.get(model_for_pass)),
            "loras": lora_result,
            "guided": guided_report,
        }

    def unload_model(self, model_name: str):
        """Unload a model and free its VRAM (gc.collect, then empty the cache).

        Holds the GPU gate: an unload requested while a generation is running
        (model delete, another generator's load) waits for the run to finish.
        """
        with gpu_work(f"unload image model {model_name}"):
            if model_name not in self.pipelines:
                return
            del self.pipelines[model_name]
            self._loaded_acceleration.pop(model_name, None)
            self.applied_acceleration.pop(model_name, None)
            free_accelerator_memory(torch)
            logger.info("Unloaded model: %s", model_name)

    def unload_all(self):
        """Drop every cached pipeline (no-op when none is resident)."""
        with gpu_work("unload image models"):
            for model_name in list(self.pipelines):
                self.unload_model(model_name)
