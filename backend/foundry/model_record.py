"""ModelRecord — the atomic unit of the Model Foundry registry.

M1 carries identity, classification, origin, and curated routing metadata.
Live download/location/hardware-fit fields are added in later milestones.
"""

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ModelRecord:
    # Identity
    id: str
    name: str
    artifact_type: str          # checkpoint | diffusers-pipeline | lora | vae | controlnet | embedding | motion-adapter | annotator
    capability: str             # image | video | edit | inpaint
    base_architecture: str      # flux | sdxl | sd15 | sd35 | ltx | svd | animatediff | unknown
    source: str                 # huggingface | civitai | local | linked

    # Origin
    repo_id: Optional[str] = None
    revision: Optional[str] = None  # commit sha pinned at classification; None = unpinned (resolves to "main" at download)
    aux_repo_id: Optional[str] = None

    # State (M2: 8-value lifecycle status, single-sourced with the TS union)
    size: str = "Unknown"
    status: str = "not_found"   # ready | downloading | error | not_found | queued | verifying | paused | cancelled

    # Compatibility / curation
    tier: str = "verified"      # verified | compatible | experimental
    quality: str = "balanced"   # draft | balanced | pro | experimental | local
    runtime: str = "local"      # local | comfyui | cloud | byom
    hardware_class: str = "unknown"  # laptop | creator | workstation | unknown
    vram: str = "Unknown"

    # Provenance
    description: str = ""
    license: Optional[str] = None
    gated: bool = False

    # Location / index (M3)
    locations: List[str] = field(default_factory=list)
    identity: Optional[str] = None
    availability: str = "available"   # available | unavailable (separate axis from status)
    library_root_id: Optional[str] = None

    # Classification + security (M4)
    tier_reason: Optional[str] = None       # one-line "why this tier" (spec 5.2)
    format: Optional[str] = None            # safetensors | pickle | diffusers
    trust_remote_code: bool = False         # repo requires running its own code
    nsfw: bool = False                      # CivitAI channel; HF results always False

    # Acquisition provenance (CivitAI direct-URL path, M4)
    download_url: Optional[str] = None
    sha256: Optional[str] = None

    # Dependency graph + calibrated hardware budget (M5)
    companions: List[str] = field(default_factory=list)   # catalog ids required alongside this model
    measured_vram_bytes: Optional[int] = None              # null until calibration harness writes it

    # Acquisition scoping (#34 PR3): explicit repo paths to download. Empty =
    # the full filtered repo file list. Curated in the catalog, so entries are
    # trusted the same way _SINGLE_FILE_FILENAMES entries are.
    files: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Legacy id aliases -> canonical catalog ids. Saved projects / jobs that
# reference an old slug resolve here so nothing breaks.
LEGACY_ID_ALIASES: Dict[str, str] = {
    # Pre-foundry direct_generator slug: its hardcoded model_map accepted
    # both "sdxl" and "sdxl-base" for SDXL base (M5 Task 11 retired the map).
    "sdxl": "sdxl-base",
}


def load_catalog(path: str) -> Dict[str, "ModelRecord"]:
    """Load verified-catalog.json into ModelRecord objects keyed by id."""
    with open(path, "r", encoding="utf-8") as handle:
        raw = json.load(handle)

    records: Dict[str, ModelRecord] = {}
    for model_id, entry in raw.items():
        records[model_id] = ModelRecord(**entry)
    return records
