"""Request/response schemas for the real edit tools (#34 second half).

The stub-era synchronous base64 contract is gone (it had zero consumers);
edit operations are jobs. Requests carry a source file path (the crop/
guided-pass convention) and the tool's real parameters - nothing fake.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BackgroundRemoveRequest(BaseModel):
    source_path: str = Field(min_length=1)
    edge_refinement: int = Field(default=50, ge=0, le=100)


class UpscaleRequest(BaseModel):
    source_path: str = Field(min_length=1)
    scale: Literal[2, 4] = 2
    model: Literal["general", "anime"] = "general"
    face_enhance: bool = False


class FaceRestoreRequest(BaseModel):
    source_path: str = Field(min_length=1)
    strength: int = Field(default=50, ge=0, le=100)


class EditJobResponse(BaseModel):
    job_id: str
    status: str
    message: str
