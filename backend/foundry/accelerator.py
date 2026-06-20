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

import os
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


def _decide(setting: str, auto_default: bool) -> bool:
    """Tri-state -> bool. Explicit on/off always win; auto uses the matrix."""
    if setting == "on":
        return True
    if setting == "off":
        return False
    return auto_default


def _resolve_slicing(plan, settings: AccelerationSettings, gpu: bool, notes: List[str]) -> Optional[str]:
    """Attention-slicing decision - the always-on perf-bug fix (spec S4).

    Today RuntimePlan.attention_slicing defaults True unconditionally, slowing
    every generation even with abundant VRAM. We derive it from fit headroom
    instead. The OOM fallback ladder still re-adds max slicing at runtime if we
    are wrong, so removing the default carries zero stability risk.
    """
    if settings.attention_slicing == "off":
        return None
    if settings.attention_slicing == "on":
        return "auto"
    if not gpu:
        return None  # CPU: no VRAM-pressure concept
    fit = getattr(plan, "fit", None)
    if fit == "fits":
        notes.append("attention_slicing off: model fits with headroom")
        return None
    notes.append(f"attention_slicing auto: tight/unknown fit ({fit or 'unknown'})")
    return "auto"


def resolve_acceleration(plan, profile, settings: AccelerationSettings) -> AccelerationPlan:
    """Decide the optimization set for this (plan, hardware, settings). Pure -
    no torch, no I/O. Security refusals and the master switch short-circuit to
    an all-disabled plan before any optimization is considered."""
    notes: List[str] = []

    if getattr(plan, "refusal", None):
        notes.append("acceleration disabled: plan refused load")
        return AccelerationPlan(sdpa=False, notes=notes)
    if not settings.master_enable:
        notes.append("acceleration disabled: master switch off")
        return AccelerationPlan(sdpa=False, notes=notes)

    family = family_for_plan(plan)
    gpu = bool(getattr(profile, "gpu_available", False))

    sdpa = _decide(settings.sdpa, auto_default=True)

    conv = family in _CONV_UNET_FAMILIES
    channels_last = _decide(settings.channels_last, auto_default=gpu and conv)
    if settings.channels_last == "auto" and gpu and not conv:
        notes.append(f"channels_last off: {family or 'unknown'} is not a conv-UNet family")

    compile_on = _decide(settings.compile, auto_default=gpu)
    attention_slicing = _resolve_slicing(plan, settings, gpu, notes)

    return AccelerationPlan(
        compile=compile_on,
        channels_last=channels_last,
        sdpa=sdpa,
        attention_slicing=attention_slicing,
        notes=notes,
    )


def configure_inductor_cache(cache_dir: str) -> None:
    """Point the Inductor compile cache at a persistent app-data dir so the
    one-time torch.compile warmup is paid once across runs (spec S6). Idempotent
    and side-effect-only; never raises."""
    try:
        os.makedirs(cache_dir, exist_ok=True)
        os.environ.setdefault("TORCHINDUCTOR_CACHE_DIR", cache_dir)
    except OSError:
        pass


def _sdpa_processor():
    """The diffusers PyTorch-native SDPA attention processor. Isolated so tests
    can stub it without importing diffusers."""
    from diffusers.models.attention_processor import AttnProcessor2_0

    return AttnProcessor2_0()


def _compile_target(pipeline):
    """(attr_name, module) for the heavy denoiser - unet or transformer."""
    unet = getattr(pipeline, "unet", None)
    if unet is not None:
        return "unet", unet
    transformer = getattr(pipeline, "transformer", None)
    if transformer is not None:
        return "transformer", transformer
    return None, None


def _apply_sdpa(pipeline, result: AppliedAcceleration) -> None:
    try:
        if hasattr(pipeline, "set_attn_processor"):
            pipeline.set_attn_processor(_sdpa_processor())
            result.applied.append("sdpa")
        else:
            result.skipped.append("sdpa (no attn-processor surface)")
    except Exception as exc:  # noqa: BLE001 - best-effort
        result.skipped.append(f"sdpa ({type(exc).__name__})")


def _apply_channels_last(pipeline, family, result: AppliedAcceleration) -> None:
    if family not in _CONV_UNET_FAMILIES:
        result.skipped.append(f"channels_last ({family or 'unknown'} not conv-UNet)")
        return
    try:
        unet = getattr(pipeline, "unet", None)
        if unet is None:
            result.skipped.append("channels_last (no unet)")
            return
        unet.to(memory_format=torch.channels_last)
        result.applied.append("channels_last")
    except Exception as exc:  # noqa: BLE001
        result.fell_back.append(f"channels_last ({type(exc).__name__})")


def _apply_slicing(pipeline, level: str, result: AppliedAcceleration) -> None:
    try:
        if not hasattr(pipeline, "enable_attention_slicing"):
            result.skipped.append("attention_slicing (unsupported pipeline)")
            return
        pipeline.enable_attention_slicing("max" if level == "max" else None)
        result.applied.append(f"attention_slicing:{level}")
    except Exception as exc:  # noqa: BLE001
        result.skipped.append(f"attention_slicing ({type(exc).__name__})")


def _apply_compile(pipeline, accel: AccelerationPlan, result: AppliedAcceleration) -> None:
    """torch.compile with the spec's HARD-FALLBACK rule: a failure NEVER fails a
    generation - we leave the eager module in place and record fell_back."""
    try:
        attr, target = _compile_target(pipeline)
        if target is None:
            result.skipped.append("compile (no unet/transformer)")
            return
        compiled = torch.compile(target, mode=accel.compile_mode, dynamic=accel.compile_dynamic)
        setattr(pipeline, attr, compiled)
        result.applied.append(f"compile:{accel.compile_mode}")
    except Exception as exc:  # noqa: BLE001
        result.fell_back.append(f"compile ({type(exc).__name__}, ran eager)")


def apply_acceleration(pipeline, accel: AccelerationPlan, family, *, slicing_max: bool = False) -> AppliedAcceleration:
    """Apply ``accel`` to a loaded, on-device pipeline. Every step is guarded and
    non-fatal; returns the honest AppliedAcceleration record."""
    result = AppliedAcceleration()
    if torch is None:
        result.skipped.append("all optimizations (torch unavailable)")
        return result

    if accel.sdpa:
        _apply_sdpa(pipeline, result)
    if accel.channels_last:
        _apply_channels_last(pipeline, family, result)

    slicing = "max" if slicing_max else accel.attention_slicing
    if slicing is not None:
        _apply_slicing(pipeline, slicing, result)

    if accel.compile:
        _apply_compile(pipeline, accel, result)
    return result


def accelerate_pipeline(pipeline, plan, settings: AccelerationSettings, *, slicing_max: bool = False) -> AppliedAcceleration:
    """The single seam both generators call: resolve from the plan's attached
    hardware_profile, then apply. Returns AppliedAcceleration for surfacing."""
    profile = getattr(plan, "hardware_profile", None)
    accel = resolve_acceleration(plan, profile, settings)
    return apply_acceleration(pipeline, accel, family_for_plan(plan), slicing_max=slicing_max)
