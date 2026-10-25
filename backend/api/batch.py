"""
Batch export API router for FastAPI.

Provides endpoints for batch image processing and ZIP export.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, HTTPException, Request, status

from middleware.rate_limit import LIMITS, limiter
from schemas.batch import (  # type: ignore[import-not-found]
    BatchErrorResponse,
    BatchExportRequest,
    BatchExportResponse,
)
from services.batch_service import (  # type: ignore[import-not-found]
    BatchService,
)
from utils.sanitization import sanitize_path

# Create router with prefix
router = APIRouter(prefix="/api/v1/batch", tags=["Batch"])

# Global service instance (initialized on first use)
_service: BatchService | None = None
# The backend's outputs folder (main.py configures it at startup): image ids
# resolve to generation outputs there.
_output_dir: Optional[str] = None


def configure(output_dir: Optional[str]) -> None:
    """Point the batch export at the backend's outputs folder."""
    global _output_dir, _service
    _output_dir = output_dir
    _service = None  # rebuilt on next use with the new folder


def get_service() -> BatchService:
    """Get or create the batch service instance."""
    global _service
    if _service is None:
        _service = BatchService(output_dir=_output_dir)
    return _service


@router.post(
    "/export-zip",
    response_model=BatchExportResponse | BatchErrorResponse,
    responses={
        200: {"model": BatchExportResponse, "description": "ZIP export successful"},
        400: {"model": BatchErrorResponse, "description": "Invalid request"},
        404: {"model": BatchErrorResponse, "description": "Image not found"},
        500: {"model": BatchErrorResponse, "description": "Internal server error"},
    },
)
@limiter.limit(LIMITS["batch"])
async def export_batch_to_zip(request: Request, batch_request: BatchExportRequest) -> BatchExportResponse | BatchErrorResponse:
    """
    Export multiple images to a ZIP archive.

    Processes multiple images in batch, applying format conversion,
    quality settings, and optional resizing before packaging into
    a ZIP file.

    ### Request Body
    - `image_ids`: Images to export - a generation job id (exports the job's
      first image) or an output path such as `/outputs/<job_id>/<file>`
    - `format`: Output format (png, jpg, webp), default "png"
    - `quality`: JPEG/WEBP quality (1-100), default 95
    - `resize`: Optional resize dimensions {"width": int, "height": int}, each 1-8192

    ### Response
    - `success`: True if export succeeded
    - `zip_file`: Base64-encoded ZIP file content
    - `file_count`: Number of files in the ZIP archive
    - `total_size_bytes`: Total size of the ZIP file in bytes
    - `processing_time_ms`: Time taken to process in milliseconds

    ### Example
    ```json
    {
      "image_ids": ["3f2c...-job-id", "/outputs/8a1b...-job-id/image_001.png"],
      "format": "jpg",
      "quality": 85,
      "resize": {"width": 1024, "height": 768}
    }
    ```
    """
    start_time = time.time()
    service = get_service()

    try:
        # Sanitize image IDs (prevent path traversal)
        sanitized_image_ids = [sanitize_path(image_id) for image_id in batch_request.image_ids]

        # Check which images exist before processing (decodes from disk -
        # off the event loop, like the export itself below).
        missing_images = await asyncio.to_thread(
            lambda: [
                image_id for image_id in sanitized_image_ids
                if service._get_image(image_id) is None
            ]
        )

        if missing_images:
            logger.warning(f"Missing images: {missing_images}")
            # If ALL images are missing, return 404
            if len(missing_images) == len(batch_request.image_ids):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={
                        "error": f"Images not found: {', '.join(missing_images)}",
                        "error_code": "IMAGES_NOT_FOUND",
                    },
                )
            # If SOME are missing, log warning but continue with existing ones

        # Export to ZIP
        zip_bytes, file_count = await asyncio.to_thread(
            service.export_to_zip,
            image_ids=sanitized_image_ids,
            format=batch_request.format,
            quality=batch_request.quality,
            resize=batch_request.resize,
        )

        # Encode ZIP to base64
        zip_base64 = base64.b64encode(zip_bytes).decode("ascii")
        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f"Batch export complete: {file_count} files, "
            f"{len(zip_bytes)} bytes, {processing_time_ms:.2f}ms"
        )

        return BatchExportResponse(
            success=True,
            zip_file=zip_base64,
            file_count=file_count,
            total_size_bytes=len(zip_bytes),
            processing_time_ms=processing_time_ms,
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Batch export validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": str(e), "error_code": "VALIDATION_ERROR"},
        )
    except Exception as e:
        logger.exception(f"Batch export failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": f"Export failed: {str(e)}", "error_code": "INTERNAL_ERROR"},
        )
