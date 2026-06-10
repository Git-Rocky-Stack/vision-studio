import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hf_cache import scan_hf_cache  # type: ignore[import-not-found]


def _fake_cache_info():
    revision = SimpleNamespace(
        commit_hash="cb7296e6587a1234",
        nb_files=2,
        snapshot_path="C:\\cache\\models--org--m\\snapshots\\cb7296e6587a1234",
        size_on_disk=1_450_000_000,
    )
    repo = SimpleNamespace(
        repo_id="org/m",
        repo_type="model",
        size_on_disk=1_450_000_000,
        revisions=[revision],
    )
    dataset = SimpleNamespace(repo_id="org/data", repo_type="dataset", size_on_disk=1, revisions=[])
    return SimpleNamespace(
        repos=[repo, dataset],
        warnings=[Exception("Snapshots dir doesn't exist in cached repo: ...Qwen-Image-2512")],
    )


_CATALOG_BY_REPO = {("org/m", "main"): "catalog-id-m"}


class ScanHfCacheTests(unittest.TestCase):
    def test_model_repos_become_records_and_datasets_are_skipped(self):
        with mock.patch("foundry.hf_cache._scan", return_value=_fake_cache_info()):
            result = scan_hf_cache(_CATALOG_BY_REPO)
        self.assertEqual(len(result.records), 1)
        record = result.records[0]
        self.assertEqual(record.id, "catalog-id-m")  # reconciled by repo_id
        self.assertEqual(record.source, "huggingface")
        self.assertEqual(record.status, "ready")
        self.assertEqual(
            record.locations,
            ["C:\\cache\\models--org--m\\snapshots\\cb7296e6587a1234"],
        )

    def test_unknown_repo_gets_hf_cache_id(self):
        with mock.patch("foundry.hf_cache._scan", return_value=_fake_cache_info()):
            result = scan_hf_cache({})
        self.assertEqual(result.records[0].id, "hf-org--m")
        self.assertEqual(result.records[0].tier, "experimental")

    def test_warnings_surface_as_strings_not_exceptions(self):
        with mock.patch("foundry.hf_cache._scan", return_value=_fake_cache_info()):
            result = scan_hf_cache({})
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("Qwen-Image-2512", result.warnings[0])

    def test_absent_library_or_cache_returns_empty_result(self):
        with mock.patch("foundry.hf_cache._scan", side_effect=ImportError("no hub")):
            result = scan_hf_cache({})
        self.assertEqual(result.records, [])
        self.assertEqual(result.warnings, ["huggingface_hub unavailable: no hub"])


    def test_second_revision_of_catalog_repo_keeps_distinct_identity(self):
        rev_a = SimpleNamespace(
            commit_hash="aaaa1111bbbb2222",
            nb_files=2,
            snapshot_path="C:\\cache\\models--org--m\\snapshots\\aaaa1111bbbb2222",
            size_on_disk=1_000_000_000,
        )
        rev_b = SimpleNamespace(
            commit_hash="cccc3333dddd4444",
            nb_files=2,
            snapshot_path="C:\\cache\\models--org--m\\snapshots\\cccc3333dddd4444",
            size_on_disk=2_000_000_000,
        )
        repo = SimpleNamespace(
            repo_id="org/m", repo_type="model", size_on_disk=3_000_000_000, revisions=[rev_a, rev_b]
        )
        info = SimpleNamespace(repos=[repo], warnings=[])
        with mock.patch("foundry.hf_cache._scan", return_value=info):
            result = scan_hf_cache(_CATALOG_BY_REPO)
        ids = sorted(record.id for record in result.records)
        self.assertEqual(ids, ["catalog-id-m", "hf-org--m--cccc3333"])
        sizes = {record.id: record.size for record in result.records}
        self.assertEqual(sizes["catalog-id-m"], "1.00 GB")
        self.assertEqual(sizes["hf-org--m--cccc3333"], "2.00 GB")


if __name__ == "__main__":
    unittest.main()
