"""
Local sentence-embedding model for M7 retrieval.

Local-first (D5b): the embedding model (all-MiniLM-L6-v2) is NEVER downloaded
at runtime. It is a ``core``-tier entry of the provisioning manifest
(``embedder-all-minilm-l6-v2``, pinned commit + per-file sha256) that the
DownloadManager places at ``<models_dir>/text-embedder/<id>/``, and this module
only ever loads it from that directory (``local_files_only``). Until it is
provisioned, ``available`` is False and callers fall back to lexical ranking -
retrieval never hard-fails on a missing model (the diffusers/torch
optional-dependency pattern). A provisioned model that fails to load (corrupt
files) flips ``available`` to False the same way until its files change.

The model runs on CPU on purpose: it is ~22M parameters (milliseconds per
batch) and must never contend with image/video generation for VRAM.

The heavy load sits behind the single ``_load_model`` seam, which tests patch
with a deterministic fake.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)

# Provisioning-manifest id + artifact type of the embedder; the on-disk layout
# (<models_dir>/<artifact type>/<id>/) is the DownloadManager's per-id layout.
EMBEDDER_MODEL_ID = "embedder-all-minilm-l6-v2"
EMBEDDER_ARTIFACT_TYPE = "text-embedder"
EMBED_DIM = 384

# Files whose presence means "provisioned". The full pinned list lives in the
# manifest; these are the ones SentenceTransformer cannot load without.
REQUIRED_MODEL_FILES = (
    "modules.json",
    "config.json",
    "model.safetensors",
    "tokenizer.json",
    "1_Pooling/config.json",
)

try:
    from sentence_transformers import SentenceTransformer

    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SentenceTransformer = None  # type: ignore[assignment, misc]
    SENTENCE_TRANSFORMERS_AVAILABLE = False

_NOT_INSTALLED = "sentence-transformers is not installed in this build"
_NOT_PROVISIONED = (
    "the retrieval embedding model is not downloaded yet (part of the core "
    "model set)"
)


class EmbedderUnavailable(RuntimeError):
    """The embedding model could not be loaded; callers use lexical ranking."""


def default_models_dir() -> Path:
    """MODELS_DIR as main.py resolves it (env first, else backend/models)."""
    env = os.getenv("MODELS_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2] / "models"


def embedder_model_dir(models_dir: Union[str, Path, None] = None) -> Path:
    """Where the provisioned embedder lives under ``models_dir``."""
    base = Path(models_dir) if models_dir is not None else default_models_dir()
    return base / EMBEDDER_ARTIFACT_TYPE / EMBEDDER_MODEL_ID


def is_provisioned(model_dir: Union[str, Path]) -> bool:
    """True when every required model file is on disk."""
    root = Path(model_dir)
    return all((root / name).is_file() for name in REQUIRED_MODEL_FILES)


def _files_signature(model_dir: Path) -> Tuple:
    """Cheap change detector for the weights (a re-provision resets a failure)."""
    try:
        stat = (model_dir / "model.safetensors").stat()
    except OSError:
        return ()
    return (stat.st_mtime_ns, stat.st_size)


class Embedder:
    """Lazy local embedder. `embed` returns L2-normalized rows so a dot product is cosine similarity."""

    def __init__(
        self,
        models_dir: Union[str, Path, None] = None,
        model_dir: Union[str, Path, None] = None,
    ):
        self._model_dir = Path(model_dir) if model_dir is not None else embedder_model_dir(models_dir)
        self._model: Optional[object] = None
        self._failed_signature: Optional[Tuple] = None
        self._failure_reason: Optional[str] = None

    @property
    def model_dir(self) -> Path:
        return self._model_dir

    def availability(self) -> Dict[str, Optional[Union[bool, str]]]:
        """``{"available": bool, "reason": str | None}`` - never loads or downloads."""
        if not SENTENCE_TRANSFORMERS_AVAILABLE:
            return {"available": False, "reason": _NOT_INSTALLED}
        if self._model is not None:
            return {"available": True, "reason": None}
        if not is_provisioned(self._model_dir):
            return {"available": False, "reason": _NOT_PROVISIONED}
        if (
            self._failed_signature is not None
            and self._failed_signature == _files_signature(self._model_dir)
        ):
            return {
                "available": False,
                "reason": f"the retrieval embedding model failed to load: {self._failure_reason}",
            }
        return {"available": True, "reason": None}

    @property
    def available(self) -> bool:
        return bool(self.availability()["available"])

    def _load_model(self) -> object:
        """The one seam tests patch. Loads the provisioned model from disk only."""
        if SentenceTransformer is None:
            raise RuntimeError(_NOT_INSTALLED)
        if not is_provisioned(self._model_dir):
            raise RuntimeError(_NOT_PROVISIONED)
        logger.info("Loading embedding model", extra={"model_dir": str(self._model_dir)})
        # A directory path plus local_files_only: SentenceTransformer can
        # never reach the Hub from here (local-first, D5b).
        return SentenceTransformer(str(self._model_dir), device="cpu", local_files_only=True)

    def embed(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, EMBED_DIM), dtype=np.float32)
        if self._model is None:
            state = self.availability()
            if not state["available"]:
                raise EmbedderUnavailable(str(state["reason"]))
            try:
                self._model = self._load_model()
            except Exception as exc:
                # Not retried until the files change: a load that failed once
                # (corrupt weights) would fail again on every request, slowly.
                self._failed_signature = _files_signature(self._model_dir)
                self._failure_reason = str(exc) or exc.__class__.__name__
                logger.warning("Embedding model unavailable; using lexical retrieval: %s", exc)
                raise EmbedderUnavailable(str(exc)) from exc
            self._failed_signature = None
            self._failure_reason = None
        raw = self._model.encode(texts, convert_to_numpy=True)  # type: ignore[attr-defined]
        vectors = np.asarray(raw, dtype=np.float32)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms
