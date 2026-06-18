"""Tests for the NumPy cosine index store."""

import pathlib
import sys
import tempfile
import unittest

import numpy as np

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.retrieval.index_store import (  # type: ignore[import-not-found]
    CorpusItem,
    IndexStore,
    content_hash,
)


def _item(source: str, text: str, label: str = "x", boost: float = 1.0) -> CorpusItem:
    digest = content_hash(source, text)
    return CorpusItem(id=digest, source=source, text=text, label=label, boost=boost, content_hash=digest)


def _unit(*values: float) -> np.ndarray:
    vec = np.array(values, dtype=np.float32)
    return vec / np.linalg.norm(vec)


class IndexStoreTests(unittest.TestCase):
    def test_query_ranks_by_cosine_and_filters_by_source(self):
        store = IndexStore(pathlib.Path(tempfile.mkdtemp()))
        store.upsert(
            [_item("prompt-history", "near"), _item("prompt-history", "far"), _item("assets", "other")],
            np.vstack([_unit(1, 0.1), _unit(0.1, 1), _unit(1, 0.1)]),
        )
        results = store.query(_unit(1, 0), k=5, sources={"prompt-history"})
        self.assertEqual([r.text for r in results], ["near", "far"])  # "other" excluded by source

    def test_boost_lifts_an_otherwise_equal_neighbour(self):
        store = IndexStore(pathlib.Path(tempfile.mkdtemp()))
        store.upsert(
            [_item("assets", "plain", boost=1.0), _item("assets", "fav", boost=1.5)],
            np.vstack([_unit(1, 0), _unit(1, 0)]),
        )
        results = store.query(_unit(1, 0), k=5, sources={"assets"})
        self.assertEqual(results[0].text, "fav")

    def test_upsert_dedupes_identical_content(self):
        store = IndexStore(pathlib.Path(tempfile.mkdtemp()))
        store.upsert([_item("assets", "same")], np.vstack([_unit(1, 0)]))
        store.upsert([_item("assets", "same")], np.vstack([_unit(0, 1)]))
        self.assertEqual(store.count(), 1)

    def test_persist_and_load_round_trip(self):
        data_dir = pathlib.Path(tempfile.mkdtemp())
        store = IndexStore(data_dir)
        store.upsert([_item("assets", "keep", label="L")], np.vstack([_unit(1, 0)]))
        store.persist()

        reloaded = IndexStore(data_dir)
        reloaded.load()
        results = reloaded.query(_unit(1, 0), k=5, sources={"assets"})
        self.assertEqual(results[0].label, "L")

    def test_clear_empties_the_store(self):
        store = IndexStore(pathlib.Path(tempfile.mkdtemp()))
        store.upsert([_item("assets", "x")], np.vstack([_unit(1, 0)]))
        store.clear()
        self.assertEqual(store.count(), 0)


if __name__ == "__main__":
    unittest.main()
