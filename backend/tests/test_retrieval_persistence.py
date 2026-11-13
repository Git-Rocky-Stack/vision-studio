"""B9 / D5b / B14: retrieval persistence safety, the startup singleton, the
semantic backfill once the embedder is provisioned, and the ingest bound.
"""
import json
import os
import pathlib
import sys
import tempfile
import threading
import unittest
from unittest import mock

import numpy as np

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import api.retrieval as retrieval_api  # noqa: E402
from schemas.retrieval import MAX_INGEST_RECORDS  # noqa: E402
from services.retrieval.index_store import (  # noqa: E402
    CORPUS_FILE,
    VECTORS_FILE,
    CorpusItem,
    IndexStore,
    content_hash,
)
from services.retrieval.retrieval_service import RetrievalService  # noqa: E402


def _item(text, source="assets"):
    digest = content_hash(source, text)
    return CorpusItem(id=digest, source=source, text=text, label="x", boost=1.0, content_hash=digest)


def _unit(*values):
    vec = np.array(values, dtype=np.float32)
    return vec / np.linalg.norm(vec)


class IndexStorePersistenceTests(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp(prefix="index-store-"))

    def test_persist_leaves_no_temp_files_and_round_trips(self):
        store = IndexStore(self.dir, dim=2)
        store.upsert([_item("keep")], np.vstack([_unit(1, 0)]))
        store.persist()
        self.assertEqual(sorted(os.listdir(self.dir)), [CORPUS_FILE, VECTORS_FILE])
        reloaded = IndexStore(self.dir, dim=2)
        reloaded.load()
        self.assertEqual(reloaded.query(_unit(1, 0), k=1, sources={"assets"})[0].text, "keep")
        self.assertEqual(reloaded.unembedded_items(), [])

    def test_torn_write_never_pairs_texts_with_the_wrong_vectors(self):
        """A crash between the two replaces leaves vectors from a newer write
        next to an older corpus: the generation mismatch is detected and the
        rows reload as zero (re-embedded later), never as another item's."""
        store = IndexStore(self.dir, dim=2)
        store.upsert([_item("old")], np.vstack([_unit(1, 0)]))
        store.persist()
        corpus_before = (self.dir / CORPUS_FILE).read_bytes()
        store.upsert([_item("new")], np.vstack([_unit(0, 1)]))
        store.persist()
        (self.dir / CORPUS_FILE).write_bytes(corpus_before)  # simulate the torn pair

        reloaded = IndexStore(self.dir, dim=2)
        with self.assertLogs("services.retrieval.index_store", level="WARNING"):
            reloaded.load()
        self.assertEqual(reloaded.count(), 1)
        self.assertEqual([i.text for i in reloaded.unembedded_items()], ["old"])

    def test_legacy_list_format_still_loads(self):
        item = _item("legacy")
        (self.dir / CORPUS_FILE).write_text(json.dumps([item.__dict__]), encoding="utf-8")
        np.savez(self.dir / VECTORS_FILE, vectors=np.vstack([_unit(1, 0)]))
        store = IndexStore(self.dir, dim=2)
        store.load()
        self.assertEqual(store.query(_unit(1, 0), k=1, sources={"assets"})[0].text, "legacy")

    def test_concurrent_upserts_and_persists_stay_consistent(self):
        store = IndexStore(self.dir, dim=2)
        errors = []

        def worker(n):
            try:
                for i in range(25):
                    store.upsert([_item(f"t{n}-{i}")], np.vstack([_unit(1, i + 1)]))
                    store.persist()
            except Exception as exc:  # pragma: no cover - surfaced below
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        reloaded = IndexStore(self.dir, dim=2)
        reloaded.load()
        self.assertEqual(reloaded.count(), 100)
        self.assertEqual(reloaded.unembedded_items(), [])


class _ToggleEmbedder:
    """Unavailable until switched on (the model gets provisioned)."""

    def __init__(self):
        self.available = False
        self.calls = []

    def embed(self, texts):
        self.calls.append(list(texts))
        return np.vstack([_unit(len(t), 1) for t in texts])


class SemanticBackfillTests(unittest.TestCase):
    def test_items_ingested_before_provisioning_are_embedded_afterwards(self):
        embedder = _ToggleEmbedder()
        service = RetrievalService(data_dir=pathlib.Path(tempfile.mkdtemp()), embedder=embedder)
        service.ingest([{"source": "prompt-history", "text": "a red fox"}])
        self.assertEqual(embedder.calls, [])
        self.assertEqual(service.query("fox", None, ["prompt-history"], 100)["mode"], "lexical")

        embedder.available = True  # the core set finished downloading
        result = service.query("fox query", None, ["prompt-history"], 100)
        self.assertEqual(result["mode"], "semantic")
        self.assertEqual([s["text"] for s in result["snippets"]], ["a red fox"])
        service.query("fox query", None, ["prompt-history"], 100)
        # The stored item is embedded exactly once (backfill), then persisted.
        self.assertEqual(embedder.calls.count(["a red fox"]), 1)

    def test_stats_report_why_semantic_is_unavailable(self):
        service = RetrievalService(data_dir=pathlib.Path(tempfile.mkdtemp()),
                                   embedder=_ToggleEmbedder())
        stats = service.stats()
        self.assertEqual(stats["mode"], "lexical")
        self.assertFalse(stats["semantic_available"])
        self.assertTrue(stats["semantic_unavailable_reason"])


class ServiceSingletonTests(unittest.TestCase):
    def setUp(self):
        previous = retrieval_api._service
        self.addCleanup(lambda: setattr(retrieval_api, "_service", previous))
        retrieval_api._service = None

    def test_init_service_is_idempotent_under_concurrency(self):
        data_dir = pathlib.Path(tempfile.mkdtemp())
        models_dir = tempfile.mkdtemp()
        created = []
        real = retrieval_api.RetrievalService

        def counting(*args, **kwargs):
            created.append(kwargs)
            return real(*args, **kwargs)

        with mock.patch.object(retrieval_api, "RetrievalService", side_effect=counting):
            threads = [
                threading.Thread(target=retrieval_api.init_service,
                                 kwargs={"models_dir": models_dir, "data_dir": data_dir})
                for _ in range(8)
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        self.assertEqual(len(created), 1)
        self.assertIs(retrieval_api.get_service(), retrieval_api.init_service())
        self.assertEqual(created[0]["models_dir"], pathlib.Path(models_dir))

    def test_availability_reports_an_unprovisioned_embedder(self):
        retrieval_api.init_service(models_dir=tempfile.mkdtemp(),
                                   data_dir=pathlib.Path(tempfile.mkdtemp()))
        state = retrieval_api.semantic_retrieval_availability()
        self.assertFalse(state["available"])
        self.assertTrue(state["reason"])


class IngestBoundTests(unittest.TestCase):
    def test_oversized_ingest_is_rejected_before_the_service_runs(self):
        previous = retrieval_api._service
        self.addCleanup(lambda: setattr(retrieval_api, "_service", previous))
        service = mock.Mock()
        retrieval_api._service = service
        app = FastAPI()
        app.include_router(retrieval_api.router)
        records = [{"source": "assets", "text": "x"}] * (MAX_INGEST_RECORDS + 1)
        response = TestClient(app).post("/api/v1/retrieval/ingest", json={"records": records})
        self.assertEqual(response.status_code, 422)
        service.ingest.assert_not_called()


if __name__ == "__main__":
    unittest.main()
