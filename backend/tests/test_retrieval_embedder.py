"""Tests for the local embedding model wrapper (D5b: local-first, never downloads)."""

import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.retrieval import embedder as embedder_module  # type: ignore[import-not-found]
from services.retrieval.embedder import (  # type: ignore[import-not-found]
    EMBED_DIM,
    EMBEDDER_ARTIFACT_TYPE,
    EMBEDDER_MODEL_ID,
    REQUIRED_MODEL_FILES,
    Embedder,
    EmbedderUnavailable,
    embedder_model_dir,
)


class _FakeModel:
    def encode(self, texts, convert_to_numpy=True):
        # Deterministic, distinct, non-normalized vectors per input.
        return np.array([[float(len(t)), 1.0] + [0.0] * (EMBED_DIM - 2) for t in texts], dtype=np.float32)


def provision_fake_model(models_dir: pathlib.Path) -> pathlib.Path:
    """Write the required embedder files where the DownloadManager puts them."""
    model_dir = embedder_model_dir(models_dir)
    for name in REQUIRED_MODEL_FILES:
        path = model_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"{}")
    return model_dir


class EmbedderTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(embedder_module, "SENTENCE_TRANSFORMERS_AVAILABLE", True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.models_dir = pathlib.Path(tempfile.mkdtemp(prefix="embedder-"))

    def test_embed_returns_l2_normalized_rows(self):
        provision_fake_model(self.models_dir)
        embedder = Embedder(models_dir=self.models_dir)
        with patch.object(Embedder, "_load_model", return_value=_FakeModel()):
            vectors = embedder.embed(["a", "bb"])
        self.assertEqual(vectors.shape, (2, EMBED_DIM))
        norms = np.linalg.norm(vectors, axis=1)
        self.assertTrue(np.allclose(norms, 1.0, atol=1e-5))

    def test_embed_empty_returns_zero_by_dim_matrix(self):
        embedder = Embedder(models_dir=self.models_dir)
        vectors = embedder.embed([])
        self.assertEqual(vectors.shape, (0, EMBED_DIM))

    def test_model_loaded_once(self):
        provision_fake_model(self.models_dir)
        embedder = Embedder(models_dir=self.models_dir)
        with patch.object(Embedder, "_load_model", return_value=_FakeModel()) as load:
            embedder.embed(["a"])
            embedder.embed(["b"])
        self.assertEqual(load.call_count, 1)

    def test_model_lives_at_the_provisioned_manifest_path(self):
        self.assertEqual(
            embedder_model_dir(self.models_dir),
            self.models_dir / EMBEDDER_ARTIFACT_TYPE / EMBEDDER_MODEL_ID,
        )

    def test_unprovisioned_model_is_unavailable_and_never_loaded(self):
        """Local-first: no provisioned files means lexical mode - the loader
        (which could reach the Hub) is never even attempted."""
        embedder = Embedder(models_dir=self.models_dir)
        state = embedder.availability()
        self.assertFalse(state["available"])
        self.assertIn("not downloaded", state["reason"])
        with patch.object(Embedder, "_load_model") as load:
            with self.assertRaises(EmbedderUnavailable):
                embedder.embed(["a"])
        load.assert_not_called()

    def test_becomes_available_once_provisioned_without_restart(self):
        embedder = Embedder(models_dir=self.models_dir)
        self.assertFalse(embedder.available)
        provision_fake_model(self.models_dir)
        self.assertTrue(embedder.available)

    def test_real_loader_reads_only_the_local_directory(self):
        model_dir = provision_fake_model(self.models_dir)
        calls = []

        class _RecordingST:
            def __init__(self, path, **kwargs):
                calls.append((path, kwargs))

        with patch.object(embedder_module, "SentenceTransformer", _RecordingST):
            Embedder(models_dir=self.models_dir)._load_model()
        self.assertEqual(calls, [(str(model_dir), {"device": "cpu", "local_files_only": True})])

    def test_not_installed_reports_the_reason(self):
        with patch.object(embedder_module, "SENTENCE_TRANSFORMERS_AVAILABLE", False):
            state = Embedder(models_dir=self.models_dir).availability()
        self.assertFalse(state["available"])
        self.assertIn("not installed", state["reason"])

    def test_failed_load_is_retried_after_the_files_change(self):
        model_dir = provision_fake_model(self.models_dir)
        embedder = Embedder(models_dir=self.models_dir)
        with patch.object(Embedder, "_load_model", side_effect=OSError("corrupt")):
            with self.assertLogs("services.retrieval.embedder", level="WARNING"):
                with self.assertRaises(EmbedderUnavailable):
                    embedder.embed(["a"])
        self.assertFalse(embedder.available)
        self.assertIn("failed to load", embedder.availability()["reason"])
        # A re-provision (new weights) clears the remembered failure.
        (model_dir / "model.safetensors").write_bytes(b"new-weights")
        self.assertTrue(embedder.available)


if __name__ == "__main__":
    unittest.main()
