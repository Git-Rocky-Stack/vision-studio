"""
Direct video generation service backed by diffusers video pipelines.
"""

from __future__ import annotations

import asyncio
import base64
import os
import random
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager, nullcontext
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional

import imageio.v2 as imageio
import numpy as np
from PIL import Image

try:
    import torch
    import diffusers
    from diffusers import MotionAdapter

    VIDEO_DIFFUSERS_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    diffusers = None  # type: ignore[assignment]
    MotionAdapter = None  # type: ignore[assignment]
    VIDEO_DIFFUSERS_AVAILABLE = False

# Plan seam + typed refusal shared with the image generator so main.py maps
# ONE error type to its job-failure envelope. Tests patch the seam where it
# is used: ``utils.direct_video_generator.resolve_plan``.
from utils.device import empty_device_cache, is_out_of_memory, resolve_device
from utils.job_manager import GenerationCancelled
from utils.direct_generator import (
    ModelLoadRefusedError,
    _resolve_lora_record,
    _resolve_record,
    apply_fallback_rung,
    dtype_for_precision,
    pipeline_class_for,
    resolve_plan,
)
from foundry.lora import loras_applied
from utils.pipeline_cache import register_pipeline_owner, release_other_pipeline_caches
from foundry.accelerator import (
    DEFAULT_ACCELERATION_SETTINGS,
    accelerate_pipeline,
    configure_inductor_cache,
)


# Catalog ids of the shipped video records -> their family. Any other id
# (a linked or downloaded checkpoint) resolves through its registry record's
# base_architecture, the same field the runtime resolver keys on.
_VIDEO_FAMILY_BY_ID = {"ltx-video": "ltx", "svd": "svd", "animatediff": "animatediff"}
VIDEO_FAMILIES = frozenset(_VIDEO_FAMILY_BY_ID.values())

# Frames each family can produce in one pass. AnimateDiff motion modules are
# trained on 16-frame windows and degrade past 32; SVD-XT is a 25-frame
# model; LTX needs 8k+1 frames and tops out at 257.
VIDEO_FRAME_LIMITS = {"animatediff": 32, "svd": 25, "ltx": 257}
MIN_VIDEO_FRAMES = 8


