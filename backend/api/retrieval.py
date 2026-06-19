"""
Retrieval / AI Director API router (M7).

Local-first retrieval store: ingest the renderer's sanitized corpus, query for
budgeted context snippets, manage the index. No real embedding model or network
in tests — the service is injected with a stub via the module-level `_service`.
"""

from __future__ import annotations

import logging
import os
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


def _data_dir() -> Path:
    base = os.getenv("RETRIEVAL_DATA_DIR")
    if base:
        return Path(base)
    database_path = os.getenv(
        "DATABASE_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "vision_studio.db")
    )
    return Path(os.path.dirname(database_path)) / "retrieval"


def get_service() -> RetrievalService:
    global _service
    if _service is None:
        _service = RetrievalService(data_dir=_data_dir())
    return _service


@router.post("/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest) -> IngestResponse:
    try:
        result = get_service().ingest([record.model_dump() for record in request.records])
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
        result = get_service().query(
            text=request.text,
            model_family=request.modelFamily,
            sources=list(request.sources),
            max_tokens=request.maxTokens,
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
    get_service().clear()
    return {"success": True}


@router.get("/stats", response_model=StatsResponse)
async def stats() -> StatsResponse:
    return StatsResponse(**get_service().stats())
