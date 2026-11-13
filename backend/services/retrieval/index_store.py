"""
Pure-NumPy cosine index for M7 retrieval.

The corpus is small (low thousands of items), so brute-force cosine over a
stacked matrix is sub-millisecond and needs no native vector extension. Items
are keyed by a content hash so identical content dedupes naturally on upsert.
Persistence is two files (corpus.json + vectors.npz) under the runtime data
dir - no SQLite, no loadable extension.

Concurrency + crash safety (B9): every operation holds one re-entrant lock
(routes run the service in worker threads, so two requests can reach the store
at once). Each file is written to a temp sibling and moved into place with
``os.replace`` (never a torn file), and both files carry the same random
``generation`` token: a crash between the two replaces leaves a corpus whose
vectors do not match, which ``load`` detects and treats as "vectors missing"
(zero rows the service re-embeds) instead of pairing texts with the wrong
vectors.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

import numpy as np

from services.retrieval.embedder import EMBED_DIM

logger = logging.getLogger(__name__)

CORPUS_FILE = "corpus.json"
VECTORS_FILE = "vectors.npz"
_FORMAT_VERSION = 2


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


_REPLACE_ATTEMPTS = 8


def _replace(src: Path, dst: Path) -> None:
    """``os.replace`` that rides out transient Windows sharing violations.

    On Windows a just-written file is routinely held open for a moment by
    antivirus / the search indexer, and replacing onto it fails with
    PermissionError (WinError 5/32). The write is still atomic - only the
    rename is retried, with a short exponential backoff (about 1.3 s total).
    """
    delay = 0.01
    for attempt in range(_REPLACE_ATTEMPTS):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == _REPLACE_ATTEMPTS - 1:
                raise
            time.sleep(delay)
            delay *= 2


class IndexStore:
    def __init__(self, data_dir: Path, dim: int = EMBED_DIM):
        self._data_dir = Path(data_dir)
        self._dim = dim
        self._by_id: Dict[str, Tuple[CorpusItem, np.ndarray]] = {}
        self._lock = threading.RLock()

    def has(self, item_id: str) -> bool:
        with self._lock:
            return item_id in self._by_id

    def upsert(self, items: List[CorpusItem], vectors: np.ndarray) -> None:
        with self._lock:
            for i, item in enumerate(items):
                self._by_id[item.id] = (item, np.asarray(vectors[i], dtype=np.float32))

    def remove(self, ids: Iterable[str]) -> None:
        with self._lock:
            for item_id in ids:
                self._by_id.pop(item_id, None)

    def clear(self) -> None:
        with self._lock:
            self._by_id.clear()

    def count(self) -> int:
        with self._lock:
            return len(self._by_id)

    def items_for_sources(self, sources: Set[str]) -> List[CorpusItem]:
        with self._lock:
            return [item for item, _ in self._by_id.values() if item.source in sources]

    def unembedded_items(self) -> List[CorpusItem]:
        """Items stored with a zero placeholder vector (ingested while no
        embedding model was available, or recovered from a torn write)."""
        with self._lock:
            return [item for item, vec in self._by_id.values() if not np.any(vec)]

    def set_vectors(self, ids: List[str], vectors: np.ndarray) -> None:
        """Replace the vectors of existing items (ids not present are ignored)."""
        with self._lock:
            for i, item_id in enumerate(ids):
                current = self._by_id.get(item_id)
                if current is not None:
                    self._by_id[item_id] = (current[0], np.asarray(vectors[i], dtype=np.float32))

    def query(self, vector: np.ndarray, k: int, sources: Set[str]) -> List[ScoredItem]:
        with self._lock:
            candidates = [
                (item, vec) for item, vec in self._by_id.values() if item.source in sources
            ]
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
        """Atomically write both files (temp + os.replace, generation-tagged)."""
        with self._lock:
            self._data_dir.mkdir(parents=True, exist_ok=True)
            generation = uuid.uuid4().hex
            items = [asdict(item) for item, _ in self._by_id.values()]
            if self._by_id:
                matrix = np.vstack([vec for _, vec in self._by_id.values()])
            else:
                matrix = np.zeros((0, self._dim), dtype=np.float32)
            corpus_path = self._data_dir / CORPUS_FILE
            vectors_path = self._data_dir / VECTORS_FILE
            corpus_tmp = corpus_path.with_name(CORPUS_FILE + ".tmp")
            vectors_tmp = vectors_path.with_name(VECTORS_FILE + ".tmp")
            # Vectors first: a crash after this replace but before the corpus
            # one leaves the OLD corpus with a mismatched generation - which
            # load() reads as "re-embed", never as wrong vectors.
            with open(vectors_tmp, "wb") as handle:
                np.savez(handle, vectors=matrix, generation=np.array(generation))
                handle.flush()
                os.fsync(handle.fileno())
            _replace(vectors_tmp, vectors_path)
            payload = {"version": _FORMAT_VERSION, "generation": generation, "items": items}
            with open(corpus_tmp, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
                handle.flush()
                os.fsync(handle.fileno())
            _replace(corpus_tmp, corpus_path)

    def load(self) -> None:
        with self._lock:
            corpus_path = self._data_dir / CORPUS_FILE
            vectors_path = self._data_dir / VECTORS_FILE
            if not corpus_path.exists():
                return
            raw = json.loads(corpus_path.read_text(encoding="utf-8"))
            if isinstance(raw, list):  # legacy (pre-generation) format
                raw_items, generation = raw, None
            else:
                raw_items, generation = raw.get("items") or [], raw.get("generation")
            matrix = self._load_matching_vectors(vectors_path, generation, len(raw_items))
            self._by_id = {
                item["id"]: (CorpusItem(**item), np.asarray(matrix[i], dtype=np.float32))
                for i, item in enumerate(raw_items)
            }

    def _load_matching_vectors(self, path: Path, generation, count: int) -> np.ndarray:
        """The persisted matrix when it provably belongs to this corpus, else
        zero rows (the service re-embeds them when a model is available)."""
        zeros = np.zeros((count, self._dim), dtype=np.float32)
        if not path.exists():
            return zeros
        try:
            with np.load(path) as data:
                matrix = data["vectors"]
                stored_generation = str(data["generation"]) if "generation" in data else None
        except (OSError, ValueError, KeyError) as exc:
            logger.warning("Retrieval vectors unreadable; re-embedding: %s", exc)
            return zeros
        if generation is not None and stored_generation != generation:
            logger.warning("Retrieval vectors do not match the corpus (interrupted write); re-embedding")
            return zeros
        if matrix.ndim != 2 or matrix.shape[0] != count:
            logger.warning("Retrieval vectors have the wrong shape %s; re-embedding", matrix.shape)
            return zeros
        return matrix
