"""resolve_model_runtime(record, hardware) -> RuntimePlan (spec 6.3/6.4).

THE PLAN, fully surfaced and overridable (D8). Pillar 2 optimizes within it.
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

from foundry.fit import VramEstimate, estimate_vram, hardware_fit
from foundry.hardware import HardwareProfile


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

_SIZE_RE = re.compile(r"([\d.]+)\s*(GB|GiB|MB|MiB)", re.IGNORECASE)


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
    entry = PIPELINE_BY_FAMILY.get((family, capability)) or PIPELINE_BY_FAMILY.get(
        (family, "image")
    )
    if entry is None:
        return _refuse(f"architecture '{family}' has no shipped pipeline - cannot auto-wire")

    single_file = record.get("artifact_type") == "checkpoint" and bool(record.get("locations"))
    if single_file and not entry.single_file_ok:
        return _refuse(
            f"single-file {family} checkpoints have no from_single_file load path "
            f"in diffusers - not loadable"
        )

    # -- the plan -----------------------------------------------------------
    precision = select_precision(family, profile)
    weight_bytes = weight_bytes_from_size_string(record.get("size") or "")
    estimate = estimate_vram(
        weight_bytes_native=weight_bytes,
        native_bytes_per_param=2 if "fp16" in (record.get("size") or "").lower() else 4,
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
        fallback_ladder=_ladder(precision, fit),
    )
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
