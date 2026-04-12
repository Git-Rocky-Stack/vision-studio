"""
LoRA Mixer API router for FastAPI.

Provides endpoints for LoRA image generation and model management.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

from fastapi import APIRouter, HTTPException, status

from schemas.lora import (  # type: ignore[import-not-found]
    LoRAErrorResponse,
    LoRARequest,
    LoRAResponse,
)
from services.lora_service import (  # type: ignore[import-not-found]
    LoRAService,
    encode_image_base64,
)

# Create router with prefix
router = APIRouter(prefix="/api/v1/lora", tags=["LoRA"])

# Global service instance (initialized on first use)
_service: Optional[LoRAService] = None


def get_service() -> LoRAService:
    """Get or create the LoRA service instance."""
    global _service
    if _service is None:
        models_dir = os.getenv("LORA_MODELS_DIR")
        _service = LoRAService(models_dir=models_dir)
    return _service


@router.post(
    "/generate",
    response_model=Union[LoRAResponse, LoRAErrorResponse],
)
async def generate_lora(request: LoRARequest) -> Union[LoRAResponse, LoRAErrorResponse]:
    """
    Generate images using LoRA (Low-Rank Adaptation).

    Creates AI-generated images based on a text prompt with LoRA model styling.
    LoRA models allow for fine-tuned styles, characters, or concepts without
    modifying the base model weights.

    ### Request Body
    - `base_model`: Base model identifier or path
    - `lora_path`: Path to LoRA weights file (.safetensors or .pt)
    - `lora_scale`: LoRA weighting strength (0.0-2.0, default 0.8)
    - `prompt`: Text description of the image to generate (1-2000 chars)
    - `negative_prompt`: Elements to exclude (max 2000 chars)
    - `num_inference_steps`: Sampling iterations (1-150, default 30)
    - `guidance_scale`: CFG scale (1.0-30.0, default 7.5)
    - `width`: Output width (64-2048, default 512)
    - `height`: Output height (64-2048, default 512)
    - `seed`: Random seed (None for random)
    - `num_images`: Number of images (1-8, default 1)

    ### Response
    - `success`: True if generation succeeded
    - `images`: List of generated image paths
    - `seed`: Seed used for generation
    - `processing_time_ms`: Time taken in milliseconds
    - `lora_applied`: Path to the LoRA model that was applied
    - `lora_scale`: The scale at which LoRA was applied

    ### Example
    ```json
    {
      "base_model": "runwayml/stable-diffusion-v1-5",
      "lora_path": "path/to/style-lora.safetensors",
      "lora_scale": 0.8,
      "prompt": "a cyberpunk cityscape at night",
      "negative_prompt": "blurry, low quality",
      "steps": 30,
      "guidance_scale": 7.5,
      "width": 512,
      "height": 512
    }
    ```
    """
    start_time = time.time()
    service = get_service()

    try:
        # Load the LoRA with specified scale
        await service.load_lora(
            base_model=request.base_model,
            lora_path=request.lora_path,
            scale=request.lora_scale,
        )

        # Generate images
        results = await service.generate(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt or "",
            steps=request.num_inference_steps,
            guidance=request.guidance_scale,
            width=request.width,
            height=request.height,
            seed=request.seed,
            num_images=request.num_images,
        )

        # Encode generated images to base64
        output_images: List[str] = []
        for result in results:
            encoded = encode_image_base64(result.image)
            output_images.append(f"data:image/png;base64,{encoded}")

        processing_time_ms = (time.time() - start_time) * 1000

        return LoRAResponse(
            images=output_images,
            seed=results[0].seed if results else 0,
            processing_time_ms=processing_time_ms,
            lora_applied=request.lora_path,
            lora_scale=request.lora_scale,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": str(e), "error_code": "INVALID_INPUT"},
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(e), "error_code": "SERVICE_ERROR"},
        )
    except Exception as e:
        logger.exception(f"LoRA generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Generation failed: {str(e)}", "error_code": "INTERNAL_ERROR"},
        )


@router.post(
    "/unload",
    response_model=Dict[str, Any],
    responses={
        200: {"description": "Model unloaded successfully"},
        500: {"model": LoRAErrorResponse, "description": "Internal server error"},
    },
)
async def unload_lora() -> Dict[str, Any]:
    """
    Unload the LoRA model from memory.

    Frees VRAM by unloading the currently loaded LoRA model.
    Call this endpoint when you're done generating images to free up resources.

    ### Response
    - `success`: True if model was unloaded
    - `message`: Confirmation message

    ### Example
    ```
    POST /api/v1/lora/unload
    ```
    """
    try:
        service = get_service()
        await service.unload()

        return {
            "success": True,
            "message": "LoRA model unloaded successfully",
        }

    except Exception as e:
        logger.exception(f"Failed to unload LoRA model: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Failed to unload model: {str(e)}", "error_code": "UNLOAD_ERROR"},
        )
