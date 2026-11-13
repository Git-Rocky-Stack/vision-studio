"""Pydantic schemas for the retrieval API."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

RetrievalSource = Literal["prompt-history", "assets", "knowledge-base"]

# One ingest request carries at most this many records (B14): each record is
# up to 8000 chars, so an unbounded list is an unbounded request body and an
# unbounded embed batch. A larger corpus is synced in chunks of this size.
MAX_INGEST_RECORDS = 10_000


class IngestRecordModel(BaseModel):
    source: RetrievalSource
    text: str = Field(min_length=1, max_length=8000)
    boosted: bool = False
    label: str = ""


class IngestRequest(BaseModel):
    records: List[IngestRecordModel] = Field(max_length=MAX_INGEST_RECORDS)


class IngestResponse(BaseModel):
    ingested: int
    skipped: int
    total: int


class QueryRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    modelFamily: Optional[str] = None
    sources: List[RetrievalSource]
    maxTokens: int = Field(gt=0, le=8000)


class SnippetModel(BaseModel):
    id: str
    source: RetrievalSource
    text: str
    label: str
    score: float


class QueryResponse(BaseModel):
    snippets: List[SnippetModel]
    mode: Literal["semantic", "lexical"]


class StatsResponse(BaseModel):
    count: int
    mode: Literal["semantic", "lexical"]
    # D5b: whether the provisioned local embedding model can serve semantic
    # ranking, and why not when it cannot (not downloaded / not installed /
    # failed to load). Lexical ranking serves every query meanwhile.
    semantic_available: bool = False
    semantic_unavailable_reason: Optional[str] = None
