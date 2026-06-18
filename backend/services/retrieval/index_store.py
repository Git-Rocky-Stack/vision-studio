"""
Pure-NumPy cosine index for M7 retrieval.

The corpus is small (low thousands of items), so brute-force cosine over a
stacked matrix is sub-millisecond and needs no native vector extension. Items
are keyed by a content hash so identical content dedupes naturally on upsert.
Persistence is two files (corpus.json + vectors.npz) under the runtime data
dir — no SQLite, no loadable extension.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

import numpy as np

from services.retrieval.embedder import EMBED_DIM


@dataclass
class CorpusItem:
    id: str
    source: str
    text: str
    label: str
    boost: float
    content_hash: str


@dataclass
class ScoredItem:
    id: str
    source: str
    text: str
    label: str
    score: float


def content_hash(source: str, text: str) -> str:
    return hashlib.sha256(f"{source}\x00{text}".encode("utf-8")).hexdigest()


class IndexStore:
    def __init__(self, data_dir: Path, dim: int = EMBED_DIM):
        self._data_dir = Path(data_dir)
        self._dim = dim
        self._by_id: Dict[str, Tuple[CorpusItem, np.ndarray]] = {}

    def has(self, item_id: str) -> bool:
        return item_id in self._by_id

    def upsert(self, items: List[CorpusItem], vectors: np.ndarray) -> None:
        for i, item in enumerate(items):
            self._by_id[item.id] = (item, np.asarray(vectors[i], dtype=np.float32))

    def remove(self, ids: Iterable[str]) -> None:
        for item_id in ids:
            self._by_id.pop(item_id, None)

    def clear(self) -> None:
        self._by_id.clear()

    def count(self) -> int:
        return len(self._by_id)

    def items_for_sources(self, sources: Set[str]) -> List[CorpusItem]:
        return [item for item, _ in self._by_id.values() if item.source in sources]

    def query(self, vector: np.ndarray, k: int, sources: Set[str]) -> List[ScoredItem]:
        candidates = [(item, vec) for item, vec in self._by_id.values() if item.source in sources]
        if not candidates:
            return []
        matrix = np.vstack([vec for _, vec in candidates])
        sims = matrix @ np.asarray(vector, dtype=np.float32)
        scored = [
            ScoredItem(id=item.id, source=item.source, text=item.text, label=item.label, score=float(sim) * item.boost)
            for (item, _), sim in zip(candidates, sims)
        ]
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored[:k]

    def persist(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        items = [asdict(item) for item, _ in self._by_id.values()]
        (self._data_dir / "corpus.json").write_text(json.dumps(items), encoding="utf-8")
        if self._by_id:
            matrix = np.vstack([vec for _, vec in self._by_id.values()])
        else:
            matrix = np.zeros((0, self._dim), dtype=np.float32)
        np.savez(self._data_dir / "vectors.npz", vectors=matrix)

    def load(self) -> None:
        corpus_path = self._data_dir / "corpus.json"
        vectors_path = self._data_dir / "vectors.npz"
        if not corpus_path.exists() or not vectors_path.exists():
            return
        raw_items = json.loads(corpus_path.read_text(encoding="utf-8"))
        matrix = np.load(vectors_path)["vectors"]
        self._by_id = {
            raw["id"]: (CorpusItem(**raw), np.asarray(matrix[i], dtype=np.float32))
            for i, raw in enumerate(raw_items)
        }
