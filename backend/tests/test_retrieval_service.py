"""Tests for the retrieval orchestration service."""

import pathlib
import sys
import tempfile
import unittest

import numpy as np

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.retrieval.retrieval_service import RetrievalService  # type: ignore[import-not-found]


class _StubEmbedder:
    """Deterministic, network-free embedder. Vectors derived from text length + first char."""

    available = True

    def embed(self, texts):
        rows = []
        for t in texts:
            first = ord(t[0]) if t else 0
            vec = np.array([first % 7, len(t) % 5, 1.0], dtype=np.float32)
            norm = np.linalg.norm(vec) or 1.0
            rows.append(vec / norm)
        return np.vstack(rows) if rows else np.zeros((0, 3), dtype=np.float32)


class _UnavailableEmbedder:
    available = False

    def embed(self, texts):  # pragma: no cover - never called when unavailable
        raise AssertionError("embed must not be called when unavailable")


def _service(embedder=None):
    return RetrievalService(data_dir=pathlib.Path(tempfile.mkdtemp()), embedder=embedder or _StubEmbedder())


class RetrievalServiceTests(unittest.TestCase):
    def test_ingest_then_semantic_query_returns_relevant_snippet(self):
        service = _service()
        service.ingest([
            {"source": "prompt-history", "text": "a red fox in snow", "boosted": False, "label": "your prior prompt"},
            {"source": "prompt-history", "text": "blue ocean waves", "boosted": False, "label": "your prior prompt"},
        ])
        result = service.query(text="a red fox in snow", model_family=None, sources=["prompt-history"], max_tokens=200)
        self.assertEqual(result["mode"], "semantic")
        self.assertTrue(result["snippets"])
        self.assertIn("fox", result["snippets"][0]["text"])

    def test_ingest_is_idempotent_on_repeated_content(self):
        service = _service()
        rec = {"source": "assets", "text": "same asset prompt", "boosted": False, "label": "your asset"}
        first = service.ingest([rec])
        second = service.ingest([rec])
        self.assertEqual(first["ingested"], 1)
        self.assertEqual(second["ingested"], 0)
        self.assertEqual(service.stats()["count"], 1)

    def test_query_merges_knowledge_base_for_family(self):
        service = _service()
        result = service.query(text="portrait", model_family="sdxl", sources=["knowledge-base"], max_tokens=400)
        self.assertTrue(any(s["source"] == "knowledge-base" for s in result["snippets"]))

    def test_secret_shaped_fields_are_never_indexed(self):
        service = _service()
        # Adversarial ingest: extra secret-shaped keys must be dropped, only `text` indexed.
        service.ingest([{
            "source": "prompt-history",
            "text": "harmless prompt",
            "boosted": False,
            "label": "your prior prompt",
            "apiKey": "sk-SECRET-TOKEN-123",
            "path": "C:/Users/secret/keys.txt",
        }])
        result = service.query(text="harmless prompt", model_family=None, sources=["prompt-history"], max_tokens=400)
        blob = repr(result)
        self.assertNotIn("sk-SECRET-TOKEN-123", blob)
        self.assertNotIn("keys.txt", blob)

    def test_lexical_fallback_when_embedder_unavailable(self):
        service = _service(embedder=_UnavailableEmbedder())
        service.ingest([
            {"source": "prompt-history", "text": "a mountain village at dawn", "boosted": False, "label": "your prior prompt"},
            {"source": "prompt-history", "text": "unrelated text", "boosted": False, "label": "your prior prompt"},
        ])
        result = service.query(text="mountain village", model_family=None, sources=["prompt-history"], max_tokens=200)
        self.assertEqual(result["mode"], "lexical")
        self.assertIn("mountain", result["snippets"][0]["text"])

    def test_budget_caps_assembled_snippets(self):
        service = _service()
        service.ingest([
            {"source": "prompt-history", "text": "word " * 50, "boosted": False, "label": "p"},
            {"source": "prompt-history", "text": "word " * 50, "boosted": False, "label": "p2"},
        ])
        tiny = service.query(text="word", model_family=None, sources=["prompt-history"], max_tokens=20)
        # 20 tokens ~= 80 chars; a single 250-char snippet already exceeds it, so at most one is returned.
        self.assertLessEqual(len(tiny["snippets"]), 1)

    def test_clear_empties_the_index(self):
        service = _service()
        service.ingest([{"source": "assets", "text": "x", "boosted": False, "label": "a"}])
        service.clear()
        self.assertEqual(service.stats()["count"], 0)


if __name__ == "__main__":
    unittest.main()
