"""
ComfyUI graph-execution router (M8).

Runs a user-authored ComfyUI graph as-is on a connected Comfy server (replacing
the hardcoded template for graph-originated runs). Validates the graph through the
authoritative safety gate before it reaches the server, then queues it, polls for
image outputs, saves them, and returns asset URLs. ComfyUI stays out of the M6
routing fabric - this is a backend-internal execution detail.

Only image graphs run here: the safety gate's node allow-list
(utils/comfy_graph_guard.FIRST_CLASS_NODES) covers the image pipeline only, so a
"video" graph could never pass it. The request schema refuses that type up front
with a clear message instead of pretending to support it.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from middleware.rate_limit import LIMITS, limiter
from utils.comfy_graph_guard import GraphValidationError, validate_comfy_graph
from utils.job_manager import GenerationCancelled, GenerationJob, JobStatus
from utils.timeutil import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/comfy", tags=["ComfyUI Interop"])

# Configured by main.py at startup (the lora.py module-global pattern, adapted to
# inject runtime references the endpoint cannot own).
_comfy_client_getter: Optional[Callable[[], object]] = None
_job_manager: object = None
_output_dir: str = "outputs"

SUPPORTED_GRAPH_TYPES = ("image",)
VIDEO_GRAPH_UNSUPPORTED = (
    "Video workflow graphs cannot run: the graph safety gate only allows image "
    "nodes. Generate video from the Video tab instead."
)


def configure(comfy_client_getter: Callable[[], object], job_manager: object, output_dir: str) -> None:
    global _comfy_client_getter, _job_manager, _output_dir
    _comfy_client_getter = comfy_client_getter
    _job_manager = job_manager
    _output_dir = output_dir


class RunGraphRequest(BaseModel):
    graph: Dict = Field(..., description="ComfyUI API-format prompt graph")
    generation_type: str = Field(
        "image",
        description="Only 'image' is supported: the node allow-list has no video nodes.",
    )

    @field_validator("generation_type")
    @classmethod
    def _image_graphs_only(cls, value: str) -> str:
        if value == "video":
            raise ValueError(VIDEO_GRAPH_UNSUPPORTED)
        if value not in SUPPORTED_GRAPH_TYPES:
            raise ValueError("generation_type must be 'image'.")
        return value


class RunGraphResponse(BaseModel):
    job_id: str
    status: str
    message: str


def _update(job_id: str, **kwargs) -> bool:
    """Write job fields unless the job was cancelled. False when it was."""
    if _job_manager is None:
        return True
    return _job_manager.update_unless_cancelled(job_id, **kwargs)


def _cancelled(job_id: str) -> bool:
    return _job_manager is not None and _job_manager.is_cancelled(job_id)


async def _client_ready(client: object) -> bool:
    """True when the client is connected, reconnecting on demand when it can."""
    if client is None:
        return False
    ensure_connected = getattr(client, "ensure_connected", None)
    if ensure_connected is not None:
        return bool(await ensure_connected())
    return bool(getattr(client, "connected", False))


def _write_output(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


async def execute_comfy_graph(job_id: str, graph: Dict, generation_type: str = "image") -> Optional[Dict]:
    """Queue a validated user graph on Comfy, collect outputs, and save them.

    Returns None when the job is cancelled, before or while it runs.
    """
    try:
        validate_comfy_graph(graph)  # defense-in-depth: never trust the caller
        if generation_type not in SUPPORTED_GRAPH_TYPES:
            raise GraphValidationError(VIDEO_GRAPH_UNSUPPORTED)
        client = _comfy_client_getter() if _comfy_client_getter else None
        if not await _client_ready(client):
            raise RuntimeError("ComfyUI is not connected.")

        # A job cancelled while it was still queued is never sent to ComfyUI.
        if not _update(job_id, status=JobStatus.PROCESSING, progress=0.0):
            return None
        prompt_id = await client.queue_prompt(graph)
        outputs = await client.wait_for_prompt_completion(
            prompt_id,
            progress_callback=lambda progress: _update(job_id, progress=progress),
            kinds=("images",),
            should_cancel=lambda: _cancelled(job_id),
        )

        output_dir = Path(_output_dir) / job_id
        saved: List[str] = []
        for index, output in enumerate(outputs, start=1):
            data = await client.get_image(
                output["filename"], output.get("subfolder", ""), output.get("type", "output")
            )
            extension = Path(output["filename"]).suffix or ".png"
            local_name = f"output_{index:03d}{extension}"
            # Disk writes run off the event loop: outputs can be many MB.
            await asyncio.to_thread(_write_output, output_dir / local_name, data)
            saved.append(f"/outputs/{job_id}/{local_name}")

        result = {"images": saved, "generation_type": generation_type}
        if not _update(job_id, status=JobStatus.COMPLETED, progress=100.0, result=result, completed_at=utc_now()):
            return None
        return result
    except GenerationCancelled:
        logger.info("[Job %s] ComfyUI graph stopped by cancel", job_id)
        return None
    except GraphValidationError as exc:
        # User-facing, leak-free refusal string from the gate.
        _update(job_id, status=JobStatus.FAILED, error=str(exc), completed_at=utc_now())
        raise
    except Exception as exc:
        logger.error("[Job %s] ComfyUI graph execution failed: %s", job_id, exc, exc_info=True)
        _update(job_id, status=JobStatus.FAILED, error="ComfyUI graph execution failed.", completed_at=utc_now())
        raise


@router.post("/run-graph", response_model=RunGraphResponse)
@limiter.limit(LIMITS["generate"])
async def run_graph(request: Request, body: RunGraphRequest, background_tasks: BackgroundTasks) -> RunGraphResponse:
    """Validate and run a user-authored ComfyUI image graph on a connected Comfy server.

    Rate limited with the generation limit (LIMITS["generate"]). 422 when the
    graph fails the safety gate or asks for a video graph; 409 when ComfyUI is
    not reachable (one on-demand reconnect is attempted first).
    """
    try:
        validate_comfy_graph(body.graph)
    except GraphValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    client = _comfy_client_getter() if _comfy_client_getter else None
    if not await _client_ready(client):
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
