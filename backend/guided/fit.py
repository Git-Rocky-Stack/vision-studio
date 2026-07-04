"""#34 PR3: hardware-fit gate for ControlNet stacks (spec section 3).

ControlNet weights ride along the base RuntimePlan: EXACT bytes from the
installed safetensors headers (never observed RSS, never a size-string
guess - the gate only runs on installed records), plus a labeled per-family
guided-pass activation band. The gate only ever refuses genuinely
over-budget combinations - cpu-only and offload-capable plans keep today's
behavior, and anything unmeasurable passes through untouched (never guess).
Messages are user-facing and path-free. No heavy imports - loads on stub CI.
"""
from __future__ import annotations

import glob
import os
from typing import List, Optional

from foundry.fit import GUIDED_PASS_OVERHEAD_BYTES, weight_bytes_from_header
from foundry.safetensors_header import HeaderError, read_safetensors_header

_GIB = 2 ** 30


def controlnet_weight_bytes(model_dir: str) -> int:
    """Exact bytes for every safetensors file under an installed record dir."""
    total = 0
    pattern = os.path.join(model_dir, "**", "*.safetensors")
    for path in glob.glob(pattern, recursive=True):
        try:
            total += weight_bytes_from_header(read_safetensors_header(path))
        except (HeaderError, OSError):
            continue
    return total


def controlnet_fit_refusal(
    base_plan,
    cn_model_dirs: List[str],
    family: Optional[str],
    profile,
) -> Optional[str]:
    """None when the stack fits (or the gate has nothing truthful to add)."""
    if base_plan is None or base_plan.refusal or base_plan.vram_plan is None:
        return None  # base-model problems surface through their own channels
    if not profile.gpu_available:
        return None  # cpu-only generation keeps today's behavior
    cn_bytes = sum(controlnet_weight_bytes(model_dir) for model_dir in cn_model_dirs)
    if cn_bytes == 0:
        return None  # nothing measurable - never refuse on a guess

    estimate = base_plan.vram_plan
    overhead = GUIDED_PASS_OVERHEAD_BYTES.get(
        family or "", GUIDED_PASS_OVERHEAD_BYTES["default"])
    total = estimate.total_bytes + cn_bytes + overhead
    if total <= profile.vram_free_bytes:
        return None
    weights = estimate.weight_bytes + cn_bytes
    if (weights <= profile.system_ram_available_bytes
            and (total - weights) <= profile.vram_free_bytes):
        return None  # fits-with-offload: the loader's offload rung handles it

    count = len(cn_model_dirs)
    plural = "s" if count != 1 else ""
    return (
        f"This ControlNet stack does not fit on this GPU: the checkpoint plus "
        f"{count} ControlNet model{plural} needs ~{total / _GIB:.1f} GB VRAM but "
        f"{profile.vram_free_bytes / _GIB:.1f} GB is free ({estimate.basis} basis). "
        "Close other GPU apps, drop a layer, or switch to a smaller checkpoint."
    )
