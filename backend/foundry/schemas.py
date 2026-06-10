"""Pydantic schema mirroring ModelRecord for FastAPI response_model."""

from typing import List, Optional

from pydantic import BaseModel


class ModelRecordSchema(BaseModel):
    id: str
    name: str
    artifact_type: str
    capability: str
    base_architecture: str
    source: str
    repo_id: Optional[str] = None
    revision: str = "main"
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
