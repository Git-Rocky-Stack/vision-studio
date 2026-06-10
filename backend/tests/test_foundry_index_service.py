import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import json

from foundry.model_record import ModelRecord  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]


def _write_catalog(path, entries):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(entries, handle)


_CATALOG = {
    "flux-dev": {
        "id": "flux-dev",
        "name": "FLUX.1 dev",
        "artifact_type": "checkpoint",
        "capability": "image",
        "base_architecture": "flux",
        "source": "huggingface",
        "repo_id": "black-forest-labs/FLUX.1-dev",
    }
}


class RegistryIndexMergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-regidx-")
        self.catalog_path = os.path.join(self.tmp, "catalog.json")
        _write_catalog(self.catalog_path, _CATALOG)
        self.registry = ModelRegistry(
            models_dir=os.path.join(self.tmp, "models"), catalog_path=self.catalog_path
        )

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _indexed(self, record_id, location, identity="1:aa"):
        return ModelRecord(
            id=record_id,
            name=record_id,
            artifact_type="checkpoint",
            capability="image",
            base_architecture="unknown",
            source="linked",
            status="ready",
            tier="experimental",
            quality="local",
            locations=[location],
            identity=identity,
        )

    def test_catalog_record_with_indexed_location_reports_ready(self):
        self.registry.apply_index([self._indexed("flux-dev", os.path.join(self.tmp, "f.st"))])
        record = self.registry.get_record("flux-dev")
        self.assertEqual(record["status"], "ready")
        self.assertEqual(record["locations"], [os.path.join(self.tmp, "f.st")])
        # Curated catalog metadata is preserved on reconciliation:
        self.assertEqual(record["name"], "FLUX.1 dev")
        self.assertEqual(record["tier"], "verified")

    def test_unknown_indexed_record_appears_in_list(self):
        self.registry.apply_index([self._indexed("local-aa", os.path.join(self.tmp, "x.st"))])
        ids = [record["id"] for record in self.registry.list_records()]
        self.assertIn("local-aa", ids)
        self.assertIn("flux-dev", ids)

    def test_same_identity_across_roots_collapses_to_one_record(self):
        first = self._indexed("local-aa", os.path.join(self.tmp, "rootA", "x.st"))
        second = self._indexed("local-aa", os.path.join(self.tmp, "rootB", "x.st"))
        self.registry.apply_index([first, second])
        record = self.registry.get_record("local-aa")
        self.assertEqual(len(record["locations"]), 2)

    def test_reapply_replaces_previous_index(self):
        self.registry.apply_index([self._indexed("local-aa", os.path.join(self.tmp, "x.st"))])
        self.registry.apply_index([])  # e.g. the root was removed
        self.assertIsNone(self.registry.get_record("local-aa"))
        self.assertEqual(self.registry.get_record("flux-dev")["status"], "not_found")

    def test_status_provider_still_wins_over_index(self):
        registry = ModelRegistry(
            models_dir=os.path.join(self.tmp, "models"),
            catalog_path=self.catalog_path,
            status_provider=lambda model_id: "downloading",
        )
        registry.apply_index([self._indexed("flux-dev", os.path.join(self.tmp, "f.st"))])
        self.assertEqual(registry.get_record("flux-dev")["status"], "downloading")

    def test_unavailable_indexed_record_keeps_records_but_flags_availability(self):
        record = self._indexed("local-aa", os.path.join(self.tmp, "gone", "x.st"))
        record.availability = "unavailable"
        self.registry.apply_index([record])
        listed = self.registry.get_record("local-aa")
        self.assertEqual(listed["availability"], "unavailable")
        self.assertEqual(listed["status"], "not_found")  # unavailable never reports ready

    def test_dup_merge_upgrades_availability_and_keeps_both_locations(self):
        gone = self._indexed("local-aa", os.path.join(self.tmp, "nas", "x.st"))
        gone.availability = "unavailable"
        here = self._indexed("local-aa", os.path.join(self.tmp, "local", "x.st"))
        self.registry.apply_index([gone, here])
        record = self.registry.get_record("local-aa")
        self.assertEqual(record["availability"], "available")
        self.assertEqual(len(record["locations"]), 2)
        self.assertEqual(record["status"], "ready")

    def test_apply_index_does_not_alias_caller_records(self):
        caller_record = self._indexed("local-aa", os.path.join(self.tmp, "x.st"))
        self.registry.apply_index([caller_record])
        caller_record.availability = "unavailable"
        caller_record.locations.append(os.path.join(self.tmp, "y.st"))
        listed = self.registry.get_record("local-aa")
        self.assertEqual(listed["availability"], "available")  # registry copy unaffected
        self.assertEqual(len(listed["locations"]), 1)


if __name__ == "__main__":
    unittest.main()
