"""Pydantic schemas for the retrieval API."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

RetrievalSource = Literal["prompt-history", "assets", "knowledge-base"]


class IngestRecordModel(BaseModel):
    source: RetrievalSource
    text: str = Field(min_length=1, max_length=8000)
    boosted: bool = False
    label: str = ""


class IngestRequest(BaseModel):
    records: List[IngestRecordModel]


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
