"""
Retrieval orchestration for M7 (S4, S7, S8, S10).

Ingest: allow-list sanitize each record (only source/text/boost/label survive —
secrets are structurally impossible to index), embed when the model is present,
upsert into the index, persist. Query: semantic ranking when the embedder is
available, deterministic lexical fallback otherwise; merge the curated KB for
the model family; greedily fit snippets to a conservative token budget.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Dict, List, Optional, Set

import numpy as np

from services.retrieval.embedder import Embedder
from services.retrieval.index_store import CorpusItem, IndexStore, ScoredItem, content_hash
from services.retrieval.knowledge_base import KnowledgeBase

logger = logging.getLogger(__name__)

BOOST_MULTIPLIER = 1.5
PER_SOURCE_K = 5
CHARS_PER_TOKEN = 4
VALID_SOURCES = {"prompt-history", "assets", "knowledge-base"}


def _estimate_tokens(text: str) -> int:
    # Conservative: round up so the assembled set never under-counts the budget.
    return max(1, math.ceil(len(text) / CHARS_PER_TOKEN))


def _tokenize(text: str) -> Set[str]:
    return {t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if t}


class RetrievalService:
    def __init__(
        self,
        data_dir: Path,
        embedder: Optional[Embedder] = None,
        knowledge_base: Optional[KnowledgeBase] = None,
    ):
        self._embedder = embedder if embedder is not None else Embedder()
        self._kb = knowledge_base if knowledge_base is not None else KnowledgeBase()
        self._index = IndexStore(Path(data_dir))
        self._index.load()

    # -- ingest -----------------------------------------------------------------

    def ingest(self, records: List[dict]) -> Dict[str, int]:
        items: List[CorpusItem] = []
        for raw in records:
            source = str(raw.get("source", ""))
            text = str(raw.get("text", "")).strip()
            if source not in VALID_SOURCES or not text:
                continue
            item_id = content_hash(source, text)
            if self._index.has(item_id):
                continue
            # Allow-list: ONLY these fields are ever read from the record.
            items.append(CorpusItem(
                id=item_id,
                source=source,
                text=text,
                label=str(raw.get("label", "")) or source,
                boost=BOOST_MULTIPLIER if bool(raw.get("boosted")) else 1.0,
                content_hash=item_id,
            ))
        if not items:
            return {"ingested": 0, "skipped": len(records), "total": self._index.count()}
        if self._embedder.available:
            vectors = self._embedder.embed([it.text for it in items])
        else:
            # No model: store with a zero placeholder vector; the lexical query path ignores it.
            vectors = np.zeros((len(items), 1), dtype=np.float32)
        self._index.upsert(items, vectors)
        self._index.persist()
        return {"ingested": len(items), "skipped": len(records) - len(items), "total": self._index.count()}

    # -- query ------------------------------------------------------------------

    def query(self, text: str, model_family: Optional[str], sources: List[str], max_tokens: int) -> Dict:
        wanted = {s for s in sources if s in VALID_SOURCES}
        corpus_sources = wanted - {"knowledge-base"}
        use_semantic = self._embedder.available and bool(corpus_sources)
        scored: List[ScoredItem] = []

        if corpus_sources:
            if use_semantic:
                qvec = self._embedder.embed([text])[0]
                scored = self._index.query(qvec, k=PER_SOURCE_K * len(corpus_sources), sources=corpus_sources)
            else:
                scored = self._lexical(text, corpus_sources)

        kb_snippets: List[Dict] = []
        if "knowledge-base" in wanted:
            for entry in self._kb.entries_for_family(model_family):
                kb_snippets.append({
                    "id": content_hash("knowledge-base", entry.text),
                    "source": "knowledge-base",
                    "text": entry.text,
                    "label": f"{(model_family or 'general')} tip",
                    "score": 0.5,  # curated entries rank below a strong personal match but above noise
                })

        merged = [
            {"id": s.id, "source": s.source, "text": s.text, "label": s.label, "score": s.score}
            for s in scored
        ] + kb_snippets
        merged.sort(key=lambda s: s["score"], reverse=True)

        chosen: List[Dict] = []
        used = 0
        for snippet in merged:
            cost = _estimate_tokens(snippet["text"])
            if used + cost > max_tokens:
                continue
            chosen.append(snippet)
            used += cost

        return {"snippets": chosen, "mode": "semantic" if use_semantic else "lexical"}

    def _lexical(self, text: str, sources: Set[str]) -> List[ScoredItem]:
        query_terms = _tokenize(text)
        results: List[ScoredItem] = []
        for item in self._index.items_for_sources(sources):
            overlap = len(query_terms & _tokenize(item.text))
            if overlap == 0:
                continue
            score = (overlap / max(1, len(query_terms))) * item.boost
            results.append(ScoredItem(id=item.id, source=item.source, text=item.text, label=item.label, score=score))
        results.sort(key=lambda s: s.score, reverse=True)
        return results[: PER_SOURCE_K * len(sources)]

    # -- management -------------------------------------------------------------

    def clear(self) -> None:
        self._index.clear()
        self._index.persist()

    def stats(self) -> Dict:
        return {"count": self._index.count(), "mode": "semantic" if self._embedder.available else "lexical"}
