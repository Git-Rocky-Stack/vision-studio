"""
Edit tools Pydantic schemas for request/response validation.

Provides schemas for:
- Background removal (rembg)
- Image upscaling (Real-ESRGAN)
- Face restoration (GFPGAN)
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BackgroundRemoveRequest(BaseModel):
    """
    Request schema for background removal.

    Attributes:
        image: Base64-encoded input image
        alpha_matting: Enable alpha matting for refined edges
        alpha_matting_foreground_threshold: Foreground threshold (0-255)
        alpha_matting_background_threshold: Background threshold (0-255)
    """
    image: str = Field(..., min_length=1, description="Base64-encoded input image")
    alpha_matting: bool = Field(default=False, description="Enable alpha matting for refined edges")
    alpha_matting_foreground_threshold: int = Field(
        default=240,
        ge=0,
        le=255,
        description="Foreground threshold for alpha matting"
    )
    alpha_matting_background_threshold: int = Field(
        default=10,
        ge=0,
        le=255,
        description="Background threshold for alpha matting"
    )


class BackgroundRemoveResponse(BaseModel):
    """
    Response schema for successful background removal.

    Attributes:
        success: True if removal succeeded
        image: Base64-encoded image with alpha channel
        processing_time_ms: Time taken in milliseconds
    """
    success: bool = Field(default=True, description="True if removal succeeded")
    image: str = Field(..., description="Base64-encoded image with alpha channel")
    processing_time_ms: float = Field(..., description="Time taken in milliseconds")


class UpscaleRequest(BaseModel):
    """
    Request schema for image upscaling.

    Attributes:
        image: Base64-encoded input image
        scale: Upscale factor (2, 4, or 8)
        face_enhance: Enable face enhancement for portraits
    """
    image: str = Field(..., min_length=1, description="Base64-encoded input image")
    scale: Literal[2, 4, 8] = Field(default=4, description="Upscale factor (2, 4, or 8)")
    face_enhance: bool = Field(default=False, description="Enable face enhancement for portraits")


class UpscaleResponse(BaseModel):
    """
    Response schema for successful upscaling.

    Attributes:
        success: True if upscaling succeeded
        image: Base64-encoded upscaled image
        original_size: (width, height) of original image
        new_size: (width, height) of upscaled image
        processing_time_ms: Time taken in milliseconds
    """
    success: bool = Field(default=True, description="True if upscaling succeeded")
    image: str = Field(..., description="Base64-encoded upscaled image")
    original_size: tuple[int, int] = Field(..., description="(width, height) of original image")
    new_size: tuple[int, int] = Field(..., description="(width, height) of upscaled image")
    processing_time_ms: float = Field(..., description="Time taken in milliseconds")


class FaceRestoreRequest(BaseModel):
    """
    Request schema for face restoration.

    Attributes:
        image: Base64-encoded input image
        fidelity: Restoration fidelity (0.0-1.0, higher = more faithful to original)
    """
    image: str = Field(..., min_length=1, description="Base64-encoded input image")
    fidelity: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Restoration fidelity (0.0-1.0, higher = more faithful to original)"
    )


class FaceRestoreResponse(BaseModel):
    """
    Response schema for successful face restoration.

    Attributes:
        success: True if restoration succeeded
        image: Base64-encoded restored image
        faces_detected: Number of faces detected and restored
        processing_time_ms: Time taken in milliseconds
    """
    success: bool = Field(default=True, description="True if restoration succeeded")
    image: str = Field(..., description="Base64-encoded restored image")
    faces_detected: int = Field(..., description="Number of faces detected and restored")
    processing_time_ms: float = Field(..., description="Time taken in milliseconds")


class EditErrorResponse(BaseModel):
    """
    Response schema for edit tool errors.

    Attributes:
        success: Always false for error responses
        error: Human-readable error message
        error_code: Machine-readable error code
    """
    success: bool = Field(default=False, description="Always false for error responses")
    error: str = Field(..., description="Human-readable error message")
    error_code: str = Field(..., description="Machine-readable error code")
