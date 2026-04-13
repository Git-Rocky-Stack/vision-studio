"""
Batch export Pydantic schemas for request/response validation.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class BatchExportRequest(BaseModel):
    """
    Request schema for batch image export to ZIP.

    Attributes:
        image_ids: List of image identifiers to export
        format: Output image format (png, jpg, webp)
        quality: JPEG/WEBP quality (1-100, default 95)
        resize: Optional resize dimensions {"width": int, "height": int}
    """
    image_ids: list[str] = Field(
        ...,
        min_length=1,
        description="List of image identifiers to export"
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
        description="Optional resize dimensions {\"width\": int, \"height\": int}"
    )


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
