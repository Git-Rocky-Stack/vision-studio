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
    reclaimable_bytes: int = 0,
) -> Optional[str]:
    """None when the guided stack fits (or the gate has nothing truthful to add).

    ip_model_dirs lists each resident copy: a FLUX adapter loaded once per
    reference appears once per instance, plus the encoder dir once.

    reclaimable_bytes is accelerator memory THIS process already holds
    (utils.device.process_reserved_vram_bytes): the resident pipeline and the
    cached guided models are either the very models this stack needs or get
    evicted before it loads. ``profile.vram_free_bytes`` is measured with them
    resident, so without the credit a user who already has the checkpoint
    loaded is told the same checkpoint does not fit (counted twice).
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
    available = profile.vram_free_bytes + max(0, int(reclaimable_bytes or 0))
    vram_total = getattr(profile, "vram_total_bytes", 0)
    if vram_total:
        available = min(available, vram_total)
    overhead = GUIDED_PASS_OVERHEAD_BYTES.get(
        family or "", GUIDED_PASS_OVERHEAD_BYTES["default"])
    total = estimate.total_bytes + extra + overhead
    if total <= available:
        return None
    weights = estimate.weight_bytes + extra
    if (weights <= profile.system_ram_available_bytes
            and (total - weights) <= available):
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
        f"{available / _GIB:.1f} GB is available ({estimate.basis} basis). "
        "Close other GPU apps, drop a layer, or switch to a smaller checkpoint."
    )
