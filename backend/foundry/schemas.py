"""Pydantic schema mirroring ModelRecord for FastAPI response_model."""

from typing import Optional

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
    status: str = "not_found"
    tier: str = "verified"
    quality: str = "balanced"
    runtime: str = "local"
    hardware_class: str = "unknown"
    vram: str = "Unknown"
    description: str = ""
    license: Optional[str] = None
    gated: bool = False
