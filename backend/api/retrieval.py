"""
Retrieval / AI Director API router (M7).

Local-first retrieval store: ingest the renderer's sanitized corpus, query for
budgeted context snippets, manage the index. No real embedding model or network
in tests — the service is injected with a stub via the module-level `_service`.

Every route runs the service in a worker thread: the first call loads the
index from disk and the embedding model (seconds), and every ingest/query
does numpy work - none of it may stall the event loop.

The service singleton is created once, under a lock: ``init_service`` at
startup (main.py lifespan, in a worker thread), with ``get_service`` as the
thread-safe lazy fallback for isolated router tests.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from schemas.retrieval import (  # type: ignore[import-not-found]
    IngestRequest,
    IngestResponse,
    QueryRequest,
    QueryResponse,
    StatsResponse,
)
from services.retrieval.retrieval_service import RetrievalService  # type: ignore[import-not-found]

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/retrieval", tags=["Retrieval"])

_service: Optional[RetrievalService] = None
_service_lock = threading.Lock()


def _data_dir() -> Path:
    base = os.getenv("RETRIEVAL_DATA_DIR")
    if base:
        return Path(base)
    database_path = os.getenv(
        "DATABASE_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "vision_studio.db")
    )
    return Path(os.path.dirname(database_path)) / "retrieval"


def init_service(
    models_dir: Optional[str] = None, data_dir: Optional[Path] = None
) -> RetrievalService:
    """Create the process-wide service (idempotent). Blocking: loads the index
    from disk - call it from a worker thread at startup. ``models_dir`` is
    where the provisioned embedding model lives (never downloaded at runtime).
    """
    global _service
    with _service_lock:
        if _service is None:
            _service = RetrievalService(
                data_dir=data_dir or _data_dir(),
                models_dir=Path(models_dir) if models_dir else None,
            )
        return _service


def get_service() -> RetrievalService:
    service = _service
    if service is not None:
        return service
    return init_service()


def semantic_retrieval_availability() -> dict:
    """``{"available": bool, "reason": str | None}`` for the capabilities
    response. Cheap (file-existence checks), never loads or downloads."""
    return get_service().semantic_availability()


@router.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest) -> IngestResponse:
    try:
        records = [record.model_dump() for record in request.records]
        result = await asyncio.to_thread(lambda: get_service().ingest(records))
        return IngestResponse(**result)
    except Exception as exc:  # structured error, never silent-fail
        logger.exception("Retrieval ingest failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Ingest failed", "error_code": "RETRIEVAL_INGEST_ERROR"},
        )


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    try:
        result = await asyncio.to_thread(
            lambda: get_service().query(
                text=request.text,
                model_family=request.modelFamily,
                sources=list(request.sources),
                max_tokens=request.maxTokens,
            )
        )
        return QueryResponse(**result)
    except Exception as exc:
        logger.exception("Retrieval query failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Query failed", "error_code": "RETRIEVAL_QUERY_ERROR"},
        )


@router.post("/clear")
async def clear() -> dict:
    await asyncio.to_thread(lambda: get_service().clear())
    return {"success": True}


@router.get("/stats", response_model=StatsResponse)
async def stats() -> StatsResponse:
    return StatsResponse(**await asyncio.to_thread(lambda: get_service().stats()))
