"""TensorRT engine build/cache/reuse, isolated from accelerator.py so the bulky
dep-heavy logic is quarantined and independently testable (M9 S7).

Engines are GPU- and shape-specific: the cache key captures family, pipeline
class, precision, resolution bucket, GPU compute capability, and TRT version.
Only families whose engine build + output tolerance are verified in the sweep
are eligible (TRT_PROVEN_FAMILIES); an un-vetted family can never auto-build.
"""

from __future__ import annotations

import hashlib
import os
from typing import Optional, Tuple

# Blessed by the maintainer's CUDA correctness sweep (docs/TENSORRT_VERIFICATION.md)
# - "evidence, not assertion". Empty in 3.1.0: TRT ships code-complete but
# auto-off until a family passes the sweep on real hardware. Explicit
# tensorrt="on" still builds (with hard-fallback to eager). Blessing a family
# is a one-line data edit here after its sweep result passes correctness.
TRT_PROVEN_FAMILIES: set[str] = set()


def is_trt_eligible(family: Optional[str]) -> bool:
    return family in TRT_PROVEN_FAMILIES


# Latent channel count and VAE downscale are shared by SD15/SDXL UNets.
_LATENT_CHANNELS = 4
_VAE_SCALE = 8
_SEQ_LEN = 77  # CLIP token sequence length
_CFG_BATCH = 2  # classifier-free guidance doubles the batch (cond + uncond)


def _bucket_pixels(resolution_bucket: str) -> int:
    """Pixel edge from a 'WxH' bucket label (square buckets; uses the width)."""
    return int(resolution_bucket.lower().split("x")[0])


def example_input_shapes(family: str, resolution_bucket: str) -> dict:
    """Pure name->shape map for the denoiser's example inputs at this bucket.

    Verified on hardware (see docs/TENSORRT_VERIFICATION.md); the shapes follow
    the documented diffusers UNet forward signatures for the two TRT-relevant
    families. Batch is _CFG_BATCH (cond + uncond)."""
    latent = _bucket_pixels(resolution_bucket) // _VAE_SCALE
    sample = (_CFG_BATCH, _LATENT_CHANNELS, latent, latent)
    if family == "sdxl":
        return {
            "sample": sample,
            "encoder_hidden_states": (_CFG_BATCH, _SEQ_LEN, 2048),
            "text_embeds": (_CFG_BATCH, 1280),
            "time_ids": (_CFG_BATCH, 6),
        }
    if family == "sd15":
        return {
            "sample": sample,
            "encoder_hidden_states": (_CFG_BATCH, _SEQ_LEN, 768),
        }
    raise ValueError(f"no TRT example-input recipe for family {family!r}")


def _trt_dtype(precision: str):
    """Map our precision label to a torch dtype. Lazy torch import (hardware)."""
    import torch  # noqa: PLC0415 - lazy heavy dep

    return {"fp16": torch.float16, "bf16": torch.bfloat16,
            "fp32": torch.float32}.get(precision, torch.float16)


def build_example_inputs(family: str, resolution_bucket: str, precision: str):
    """Materialize (arg_inputs, kwarg_inputs) for torch_tensorrt.compile. Runs
    only on a CUDA box; the maintainer confirms the exact forward plumbing per
    the runbook. Returns positional args (sample, timestep, encoder_hidden_states)
    and SDXL's added_cond_kwargs as kwarg_inputs."""
    import torch  # noqa: PLC0415 - lazy heavy dep

    shapes = example_input_shapes(family, resolution_bucket)
    dtype = _trt_dtype(precision)

    def _rand(shape):
        return torch.randn(*shape, dtype=dtype, device="cuda")

    arg_inputs = (
        _rand(shapes["sample"]),
        torch.tensor(1.0, dtype=dtype, device="cuda"),  # timestep
        _rand(shapes["encoder_hidden_states"]),
    )
    kwarg_inputs: dict = {}
    if family == "sdxl":
        kwarg_inputs["added_cond_kwargs"] = {
            "text_embeds": _rand(shapes["text_embeds"]),
            "time_ids": _rand(shapes["time_ids"]),
        }
    return arg_inputs, kwarg_inputs


def engine_cache_key(*, family: str, pipeline_class: str, precision: str,
                     resolution_bucket: str, compute_capability: Tuple[int, int],
                     trt_version: str) -> str:
    """Stable hash of every dimension an engine is specific to."""
    raw = "|".join([
        family, pipeline_class, precision, resolution_bucket,
        f"{compute_capability[0]}.{compute_capability[1]}", trt_version,
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def engine_cache_path(cache_dir: str, key: str) -> str:
    return os.path.join(cache_dir, f"{key}.plan")


def build_or_load_engine(pipeline, *, family: str, pipeline_class: str, precision: str,
                         resolution_bucket: str, cache_dir: str,
                         compute_capability: Tuple[int, int], trt_version: str) -> str:
    """Cache-hit -> bind prebuilt engine ("cached"); cache-miss -> export ONNX,
    build, serialize ("built"). Raises on real build failure - the caller guards
    it into a non-fatal fell_back. Heavy deps imported lazily."""
    key = engine_cache_key(
        family=family, pipeline_class=pipeline_class, precision=precision,
        resolution_bucket=resolution_bucket, compute_capability=compute_capability,
        trt_version=trt_version)
    path = engine_cache_path(cache_dir, key)
    os.makedirs(cache_dir, exist_ok=True)
    if os.path.isfile(path):
        _bind_engine(pipeline, path)
        return "cached"
    _build_engine(pipeline, path, resolution_bucket=resolution_bucket, precision=precision)
    return "built"


def _bind_engine(pipeline, path: str) -> None:
    import torch_tensorrt  # noqa: F401, PLC0415 - lazy heavy dep

    # Deserialize the serialized TRT module and attach to the pipeline's denoiser.
    # (Engineer: bind to pipeline.unet/transformer per the torch_tensorrt API.)
    raise NotImplementedError  # replaced with the real bind in the CUDA-verified pass


def _build_engine(pipeline, path: str, *, resolution_bucket: str, precision: str) -> None:
    import torch_tensorrt  # noqa: F401, PLC0415 - lazy heavy dep

    # Export the denoiser to ONNX at the bucket's shape, compile a TRT engine,
    # serialize to `path`. (Engineer: implement per the torch_tensorrt API and
    # verify output tolerance via benchmark_accel before adding the family to
    # TRT_PROVEN_FAMILIES.)
    raise NotImplementedError  # replaced with the real build in the CUDA-verified pass
