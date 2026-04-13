"""
Edit API router for FastAPI.

Provides endpoints for AI-powered image editing:
- Background removal (rembg)
- Image upscaling (Real-ESRGAN)
- Face restoration (GFPGAN)
"""

from __future__ import annotations

import logging
import time
from typing import Optional, Union

from fastapi import APIRouter, HTTPException, status

from schemas.edit import (  # type: ignore[import-not-found]
    BackgroundRemoveRequest,
    BackgroundRemoveResponse,
    UpscaleRequest,
    UpscaleResponse,
    FaceRestoreRequest,
    FaceRestoreResponse,
    EditErrorResponse,
)
from services.edit_service import (  # type: ignore[import-not-found]
    EditService,
    encode_image_base64,
)
from utils.sanitization import validate_base64

logger = logging.getLogger(__name__)

# Create router with prefix
router = APIRouter(prefix="/api/v1/edit", tags=["Edit"])

# Global service instance (initialized on first use)
_service: Optional[EditService] = None


def get_service() -> EditService:
    """Get or create the Edit service instance."""
    global _service
    if _service is None:
        import os
        models_dir = os.getenv("EDIT_MODELS_DIR")
        _service = EditService(models_dir=models_dir)
    return _service


@router.post(
    "/remove-background",
    response_model=Union[BackgroundRemoveResponse, EditErrorResponse],
    responses={
        200: {"model": BackgroundRemoveResponse, "description": "Background removed successfully"},
        400: {"model": EditErrorResponse, "description": "Invalid input"},
        500: {"model": EditErrorResponse, "description": "Internal server error"},
    },
)
async def remove_background(request: BackgroundRemoveRequest) -> Union[BackgroundRemoveResponse, EditErrorResponse]:
    """
    Remove background from an image.

    Uses AI-powered background removal (rembg) to create a transparent background.
    Optional alpha matting provides refined edge detection for better results.

    ### Request Body
    - `image`: Base64-encoded input image
    - `alpha_matting`: Enable alpha matting for refined edges (default: false)
    - `alpha_matting_foreground_threshold`: Foreground threshold 0-255 (default: 240)
    - `alpha_matting_background_threshold`: Background threshold 0-255 (default: 10)

    ### Response
    - `success`: True if removal succeeded
    - `image`: Base64-encoded image with alpha channel (PNG format)
    - `processing_time_ms`: Time taken in milliseconds

    ### Example
    ```json
    {
      "image": "data:image/png;base64,iVBOR...",
      "alpha_matting": true,
      "alpha_matting_foreground_threshold": 240,
      "alpha_matting_background_threshold": 10
    }
    ```
    """
    start_time = time.time()
    service = get_service()

    try:
        # Validate base64 image
        if not validate_base64(request.image):
            raise ValueError("Invalid base64 format for image")

        # Remove background
        result_image, processing_time_ms = await service.remove_background(
            image=request.image,
            alpha_matting=request.alpha_matting,
            alpha_matting_foreground_threshold=request.alpha_matting_foreground_threshold,
            alpha_matting_background_threshold=request.alpha_matting_background_threshold,
        )

        return BackgroundRemoveResponse(
            success=True,
            image=f"data:image/png;base64,{result_image}",
            processing_time_ms=processing_time_ms,
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
        logger.exception(f"Background removal failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Background removal failed: {str(e)}", "error_code": "INTERNAL_ERROR"},
        )


