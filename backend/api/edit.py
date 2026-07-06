"""Edit API router: real AI edit tools as job submitters (#34 second half).

Each POST validates, registers a GenerationJob(type="edit"), schedules the
synchronous edit pass on a worker thread, and answers 202 with the job id -
the renderer polls GET /api/jobs/{job_id} exactly like generation jobs.
Missing weights surface as a FAILED job carrying the Foundry-pointer copy,
so the panel has one consistent error path. Cancellation flows through the
existing cancel endpoint; the tool passes check it between tiles/faces.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from edit_tools.service import run_edit_operation
from edit_tools.weights import EditCancelled, EditModelUnavailable, EditToolError
from middleware.rate_limit import LIMITS, limiter
from schemas.edit import (  # type: ignore[import-not-found]
    BackgroundRemoveRequest,
    EditJobResponse,
    FaceRestoreRequest,
    UpscaleRequest,
)
from utils.job_manager import GenerationJob, JobStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/edit", tags=["Edit"])

# Configured by main.py at startup (the api/comfy_graph.py pattern).
_job_manager: Any = None
_output_dir: str = "outputs"
_models_dir: str = "models"
_resolve_record: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None

# Tool -> every record it needs (upscale readiness = the general model;
# anime and face_enhance surface their own refusals at run time).
TOOL_RECORDS = {
    "remove-background": ["edit-u2net"],
    "upscale": ["edit-realesrgan-x4plus"],
    "restore-faces": ["edit-gfpgan-v14", "edit-face-detection", "edit-face-parsing"],
}


def configure(job_manager: Any, output_dir: str, models_dir: str,
              resolve_record: Callable[[str], Optional[Dict[str, Any]]]) -> None:
    global _job_manager, _output_dir, _models_dir, _resolve_record
    _job_manager = job_manager
    _output_dir = output_dir
    _models_dir = models_dir
    _resolve_record = resolve_record


async def _process(job_id: str, operation: str, params: Dict[str, Any]) -> None:
    _job_manager.update_job(job_id, status=JobStatus.PROCESSING, progress=0.0)

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
        _job_manager.update_job(
            job_id, status=JobStatus.COMPLETED, progress=100.0,
            result=result, completed_at=datetime.now())
    except EditCancelled:
        _job_manager.update_job(
            job_id, status=JobStatus.CANCELLED, completed_at=datetime.now())
    except (EditModelUnavailable, EditToolError) as exc:
        _job_manager.update_job(
            job_id, status=JobStatus.FAILED, error=str(exc),
            completed_at=datetime.now())
    except Exception:
        logger.exception(f"[Job {job_id}] edit operation '{operation}' failed")
        _job_manager.update_job(
            job_id, status=JobStatus.FAILED,
            error=f"The {operation} operation failed unexpectedly - check the backend logs.",
            completed_at=datetime.now())


def _submit(operation: str, source_path: str, params: Dict[str, Any],
            background_tasks: BackgroundTasks) -> EditJobResponse:
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
    return _submit("remove-background", body.source_path,
                   {"edge_refinement": body.edge_refinement}, background_tasks)


@router.post("/upscale", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def upscale_image(request: Request, body: UpscaleRequest,
                        background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI super-resolution (Real-ESRGAN, optional GFPGAN face pass)."""
    return _submit("upscale", body.source_path,
                   {"scale": body.scale, "model": body.model,
                    "face_enhance": body.face_enhance}, background_tasks)


@router.post("/restore-faces", response_model=EditJobResponse, status_code=202)
@limiter.limit(LIMITS["edit"])
async def restore_faces(request: Request, body: FaceRestoreRequest,
                        background_tasks: BackgroundTasks) -> EditJobResponse:
    """AI face restoration (GFPGAN v1.4). faces_detected lands on the job result."""
    return _submit("restore-faces", body.source_path,
                   {"strength": body.strength}, background_tasks)


@router.get("/models")
@limiter.limit(LIMITS["default"])
async def list_edit_models(request: Request) -> dict:
    """Per-tool readiness from the Foundry registry (no fake 'loaded' flags)."""
    def ready(record_ids):
        if _resolve_record is None:
            return False
        return all(
            (_resolve_record(record_id) or {}).get("status") == "ready"
            for record_id in record_ids
        )

    return {
        "tools": {
            operation: {"ready": ready(record_ids), "records": record_ids}
            for operation, record_ids in TOOL_RECORDS.items()
        }
    }
