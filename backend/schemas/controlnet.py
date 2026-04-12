"""
ControlNet Pydantic schemas for request/response validation.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ControlNetModel(str, Enum):
    """Supported ControlNet model types."""
    CANNY = "canny"
    DEPTH = "depth"
    NORMAL = "normal"
    OPENPOSE = "openpose"
    SEGMENTATION = "segmentation"
    MLSD = "mlsd"
    LINEART = "lineart"
    SOFTEDGE = "softedge"


class ControlNetRequest(BaseModel):
    """
    Request schema for ControlNet image generation.

    Attributes:
        prompt: Text description of the image to generate (1-2000 chars)
        images: List of base64-encoded control images (at least 1 required)
        model: ControlNet model type to use
        conditioning_scale: Strength of control (0.0-2.0, default 1.0)
        guidance_start: When control begins (0.0-1.0, default 0.0)
        guidance_end: When control ends (0.0-1.0, default 1.0)
        steps: Sampling iterations (1-150, default 25)
        guidance_scale: CFG scale (1-30, default 7.5)
        width: Output image width (64-2048, default 512)
        height: Output image height (64-2048, default 512)
        seed: Random seed for reproducibility (-1 for random)
        num_images: Number of images to generate (1-8, default 1)
        negative_prompt: Elements to exclude from output
    """
    prompt: str = Field(
        ...,
        min_length=0,
        max_length=2000,
        description="Text description of the image to generate"
    )
    images: List[str] = Field(
        ...,
        min_length=1,
        description="List of base64-encoded control images"
    )
    model: ControlNetModel = Field(
        ...,
        description="ControlNet model type to use"
    )
    conditioning_scale: float = Field(
        default=1.0,
        ge=0.0,
        le=2.0,
        description="Strength of control"
    )
    guidance_start: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="When control begins (0.0-1.0)"
    )
    guidance_end: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="When control ends (0.0-1.0)"
    )
    steps: int = Field(
        default=25,
        ge=1,
        le=150,
        description="Sampling iterations"
    )
    guidance_scale: float = Field(
        default=7.5,
        ge=1.0,
        le=30.0,
        description="CFG scale"
    )
    width: int = Field(
        default=512,
        ge=64,
        le=2048,
        description="Output image width"
    )
    height: int = Field(
        default=512,
        ge=64,
        le=2048,
        description="Output image height"
    )
    seed: int = Field(
        default=-1,
        description="Random seed (-1 for random)"
    )
    num_images: int = Field(
        default=1,
        ge=1,
        le=8,
        description="Number of images to generate"
    )
    negative_prompt: str = Field(
        default="",
        description="Elements to exclude from output"
    )


class ControlNetResponse(BaseModel):
    """
    Response schema for successful ControlNet generation.

    Attributes:
        success: Always true for successful responses
        images: List of generated image URLs/paths
        seed: Seed used for generation
        processing_time_ms: Time taken to generate in milliseconds
        model_used: ControlNet model that was used
        warning: Optional warning message
    """
    success: bool = Field(default=True, description="Always true for successful responses")
    images: List[str] = Field(..., description="List of generated image URLs/paths")
    seed: int = Field(..., description="Seed used for generation")
    processing_time_ms: float = Field(..., description="Time taken to generate in milliseconds")
    model_used: str = Field(..., description="ControlNet model that was used")
    warning: Optional[str] = Field(default=None, description="Optional warning message")


class ControlNetErrorResponse(BaseModel):
    """
    Response schema for ControlNet errors.

    Attributes:
        success: Always false for error responses
        error: Human-readable error message
        error_code: Machine-readable error code
        details: Optional additional error details
    """
    success: bool = Field(default=False, description="Always false for error responses")
    error: str = Field(..., description="Human-readable error message")
    error_code: str = Field(..., description="Machine-readable error code")
    details: Optional[Dict[str, str]] = Field(default=None, description="Optional additional error details")
