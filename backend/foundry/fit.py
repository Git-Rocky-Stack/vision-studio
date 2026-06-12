"""VRAM / RAM fit math (spec 6.2, calibrated by Spike D).

Weight bytes are EXACT: safetensors headers give every tensor's shape and
dtype, and Spike D measured predicted-vs-file ratios of 1.0000 across real
sd15/controlnet weights. ALL uncertainty therefore lives in two labeled
bands: activation memory (family-dependent; seeded from published runs of
each family at its native resolution) and CUDA runtime overhead (context +
cudnn workspaces). Bands are refined by tools/calibrate_vram.py on real
CUDA hardware as verified-catalog data edits; until then basis="estimated"
is surfaced everywhere (spec 6.2: measured vs estimated always labeled).
Observed RSS is NEVER a signal - from_pretrained is mmap-lazy (Spike D).
"""

import math
from dataclasses import dataclass
from typing import Dict, Optional

DTYPE_BYTES = {
    "F64": 8, "F32": 4, "F16": 2, "BF16": 2,
    "I64": 8, "I32": 4, "I16": 2, "I8": 1, "U8": 1, "BOOL": 1,
    "F8_E4M3": 1, "F8_E5M2": 1,
}

PRECISION_BYTES: Dict[str, int] = {"fp32": 4, "bf16": 2, "fp16": 2, "fp8": 1}

# Activation bands at each family's native resolution, in bytes. Seeded from
# published community measurements; calibration refines (data edits, not
# code). The unknown-family band is deliberately the WIDEST so unrecognized
# architectures are never optimistically declared to fit.
_GIB = 2**30
ACTIVATION_BAND_BYTES: Dict[str, int] = {
    "sd15": int(1.5 * _GIB),
    "sdxl": int(3.0 * _GIB),
    "sd35": int(3.5 * _GIB),
    "flux": int(4.0 * _GIB),
    "ltx": int(4.0 * _GIB),
    "svd": int(4.5 * _GIB),
    "animatediff": int(3.5 * _GIB),
}
_UNKNOWN_ACTIVATION_BAND = int(5.0 * _GIB)

# CUDA context + cudnn/cublas workspaces. Estimated; calibration refines.
RUNTIME_BAND_BYTES = int(0.7 * _GIB)


def weight_bytes_from_header(header: dict) -> int:
    """Exact bytes for the tensors a safetensors header describes."""
    total = 0
    for key, meta in header.items():
        if key == "__metadata__":
            continue
        count = math.prod(meta["shape"]) if meta["shape"] else 1
        total += count * DTYPE_BYTES.get(meta["dtype"], 4)
    return total


@dataclass
class VramEstimate:
    weight_bytes: int
    activation_bytes: int
    runtime_bytes: int
    total_bytes: int
    basis: str  # "measured" | "estimated"


def estimate_vram(
    weight_bytes_native: int,
    native_bytes_per_param: int,
    target_precision: str,
    family: Optional[str],
    measured_total_bytes: Optional[int] = None,
) -> VramEstimate:
    """Compose the plan-time VRAM budget for a model at a target precision."""
    target_bytes = PRECISION_BYTES.get(target_precision, 4)
    weights = int((weight_bytes_native * target_bytes) // max(1, native_bytes_per_param))
    if measured_total_bytes and measured_total_bytes > 0:
        # A measurement anchors the TOTAL, but hardware_fit's offload rung
        # still needs the weights/non-weights split: weights stay exact
        # (computed, clamped to the measurement) and the measurement's
        # remainder lands in activation_bytes (runtime folded in - a single
        # measured total carries no finer decomposition). Zeroing the
        # components instead would make over-budget structurally unreachable
        # for measured models.
        measured = int(measured_total_bytes)
        measured_weights = min(weights, measured)
        return VramEstimate(
            weight_bytes=measured_weights,
            activation_bytes=measured - measured_weights,
            runtime_bytes=0,
            total_bytes=measured,
            basis="measured",
        )
    activation = ACTIVATION_BAND_BYTES.get(family or "", _UNKNOWN_ACTIVATION_BAND)
    return VramEstimate(
        weight_bytes=weights,
        activation_bytes=activation,
        runtime_bytes=RUNTIME_BAND_BYTES,
        total_bytes=weights + activation + RUNTIME_BAND_BYTES,
        basis="estimated",
    )


def load_peak_ram_bytes(resident_bytes: int, checkpoint_bytes: int, single_file: bool) -> int:
    """System-RAM peak during load (Spike D adjustment 5): single-file
    conversion is not mmap-lazy and transiently holds resident + checkpoint."""
    return resident_bytes + (checkpoint_bytes if single_file else 0)


def hardware_fit(estimate: VramEstimate, profile) -> str:
    """fits | fits-with-offload | over-budget | cpu-only (spec 6.2).

    Offload moves weights to pinned host RAM, so the offload rung needs the
    WEIGHTS to fit in available system RAM while activations + runtime still
    fit in VRAM. No GPU -> cpu-only, stated honestly (Spike D: a 2-step
    128x128 sd15 run took ~13 s on this machine's CPU - functional, unfit).
    """
    if not profile.gpu_available:
        return "cpu-only"
    if estimate.total_bytes <= profile.vram_free_bytes:
        return "fits"
    non_weight = estimate.activation_bytes + estimate.runtime_bytes
    if (
        estimate.weight_bytes <= profile.system_ram_available_bytes
        and non_weight <= profile.vram_free_bytes
    ):
        return "fits-with-offload"
    return "over-budget"
