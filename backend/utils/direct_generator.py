"""
Direct Generator - Generate images using diffusers directly
Fallback when ComfyUI is not available
"""

import os
try:
    import torch
except ImportError:  # torch is optional and absent in the lightweight CI/test env
    torch = None
from typing import Optional, Callable, Dict, Any
from pathlib import Path
from PIL import Image
import asyncio
from concurrent.futures import ThreadPoolExecutor

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
        if model_name in self.pipelines:
            return self.pipelines[model_name]

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
            pipeline, plan, acceleration_settings or DEFAULT_ACCELERATION_SETTINGS,
            slicing_max=slicing_max)
        self.applied_acceleration[model_name] = applied

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
    ) -> Dict[str, Any]:
        """Synchronous generation (runs in thread pool)"""

        # Load pipeline
        pipeline = self.load_model(model_name, acceleration_settings=acceleration_settings)
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

        with torch.inference_mode():
            output = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=cfg_scale,
                generator=generator,
                callback_on_step_end=_on_step_end,
            )
        
        # Save image
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
            "acceleration": _acceleration_payload(self.applied_acceleration.get(model_name)),
        }
    
    def unload_model(self, model_name: str):
        """Unload a model to free VRAM"""
        if model_name in self.pipelines:
            del self.pipelines[model_name]
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
