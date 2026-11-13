"""Edit API router: real AI edit tools as job submitters (#34 second half).

Each POST validates, registers a GenerationJob(type="edit"), schedules the
synchronous edit pass on a worker thread, and answers 202 with the job id -
the renderer polls GET /api/jobs/{job_id} exactly like generation jobs.
Missing weights surface as a FAILED job carrying the Foundry-pointer copy,
so the panel has one consistent error path. Cancellation flows through the
existing cancel endpoint; the tool passes check it between tiles/faces (and
while a GPU tool is queued behind another GPU job - edit_tools.service holds
the process-wide GPU gate). Source paths resolve through the media-path
allow-list (utils.media_paths): anything outside the outputs folder and the
linked libraries is a 400 before a job exists.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from PIL import Image

from edit_tools.service import MODEL_SCALE, run_edit_operation
from edit_tools.upscale import check_upscale_size
from edit_tools.weights import EditCancelled, EditModelUnavailable, EditToolError
from middleware.rate_limit import LIMITS, limiter
from schemas.edit import (  # type: ignore[import-not-found]
    BackgroundRemoveRequest,
    EditJobResponse,
    FaceRestoreRequest,
    UpscaleRequest,
)
from utils.job_manager import GenerationJob, JobStatus
from utils.media_paths import MediaPathError, resolve_media_path
from utils.timeutil import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/edit", tags=["Edit"])

# Configured by main.py at startup (the api/comfy_graph.py pattern).
_job_manager: Any = None
_output_dir: str = "outputs"
_models_dir: str = "models"
_resolve_record: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None


def configure(job_manager: Any, output_dir: str, models_dir: str,
              resolve_record: Callable[[str], Optional[Dict[str, Any]]]) -> None:
    global _job_manager, _output_dir, _models_dir, _resolve_record
    _job_manager = job_manager
    _output_dir = output_dir
    _models_dir = models_dir
    _resolve_record = resolve_record


async def _process(job_id: str, operation: str, params: Dict[str, Any]) -> None:
    # A job cancelled while it was still queued never starts.
    if not _job_manager.update_unless_cancelled(job_id, status=JobStatus.PROCESSING, progress=0.0):
        return

    def cancel_check() -> bool:
        job = _job_manager.get_job(job_id)
        return bool(job and job.status == JobStatus.CANCELLED)

    def progress_cb(done: int, total: int) -> None:
        _job_manager.update_job(
            job_id, progress=round(done * 100.0 / max(total, 1), 1))

    try:
        result = await asyncio.to_thread(
            run_edit_operation, job_id, operation, params, _output_dir,
            _models_dir, _resolve_record, progress_cb, cancel_check)
        # A cancel that landed after the last tile still wins over the result.
        _job_manager.update_unless_cancelled(
            job_id, status=JobStatus.COMPLETED, progress=100.0,
            result=result, completed_at=utc_now())
    except EditCancelled:
        _job_manager.update_job(
            job_id, status=JobStatus.CANCELLED, completed_at=utc_now())
    except (EditModelUnavailable, EditToolError) as exc:
        _job_manager.update_unless_cancelled(
            job_id, status=JobStatus.FAILED, error=str(exc),
            completed_at=utc_now())
    except Exception:
        logger.exception(f"[Job {job_id}] edit operation '{operation}' failed")
        _job_manager.update_unless_cancelled(
            job_id, status=JobStatus.FAILED,
            error=f"The {operation} operation failed unexpectedly - check the backend logs.",
            completed_at=utc_now())


def _image_size(source_path: str) -> Optional[tuple]:
    """(width, height) from the image header, or None when it cannot be read
    (a missing file 404s in _submit; an unreadable one fails the job)."""
    try:
        with Image.open(source_path) as image:
            return image.size
    except Exception:  # noqa: BLE001
        return None


def _resolve_source(source_path: str) -> str:
    """Allow-listed absolute source path, or HTTP 400 (never echoes the path)."""
    try:
        return resolve_media_path(source_path)
    except MediaPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _submit(operation: str, source_path: str, params: Dict[str, Any],
            background_tasks: BackgroundTasks) -> EditJobResponse:
    """Register + schedule an edit job. ``source_path`` is already resolved."""
    if not os.path.exists(source_path):  # the /api/images/crop convention
        raise HTTPException(status_code=404, detail="Source image not found")

    job_id = str(uuid.uuid4())
    _job_manager.add_job(GenerationJob(
        id=job_id,
        type="edit",
        status=JobStatus.PENDING,
        params={"source": "edit-tool", "operation": operation, **params},
        output_dir=os.path.join(_output_dir, job_id),
    ))
    background_tasks.add_task(
        _process, job_id, operation, {"source_path": source_path, **params})
    return EditJobResponse(job_id=job_id, status="pending",
                           message=f"Edit job started: {operation}")


@router.post("/remove-background", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def remove_background(request: Request, body: BackgroundRemoveRequest,
                            background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI background removal (U^2-Net). Poll GET /api/jobs/{job_id}."""
    return _submit("remove-background", _resolve_source(body.source_path),
                   {"edge_refinement": body.edge_refinement}, background_tasks)


@router.post("/upscale", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def upscale_image(request: Request, body: UpscaleRequest,
                        background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI super-resolution (Real-ESRGAN, optional GFPGAN face pass).

    An image whose working canvas would exceed 16384px on the long edge is
    refused with 422 before a job exists (the tool checks again itself).
    """
    source_path = _resolve_source(body.source_path)
    size = await asyncio.to_thread(_image_size, source_path)
    if size is not None:
        try:
            check_upscale_size(size[0], size[1], body.scale, MODEL_SCALE)
        except EditToolError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    return _submit("upscale", source_path,
                   {"scale": body.scale, "model": body.model,
                    "face_enhance": body.face_enhance}, background_tasks)


@router.post("/restore-faces", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def restore_faces(request: Request, body: FaceRestoreRequest,
                        background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI face restoration (GFPGAN v1.4). faces_detected lands on the job result."""
    return _submit("restore-faces", _resolve_source(body.source_path),
                   {"strength": body.strength}, background_tasks)
