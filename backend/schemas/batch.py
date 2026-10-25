"""
Batch export Pydantic schemas for request/response validation.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Longest edge a batch resize may ask for: every image in the batch is
# resized in memory, so the bound keeps one request from allocating gigabytes.
MAX_RESIZE_EDGE = 8192


class BatchExportRequest(BaseModel):
    """
    Request schema for batch image export to ZIP.

    Attributes:
        image_ids: Images to export - a job id (its first image under
            outputs/<job_id>/) or an output path ("/outputs/<job_id>/<file>")
        format: Output image format (png, jpg, webp)
        quality: JPEG/WEBP quality (1-100, default 95)
        resize: Optional resize dimensions {"width": int, "height": int}
    """
    image_ids: list[str] = Field(
        ...,
        min_length=1,
        description=(
            "Images to export: a generation job id (its first image) or an "
            "output path such as /outputs/<job_id>/<file>"
        ),
    )
    format: str = Field(
        default="png",
        pattern="^(png|jpg|webp)$",
        description="Output image format (png, jpg, webp)"
    )
    quality: int = Field(
        default=95,
        ge=1,
        le=100,
        description="JPEG/WEBP quality (1-100)"
    )
    resize: Optional[dict] = Field(
        default=None,
        description=(
            "Optional resize dimensions {\"width\": int, \"height\": int}, "
            f"each 1-{MAX_RESIZE_EDGE}"
        ),
    )

    @field_validator("resize")
    @classmethod
    def _validate_resize(cls, value: Optional[dict]) -> Optional[dict]:
        """Exactly integer width and height in range - a malformed resize used
        to be skipped silently, and an oversized one allocated unbounded."""
        if value is None:
            return None
        if set(value) != {"width", "height"}:
            raise ValueError("resize must have exactly 'width' and 'height'")
        for key in ("width", "height"):
            dimension = value[key]
            if isinstance(dimension, bool) or not isinstance(dimension, int):
                raise ValueError(f"resize.{key} must be an integer")
            if not 1 <= dimension <= MAX_RESIZE_EDGE:
                raise ValueError(f"resize.{key} must be between 1 and {MAX_RESIZE_EDGE}")
        return value


class BatchExportResponse(BaseModel):
    """
    Response schema for successful batch export.

    Attributes:
        success: True if export succeeded
        zip_file: Base64-encoded ZIP file content
        file_count: Number of files in the ZIP archive
        total_size_bytes: Total size of the ZIP file in bytes
        processing_time_ms: Time taken to process in milliseconds
    """
    success: bool = Field(default=True, description="True if export succeeded")
    zip_file: str = Field(..., description="Base64-encoded ZIP file content")
    file_count: int = Field(..., description="Number of files in the ZIP archive")
    total_size_bytes: int = Field(..., description="Total size of the ZIP file in bytes")
    processing_time_ms: float = Field(..., description="Time taken to process in milliseconds")


class BatchErrorResponse(BaseModel):
    """
    Response schema for batch export errors.

    Attributes:
        success: Always false for error responses
        error: Human-readable error message
        error_code: Machine-readable error code
    """
    success: bool = Field(default=False, description="Always false for error responses")
    error: str = Field(..., description="Human-readable error message")
    error_code: str = Field(..., description="Machine-readable error code")
