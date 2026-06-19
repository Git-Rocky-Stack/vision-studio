"""Tests for the local embedding model wrapper."""

import pathlib
import sys
import unittest
from unittest.mock import patch

import numpy as np

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.retrieval.embedder import EMBED_DIM, Embedder  # type: ignore[import-not-found]


class _FakeModel:
    def encode(self, texts, convert_to_numpy=True):
        # Deterministic, distinct, non-normalized vectors per input.
        return np.array([[float(len(t)), 1.0] + [0.0] * (EMBED_DIM - 2) for t in texts], dtype=np.float32)


class EmbedderTests(unittest.TestCase):
    def test_embed_returns_l2_normalized_rows(self):
        embedder = Embedder()
        with patch.object(Embedder, "_load_model", return_value=_FakeModel()):
            vectors = embedder.embed(["a", "bb"])
        self.assertEqual(vectors.shape, (2, EMBED_DIM))
        norms = np.linalg.norm(vectors, axis=1)
        self.assertTrue(np.allclose(norms, 1.0, atol=1e-5))

    def test_embed_empty_returns_zero_by_dim_matrix(self):
        embedder = Embedder()
        vectors = embedder.embed([])
        self.assertEqual(vectors.shape, (0, EMBED_DIM))

    def test_model_loaded_once(self):
        embedder = Embedder()
        with patch.object(Embedder, "_load_model", return_value=_FakeModel()) as load:
            embedder.embed(["a"])
            embedder.embed(["b"])
        self.assertEqual(load.call_count, 1)


if __name__ == "__main__":
    unittest.main()
