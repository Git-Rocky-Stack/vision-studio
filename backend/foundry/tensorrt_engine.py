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
