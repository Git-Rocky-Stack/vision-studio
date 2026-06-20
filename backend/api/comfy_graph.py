"""
ComfyUI graph-execution router (M8).

Runs a user-authored ComfyUI graph as-is on a connected Comfy server (replacing
the hardcoded template for graph-originated runs). Validates the graph through the
authoritative safety gate before it reaches the server, then queues it, polls for
image OR video outputs, saves them, and returns asset URLs. ComfyUI stays out of
the M6 routing fabric - this is a backend-internal execution detail.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from middleware.rate_limit import LIMITS, limiter
from utils.comfy_graph_guard import GraphValidationError, validate_comfy_graph
from utils.job_manager import GenerationJob, JobStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/comfy", tags=["ComfyUI Interop"])

# Configured by main.py at startup (the lora.py module-global pattern, adapted to
# inject runtime references the endpoint cannot own).
_comfy_client_getter: Optional[Callable[[], object]] = None
_job_manager: object = None
_output_dir: str = "outputs"


def configure(comfy_client_getter: Callable[[], object], job_manager: object, output_dir: str) -> None:
    global _comfy_client_getter, _job_manager, _output_dir
    _comfy_client_getter = comfy_client_getter
    _job_manager = job_manager
    _output_dir = output_dir


class RunGraphRequest(BaseModel):
    graph: Dict = Field(..., description="ComfyUI API-format prompt graph")
    generation_type: str = Field("image", pattern="^(image|video)$")


class RunGraphResponse(BaseModel):
    job_id: str
    status: str
    message: str


def _kinds_for(generation_type: str) -> tuple[str, ...]:
    return ("images", "gifs", "videos") if generation_type == "video" else ("images",)


def _update(job_id: str, **kwargs) -> None:
    if _job_manager is not None:
        _job_manager.update_job(job_id, **kwargs)


async def execute_comfy_graph(job_id: str, graph: Dict, generation_type: str) -> Dict:
    """Queue a validated user graph on Comfy, collect outputs, and save them."""
    try:
        validate_comfy_graph(graph)  # defense-in-depth: never trust the caller
        client = _comfy_client_getter() if _comfy_client_getter else None
        if client is None or not getattr(client, "connected", False):
            raise RuntimeError("ComfyUI is not connected.")

        _update(job_id, status=JobStatus.PROCESSING, progress=0.0)
        prompt_id = await client.queue_prompt(graph)
        outputs = await client.wait_for_prompt_completion(
            prompt_id,
            progress_callback=lambda progress: _update(job_id, progress=progress),
            kinds=_kinds_for(generation_type),
        )

        output_dir = Path(_output_dir) / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        saved: List[str] = []
        for index, output in enumerate(outputs, start=1):
            data = await client.get_image(
                output["filename"], output.get("subfolder", ""), output.get("type", "output")
            )
            extension = Path(output["filename"]).suffix or ".png"
            local_name = f"output_{index:03d}{extension}"
            (output_dir / local_name).write_bytes(data)
            saved.append(f"/outputs/{job_id}/{local_name}")

        key = "videos" if generation_type == "video" else "images"
        result = {key: saved, "generation_type": generation_type}
        _update(job_id, status=JobStatus.COMPLETED, progress=100.0, result=result, completed_at=datetime.now())
        return result
    except GraphValidationError as exc:
        # User-facing, leak-free refusal string from the gate.
        _update(job_id, status=JobStatus.FAILED, error=str(exc), completed_at=datetime.now())
        raise
    except Exception as exc:
        logger.error(f"[Job {job_id}] ComfyUI graph execution failed: {exc}", exc_info=True)
        _update(job_id, status=JobStatus.FAILED, error="ComfyUI graph execution failed.", completed_at=datetime.now())
        raise


@router.post("/run-graph", response_model=RunGraphResponse)
@limiter.limit(LIMITS["generate"])
async def run_graph(request: Request, body: RunGraphRequest, background_tasks: BackgroundTasks) -> RunGraphResponse:
    """Validate and run a user-authored ComfyUI graph on a connected Comfy server."""
    try:
        validate_comfy_graph(body.graph)
    except GraphValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    client = _comfy_client_getter() if _comfy_client_getter else None
    if client is None or not getattr(client, "connected", False):
        raise HTTPException(status_code=409, detail="Running a workflow graph requires a connected ComfyUI server.")

    job_id = str(uuid.uuid4())
    output_dir = str(Path(_output_dir) / job_id)
    if _job_manager is not None:
        # Register the job up front so the renderer can poll it immediately;
        # JobManager.update_job is a no-op until the job exists.
        _job_manager.add_job(
            GenerationJob(
                id=job_id,
                type=body.generation_type,
                status=JobStatus.PENDING,
                params={"source": "comfy-graph", "generation_type": body.generation_type},
                output_dir=output_dir,
            )
        )

    background_tasks.add_task(execute_comfy_graph, job_id, body.graph, body.generation_type)
    return RunGraphResponse(job_id=job_id, status="pending", message="ComfyUI graph job started")
