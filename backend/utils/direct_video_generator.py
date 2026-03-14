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
    from diffusers import AnimateDiffPipeline, LTXPipeline, MotionAdapter, StableVideoDiffusionPipeline

    VIDEO_DIFFUSERS_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    AnimateDiffPipeline = None  # type: ignore[assignment]
    LTXPipeline = None  # type: ignore[assignment]
    MotionAdapter = None  # type: ignore[assignment]
    StableVideoDiffusionPipeline = None  # type: ignore[assignment]
    VIDEO_DIFFUSERS_AVAILABLE = False


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


VIDEO_MODEL_REPOS = {
    "ltx-video": "Lightricks/LTX-Video",
    "svd": "stabilityai/stable-video-diffusion-img2vid-xt",
}


def resolve_video_model_source(models_dir: str, model_name: str) -> str:
    local_bundle = Path(models_dir) / "diffusers" / model_name
    if local_bundle.exists():
        return str(local_bundle).replace("\\", "/")
    return VIDEO_MODEL_REPOS.get(model_name, model_name)


def resolve_animatediff_sources(models_dir: str) -> tuple[str, str]:
    animatediff_root = Path(models_dir) / "diffusers" / "animatediff"
    base_bundle = animatediff_root / "base"
    adapter_bundle = animatediff_root / "adapter"
    if base_bundle.exists() and adapter_bundle.exists():
        return (
            str(base_bundle).replace("\\", "/"),
            str(adapter_bundle).replace("\\", "/"),
        )
    return ("runwayml/stable-diffusion-v1-5", "guoyww/animatediff-motion-adapter-v1-5-2")


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

    def _load_pipeline(self, model_name: str):
        if not VIDEO_DIFFUSERS_AVAILABLE:
            raise RuntimeError("diffusers video pipelines are not available")

        if model_name in self.pipelines:
            return self.pipelines[model_name]

        if model_name == "ltx-video":
            pipeline_source = resolve_video_model_source(self.models_dir, model_name)
            pipeline = LTXPipeline.from_pretrained(
                pipeline_source,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
            )
        elif model_name == "svd":
            pipeline_source = resolve_video_model_source(self.models_dir, model_name)
            pipeline = StableVideoDiffusionPipeline.from_pretrained(
                pipeline_source,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                variant="fp16" if self.device == "cuda" else None,
            )
        elif model_name == "animatediff":
            base_source, adapter_source = resolve_animatediff_sources(self.models_dir)
            adapter = MotionAdapter.from_pretrained(adapter_source)
            pipeline = AnimateDiffPipeline.from_pretrained(
                base_source,
                motion_adapter=adapter,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            )
        else:
            raise ValueError(f"Unsupported video model: {model_name}")

        pipeline = pipeline.to(self.device)
        self.pipelines[model_name] = pipeline
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
    ) -> Dict[str, object]:
        frame_count = max(8, fps * duration)
        strategy = resolve_video_model_strategy(model_name, bool(image_path))
        pipeline = self._load_pipeline(model_name)

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

        return build_video_result(
            job_id=os.path.basename(output_dir),
            relative_video_path=f"/outputs/{os.path.basename(output_dir)}/video.mp4",
            frame_count=len(frames),
            fps=fps,
            duration=duration,
        )

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
    ) -> Dict[str, object]:
        output_dir = os.path.join(self.output_dir, job_id)
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        if seed is None:
            seed = 0

        if progress_callback:
            progress_callback(5.0)

        loop = asyncio.get_event_loop()
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
        )

        if progress_callback:
            progress_callback(100.0)

        return result
