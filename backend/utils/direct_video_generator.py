"""
Direct video generation service backed by diffusers video pipelines.
"""

from __future__ import annotations

import asyncio
import base64
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, Optional

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
from utils.direct_generator import (
    ModelLoadRefusedError,
    apply_fallback_rung,
    dtype_for_precision,
    pipeline_class_for,
    resolve_plan,
)
from foundry.accelerator import (
    DEFAULT_ACCELERATION_SETTINGS,
    accelerate_pipeline,
    configure_inductor_cache,
)


def resolve_video_model_strategy(model_name: str, has_input_image: bool) -> str:
    normalized = model_name.lower()
    if normalized == "ltx-video":
        return "text-to-video"
    if normalized == "svd":
        if not has_input_image:
            raise ValueError("Stable Video Diffusion requires an input image")
        return "image-to-video"
    if normalized == "animatediff":
        return "text-to-video"
    raise ValueError(f"Unsupported video model: {model_name}")


def build_video_result(
    job_id: str,
    relative_video_path: str,
    frame_count: int,
    fps: int,
    duration: int,
) -> Dict[str, object]:
    return {
        "video": relative_video_path,
        "frames": frame_count,
        "fps": fps,
        "duration": duration,
        "job_id": job_id,
    }


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
        base_repo or "runwayml/stable-diffusion-v1-5",
        adapter_repo or "guoyww/animatediff-motion-adapter-v1-5-2",
    )


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
        self.device = "cuda" if torch and torch.cuda.is_available() else "cpu"
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.pipelines: Dict[str, Any] = {}
        self.applied_acceleration: Dict[str, Any] = {}
        # Acceleration settings the cached pipeline was built with, per model.
        # A changed request must evict+rebuild (in-place accel is irreversible).
        self._loaded_acceleration: Dict[str, Any] = {}
        configure_inductor_cache(os.path.join(models_dir, ".cache", "inductor"))

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
            del self.pipelines[model_name]
            self._loaded_acceleration.pop(model_name, None)
            self.applied_acceleration.pop(model_name, None)
            if torch is not None:
                torch.cuda.empty_cache()

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
        if plan.offload:
            # Offload manages device placement itself - no manual .to(device).
            pipeline.enable_model_cpu_offload()
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
    ) -> Dict[str, object]:
        frame_count = max(8, fps * duration)
        strategy = resolve_video_model_strategy(model_name, bool(image_path))
        pipeline = self.load_model(model_name, acceleration_settings=acceleration_settings)

        generator = None
        if torch is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        if strategy == "text-to-video":
            output = pipeline(
                prompt=prompt,
                negative_prompt="worst quality, blurry, distorted",
                width=width,
                height=height,
                num_frames=frame_count,
                num_inference_steps=steps,
                generator=generator,
            )
        else:
            with decode_data_url_to_image(image_path) as source_image:
                source = source_image.convert("RGB").resize(
                    (width, height),
                    Image.Resampling.LANCZOS,
                )
            output = pipeline(
                source,
                height=height,
                width=width,
                num_frames=frame_count,
                num_inference_steps=steps,
                generator=generator,
            )

        frames = output.frames[0]
        output_path = os.path.join(output_dir, "video.mp4")
        self._export_frames_to_video(frames, output_path, fps=fps)

        result = build_video_result(
            job_id=os.path.basename(output_dir),
            relative_video_path=f"/outputs/{os.path.basename(output_dir)}/video.mp4",
            frame_count=len(frames),
            fps=fps,
            duration=duration,
        )
        applied = self.applied_acceleration.get(model_name)
        if applied is not None:
            result["acceleration"] = {
                "applied": list(applied.applied),
                "skipped": list(applied.skipped),
                "fell_back": list(applied.fell_back),
            }
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
    ) -> Dict[str, object]:
        output_dir = os.path.join(self.output_dir, job_id)
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        if seed is None:
            seed = 0

        if progress_callback:
            progress_callback(5.0)

        # get_running_loop is the correct API inside an async context (avoids the
        # 3.12 get_event_loop deprecation); progress here is reported on the
        # async side, so no worker-thread loop hop is needed.
        loop = asyncio.get_running_loop()
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
        )

        if progress_callback:
            progress_callback(100.0)

        return result
