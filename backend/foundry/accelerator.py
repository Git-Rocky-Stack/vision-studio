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

import importlib.util
import os
from dataclasses import dataclass, field, replace
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

_VAE_SCALE_DEFAULT = 8  # SD15/SDXL VAE downscale; engine resolution-bucket math

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

# method -> families verified safe (output within tolerance vs unquantized).
# Populated from the PR2 benchmark+correctness sweep, not asserted (spec S5/S8).
_QUANT_ALLOWLIST = {
    "int8": {"sdxl", "sd15", "flux", "sd35"},
    "fp8": {"flux", "sd35", "sdxl"},
}


@dataclass(frozen=True)
class QuantBackends:
    int8: bool = False
    fp8: bool = False


def _spec_present(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def quant_backends_available() -> QuantBackends:
    """Which quantization backends are importable - WITHOUT importing them
    (find_spec does not execute the module). optimum-quanto provides both
    post-load int8 (qint8) and fp8 (qfloat8); torchao is an fp8 alternative."""
    quanto = _spec_present("optimum.quanto")
    return QuantBackends(int8=quanto, fp8=quanto or _spec_present("torchao"))


def family_for_plan(plan) -> Optional[str]:
    """Family string for a RuntimePlan, via its pipeline_class. None if unknown
    (the decision layer then defaults conservatively)."""
    return _FAMILY_BY_PIPELINE_CLASS.get(getattr(plan, "pipeline_class", None))


_VALID_TRISTATE = {"auto", "on", "off"}
_TRISTATE_FIELDS = ("sdpa", "channels_last", "compile", "quantization", "attention_slicing", "tensorrt")


def accel_settings_from_dict(data: Optional[dict]) -> AccelerationSettings:
    """Tolerant parser: missing -> default, unknown keys ignored, an invalid
    tri-state falls back to 'auto'. Never raises on user-supplied data."""
    if not data:
        return DEFAULT_ACCELERATION_SETTINGS
    patch = {}
    if isinstance(data.get("master_enable"), bool):
        patch["master_enable"] = data["master_enable"]
    for field_name in _TRISTATE_FIELDS:
        value = data.get(field_name)
        if isinstance(value, str):
            patch[field_name] = value if value in _VALID_TRISTATE else "auto"
    return replace(DEFAULT_ACCELERATION_SETTINGS, **patch)


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


def _auto_quant(family, profile, backends: QuantBackends) -> Optional[str]:
    """Most aggressive PROVEN-SAFE method for (family, hardware, deps)."""
    if family is None:
        return None
    if getattr(profile, "supports_fp8", False) and family in _QUANT_ALLOWLIST["fp8"] and backends.fp8:
        return "fp8"
    if family in _QUANT_ALLOWLIST["int8"] and backends.int8:
        return "int8"
    return None


def _resolve_quant(family, profile, settings, backends: QuantBackends, notes: List[str]) -> Optional[str]:
    """Four-gate quantization (spec S5): family allowlist, hardware capability,
    backend availability, GPU-only. Explicit method honored only if all pass."""
    s = settings.quantization
    if s == "off":
        return None
    if not getattr(profile, "gpu_available", False):
        if s in ("int8", "fp8"):
            notes.append(f"quantization {s} skipped: no GPU")
        return None
    if s == "auto":
        method = _auto_quant(family, profile, backends)
        if method:
            notes.append(f"quantization auto: {method} ({family})")
        return method
    # Forced method - honor only if every gate passes (spec S5 Gate-4 override).
    method = s
    if family not in _QUANT_ALLOWLIST.get(method, set()):
        notes.append(f"quantization {method} skipped: {family or 'unknown'} not on the {method} allowlist")
        return None
    if method == "fp8" and not getattr(profile, "supports_fp8", False):
        notes.append("quantization fp8 skipped: GPU compute < 8.9")
        return None
    if not getattr(backends, method, False):
        notes.append(f"quantization {method} skipped: backend unavailable")
        return None
    notes.append(f"quantization forced: {method}")
    return method


def _trt_backend_available() -> bool:
    """True when a TensorRT backend is importable - WITHOUT importing it
    (find_spec does not execute the module)."""
    return _spec_present("torch_tensorrt") or _spec_present("tensorrt")


def _resolve_tensorrt(family, settings: AccelerationSettings, gpu: bool, notes: List[str]) -> bool:
    """TensorRT decision (spec S7). Off by default in ``auto`` (engine build is
    expensive); enabled only when forced ``on`` OR the family is TRT-proven and a
    TRT backend is present on a GPU. Never auto-builds for an un-vetted family."""
    from foundry.tensorrt_engine import is_trt_eligible

    if settings.tensorrt == "off":
        return False
    if not gpu or not _trt_backend_available():
        if settings.tensorrt == "on":
            notes.append("tensorrt off: no GPU or TRT backend")
        return False
    if settings.tensorrt == "on":
        return True
    # auto: only proven families, and never unbidden for un-vetted ones.
    return is_trt_eligible(family)


def resolve_acceleration(plan, profile, settings: AccelerationSettings, *, backends: Optional[QuantBackends] = None) -> AccelerationPlan:
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

    if backends is None:
        backends = quant_backends_available()
    quantization = _resolve_quant(family, profile, settings, backends, notes)

    sdpa = _decide(settings.sdpa, auto_default=True)

    conv = family in _CONV_UNET_FAMILIES
    channels_last = _decide(settings.channels_last, auto_default=gpu and conv)
    if settings.channels_last == "auto" and gpu and not conv:
        notes.append(f"channels_last off: {family or 'unknown'} is not a conv-UNet family")

    compile_on = _decide(settings.compile, auto_default=gpu)
    attention_slicing = _resolve_slicing(plan, settings, gpu, notes)

    tensorrt = _resolve_tensorrt(family, settings, gpu, notes)
    if tensorrt and compile_on:
        compile_on = False
        notes.append("compile off: tensorrt is the compiled artifact (mutually exclusive)")

    return AccelerationPlan(
        compile=compile_on,
        channels_last=channels_last,
        sdpa=sdpa,
        attention_slicing=attention_slicing,
        quantization=quantization,
        tensorrt=tensorrt,
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


# precision derivation reads str(module.dtype) so it needs no torch import.
_PRECISION_BY_DTYPE_STR = {
    "torch.float16": "fp16", "torch.half": "fp16",
    "torch.bfloat16": "bf16",
    "torch.float32": "fp32", "torch.float": "fp32",
}
_CANONICAL_BUCKETS = (512, 768, 1024)


def _pipeline_precision(pipeline) -> str:
    """The denoiser's working precision, from its dtype repr. Defaults fp16."""
    _attr, module = _compile_target(pipeline)
    dtype_str = str(getattr(module, "dtype", "")) if module is not None else ""
    return _PRECISION_BY_DTYPE_STR.get(dtype_str, "fp16")


def _resolution_bucket(pipeline) -> str:
    """Snap the denoiser's native pixel resolution to a canonical engine bucket.
    sample_size (latent) * vae_scale_factor = native pixels. Defaults 1024x1024
    when the pipeline does not expose a usable sample_size."""
    _attr, module = _compile_target(pipeline)
    config = getattr(module, "config", None)
    sample_size = getattr(config, "sample_size", None)
    vae_scale = getattr(pipeline, "vae_scale_factor", _VAE_SCALE_DEFAULT) or _VAE_SCALE_DEFAULT
    if not isinstance(sample_size, int):
        return "1024x1024"
    pixels = sample_size * vae_scale
    nearest = min(_CANONICAL_BUCKETS, key=lambda b: abs(b - pixels))
    return f"{nearest}x{nearest}"


def _device_capability() -> tuple:
    """GPU compute capability, or (0, 0) when torch/CUDA is unavailable."""
    if torch is None or getattr(torch, "cuda", None) is None:
        return (0, 0)
    try:
        return tuple(torch.cuda.get_device_capability())
    except Exception:  # noqa: BLE001 - any CUDA error -> safe sentinel
        return (0, 0)


def _trt_version() -> str:
    """Installed TensorRT/torch_tensorrt version string, or 'unknown'."""
    for name in ("tensorrt", "torch_tensorrt"):
        try:
            module = importlib.import_module(name)
        except ImportError:
            continue
        version = getattr(module, "__version__", None)
        if version:
            return str(version)
    return "unknown"


def _run_tensorrt(pipeline, family) -> str:
    """Resolve the TRT engine for this pipeline; returns the state token
    ("cached"/"built"). Derives every cache-key dimension from reality so a
    cached <key>.plan is specific to the GPU + shape it was built for. Isolated
    so the apply tests patch ONE seam."""
    from foundry.tensorrt_engine import build_or_load_engine

    return build_or_load_engine(
        pipeline,
        family=family,
        pipeline_class=type(pipeline).__name__,
        precision=_pipeline_precision(pipeline),
        resolution_bucket=_resolution_bucket(pipeline),
        cache_dir=os.environ.get("VS_TRT_CACHE_DIR", ".cache/tensorrt"),
        compute_capability=_device_capability(),
        trt_version=_trt_version(),
    )


def _apply_tensorrt(pipeline, family, result: AppliedAcceleration) -> None:
    """TensorRT engine build/load with the HARD-FALLBACK rule: a failure NEVER
    fails a generation - we leave the eager module in place and record fell_back."""
    try:
        state = _run_tensorrt(pipeline, family)
        result.applied.append(f"tensorrt:{state}")
    except Exception as exc:  # noqa: BLE001 - hard-fallback, never fails a generation
        result.fell_back.append(f"tensorrt (build/load failed: {type(exc).__name__}, ran eager)")


def _quant_target(pipeline):
    """The heavy module to quantize - unet or transformer."""
    _attr, module = _compile_target(pipeline)
    return module


def _quantize_module(module, method: str) -> None:
    """Post-load quantization via optimum-quanto (works on a loaded module)."""
    from optimum.quanto import freeze, qfloat8, qint8, quantize

    weights = qfloat8 if method == "fp8" else qint8
    quantize(module, weights=weights)
    freeze(module)


def _apply_quant(pipeline, method: str, result: AppliedAcceleration) -> None:
    target = _quant_target(pipeline)
    if target is None:
        result.skipped.append(f"quantization:{method} (no unet/transformer)")
        return
    try:
        _quantize_module(target, method)
        result.applied.append(f"quantization:{method}")
    except ImportError:
        result.skipped.append(f"quantization:{method} (backend unavailable)")
    except Exception as exc:  # noqa: BLE001 - non-fatal, unquantized pipeline still valid
        result.fell_back.append(f"quantization:{method} ({type(exc).__name__})")


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
    if accel.quantization:
        _apply_quant(pipeline, accel.quantization, result)

    slicing = "max" if slicing_max else accel.attention_slicing
    if slicing is not None:
        _apply_slicing(pipeline, slicing, result)

    # TensorRT and torch.compile are mutually exclusive (the decision layer
    # already forces compile off when tensorrt wins); guard here too so a direct
    # apply_acceleration caller can never run both compiled paths.
    if accel.tensorrt:
        _apply_tensorrt(pipeline, family, result)
    elif accel.compile:
        _apply_compile(pipeline, accel, result)
    return result


def accelerate_pipeline(pipeline, plan, settings: AccelerationSettings, *, slicing_max: bool = False) -> AppliedAcceleration:
    """The single seam both generators call: resolve from the plan's attached
    hardware_profile, then apply. Returns AppliedAcceleration for surfacing."""
    profile = getattr(plan, "hardware_profile", None)
    accel = resolve_acceleration(plan, profile, settings)
    return apply_acceleration(pipeline, accel, family_for_plan(plan), slicing_max=slicing_max)
