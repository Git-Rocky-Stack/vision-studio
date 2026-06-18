"""Tests for the retrieval API router (mounted in isolation, mocked embedder)."""

import pathlib
import sys
import tempfile
import unittest

import numpy as np

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.retrieval as retrieval_api  # type: ignore[import-not-found]
from services.retrieval.retrieval_service import RetrievalService  # type: ignore[import-not-found]


class _StubEmbedder:
    available = True

    def embed(self, texts):
        rows = [np.array([ord(t[0]) % 7 if t else 0, len(t) % 5, 1.0], dtype=np.float32) for t in texts]
        rows = [r / (np.linalg.norm(r) or 1.0) for r in rows]
        return np.vstack(rows) if rows else np.zeros((0, 3), dtype=np.float32)


def _client() -> TestClient:
    # Inject a fresh temp-dir service with a stub embedder via the module seam.
    retrieval_api._service = RetrievalService(  # type: ignore[attr-defined]
        data_dir=pathlib.Path(tempfile.mkdtemp()), embedder=_StubEmbedder()
    )
    app = FastAPI()
    app.include_router(retrieval_api.router)
    return TestClient(app)


class RetrievalAPITests(unittest.TestCase):
    def test_ingest_then_query(self):
        client = _client()
        ingest = client.post(
            "/api/v1/retrieval/ingest",
            json={"records": [{"source": "prompt-history", "text": "a red fox", "boosted": False, "label": "p"}]},
        )
        self.assertEqual(ingest.status_code, 200)
        self.assertEqual(ingest.json()["ingested"], 1)

        query = client.post(
            "/api/v1/retrieval/query",
            json={"text": "a red fox", "modelFamily": None, "sources": ["prompt-history"], "maxTokens": 200},
        )
        self.assertEqual(query.status_code, 200)
        body = query.json()
        self.assertIn(body["mode"], {"semantic", "lexical"})
        self.assertTrue(body["snippets"])

    def test_stats_and_clear(self):
        client = _client()
        client.post(
            "/api/v1/retrieval/ingest",
            json={"records": [{"source": "assets", "text": "x", "boosted": False, "label": "a"}]},
        )
        self.assertEqual(client.get("/api/v1/retrieval/stats").json()["count"], 1)
        self.assertEqual(client.post("/api/v1/retrieval/clear").status_code, 200)
        self.assertEqual(client.get("/api/v1/retrieval/stats").json()["count"], 0)

    def test_query_rejects_bad_source(self):
        client = _client()
        resp = client.post(
            "/api/v1/retrieval/query",
            json={"text": "x", "modelFamily": None, "sources": ["not-a-source"], "maxTokens": 100},
        )
        self.assertEqual(resp.status_code, 422)


if __name__ == "__main__":
    unittest.main()
