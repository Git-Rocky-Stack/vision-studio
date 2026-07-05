"""
Direct Generator - Generate images using diffusers directly
Fallback when ComfyUI is not available
"""

import os
try:
    import torch
except ImportError:  # torch is optional and absent in the lightweight CI/test env
    torch = None
from typing import Optional, Callable, Dict, Any, List
from pathlib import Path
from PIL import Image
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
    print(f"⚠️ diffusers import failed: {e}. Direct image generation disabled.")

# M9 acceleration seam (import-safe: accelerator imports no torch at module load).
from foundry.accelerator import DEFAULT_ACCELERATION_SETTINGS, accelerate_pipeline
from foundry.lora import loras_applied

# #34 guided passes (all modules import with no torch/diffusers).
from guided.controlnet_registry import resolve_controlnet_stack
from guided.masks import mask_coverage, rasterize_mask
from guided.passes import GuidedValidationError, resolve_guided_pass
from guided.pipelines import (
    combine_controlnets,
    controlnets_attached,
    derive_variant,
    filter_call_kwargs,
)
from guided.preprocessors import produce_control_image


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
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.executor = ThreadPoolExecutor(max_workers=1)

        from foundry.accelerator import configure_inductor_cache
        configure_inductor_cache(os.path.join(models_dir, ".cache", "inductor"))
        
        if not DIFFUSERS_AVAILABLE:
            raise RuntimeError("diffusers library not available")
        
        print(f"🖥️ DirectGenerator using device: {self.device}")
        
        if self.device == "cuda":
            print(f"   GPU: {torch.cuda.get_device_name(0)}")
            print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    
    def load_model(self, model_name: str, overrides: Optional[Dict[str, Any]] = None,
                   acceleration_settings=None):
        """Resolve the runtime plan for model_name, then load exactly what it says.

        Replaces the legacy name-substring branching and hardcoded model map:
        pipeline class, dtype, offload, tiling and the single-file path all
        come from resolve_model_runtime via the resolve_plan seam. On CUDA
        OOM the plan's fallback_ladder is consumed rung by rung; the OOM is
        re-raised honestly when the ladder is exhausted.
        """
        requested_acceleration = acceleration_settings or DEFAULT_ACCELERATION_SETTINGS
        cached = self.pipelines.get(model_name)
        if cached is not None:
            if self._loaded_acceleration.get(model_name) == requested_acceleration:
                return cached
            # The Performance-panel acceleration request changed since this
            # model was cached. compile/quantization/slicing mutate the pipeline
            # in place and cannot be cleanly reverted, so evict and rebuild to
            # honor (and honestly report) the new settings.
            print(f"Acceleration settings changed for {model_name}; reloading")
            self.unload_model(model_name)

        print(f"Loading model: {model_name}")
        plan = resolve_plan(model_name, overrides)
        if plan.refusal:
            raise ModelLoadRefusedError(plan.refusal)

        ladder = list(plan.fallback_ladder)
        slicing_max = False
        while True:
            try:
                pipeline = self._load_from_plan(model_name, plan, slicing_max)
                break
            except torch.cuda.OutOfMemoryError:
                if not ladder:
                    print(f"OOM loading {model_name}: fallback ladder exhausted")
                    raise
                rung = ladder.pop(0)
                print(f"OOM loading {model_name}: stepping fallback rung '{rung}'")
                slicing_max = apply_fallback_rung(plan, rung) or slicing_max
                torch.cuda.empty_cache()

        applied = accelerate_pipeline(
            pipeline, plan, requested_acceleration, slicing_max=slicing_max)
        self.applied_acceleration[model_name] = applied
        self._loaded_acceleration[model_name] = requested_acceleration

        self.pipelines[model_name] = pipeline
        print(f"Model loaded: {model_name} ({plan.pipeline_class}, {plan.precision})")
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

        if plan.offload:
            # Offload manages device placement itself - no manual .to(device).
            pipeline.enable_model_cpu_offload()
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
        normalized = scheduler_name.strip().lower()
        scheduler_cls = EulerAncestralDiscreteScheduler

        if normalized == "euler":
            scheduler_cls = EulerDiscreteScheduler
        elif normalized in {"euler a", "euler_a", "euler ancestral"}:
            scheduler_cls = EulerAncestralDiscreteScheduler
        elif normalized in {
            "dpm++ 2m",
            "dpm++ 2m karras",
            "dpm++ sde",
            "dpm++ sde karras",
        }:
            scheduler_cls = DPMSolverMultistepScheduler
        elif normalized == "ddim":
            scheduler_cls = DDIMScheduler
        elif normalized == "unipc":
            scheduler_cls = UniPCMultistepScheduler

        pipeline.scheduler = scheduler_cls.from_config(pipeline.scheduler.config)
        if "karras" in normalized and hasattr(pipeline.scheduler.config, "use_karras_sigmas"):
            pipeline.scheduler.config.use_karras_sigmas = True
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
    ) -> Dict[str, Any]:
        """Generate an image"""
        
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

        def progress_callback_fn(step, timestep, latents):
            if progress_callback:
                progress = (step + 1) / steps * 100
                loop.call_soon_threadsafe(progress_callback, progress)

        # Run generation in thread pool (to not block the event loop)
        try:
            result = await loop.run_in_executor(
                self.executor,
                self._generate_sync,
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
            
        except Exception as e:
            print(f"❌ Generation failed: {e}")
            raise
    
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

        # Load pipeline
        pipeline = self.load_model(model_for_pass, acceleration_settings=acceleration_settings)
        pipeline = self._configure_scheduler(pipeline, scheduler)

        # Set generator for reproducibility
        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Generate
        print(f"🎨 Generating: {width}x{height}, {steps} steps, seed={seed}")

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
            base_size = init_image.size
            init_image = init_image.resize((width, height), Image.Resampling.LANCZOS)
            call_kwargs["image"] = init_image
            call_kwargs["strength"] = pass_plan.strength
            if pass_plan.kind == "inpaint":
                mask_image = rasterize_mask(pass_plan.mask or {}, base_size[0], base_size[1])
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

            call_kwargs, dropped_params = filter_call_kwargs(run_pipeline, call_kwargs)
            if pass_plan.kind != "none" or cn_stack:
                guided_report = {
                    "pass": pass_plan.kind,
                    "notices": list(pass_plan.notices),
                    "dropped_params": dropped_params,
                    "controlnet": [
                        {"layer_id": item.layer.get("layer_id"),
                         "preprocessor": item.layer.get("preprocessor"),
                         "record_id": item.record_id,
                         "control_mode": item.control_mode}
                        for item in cn_stack
                    ],
                }

            with loras_applied(pipeline, loras or [], _resolve_lora_record) as lora_result:
                with torch.inference_mode():
                    output = run_pipeline(**call_kwargs)

            # Save the image before the ControlNet weights are released.
            image = output.images[0]
            output_path = os.path.join(output_dir, "generated.png")
            image.save(output_path, "PNG")

        print(f"✅ Saved: {output_path}")
        
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
        """Unload a model to free VRAM"""
        if model_name in self.pipelines:
            del self.pipelines[model_name]
            self._loaded_acceleration.pop(model_name, None)
            self.applied_acceleration.pop(model_name, None)
            torch.cuda.empty_cache()
            print(f"🗑️ Unloaded model: {model_name}")
    
    def get_memory_usage(self) -> Dict[str, float]:
        """Get GPU memory usage"""
        if self.device == "cuda":
            allocated = torch.cuda.memory_allocated() / 1e9
            reserved = torch.cuda.memory_reserved() / 1e9
            total = torch.cuda.get_device_properties(0).total_memory / 1e9
            
            return {
                "allocated_gb": round(allocated, 2),
                "reserved_gb": round(reserved, 2),
                "total_gb": round(total, 2),
                "free_gb": round(total - allocated, 2)
            }
        return {"device": "cpu"}
