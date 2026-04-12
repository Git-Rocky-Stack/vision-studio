"""
LoRA Mixer Pydantic schemas for request/response validation.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LoRARequest(BaseModel):
    """
    Request schema for LoRA image generation.

    Attributes:
        base_model: Base model identifier or path
        lora_path: Path to LoRA weights file (.safetensors or .pt)
        lora_scale: LoRA weighting strength (0.0-2.0, default 0.8)
        prompt: Text description of the image to generate (1-2000 chars)
        negative_prompt: Elements to exclude from output (max 2000 chars)
        num_inference_steps: Sampling iterations (1-150, default 30)
        guidance_scale: CFG scale (1.0-30.0, default 7.5)
        width: Output image width (64-2048, default 512)
        height: Output image height (64-2048, default 512)
        seed: Random seed for reproducibility (None for random)
        num_images: Number of images to generate (1-8, default 1)
    """
    base_model: str = Field(
        ...,
        min_length=1,
        description="Base model identifier or path"
    )
    lora_path: str = Field(
        ...,
        min_length=1,
        description="Path to LoRA weights file (.safetensors or .pt)"
    )
    lora_scale: float = Field(
        default=0.8,
        ge=0.0,
        le=2.0,
        description="LoRA weighting strength (0.0-2.0)"
    )
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Text description of the image to generate"
    )
    negative_prompt: Optional[str] = Field(
        default="",
        max_length=2000,
        description="Elements to exclude from output"
    )
    num_inference_steps: int = Field(
        default=30,
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
    seed: Optional[int] = Field(
        default=None,
        ge=0,
        description="Random seed (None for random)"
    )
    num_images: int = Field(
        default=1,
        ge=1,
        le=8,
        description="Number of images to generate"
    )


class LoRAResponse(BaseModel):
    """
    Response schema for successful LoRA generation.

    Attributes:
        success: True if generation succeeded
        images: List of generated image paths/URLs
        seed: Seed used for generation
        processing_time_ms: Time taken to generate in milliseconds
        lora_applied: Path to the LoRA model that was applied
        lora_scale: The scale at which LoRA was applied
    """
    success: bool = Field(default=True, description="True if generation succeeded")
    images: list[str] = Field(..., description="List of generated image paths/URLs")
    seed: int = Field(..., description="Seed used for generation")
    processing_time_ms: float = Field(..., description="Time taken to generate in milliseconds")
    lora_applied: str = Field(..., description="Path to the LoRA model that was applied")
    lora_scale: float = Field(..., description="The scale at which LoRA was applied")


class LoRAErrorResponse(BaseModel):
    """
    Response schema for LoRA errors.

    Attributes:
        success: Always false for error responses
        error: Human-readable error message
        error_code: Machine-readable error code
    """
    success: bool = Field(default=False, description="Always false for error responses")
    error: str = Field(..., description="Human-readable error message")
    error_code: str = Field(..., description="Machine-readable error code")
