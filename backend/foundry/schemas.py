"""Pydantic schema mirroring ModelRecord for FastAPI response_model."""

import re
from typing import List, Optional

from pydantic import BaseModel, field_validator


class ModelRecordSchema(BaseModel):
    id: str
    name: str
    artifact_type: str
    capability: str
    base_architecture: str
    source: str
    repo_id: Optional[str] = None
    revision: Optional[str] = None  # commit sha pinned at classification; None = unpinned
    aux_repo_id: Optional[str] = None
    size: str = "Unknown"
    # Lifecycle: ready | downloading | error | not_found | queued | verifying | paused | cancelled
    status: str = "not_found"
    tier: str = "verified"
    quality: str = "balanced"
    runtime: str = "local"
    hardware_class: str = "unknown"
    vram: str = "Unknown"
    description: str = ""
    license: Optional[str] = None
    gated: bool = False
    locations: List[str] = []
    identity: Optional[str] = None
    availability: str = "available"
    library_root_id: Optional[str] = None
    tier_reason: Optional[str] = None
    format: Optional[str] = None
    trust_remote_code: bool = False
    nsfw: bool = False
    download_url: Optional[str] = None
    sha256: Optional[str] = None
    # Dependency graph + calibrated hardware budget (M5)
    companions: List[str] = []
    measured_vram_bytes: Optional[int] = None

    @field_validator("sha256")
    @classmethod
    def _validate_sha256(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.fullmatch(r"[0-9a-f]{64}", v):
            raise ValueError("sha256 must be a 64-character lowercase hex string")
        return v


class DownloadJobSchema(BaseModel):
    # model_config silences pydantic v2's "model_" protected-namespace warning;
    # the API contract requires the field be named model_id.
    model_config = {"protected_namespaces": ()}

    model_id: str
    status: str  # queued | downloading | paused | verifying | ready | error | cancelled
    progress: float = 0.0
    speed: float = 0.0
    eta: Optional[float] = None
    total_bytes: int = 0
    error: Optional[str] = None
    gate_url: Optional[str] = None


class ProvisionModelSchema(BaseModel):
    """One row of the first-run auto-provisioning status (#34 installer PR2)."""

    id: str
    name: str
    license: Optional[str] = None
    attribution: Optional[str] = None
    approx_bytes: int = 0
    # ready | missing | queued | downloading | paused | verifying | error | cancelled
    status: str
    progress: float = 0.0
    error: Optional[str] = None
    gate_url: Optional[str] = None


class ProvisionStatusSchema(BaseModel):
    """Aggregate + per-model snapshot of comprehensive auto-provisioning.

    ``schema_version`` (not ``schema``) avoids shadowing pydantic's reserved
    ``BaseModel.schema`` classmethod.
    """

    schema_version: int
    overall_progress: float
    total_bytes: int
    present_bytes: int
    remaining_bytes: int
    speed: float = 0.0
    eta: Optional[float] = None
    total_count: int
    ready_count: int
    active_count: int
    error_count: int
    complete: bool
    attribution: Optional[str] = None
    models: List[ProvisionModelSchema] = []


class LibraryRootSchema(BaseModel):
    id: str
    path: str
    layout_hint: str
    added_at: str


class DetectedRootSchema(BaseModel):
    path: str
    layout_hint: str


class ScanResultSchema(BaseModel):
    records_indexed: int
    warnings: List[str] = []


class ConsentRequestSchema(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    kind: str  # pickle | trust_remote_code
    granted: bool


class ConsentStateSchema(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    pickle: bool
    trust_remote_code: bool


class SearchResultSchema(BaseModel):
    # DELIBERATE omission: SearchResult's download_url/sha256 are server-side
    # acquisition data carried on the transient ModelRecord, never in browse
    # responses. Pydantic's extra='ignore' silently drops them at
    # SearchResultSchema(**asdict(result)) - keep it that way.
    id: str
    source: str
    name: str
    repo_id: Optional[str] = None
    tier: str
    tier_reason: str
    artifact_type: str = "diffusers-pipeline"
    base_architecture: str = "unknown"
    capability: str = "image"
    downloads: int = 0
    likes: int = 0
    author: Optional[str] = None
    license: Optional[str] = None
    gated: bool = False
    nsfw: bool = False
    format: Optional[str] = None
    trust_remote_code: bool = False
    size: str = "Unknown"
    tags: List[str] = []


class SearchResponseSchema(BaseModel):
    source: str
    query: str
    page: int
    results: List[SearchResultSchema] = []
    offline: bool = False
    warning: Optional[str] = None


class ConvertResultSchema(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    safetensors_path: str
    tensor_count: int


class HardwareProfileSchema(BaseModel):
    """Mirror of foundry.hardware.HardwareProfile (spec 6.1)."""

    gpu_available: bool
    gpu_name: Optional[str] = None
    vram_total_bytes: int = 0
    vram_free_bytes: int = 0
    compute_major: int = 0
    compute_minor: int = 0
    cuda_version: Optional[str] = None
    torch_available: bool = False
    system_ram_total_bytes: int = 0
    system_ram_available_bytes: int = 0
    disk_free_bytes: int = 0


class VramEstimateSchema(BaseModel):
    """Mirror of foundry.fit.VramEstimate (spec 6.2)."""

    weight_bytes: int
    activation_bytes: int
    runtime_bytes: int
    total_bytes: int
    basis: str  # measured | estimated


class RuntimePlanSchema(BaseModel):
    """Mirror of foundry.runtime_resolver.RuntimePlan (spec 6.4).

    A refusal is an informational 200 payload, never a 4xx/5xx: preflight
    answers 'will this load here, and why not' - that answer is the product.
    """

    model_config = {"protected_namespaces": ()}

    pipeline_class: Optional[str] = None
    precision: Optional[str] = None
    offload: bool = False
    vae_tiling: bool = False
    attention_slicing: bool = True
    single_file: bool = False
    config_catalog_id: Optional[str] = None
    vram_plan: Optional[VramEstimateSchema] = None
    fit: Optional[str] = None  # fits | fits-with-offload | over-budget | cpu-only
    missing_components: List[str] = []
    fallback_ladder: List[str] = []
    readiness: str = ""
    refusal: Optional[str] = None
