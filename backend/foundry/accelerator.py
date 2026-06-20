"""M9 acceleration layer (spec S3-S7).

Two stages, strictly separated:

- ``resolve_acceleration(plan, profile, settings) -> AccelerationPlan`` is a
  PURE decision function. It imports no torch and is fully unit-testable on
  the stub CI with a mocked profile and no GPU.
- ``apply_acceleration(pipeline, accel, family) -> AppliedAcceleration`` is the
  ONLY place torch / quantization / tensorrt are touched, all behind import
  guards. Every optimization is best-effort: a failure is recorded, never
  raised, so it can never fail a generation.

The M5/M6 RuntimePlan contract is read-only input - this module never mutates
or extends it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

try:  # torch is optional and absent in the lightweight CI/test env
    import torch
except ImportError:
    torch = None  # type: ignore[assignment]

# Pure-python import (no torch): the authoritative family<->pipeline map.
from foundry.runtime_resolver import PIPELINE_BY_FAMILY

# Conv-UNet families benefit from channels_last; DiT families (flux/sd35/ltx)
# are neutral-to-negative, so channels_last stays OFF for them (spec S4).
_CONV_UNET_FAMILIES = {"sd15", "sdxl", "svd"}

# Derived from the resolver's authoritative table - never hand-maintained.
# Each pipeline_class belongs to exactly one family (verified: no cross-family
# collisions in PIPELINE_BY_FAMILY).
_FAMILY_BY_PIPELINE_CLASS = {
    entry.pipeline_class: family for (family, _capability), entry in PIPELINE_BY_FAMILY.items()
}


@dataclass(frozen=True)
class AccelerationSettings:
    """The user's Performance-panel choices. Tri-state strings: ``"auto"``
    lets the decision layer choose; ``"on"``/``"off"`` are explicit overrides."""

    master_enable: bool = True
    sdpa: str = "auto"
    channels_last: str = "auto"
    compile: str = "auto"
    quantization: str = "auto"
    attention_slicing: str = "auto"
    tensorrt: str = "auto"


@dataclass(frozen=True)
class AccelerationPlan:
    """What we INTEND to apply (the pure decision output)."""

    compile: bool = False
    compile_mode: str = "reduce-overhead"
    compile_dynamic: bool = True
    channels_last: bool = False
    sdpa: bool = True
    attention_slicing: Optional[str] = None  # None | "auto" | "max"
    quantization: Optional[str] = None  # None | "int8" | "fp8"
    tensorrt: bool = False
    notes: List[str] = field(default_factory=list)


@dataclass
class AppliedAcceleration:
    """What ACTUALLY took effect (the honest apply output)."""

    applied: List[str] = field(default_factory=list)
    skipped: List[str] = field(default_factory=list)
    fell_back: List[str] = field(default_factory=list)


DEFAULT_ACCELERATION_SETTINGS = AccelerationSettings()


def family_for_plan(plan) -> Optional[str]:
    """Family string for a RuntimePlan, via its pipeline_class. None if unknown
    (the decision layer then defaults conservatively)."""
    return _FAMILY_BY_PIPELINE_CLASS.get(getattr(plan, "pipeline_class", None))
