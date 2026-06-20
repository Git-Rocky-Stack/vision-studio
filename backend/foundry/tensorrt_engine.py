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

# Populated from the PR3 correctness sweep - evidence, not assertion.
TRT_PROVEN_FAMILIES = {"sdxl", "sd15"}


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
