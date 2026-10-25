"""
Local sentence-embedding model for M7 retrieval.

The heavy model (all-MiniLM-L6-v2) is loaded on first use through the single
`_load_model` seam, which tests patch with a deterministic fake. When
sentence-transformers is not installed (CI / lightweight envs) `available` is
False and callers fall back to lexical ranking — retrieval never hard-fails on
a missing model (the diffusers/torch optional-dependency pattern). A model
that is installed but fails to load (weights not downloadable offline, a
corrupt cache) flips `available` to False the same way, after one attempt.
"""

from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_EMBED_MODEL = "all-MiniLM-L6-v2"
EMBED_DIM = 384

try:
    from sentence_transformers import SentenceTransformer

    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SentenceTransformer = None  # type: ignore[assignment, misc]
    SENTENCE_TRANSFORMERS_AVAILABLE = False


class EmbedderUnavailable(RuntimeError):
    """The embedding model could not be loaded; callers use lexical ranking."""


class Embedder:
    """Lazy local embedder. `embed` returns L2-normalized rows so a dot product is cosine similarity."""

    def __init__(self, model_name: str = DEFAULT_EMBED_MODEL):
        self._model_name = model_name
        self._model: Optional[object] = None
        self._load_failed = False

    @property
    def available(self) -> bool:
        return SENTENCE_TRANSFORMERS_AVAILABLE and not self._load_failed

    def _load_model(self) -> object:
        """The one seam tests patch. Loads the real model lazily."""
        if SentenceTransformer is None:
            raise RuntimeError("sentence-transformers is not installed")
        logger.info("Loading embedding model", extra={"model": self._model_name})
        return SentenceTransformer(self._model_name)

    def embed(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, EMBED_DIM), dtype=np.float32)
        if self._model is None:
            if self._load_failed:
                raise EmbedderUnavailable("the embedding model failed to load earlier")
            try:
                self._model = self._load_model()
            except Exception as exc:
                # Never retried: a load that failed once (offline, corrupt
                # cache) would fail again on every request, slowly.
                self._load_failed = True
                logger.warning("Embedding model unavailable; using lexical retrieval: %s", exc)
                raise EmbedderUnavailable(str(exc)) from exc
        raw = self._model.encode(texts, convert_to_numpy=True)  # type: ignore[attr-defined]
        vectors = np.asarray(raw, dtype=np.float32)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms
