"""resolve_model_runtime(record, hardware) -> RuntimePlan (spec 6.3/6.4).

THE PLAN, fully surfaced and overridable (D8; overrides are wired through the
generators' resolve seam). Pillar 2 optimizes within it.
Security comes first: this module is the loader-side enforcement point the
M4 Codex gate deferred to M5 - remote-code records never resolve (M5 ships
no remote-code load path, consent or not); pickle records resolve only
through convert-to-safetensors; a missing safetensors file NEVER falls back
to a pickle sibling. Weight size comes from the record's parsed size string
(pre-download) or the local header (post-index) - never from observed RSS.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from foundry.fit import (
    VramEstimate,
    estimate_vram,
    hardware_fit,
    load_peak_ram_bytes,
    weight_bytes_from_header,
)
from foundry.hardware import HardwareProfile
from foundry.safetensors_header import HeaderError, read_safetensors_header


@dataclass(frozen=True)
class PipelineEntry:
    pipeline_class: str
    single_file_ok: bool
    # Catalog id whose repo supplies from_single_file's pinned config=
    # (Spike D adjustment 3 - never let key-sniffing pick the config repo).
    config_catalog_id: Optional[str]


PIPELINE_BY_FAMILY: Dict[Tuple[str, str], PipelineEntry] = {
    ("sd15", "image"): PipelineEntry("StableDiffusionPipeline", True, "sd-1-5"),
    ("sd15", "edit"): PipelineEntry("StableDiffusionImg2ImgPipeline", True, "sd-1-5"),
    ("sd15", "inpaint"): PipelineEntry("StableDiffusionInpaintPipeline", True, "sd-1-5"),
    ("sdxl", "image"): PipelineEntry("StableDiffusionXLPipeline", True, "sdxl-base"),
    ("sdxl", "edit"): PipelineEntry("StableDiffusionXLImg2ImgPipeline", True, "sdxl-base"),
    ("sd35", "image"): PipelineEntry("StableDiffusion3Pipeline", True, "sd3.5-medium"),
    ("flux", "image"): PipelineEntry("FluxPipeline", True, "flux-dev"),
    ("flux", "edit"): PipelineEntry("FluxImg2ImgPipeline", True, "flux-dev"),
    ("flux", "inpaint"): PipelineEntry("FluxFillPipeline", True, "flux-fill"),
    ("ltx", "video"): PipelineEntry("LTXPipeline", True, "ltx-video"),
    ("svd", "video"): PipelineEntry("StableVideoDiffusionPipeline", False, None),
    ("animatediff", "video"): PipelineEntry("AnimateDiffPipeline", True, "animatediff"),
}

# Families that corrupt output in fp16 (community-established; flux notably).
_NO_FP16_FAMILIES = {"flux", "sd35"}

_SIZE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(GB|GiB|MB|MiB)", re.IGNORECASE)

_WEIGHT_GLOBS = ("*.safetensors", "*.bin")


def select_precision(family: str, profile: HardwareProfile) -> str:
    if not profile.gpu_available:
        return "fp32"
    if profile.supports_bf16:
        return "bf16"
    if family in _NO_FP16_FAMILIES:
        return "fp32"  # honest: slow beats corrupt
    return "fp16"


def weight_bytes_from_size_string(size: str) -> int:
    """Parse the record's human size ('6.9 GB') into bytes; 0 if unknown.
    Pre-download this is the only weight signal; post-index the header wins."""
    match = _SIZE_RE.search(size or "")
    if not match:
        return 0
    value = float(match.group(1))
    unit = match.group(2).lower()
    scale = 2**30 if unit in ("gb", "gib") else 2**20
    return int(value * scale)


@dataclass
class RuntimePlan:
    pipeline_class: Optional[str] = None
    precision: Optional[str] = None
    offload: bool = False
    vae_tiling: bool = False
    attention_slicing: bool = True
    single_file: bool = False
    config_catalog_id: Optional[str] = None
    vram_plan: Optional[VramEstimate] = None
    fit: Optional[str] = None
    missing_components: List[str] = field(default_factory=list)
    fallback_ladder: List[str] = field(default_factory=list)
    readiness: str = ""
    refusal: Optional[str] = None


def _refuse(reason: str) -> RuntimePlan:
    return RuntimePlan(refusal=reason, readiness=reason)


def _local_weight_bytes(record: dict) -> Tuple[int, int]:
    """(weight_bytes, native_bytes_per_param) from local safetensors headers.
    (0, 4) when nothing local is readable - callers fall back to the size
    string. Reads headers only - never loads tensors."""
    import glob
    import os

    total = 0
    native = 4
    for location in dict.fromkeys(record.get("locations") or []):
        paths = []
        if os.path.isfile(location) and location.endswith(".safetensors"):
            paths = [location]
        elif os.path.isdir(location):
            paths = glob.glob(os.path.join(location, "**", "*.safetensors"), recursive=True)
        for path in paths:
            try:
                header = read_safetensors_header(path)
            except (HeaderError, OSError):
                continue
            total += weight_bytes_from_header(header)
            dtypes = {m.get("dtype") for k, m in header.items() if k != "__metadata__"}
            if dtypes & {"F16", "BF16"}:
                native = 2
    return total, native


def _missing_components(record: dict) -> List[str]:
    """Weighted model_index.json submodels with no weights on disk (Spike D
    stage 3: config-only components - scheduler/tokenizer/feature_extractor -
    never block)."""
    import glob
    import json
    import os

    # Duplicate locations would double-count weights / duplicate "Needs"
    # entries; dict.fromkeys dedupes while preserving order.
    missing: List[str] = []
    for location in dict.fromkeys(record.get("locations") or []):
        index_path = os.path.join(location, "model_index.json")
        if not os.path.isfile(index_path):
            continue
        try:
            with open(index_path, "r", encoding="utf-8") as handle:
                index = json.load(handle)
        except (OSError, ValueError):
            continue
        if not isinstance(index, dict):
            # Valid JSON but not an object (e.g. a list) - a corrupt or
            # foreign file must skip this location, never crash resolution.
            continue
        for name, value in index.items():
            if not (isinstance(value, (list, tuple)) and len(value) == 2):
                continue
            if value[1] is None or name in ("scheduler", "tokenizer", "tokenizer_2",
                                            "tokenizer_3", "feature_extractor"):
                continue
            component_dir = os.path.join(location, name)
            weighted = any(
                glob.glob(os.path.join(component_dir, pattern)) for pattern in _WEIGHT_GLOBS
            )
            if not weighted:
                missing.append(name)
    return missing


def _readiness(plan: RuntimePlan, profile: HardwareProfile) -> str:
    if plan.missing_components:
        return "Needs " + ", ".join(plan.missing_components)
    basis = plan.vram_plan.basis if plan.vram_plan else "estimated"
    if plan.fit == "fits":
        return f"Ready - {plan.precision} - fits ({basis})"
    if plan.fit == "fits-with-offload":
        return f"Runs with CPU offload (~slower) - {plan.precision} ({basis})"
    if plan.fit == "cpu-only":
        return "CPU only - not recommended for real work"
    total_gb = round(profile.vram_total_bytes / 2**30)
    return f"Over budget on {total_gb} GB VRAM ({basis})"


def _checkpoint_file_bytes(record: dict) -> int:
    """Size of the first local checkpoint file, 0 when nothing is on disk yet
    (pre-download single-file plans skip the load-peak RAM check honestly)."""
    import os

    for location in record.get("locations") or []:
        try:
            if os.path.isfile(location):
                return os.path.getsize(location)
        except OSError:
            continue
    return 0


def resolve_model_runtime(
    record: dict,
    profile: HardwareProfile,
    consent: Dict[str, bool],
) -> RuntimePlan:
    # -- security gate (order matters: refusals before any planning) -------
    if record.get("trust_remote_code"):
        return _refuse(
            "requires running remote code authored by the repo - no remote-code "
            "load path exists; not supported"
        )
    if (record.get("format") or "").lower() == "pickle":
        if not consent.get("pickle"):
            return _refuse("pickle weights - grant consent and convert to safetensors first")
        return _refuse("pickle weights - convert to safetensors first (Models > Convert)")

    family = record.get("base_architecture") or "unknown"
    capability = record.get("capability") or "image"
    entry = PIPELINE_BY_FAMILY.get((family, capability))
    if entry is None and capability in ("edit", "inpaint"):
        entry = PIPELINE_BY_FAMILY.get((family, "image"))
    if entry is None:
        return _refuse(
            f"architecture '{family}' has no shipped pipeline for capability "
            f"'{capability}' - cannot auto-wire"
        )

    single_file = record.get("artifact_type") == "checkpoint" and bool(record.get("locations"))
    if single_file and not entry.single_file_ok:
        return _refuse(
            f"single-file {family} checkpoints have no from_single_file load path "
            f"in diffusers - not loadable"
        )

    # -- the plan -----------------------------------------------------------
    precision = select_precision(family, profile)
    # Local-header truth beats the catalog's human size string (spec 6.2):
    # post-index the header gives EXACT bytes; pre-download the string is
    # the only signal and stays the fallback.
    weight_bytes, native_bytes = _local_weight_bytes(record)
    if weight_bytes == 0:
        weight_bytes = weight_bytes_from_size_string(record.get("size") or "")
        native_bytes = 2 if "fp16" in (record.get("size") or "").lower() else 4
    estimate = estimate_vram(
        weight_bytes_native=weight_bytes,
        native_bytes_per_param=native_bytes,
        target_precision=precision,
        family=family,
        measured_total_bytes=record.get("measured_vram_bytes"),
    )
    fit = hardware_fit(estimate, profile)
    offload = fit == "fits-with-offload"
    plan = RuntimePlan(
        pipeline_class=entry.pipeline_class,
        precision=precision,
        offload=offload,
        vae_tiling=offload,
        attention_slicing=True,
        single_file=single_file,
        config_catalog_id=entry.config_catalog_id if single_file else None,
        vram_plan=estimate,
        fit=fit,
        missing_components=_missing_components(record),
        fallback_ladder=_ladder(precision, fit),
    )

    # -- readiness readout (GeneratePanel footer contract, Task 13) ----------
    readiness = _readiness(plan, profile)
    if single_file:
        # Load-peak RAM check (Spike D adjustment 5): single-file conversion
        # transiently holds resident + checkpoint bytes in system RAM.
        # Informational only - never a refusal.
        checkpoint_bytes = _checkpoint_file_bytes(record)
        if checkpoint_bytes:
            peak = load_peak_ram_bytes(
                estimate.weight_bytes,
                checkpoint_bytes=checkpoint_bytes,
                single_file=True,
            )
            if peak > profile.system_ram_available_bytes:
                readiness = "Low RAM for load conversion - " + readiness
    if weight_bytes == 0 and estimate.basis == "estimated":
        # Nothing local, size string unparseable, no measurement: the plan
        # is activation-band-only - disclose it rather than imply precision.
        readiness += " (weight size unknown)"
    plan.readiness = readiness
    return plan


def _ladder(precision: str, fit: str) -> List[str]:
    """Ordered OOM-recovery rungs (spec 6.6), each recorded when stepped."""
    rungs: List[str] = []
    if precision == "bf16":
        rungs.append("precision:fp16")
    if fit != "fits-with-offload":
        rungs.append("offload:cpu")
    rungs.append("vae:tiling")
    rungs.append("attention:slicing-max")
    return rungs