@router.post(
    "/upscale",
    response_model=Union[UpscaleResponse, EditErrorResponse],
    responses={
        200: {"model": UpscaleResponse, "description": "Image upscaled successfully"},
        400: {"model": EditErrorResponse, "description": "Invalid input"},
        500: {"model": EditErrorResponse, "description": "Internal server error"},
    },
)
async def upscale_image(request: UpscaleRequest) -> Union[UpscaleResponse, EditErrorResponse]:
    """
    Upscale an image using AI super-resolution.

    Uses Real-ESRGAN for high-quality image upscaling with optional face enhancement.
    Supports 2x, 4x, and 8x scaling factors.

    ### Request Body
    - `image`: Base64-encoded input image
    - `scale`: Upscale factor: 2, 4, or 8 (default: 4)
    - `face_enhance`: Enable face enhancement for portraits (default: false)

    ### Response
    - `success`: True if upscaling succeeded
    - `image`: Base64-encoded upscaled image
    - `original_size`: (width, height) of original image
    - `new_size`: (width, height) of upscaled image
    - `processing_time_ms`: Time taken in milliseconds

    ### Example
    ```json
    {
      "image": "data:image/png;base64,iVBOR...",
      "scale": 4,
      "face_enhance": false
    }
    ```
    """
    start_time = time.time()
    service = get_service()

    try:
        # Validate base64 image
        if not validate_base64(request.image):
            raise ValueError("Invalid base64 format for image")

        # Upscale image
        result_image, original_size, new_size, processing_time_ms = await service.upscale(
            image=request.image,
            scale=request.scale,
            face_enhance=request.face_enhance,
        )

        return UpscaleResponse(
            success=True,
            image=f"data:image/png;base64,{result_image}",
            original_size=original_size,
            new_size=new_size,
            processing_time_ms=processing_time_ms,
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
        logger.exception(f"Image upscaling failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Upscaling failed: {str(e)}", "error_code": "INTERNAL_ERROR"},
        )


@router.post(
    "/restore-faces",
    response_model=Union[FaceRestoreResponse, EditErrorResponse],
    responses={
        200: {"model": FaceRestoreResponse, "description": "Faces restored successfully"},
        400: {"model": EditErrorResponse, "description": "Invalid input"},
        500: {"model": EditErrorResponse, "description": "Internal server error"},
    },
)
async def restore_faces(request: FaceRestoreRequest) -> Union[FaceRestoreResponse, EditErrorResponse]:
    """
    Restore and enhance faces in an image.

    Uses GFPGAN for AI-powered face restoration, improving quality and detail
    in detected faces. Adjustable fidelity controls how closely the output
    matches the original.

    ### Request Body
    - `image`: Base64-encoded input image
    - `fidelity`: Restoration fidelity 0.0-1.0 (default: 0.5)
      - Higher values preserve more of the original appearance
      - Lower values allow more AI enhancement

    ### Response
    - `success`: True if restoration succeeded
    - `image`: Base64-encoded restored image
    - `faces_detected`: Number of faces detected and restored
    - `processing_time_ms`: Time taken in milliseconds

    ### Example
    ```json
    {
      "image": "data:image/png;base64,iVBOR...",
      "fidelity": 0.5
    }
    ```
    """
    start_time = time.time()
    service = get_service()

    try:
        # Validate base64 image
        if not validate_base64(request.image):
            raise ValueError("Invalid base64 format for image")

        # Restore faces
        result_image, faces_detected, processing_time_ms = await service.restore_faces(
            image=request.image,
            fidelity=request.fidelity,
        )

        return FaceRestoreResponse(
            success=True,
            image=f"data:image/png;base64,{result_image}",
            faces_detected=faces_detected,
            processing_time_ms=processing_time_ms,
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
        logger.exception(f"Face restoration failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Face restoration failed: {str(e)}", "error_code": "INTERNAL_ERROR"},
        )


@router.get(
    "/models",
    response_model=dict,
)
async def list_edit_models() -> dict:
    """
    List available edit models and their status.

    Returns information about the AI models used for editing operations.

    ### Response
    - `models`: Object with model names and their status
    - `rembg`: Background removal model
    - `realesrgan`: Upscaling model
    - `gfpgan`: Face restoration model

    ### Example
    ```
    GET /api/v1/edit/models
    ```
    """
    service = get_service()

    return {
        "models": {
            "rembg": {
                "name": "Background Removal",
                "description": "AI-powered background removal using U^2-Net",
                "loaded": service.is_model_loaded("rembg"),
            },
            "realesrgan": {
                "name": "Real-ESRGAN",
                "description": "Super-resolution upscaling (2x, 4x, 8x)",
                "loaded": service.is_model_loaded("realesrgan"),
            },
            "gfpgan": {
                "name": "GFPGAN",
                "description": "Face restoration and enhancement",
                "loaded": service.is_model_loaded("gfpgan"),
            },
        },
    }