def resolve_video_family(model_name: str, record: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """"ltx" | "svd" | "animatediff" for a model id, or None when unknown."""
    family = _VIDEO_FAMILY_BY_ID.get(model_name.lower())
    if family is not None:
        return family
    architecture = (record or {}).get("base_architecture")
    return architecture if architecture in VIDEO_FAMILIES else None


def resolve_video_model_strategy(
    model_name: str,
    has_input_image: bool,
    record: Optional[Dict[str, Any]] = None,
) -> str:
    family = resolve_video_family(model_name, record)
    if family == "svd":
        if not has_input_image:
            raise ValueError("Stable Video Diffusion requires an input image")
        return "image-to-video"
    if family in ("ltx", "animatediff"):
        return "text-to-video"
    raise ValueError(f"Unsupported video model: {model_name}")


def plan_video_frame_count(family: Optional[str], fps: int, duration: int) -> int:
    """Frames to request from the pipeline for fps * duration, capped per family.

    The requested length is a wish, not a contract: asking AnimateDiff for 240
    frames runs out of memory or produces noise, and LTX rejects counts that
    are not 8k+1. The result reports the length that was actually produced.
    """
    requested = max(MIN_VIDEO_FRAMES, int(fps) * int(duration))
    limit = VIDEO_FRAME_LIMITS.get(family or "")
    if limit is None:
        return requested
    frames = min(requested, limit)
    if family == "ltx":
        # Nearest 8k+1 (k >= 1), never past the 257-frame ceiling.
        frames = min(8 * max(1, round((frames - 1) / 8)) + 1, limit)
    return frames


def build_video_result(
    job_id: str,
    relative_video_path: str,
    frame_count: int,
    fps: int,
    duration: float,
    requested_duration: Optional[float] = None,
    seed: Optional[int] = None,
) -> Dict[str, object]:
    result: Dict[str, object] = {
        "video": relative_video_path,
        "frames": frame_count,
        "fps": fps,
        "duration": duration,
        "job_id": job_id,
    }
    if requested_duration is not None:
        result["requested_duration"] = requested_duration
    if seed is not None:
        result["seed"] = seed
    return result


def resolve_video_model_source(models_dir: str, model_name: str, default: Optional[str] = None) -> str:
    """Prefer a pre-seeded local diffusers bundle; otherwise the plan-resolved
    source (record repo_id or local snapshot). The legacy hardcoded repo map
    died with M5 Task 11 - repo ids come from the registry record."""
    local_bundle = Path(models_dir) / "diffusers" / model_name
    if local_bundle.exists():
        return str(local_bundle).replace("\\", "/")
    return default or model_name


def resolve_animatediff_sources(
    models_dir: str,
    base_repo: Optional[str] = None,
    adapter_repo: Optional[str] = None,
) -> tuple[str, str]:
    """(base, motion adapter) sources: pre-seeded local bundles win, then the
    record's repo_id / aux_repo_id, then the historical defaults."""
    animatediff_root = Path(models_dir) / "diffusers" / "animatediff"
    base_bundle = animatediff_root / "base"
    adapter_bundle = animatediff_root / "adapter"
    if base_bundle.exists() and adapter_bundle.exists():
        return (
            str(base_bundle).replace("\\", "/"),
            str(adapter_bundle).replace("\\", "/"),
        )
    return (
        # runwayml/stable-diffusion-v1-5 was deleted from HuggingFace; the
        # community mirror is the permanent SD1.5 source (matches the catalog).
        base_repo or "stable-diffusion-v1-5/stable-diffusion-v1-5",
        adapter_repo or "guoyww/animatediff-motion-adapter-v1-5-2",
    )


def _video_record(model_name: str) -> Optional[Dict[str, Any]]:
    """Registry record for model_name, or None. Fail-soft: an unreadable
    registry leaves the id unknown, which resolve_video_model_strategy reports."""
    try:
        return _resolve_record(model_name)
    except Exception:  # noqa: BLE001 - lookup is advisory
        return None


def _inference_mode():
    """torch.inference_mode() when torch is present, else a no-op context
    (the stub CI env has no torch; fake pipelines run under it unchanged)."""
    if torch is None:
        return nullcontext()
    return torch.inference_mode()


@contextmanager
def decode_data_url_to_image(image_source: str) -> Iterator[Image.Image]:
    if image_source.startswith("data:image/"):
        _, encoded = image_source.split(",", 1)
        image_bytes = base64.b64decode(encoded)
        with Image.open(BytesIO(image_bytes)) as image:
            yield image.copy()
        return

    with Image.open(image_source) as image:
        yield image.copy()


class DirectVideoGenerator:
    def __init__(self, models_dir: str, output_dir: str):
        self.models_dir = models_dir
        self.output_dir = output_dir
        self.device = resolve_device(torch)
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.pipelines: Dict[str, Any] = {}
        self.applied_acceleration: Dict[str, Any] = {}
        # Acceleration settings the cached pipeline was built with, per model.
        # A changed request must evict+rebuild (in-place accel is irreversible).
        self._loaded_acceleration: Dict[str, Any] = {}
        configure_inductor_cache(os.path.join(models_dir, ".cache", "inductor"))
        # The image generator releases this cache before it loads (and this
        # one releases the image cache) - see utils.pipeline_cache.
        register_pipeline_owner("video", self.unload_all)

    def unload_model(self, model_name: str) -> None:
        """Drop one cached pipeline and release the allocator cache."""
        if model_name in self.pipelines:
            del self.pipelines[model_name]
            self._loaded_acceleration.pop(model_name, None)
            self.applied_acceleration.pop(model_name, None)
            empty_device_cache(torch)

    def unload_all(self) -> None:
        """Drop every cached pipeline (no-op when none is resident)."""
        for model_name in list(self.pipelines):
            self.unload_model(model_name)

    def load_model(self, model_name: str, overrides: Optional[Dict[str, Any]] = None,
                   acceleration_settings=None):
        """Plan-driven load mirroring DirectGenerator.load_model: the runtime
        plan decides pipeline class, dtype, offload and tiling; refusals raise
        ModelLoadRefusedError; CUDA OOM consumes the plan's fallback ladder.
        svd records arrive as plans only via from_pretrained (the resolver
        refuses svd single-file)."""
        if not VIDEO_DIFFUSERS_AVAILABLE:
            raise RuntimeError("diffusers video pipelines are not available")

        requested_acceleration = acceleration_settings or DEFAULT_ACCELERATION_SETTINGS
        cached = self.pipelines.get(model_name)
        if cached is not None:
            if self._loaded_acceleration.get(model_name) == requested_acceleration:
                return cached
            # Acceleration request changed since this model was cached; in-place
            # accel (compile/quantization/slicing) is irreversible, so evict and
            # rebuild to honor (and honestly report) the new settings.
            print(f"Acceleration settings changed for {model_name}; reloading")
            self.unload_model(model_name)

        plan = resolve_plan(model_name, overrides)
        if plan.refusal:
            raise ModelLoadRefusedError(plan.refusal)

        # One resident pipeline per generator, and none in the image
        # generator: two multi-GB pipelines never share VRAM.
        self.unload_all()
        release_other_pipeline_caches("video")

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
                    print(f"OOM loading {model_name}: fallback ladder exhausted")
                    raise
                rung = ladder.pop(0)
                print(f"OOM loading {model_name}: stepping fallback rung '{rung}'")
                slicing_max = apply_fallback_rung(plan, rung) or slicing_max
                empty_device_cache(torch)

        applied = accelerate_pipeline(
            pipeline, plan, requested_acceleration, slicing_max=slicing_max)
        self.applied_acceleration[model_name] = applied
        self._loaded_acceleration[model_name] = requested_acceleration

        self.pipelines[model_name] = pipeline
        return pipeline

    def _load_from_plan(self, model_name: str, plan, slicing_max: bool):
        """One load attempt driven entirely by the plan (no name-sniffing)."""
        dtype = dtype_for_precision(plan.precision)
        pipeline_cls = pipeline_class_for(plan)

        if plan.single_file:
            # Mirror of DirectGenerator: ltx/animatediff single-file
            # checkpoints load via from_single_file with the catalog-pinned
            # config (Spike D adj. 3) - keys are NEVER sniffed for a config.
            # (svd never reaches here: the resolver refuses svd single-file.)
            checkpoint = getattr(plan, "checkpoint_path", None)
            if not checkpoint:
                raise ModelLoadRefusedError(
                    f"Model '{model_name}' has no local safetensors checkpoint to load"
                )
            pipeline = pipeline_cls.from_single_file(
                checkpoint,
                config=getattr(plan, "config_repo_id", None),
                torch_dtype=dtype,
            )
            return self._apply_plan_runtime_flags(pipeline, plan, slicing_max)

        source = resolve_video_model_source(
            self.models_dir, model_name, default=getattr(plan, "load_source", None)
        )
        if not source:
            raise ModelLoadRefusedError(
                f"Model '{model_name}' has no repo or local snapshot to load from"
            )

        # use_safetensors=True is NON-NEGOTIABLE on every weight load: never
        # fall back from safetensors to pickle weights (M4 gate residual).
        if plan.pipeline_class == "AnimateDiffPipeline":
            base_source, adapter_source = resolve_animatediff_sources(
                self.models_dir,
                base_repo=getattr(plan, "load_source", None),
                adapter_repo=getattr(plan, "adapter_repo_id", None),
            )
            adapter = MotionAdapter.from_pretrained(adapter_source, use_safetensors=True)
            pipeline = pipeline_cls.from_pretrained(
                base_source,
                motion_adapter=adapter,
                torch_dtype=dtype,
                use_safetensors=True,
            )
        elif plan.pipeline_class == "StableVideoDiffusionPipeline":
            pipeline = pipeline_cls.from_pretrained(
                source,
                torch_dtype=dtype,
                # The svd repo ships fp16-variant weight files; on GPU plans
                # (fp16/bf16) select them as the legacy loader did on CUDA.
                variant="fp16" if plan.precision in ("fp16", "bf16") else None,
                use_safetensors=True,
            )
        else:
            pipeline = pipeline_cls.from_pretrained(
                source,
                torch_dtype=dtype,
                use_safetensors=True,
            )

        return self._apply_plan_runtime_flags(pipeline, plan, slicing_max)

    def _apply_plan_runtime_flags(self, pipeline, plan, slicing_max: bool):
        """Post-load flags from the plan - shared by both load branches."""
        if plan.offload and self.device != "cpu":
            # Offload manages device placement itself - no manual .to(device).
            # Device passed explicitly: diffusers defaults to CUDA, which
            # would break the MPS bundle; on cpu-only offload is meaningless.
            pipeline.enable_model_cpu_offload(device=self.device)
        else:
            pipeline = pipeline.to(self.device)

        if plan.vae_tiling and hasattr(pipeline, "vae"):
            pipeline.vae.enable_tiling()

        # Attention slicing + fused attention + compile are owned by the M9
        # accel layer (applied once in load_model). slicing_max stays a
        # parameter for signature stability and is threaded there.
        return pipeline

    def _export_frames_to_video(self, frames, output_path: str, fps: int) -> None:
        writer = imageio.get_writer(output_path, fps=fps)
        try:
            for frame in frames:
                if isinstance(frame, Image.Image):
                    writer.append_data(np.asarray(frame))
                else:
                    writer.append_data(frame)
        finally:
            writer.close()

    def _generate_sync(
        self,
        prompt: str,
        image_path: Optional[str],
        width: int,
        height: int,
        fps: int,
        duration: int,
        steps: int,
        model_name: str,
        seed: int,
        output_dir: str,
        acceleration_settings=None,
        loras: Optional[List[Dict[str, Any]]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
        progress_fn: Optional[Callable[[int, int], None]] = None,
    ) -> Dict[str, object]:
        # Unknown ids (linked/downloaded checkpoints) resolve their family
        # through the registry record; the catalog ids never need the lookup.
        record = None
        if model_name.lower() not in _VIDEO_FAMILY_BY_ID:
            record = _video_record(model_name)
        family = resolve_video_family(model_name, record)
        strategy = resolve_video_model_strategy(model_name, bool(image_path), record)
        frame_count = plan_video_frame_count(family, fps, duration)
        pipeline = self.load_model(model_name, acceleration_settings=acceleration_settings)

        generator = None
        if torch is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        # LTX, SVD and AnimateDiff all call callback_on_step_end after every
        # denoising step; raising there stops a cancelled job at that step.
        def _on_step_end(_pipe, step, _timestep, callback_kwargs):
            if should_cancel is not None and should_cancel():
                raise GenerationCancelled(os.path.basename(output_dir))
            if progress_fn is not None:
                progress_fn(step + 1, steps)
            return callback_kwargs

        call_kwargs: Dict[str, Any] = {
            "height": height,
            "width": width,
            "num_frames": frame_count,
            "num_inference_steps": steps,
            "generator": generator,
            "callback_on_step_end": _on_step_end,
        }
        # svd (StableVideoDiffusionPipeline) has no text/LoRA conditioning path.
        effective_loras = [] if family == "svd" else (loras or [])
        with loras_applied(pipeline, effective_loras, _resolve_lora_record) as lora_result:
            with _inference_mode():
                if strategy == "text-to-video":
                    output = pipeline(
                        prompt=prompt,
                        negative_prompt="worst quality, blurry, distorted",
                        **call_kwargs,
                    )
                else:
                    with decode_data_url_to_image(image_path) as source_image:
                        source = source_image.convert("RGB").resize(
                            (width, height),
                            Image.Resampling.LANCZOS,
                        )
                    if family == "svd":
                        # The VAE decodes every frame at once by default - the
                        # VRAM peak of an SVD run. 8 at a time is the
                        # diffusers-documented memory/speed balance.
                        call_kwargs["decode_chunk_size"] = 8
                    output = pipeline(source, **call_kwargs)

        frames = output.frames[0]
        output_path = os.path.join(output_dir, "video.mp4")
        self._export_frames_to_video(frames, output_path, fps=fps)

        result = build_video_result(
            job_id=os.path.basename(output_dir),
            relative_video_path=f"/outputs/{os.path.basename(output_dir)}/video.mp4",
            frame_count=len(frames),
            fps=fps,
            # What was produced, not what was asked for: the frame count is
            # capped per family (plan_video_frame_count).
            duration=round(len(frames) / fps, 3) if fps else 0.0,
            requested_duration=duration,
            seed=seed,
        )
        applied = self.applied_acceleration.get(model_name)
        if applied is not None:
            result["acceleration"] = {
                "applied": list(applied.applied),
                "skipped": list(applied.skipped),
                "fell_back": list(applied.fell_back),
            }
        result["loras"] = lora_result
        return result

    async def generate_video(
        self,
        job_id: str,
        prompt: str,
        image_path: Optional[str],
        width: int,
        height: int,
        fps: int,
        duration: int,
        steps: int,
        model_name: str,
        seed: Optional[int] = None,
        progress_callback: Optional[Callable[[float], None]] = None,
        acceleration_settings=None,
        loras: Optional[List[Dict[str, Any]]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> Dict[str, object]:
        output_dir = os.path.join(self.output_dir, job_id)
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # Same contract as the image path: no seed means a fresh random one,
        # reported back in the result so the run can be reproduced.
        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        if progress_callback:
            progress_callback(5.0)

        # Capture the running loop HERE (async context). progress_fn runs in
        # the executor worker, which has no event loop; call_soon_threadsafe
        # hops each per-step update back onto this one (mirrors the image path).
        loop = asyncio.get_running_loop()
        finished = {"done": False}

        def report(progress: float) -> None:
            # A step update still queued when the run returns must not pull
            # the final 100% back down.
            if progress_callback and not finished["done"]:
                progress_callback(progress)

        def progress_fn(step: int, total: int) -> None:
            if progress_callback and total > 0:
                # 5% is reported before the load; denoising spans 5-95%, the
                # remaining 5% is the MP4 encode.
                loop.call_soon_threadsafe(report, 5.0 + (step / total) * 90.0)

        result = await loop.run_in_executor(
            self.executor,
            self._generate_sync,
            prompt,
            image_path,
            width,
            height,
            fps,
            duration,
            steps,
            model_name,
            seed,
            output_dir,
            acceleration_settings,
            loras,
            should_cancel,
            progress_fn,
        )

        finished["done"] = True
        if progress_callback:
            progress_callback(100.0)

        return result
