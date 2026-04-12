"""
ControlNet API router for FastAPI.

Provides endpoints for ControlNet image generation and model management.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException, status

from schemas.controlnet import (  # type: ignore[import-not-found]
    ControlNetErrorResponse,
    ControlNetModel,
    ControlNetRequest,
    ControlNetResponse,
)
from services.controlnet_service import (  # type: ignore[import-not-found]
    ControlNetService,
    encode_image_base64,
)

# Create router with prefix
router = APIRouter(prefix="/api/v1/controlnet", tags=["ControlNet"])

# Global service instance (initialized on first use)
_service: Optional[ControlNetService] = None


def get_service() -> ControlNetService:
    """Get or create the ControlNet service instance."""
    global _service
    if _service is None:
        import os
        models_dir = os.getenv("CONTROLNET_MODELS_DIR")
        _service = ControlNetService(models_dir=models_dir)
    return _service


@router.post(
    "/generate",
    response_model=Union[ControlNetResponse, ControlNetErrorResponse],
)
async def generate_controlnet(request: ControlNetRequest) -> Union[ControlNetResponse, ControlNetErrorResponse]:
    """
    Generate images using ControlNet.

    Creates AI-generated images based on a text prompt and control images.
    The control image(s) guide the composition, structure, or style of the output.

    ### Request Body
    - `prompt`: Text description of the image to generate (1-2000 chars)
    - `init_image`: Base64-encoded initial/reference image
    - `control_image`: Base64-encoded control image (canny, depth, etc.)
    - `model`: ControlNet model type (canny, depth, normal, openpose, segmentation, mlsd, lineart, softedge)
    - `conditioning_scale`: Strength of control (0.0-2.0, default 1.0)
    - `guidance_start`: When control begins (0.0-1.0, default 0.0)
    - `guidance_end`: When control ends (0.0-1.0, default 1.0)
    - `steps`: Sampling iterations (1-150, default 25)
    - `guidance_scale`: CFG scale (1-30, default 7.5)
    - `width`: Output width (64-2048, default 512)
    - `height`: Output height (64-2048, default 512)
    - `seed`: Random seed (-1 for random)
    - `num_images`: Number of images (1-8, default 1)
    - `negative_prompt`: Elements to exclude

    ### Response
    - `success`: True if generation succeeded
    - `images`: List of generated image paths
    - `seed`: Seed used for generation
    - `processing_time_ms`: Time taken in milliseconds
    - `model_used`: ControlNet model type used
    - `warning`: Optional warning message

    ### ControlNet Models
    - **canny**: Edge detection control
    - **depth**: Depth map control
    - **normal**: Normal map control
    - **openpose**: Human pose control
    - **segmentation**: Semantic segmentation control
    - **mlsd**: Line detection control
    - **lineart**: Line art control
    - **softedge**: Soft edge detection control

    ### Example
    ```json
    {
      "prompt": "a futuristic city skyline at sunset",
      "init_image": "data:image/png;base64,iVBOR...",
      "control_image": "data:image/png;base64,iVBOR...",
      "model": "canny",
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
        # Load the requested model
        model_type = request.model.value
        await service.load_model(model_type)

        # Generate images
        results = await service.generate(
            prompt=request.prompt,
            init_image=request.init_image,
            control_image=request.control_image,
            model_type=model_type,
            width=request.width,
            height=request.height,
            steps=request.steps,
            guidance_scale=request.guidance_scale,
            conditioning_scale=request.conditioning_scale,
            guidance_start=request.guidance_start,
            guidance_end=request.guidance_end,
            negative_prompt=request.negative_prompt,
            seed=request.seed,
            num_images=request.num_images,
        )

        # Encode generated images to base64
        output_images: List[str] = []
        for result in results:
            encoded = encode_image_base64(result.image)
            output_images.append(f"data:image/png;base64,{encoded}")

        processing_time_ms = (time.time() - start_time) * 1000

        return ControlNetResponse(
            images=output_images,
            seed=results[0].seed if results else request.seed,
            processing_time_ms=processing_time_ms,
            model_used=model_type,
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
        # Log the full exception for debugging
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Generation failed: {str(e)}", "error_code": "INTERNAL_ERROR"},
        )


@router.post(
    "/unload",
    response_model=Dict[str, Any],
    responses={
        200: {"description": "Model unloaded successfully"},
        500: {"model": ControlNetErrorResponse, "description": "Internal server error"},
    },
)
async def unload_controlnet() -> Dict[str, Any]:
    """
    Unload the ControlNet model from memory.

    Frees VRAM by unloading the currently loaded ControlNet model.
    Call this endpoint when you're done generating images to free up resources.

    ### Response
    - `success`: True if model was unloaded
    - `message`: Confirmation message

    ### Example
    ```
    POST /api/v1/controlnet/unload
    ```
    """
    try:
        service = get_service()
        await service.unload_model()

        return {
            "success": True,
            "message": "ControlNet model unloaded successfully",
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


@router.get(
    "/models",
    response_model=List[Dict[str, str]],
)
async def list_controlnet_models() -> List[Dict[str, str]]:
    """
    List available ControlNet models.

    Returns information about all supported ControlNet model types.

    ### Response
    Array of model objects with:
    - `id`: Model identifier
    - `name`: Human-readable name
    - `description`: Model description

    ### Example
    ```
    GET /api/v1/controlnet/models
    ```
    """
    service = get_service()

    models = [
        {"id": "canny", "name": "Canny Edge", "description": "Edge detection control for precise outlines"},
        {"id": "depth", "name": "Depth Map", "description": "Depth-based control for 3D structure"},
        {"id": "normal", "name": "Normal Map", "description": "Surface normal control for lighting and depth"},
        {"id": "openpose", "name": "OpenPose", "description": "Human pose estimation for character control"},
        {"id": "segmentation", "name": "Segmentation", "description": "Semantic segmentation for region control"},
        {"id": "mlsd", "name": "MLSD Lines", "description": "Straight line detection for architectural elements"},
        {"id": "lineart", "name": "Line Art", "description": "Line art extraction for sketches"},
        {"id": "softedge", "name": "Soft Edge", "description": "Soft edge detection for gentle boundaries"},
    ]

    return models
