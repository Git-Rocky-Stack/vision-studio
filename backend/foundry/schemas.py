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
    tier_reason: Optional[str] = None
    format: Optional[str] = None
    trust_remote_code: bool = False
    nsfw: bool = False
    download_url: Optional[str] = None
    sha256: Optional[str] = None

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
