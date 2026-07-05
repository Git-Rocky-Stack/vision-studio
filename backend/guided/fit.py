"""#34 PR3/PR4: hardware-fit gate for guided stacks (spec section 3).

ControlNet and IP-Adapter weights ride along the base RuntimePlan: EXACT
bytes from the installed safetensors headers (never observed RSS, never a
size-string guess - the gate only runs on installed records), plus a labeled
per-family guided-pass activation band. The gate only ever refuses genuinely
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


def installed_weight_bytes(model_dir: str) -> int:
    """Exact bytes for every safetensors file under an installed record dir."""
    total = 0
    pattern = os.path.join(model_dir, "**", "*.safetensors")
    for path in glob.glob(pattern, recursive=True):
        try:
            total += weight_bytes_from_header(read_safetensors_header(path))
        except (HeaderError, OSError):
            continue
    return total


def guided_fit_refusal(
    base_plan,
    family: Optional[str],
    profile,
    cn_model_dirs: List[str] = (),
    ip_model_dirs: List[str] = (),
) -> Optional[str]:
    """None when the guided stack fits (or the gate has nothing truthful to add).

    ip_model_dirs lists each resident copy: a FLUX adapter loaded once per
    reference appears once per instance, plus the encoder dir once.
    """
    if base_plan is None or base_plan.refusal or base_plan.vram_plan is None:
        return None  # base-model problems surface through their own channels
    if not profile.gpu_available:
        return None  # cpu-only generation keeps today's behavior
    cn_bytes = sum(installed_weight_bytes(model_dir) for model_dir in cn_model_dirs)
    ip_bytes = sum(installed_weight_bytes(model_dir) for model_dir in ip_model_dirs)
    extra = cn_bytes + ip_bytes
    if extra == 0:
        return None  # nothing measurable - never refuse on a guess

    estimate = base_plan.vram_plan
    overhead = GUIDED_PASS_OVERHEAD_BYTES.get(
        family or "", GUIDED_PASS_OVERHEAD_BYTES["default"])
    total = estimate.total_bytes + extra + overhead
    if total <= profile.vram_free_bytes:
        return None
    weights = estimate.weight_bytes + extra
    if (weights <= profile.system_ram_available_bytes
            and (total - weights) <= profile.vram_free_bytes):
        return None  # fits-with-offload: the loader's offload rung handles it

    parts = []
    if cn_bytes:
        count = len(cn_model_dirs)
        parts.append(f"{count} ControlNet model{'s' if count != 1 else ''}")
    if ip_bytes:
        parts.append("the IP-Adapter reference stack")
    stack = " plus ".join(parts)
    return (
        f"This guided stack does not fit on this GPU: the checkpoint plus "
        f"{stack} needs ~{total / _GIB:.1f} GB VRAM but "
        f"{profile.vram_free_bytes / _GIB:.1f} GB is free ({estimate.basis} basis). "
        "Close other GPU apps, drop a layer, or switch to a smaller checkpoint."
    )
