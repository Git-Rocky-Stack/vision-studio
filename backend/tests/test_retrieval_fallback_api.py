"""Retrieval degrades to lexical when the embedding model fails to load, and the
routes never run the service on the event loop.

An installed sentence-transformers whose model could not load (offline first
run, corrupt cache) used to raise on every ingest/query - a 500 each time,
after a slow retry - instead of using the keyword fallback that exists for
exactly that case. The first service call also loaded the model on the loop.

Integration tier for the router check (the _api.py suffix).
"""
import asyncio
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import api.retrieval as retrieval_api  # noqa: E402
from services.retrieval import embedder as embedder_module  # noqa: E402
from services.retrieval.embedder import Embedder, EmbedderUnavailable  # noqa: E402
from services.retrieval.retrieval_service import RetrievalService  # noqa: E402


def _broken_embedder():
    patcher = mock.patch.object(embedder_module, "SENTENCE_TRANSFORMERS_AVAILABLE", True)
    patcher.start()
    embedder = Embedder()
    load = mock.patch.object(Embedder, "_load_model", side_effect=OSError("offline"))
    return embedder, load, patcher


class EmbedderLoadFailureTests(unittest.TestCase):
    def setUp(self):
        self.embedder, load, patcher = _broken_embedder()
        self.addCleanup(patcher.stop)
        self.load = load.start()
        self.addCleanup(load.stop)

    def test_failed_load_flips_available_and_is_not_retried(self):
        self.assertTrue(self.embedder.available)
        with self.assertLogs("services.retrieval.embedder", level="WARNING"):
            with self.assertRaises(EmbedderUnavailable):
                self.embedder.embed(["a"])
        self.assertFalse(self.embedder.available)
        with self.assertRaises(EmbedderUnavailable):
            self.embedder.embed(["b"])
        self.assertEqual(self.load.call_count, 1)

    def test_service_falls_back_to_lexical(self):
        service = RetrievalService(data_dir=pathlib.Path(tempfile.mkdtemp()),
                                   embedder=self.embedder)
        with self.assertLogs("services.retrieval.embedder", level="WARNING"):
            ingested = service.ingest([
                {"source": "prompt-history", "text": "a red fox in snow"}])
        self.assertEqual(ingested["ingested"], 1)

        result = service.query(text="red fox", model_family=None,
                               sources=["prompt-history"], max_tokens=200)
        self.assertEqual(result["mode"], "lexical")
        self.assertEqual([s["text"] for s in result["snippets"]], ["a red fox in snow"])
        self.assertEqual(service.stats()["mode"], "lexical")

    def test_query_before_any_ingest_also_falls_back(self):
        service = RetrievalService(data_dir=pathlib.Path(tempfile.mkdtemp()),
                                   embedder=self.embedder)
        with self.assertLogs("services.retrieval.embedder", level="WARNING"):
            result = service.query(text="fox", model_family=None,
                                   sources=["prompt-history"], max_tokens=200)
        self.assertEqual(result, {"snippets": [], "mode": "lexical"})


class _LoopRecordingService:
    """Records, per call, whether it ran ON the event loop thread."""

    def __init__(self):
        self.on_loop = []

    def _record(self):
        try:
            asyncio.get_running_loop()
            self.on_loop.append(True)
        except RuntimeError:
            self.on_loop.append(False)

    def ingest(self, records):
        self._record()
        return {"ingested": 0, "skipped": 0, "total": 0}

    def query(self, **kwargs):
        self._record()
        return {"snippets": [], "mode": "lexical"}

    def clear(self):
        self._record()

    def stats(self):
        self._record()
        return {"count": 0, "mode": "lexical"}


class RetrievalRoutesOffLoopTests(unittest.TestCase):
    def test_every_route_runs_the_service_in_a_worker_thread(self):
        previous = retrieval_api._service
        self.addCleanup(lambda: setattr(retrieval_api, "_service", previous))
        service = _LoopRecordingService()
        retrieval_api._service = service
        app = FastAPI()
        app.include_router(retrieval_api.router)
        client = TestClient(app)

        client.post("/api/v1/retrieval/ingest", json={"records": []})
        client.post("/api/v1/retrieval/query", json={
            "text": "x", "modelFamily": None, "sources": ["prompt-history"], "maxTokens": 10})
        client.post("/api/v1/retrieval/clear")
        client.get("/api/v1/retrieval/stats")

        self.assertEqual(service.on_loop, [False, False, False, False])


if __name__ == "__main__":
    unittest.main()
