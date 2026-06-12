"""Tri-tier compatibility classifier - the Spike C precedence ladder.

Tier = "will it load with the pipelines Vision Studio ships today".
Every verdict carries a one-line human reason (spec 5.2). The ladder demands a
POSITIVE signal for Compatible; the default is Experimental. False-Compatible=0
over the Spike C corpus is an asserted regression invariant.
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Set, Tuple

from foundry.hub_signals import RepoSignals

SHIPPED_PIPELINES = {
    "StableDiffusionPipeline",
    "StableDiffusionXLPipeline",
    "StableDiffusion3Pipeline",
    "FluxPipeline",
    "FluxFillPipeline",
    "AnimateDiffPipeline",
    "LTXPipeline",
    "StableVideoDiffusionPipeline",
    "StableDiffusionControlNetPipeline",
}
SHIPPED_COMPONENTS = {"ControlNetModel", "MotionAdapter", "AutoencoderKL"}

FAMILY_BY_CLASS = {
    "StableDiffusionPipeline": "sd15",
    "StableDiffusionXLPipeline": "sdxl",
    "StableDiffusion3Pipeline": "sd35",
    "FluxPipeline": "flux",
    "FluxFillPipeline": "flux",
    "AnimateDiffPipeline": "animatediff",
    "LTXPipeline": "ltx",
    "StableVideoDiffusionPipeline": "svd",
    "StableDiffusionControlNetPipeline": "sd15",
}

# Lora base-repo -> family. Catalog repo_ids + known hub mirrors (Spike C).
BASE_FAMILY_BY_REPO = {
    "runwayml/stable-diffusion-v1-5": "sd15",
    "stable-diffusion-v1-5/stable-diffusion-v1-5": "sd15",
    "stabilityai/stable-diffusion-xl-base-1.0": "sdxl",
    "black-forest-labs/FLUX.1-dev": "flux",
    "black-forest-labs/FLUX.1-schnell": "flux",
    "stabilityai/stable-diffusion-3.5-large": "sd35",
    "stabilityai/stable-diffusion-3.5-medium": "sd35",
}

_ALLOWED_LIBRARIES = (None, "diffusers", "stable-diffusion", "safetensors")
_COMPONENT_DIR_RE = re.compile(
    r"^(unet|transformer|vae|text_encoder\w*|prior|decoder|image_encoder|motion_adapter|controlnet)/"
)
_PICKLE_SUFFIXES = (".ckpt", ".bin", ".pt", ".pth")

# Families with a confirmed from_single_file load path (Spike D adjustment 3 -
# config pinned to catalog id; no key-sniffing). "sd-unet-family" is the
# ambiguous kohya-lora routing label and cannot pin a config - stays experimental.
# svd is carved out separately: StableVideoDiffusionPipeline has no
# FromSingleFileMixin in diffusers.
_SINGLE_FILE_FAMILIES = {"sd15", "sdxl", "sd35", "flux", "ltx", "animatediff"}


@dataclass
class TierVerdict:
    tier: str            # verified | compatible | experimental
    reason: str          # one-line tier_reason, always set
    available: bool = True
    trust_remote_code: bool = False
    format: Optional[str] = None   # safetensors | pickle | diffusers
    family: Optional[str] = None   # M5: sdxl|sd15|sd35|flux|ltx|svd|animatediff|sd-unet-family (header-lora routing label)


def tree_weight_format(siblings: List[str]) -> Tuple[int, int, int, int]:
    """(component_safetensors, component_pickle, root_safetensors, root_pickle).

    Tree-scoped (Spike C adjustment 3): the diffusers component dirs are what
    from_pretrained loads; root-level extras neither vouch nor taint.
    """
    comp_st = comp_pickle = root_st = root_pickle = 0
    for name in siblings:
        low = name.lower()
        in_comp = bool(_COMPONENT_DIR_RE.match(name))
        if low.endswith(".safetensors"):
            if in_comp:
                comp_st += 1
            elif "/" not in name:
                root_st += 1
        elif low.endswith(_PICKLE_SUFFIXES):
            if in_comp:
                comp_pickle += 1
            elif "/" not in name:
                root_pickle += 1
    return comp_st, comp_pickle, root_st, root_pickle


def file_is_lora(keys: List[str]) -> bool:
    # NOTE: .lora_A./.lora_B. are PEFT-format keys. classify_safetensors in
    # safetensors_header.py deliberately does NOT include them (M3 indexer
    # scope); if PEFT loras need local indexing, update BOTH sites together.
    return any(
        ".lora_down." in k or ".lora_up." in k or ".lora_A." in k or ".lora_B." in k
        or k.startswith(("lora_unet_", "lora_te", "lora_transformer_"))
        or ("_lora" in k and ("double_blocks." in k or "single_blocks." in k))
        for k in keys
    )


def lora_family_from_keys(keys: List[str]) -> Optional[str]:
    """Order matters: sd/sdxl unet attention paths CONTAIN 'transformer_blocks'
    (kohya), so unet-style prefixes are checked BEFORE DiT patterns (Spike C)."""
    if not file_is_lora(keys):
        return None
    if any("lora_te2" in k or "text_encoder_2" in k for k in keys):
        return "sdxl"
    # "sd-unet-family" is a routing label meaning sd15/sdxl non-DiT (any
    # kohya/diffusers unet- or te-targeting lora), not literally unet-only.
    if any(k.startswith(("lora_unet_", "lora_te")) or ".unet." in k or k.startswith("unet.") for k in keys):
        return "sd-unet-family"
    if any("double_blocks." in k or "single_blocks." in k for k in keys):
        return "flux"
    if any("transformer_blocks" in k or k.startswith("transformer.") for k in keys):
        return "dit-unknown"
    return "unrecognized"


def lora_base_family(tags: List[str]) -> Optional[str]:
    if "lora" not in tags:
        return None
    for tag in tags:
        if tag.startswith("base_model:"):
            base = tag.split(":")[-1]
            if base in BASE_FAMILY_BY_REPO:
                return BASE_FAMILY_BY_REPO[base]
    return None


def indexed_tier(artifact_type: str, family: Optional[str]) -> Tuple[str, str, Optional[str]]:
    """Post-index tier for a locally indexed artifact (spec 5.2 upgrade/downgrade).

    Standalone loras load via load_lora_weights -> compatible. Single-file
    checkpoints with a known family load via from_single_file (config pinned to
    catalog) -> compatible; the from_single_file load path shipped in M5.
    svd is carved out: StableVideoDiffusionPipeline has no FromSingleFileMixin
    in diffusers (Spike D adjustment 4).

    Returns (tier, reason, family_out). family_out echoes the input family for
    recognized families, None otherwise (M5 structured field).
    """
    if artifact_type == "lora":
        if family in ("sdxl", "sd-unet-family", "flux"):
            return "compatible", f"indexed {family} lora - loads via load_lora_weights", family
        return "experimental", "indexed lora - base family unrecognized from header", None
    if artifact_type == "checkpoint":
        if family == "svd":
            return (
                "experimental",
                "svd single-file checkpoint - StableVideoDiffusionPipeline has no "
                "from_single_file path in diffusers",
                "svd",
            )
        if family in _SINGLE_FILE_FAMILIES:  # sd15|sdxl|sd35|flux|ltx|animatediff
            return (
                "compatible",
                f"single-file {family} checkpoint - loads via from_single_file "
                f"(config pinned to catalog)",
                family,
            )
        return ("experimental", "single-file checkpoint of unrecognized architecture", None)
    if artifact_type in ("vae", "controlnet"):
        return "experimental", f"indexed loose {artifact_type} - wiring lands with M5 runtime resolution", None
    if artifact_type == "diffusers-pipeline":
        return "experimental", "indexed diffusers directory - load wiring lands with M5 runtime resolution", None
    return "experimental", "indexed artifact of unrecognized type", None


def classify_repo(signals: RepoSignals, verified_repo_ids: Set[str]) -> TierVerdict:
    """The 8-rule ladder. First match wins; default Experimental.

    Every Compatible pipeline/lora verdict carries a structured family field
    (M5). Component verdicts (ControlNetModel/MotionAdapter/AutoencoderKL)
    carry family=None - a component's base family is not derivable from its
    class alone. Verified verdicts omit family (the catalog record owns that
    metadata). Experimental defaults stay None.
    """
    # 1 - catalog authority (even if the hub copy is gone; bytes may be local).
    if signals.repo_id in verified_repo_ids:
        return TierVerdict("verified", "in verified catalog",
                           available=signals.reachable, format="safetensors")

    # 2 - unreachable, non-catalog.
    if not signals.reachable:
        return TierVerdict("experimental", "repo unreachable (removed, renamed, or offline)",
                           available=False)

    # 3 - non-diffusion libraries are never Compatible.
    if signals.library_name not in _ALLOWED_LIBRARIES:
        return TierVerdict(
            "experimental",
            f"library '{signals.library_name}' is not an image/video generation artifact we load",
        )

    # 4 - remote-code suspicion: deny by default (spec 5.3).
    if signals.has_auto_map or signals.py_file_count > 0:
        return TierVerdict(
            "experimental",
            "repo ships custom code - runs code authored by the repo (denied by default)",
            trust_remote_code=True,
        )

    comp_st, comp_pickle, root_st, root_pickle = tree_weight_format(signals.siblings)

    # 5 - explicit class signal.
    if signals.class_name:
        cls_family = FAMILY_BY_CLASS.get(signals.class_name)
        if signals.class_name in SHIPPED_PIPELINES:
            if signals.gated:
                return TierVerdict(
                    "compatible",
                    f"diffusers {cls_family} ({signals.class_name}) - gated; format verified after license accept",
                    format="diffusers",
                    family=cls_family,
                )
            if comp_st:
                return TierVerdict(
                    "compatible",
                    f"diffusers {cls_family} ({signals.class_name}) - safetensors - no remote code",
                    format="diffusers",
                    family=cls_family,
                )
            if signals.partial and signals.has_safetensors:
                # PROVISIONAL: partial (listing-level) signals carry no
                # file/config census, so this branch cannot prove "no remote
                # code". Callers MUST re-verify against full repo signals
                # before surfacing or acting on this verdict - hub_search
                # does (display) and enqueue_download does (boundary).
                return TierVerdict(
                    "compatible",
                    f"diffusers {cls_family} ({signals.class_name}) - safetensors tag - no remote code",
                    format="diffusers",
                    family=cls_family,
                )
            return TierVerdict(
                "experimental",
                f"{signals.class_name} but pickle-only weights - requires explicit consent",
                format="pickle",
                family=cls_family,
            )
        if signals.class_name in SHIPPED_COMPONENTS:
            if comp_st or root_st or signals.has_safetensors:
                # family=None deliberately: a component's base family is not
                # derivable from its class alone (a ControlNetModel may target
                # sd15 or sdxl); FAMILY_BY_CLASS has no component entries.
                return TierVerdict(
                    "compatible",
                    f"{signals.class_name} component - safetensors - no remote code",
                    format="safetensors",
                    family=None,
                )
            return TierVerdict(
                "experimental",
                f"{signals.class_name} component but pickle-only weights",
                format="pickle",
            )
        return TierVerdict(
            "experimental",
            f"pipeline class {signals.class_name} not supported by shipped pipelines",
        )

    # 5.5 - hub lora channel: lora tag + base_model tag resolving to a shipped family.
    tag_family = lora_base_family(signals.tags)
    if tag_family:
        if signals.has_safetensors:
            return TierVerdict(
                "compatible",
                f"standalone {tag_family} lora (base_model tag) - safetensors - loads via load_lora_weights",
                format="safetensors",
                family=tag_family,
            )
        return TierVerdict("experimental", f"{tag_family} lora but pickle-only weights", format="pickle", family=tag_family)

    # 6 - header lora channel (loose files), with the mixed-repo guard.
    lora_hit = None
    saw_non_lora = False
    for name, keys in signals.per_file_keys.items():
        if not keys:
            continue
        if file_is_lora(keys):
            # First recognized family wins. A pack mixing families (sd15 +
            # flux loras) still verdicts compatible naming the first family:
            # every file is individually loadable via load_lora_weights, so
            # this is not a false-Compatible. Known limitation, not in the
            # measured corpus; revisit if multi-family packs surface.
            lora_hit = lora_hit or lora_family_from_keys(keys)
        else:
            saw_non_lora = True
    if lora_hit:
        if saw_non_lora:
            return TierVerdict(
                "experimental",
                "mixed loose artifacts (loras + full/bare weights) - artifact role ambiguous pre-import",
            )
        if lora_hit in ("sdxl", "sd-unet-family", "flux"):
            return TierVerdict(
                "compatible",
                f"standalone lora ({lora_hit}) - safetensors - loads via load_lora_weights",
                format="safetensors",
                family=lora_hit,
            )
        return TierVerdict(
            "experimental",
            "lora with unrecognized family signals (DiT base unprovable from header alone)",
        )

    # 7/8 - defaults, honestly reasoned.
    if signals.has_safetensors:
        return TierVerdict(
            "experimental",
            "loose safetensors without class metadata - typed only after local header index",
            format="safetensors",
        )
    if root_pickle or comp_pickle:
        return TierVerdict(
            "experimental",
            "pickle-only weights, no metadata - requires explicit consent",
            format="pickle",
        )
    return TierVerdict("experimental", "insufficient metadata to classify")
