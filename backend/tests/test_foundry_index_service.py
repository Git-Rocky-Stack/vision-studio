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


from unittest import mock

from foundry.hf_cache import HfCacheScan  # type: ignore[import-not-found]
from foundry.index_service import IndexService  # type: ignore[import-not-found]
from foundry.library_roots import RootsStore  # type: ignore[import-not-found]
from tests.foundry_fixtures import LORA_TENSORS, make_safetensors


class IndexServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-svc-")
        self.models_dir = os.path.join(self.tmp, "models")
        os.makedirs(self.models_dir)
        catalog_path = os.path.join(self.tmp, "catalog.json")
        _write_catalog(catalog_path, _CATALOG)
        self.registry = ModelRegistry(models_dir=self.models_dir, catalog_path=catalog_path)
        self.roots = RootsStore(os.path.join(self.models_dir, ".foundry", "library_roots.json"))
        self.service = IndexService(
            registry=self.registry,
            roots_store=self.roots,
            models_dir=self.models_dir,
            state_path=os.path.join(self.models_dir, ".foundry", "index_state.json"),
        )

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _scan(self):
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()):
            return self.service.scan()

    def test_scan_indexes_linked_root_into_registry(self):
        lib = os.path.join(self.tmp, "lib")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        self.roots.add(lib, "comfyui")
        snapshot = self._scan()
        self.assertGreaterEqual(snapshot.records_indexed, 1)
        local_ids = [
            record["id"] for record in self.registry.list_records() if record["id"].startswith("local-")
        ]
        self.assertEqual(len(local_ids), 1)

    def test_scan_indexes_app_managed_tree(self):
        # flux1-dev.safetensors in the app tree reconciles to flux-dev (M1 TODO).
        from tests.foundry_fixtures import CHECKPOINT_TENSORS

        make_safetensors(
            os.path.join(self.models_dir, "checkpoints", "flux1-dev.safetensors"),
            CHECKPOINT_TENSORS,
        )
        self._scan()
        self.assertEqual(self.registry.get_record("flux-dev")["status"], "ready")

    def test_missing_root_marks_records_unavailable_not_error(self):
        lib = os.path.join(self.tmp, "nas")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        root = self.roots.add(lib, "comfyui")
        self._scan()
        shutil.rmtree(lib)  # the NAS unmounts
        snapshot = self._scan()
        record = next(
            r for r in self.registry.list_records() if r.get("library_root_id") == root.id
        )
        self.assertEqual(record["availability"], "unavailable")
        self.assertEqual(record["status"], "not_found")
        self.assertEqual(snapshot.warnings, [])  # no error storm

    def test_remove_root_drops_its_records_and_touches_no_bytes(self):
        lib = os.path.join(self.tmp, "lib2")
        path = make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        root = self.roots.add(lib, "comfyui")
        self._scan()
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()):
            dropped = self.service.remove_root(root.id)
        self.assertEqual(dropped, 1)
        self.assertTrue(os.path.exists(path))  # bytes untouched
        remaining = [
            record
            for record in self.registry.list_records()
            if record.get("library_root_id") == root.id
        ]
        self.assertEqual(remaining, [])

    def test_signatures_persist_across_service_instances(self):
        lib = os.path.join(self.tmp, "lib3")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        self.roots.add(lib, "comfyui")
        self._scan()
        fresh = IndexService(
            registry=self.registry,
            roots_store=self.roots,
            models_dir=self.models_dir,
            state_path=os.path.join(self.models_dir, ".foundry", "index_state.json"),
        )
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()), mock.patch(
            "foundry.indexer.read_safetensors_header"
        ) as header_spy:
            fresh.scan()
        header_spy.assert_not_called()  # signatures loaded from disk; nothing re-read

    def test_detect_candidates_reports_existing_known_paths(self):
        comfy = os.path.join(self.tmp, "ComfyUI", "models")
        os.makedirs(comfy)
        with mock.patch("foundry.index_service._WELL_KNOWN_CANDIDATES", [(comfy, "comfyui")]):
            offers = self.service.detect_candidates()
        self.assertEqual(offers, [{"path": comfy, "layout_hint": "comfyui"}])

    def test_hf_cache_warnings_propagate_to_snapshot(self):
        with mock.patch(
            "foundry.index_service.scan_hf_cache",
            return_value=HfCacheScan(warnings=["broken cache entry: Qwen-Image-2512"]),
        ):
            snapshot = self.service.scan()
        self.assertIn("broken cache entry: Qwen-Image-2512", snapshot.warnings)

    def test_remove_unknown_root_returns_zero(self):
        with mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan()):
            self.assertEqual(self.service.remove_root("does-not-exist"), 0)

    def test_generic_diffusers_filename_does_not_reconcile_to_catalog(self):
        lib = os.path.join(self.tmp, "lib-generic")
        make_safetensors(
            os.path.join(lib, "loras", "diffusion_pytorch_model.safetensors"), LORA_TENSORS
        )
        self.roots.add(lib, "comfyui")
        self._scan()
        ids = [record["id"] for record in self.registry.list_records()]
        local_ids = [i for i in ids if i.startswith("local-")]
        self.assertEqual(len(local_ids), 1)  # discovered as a local record, NOT catalog-reconciled
        vae = self.registry.get_record("sd-vae-ft-mse")
        if vae is not None:
            self.assertNotEqual(vae["status"], "ready")


if __name__ == "__main__":
    unittest.main()
