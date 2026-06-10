import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.model_record import ModelRecord  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def make_registry():
    return ModelRegistry(models_dir=tempfile.mkdtemp(), catalog_path=CATALOG_PATH)


class FoundryRegistryTests(unittest.TestCase):
    def test_list_records_returns_all_catalog_entries_as_dicts(self):
        registry = make_registry()
        records = registry.list_records()
        assert isinstance(records, list)
        assert len(records) >= 13
        ids = {r["id"] for r in records}
        assert "flux-dev" in ids and "ltx-video" in ids

    def test_get_record_by_id(self):
        registry = make_registry()
        record = registry.get_record("flux-dev")
        assert record is not None
        assert record["name"] == "FLUX.1 [dev]"

    def test_get_record_unknown_returns_none(self):
        registry = make_registry()
        assert registry.get_record("does-not-exist") is None

    def test_get_record_resolves_legacy_alias(self):
        registry = make_registry()
        # Inject a temporary alias to prove resolution wiring works.
        registry.legacy_aliases["sd15"] = "sd-1-5"
        record = registry.get_record("sd15")
        assert record is not None
        assert record["id"] == "sd-1-5"

    def test_status_reconciles_to_ready_when_present_on_disk(self):
        models_dir = tempfile.mkdtemp()
        # Simulate a downloaded diffusers bundle for ltx-video.
        bundle = os.path.join(models_dir, "diffusers", "ltx-video")
        os.makedirs(bundle, exist_ok=True)
        with open(os.path.join(bundle, "model_index.json"), "w", encoding="utf-8") as handle:
            handle.write("{}")

        registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
        record = registry.get_record("ltx-video")
        assert record["status"] == "ready"

        # A model with no files on disk stays not_found.
        assert registry.get_record("flux-dev")["status"] == "not_found"

    def test_unrelated_file_in_typed_subdir_does_not_mark_model_ready(self):
        models_dir = tempfile.mkdtemp()
        checkpoints = os.path.join(models_dir, "checkpoints")
        os.makedirs(checkpoints, exist_ok=True)
        with open(os.path.join(checkpoints, "some-other-model.safetensors"), "w", encoding="utf-8") as handle:
            handle.write("stub")

        registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
        # A stray unrelated checkpoint file must NOT mark different models ready.
        assert registry.get_record("flux-dev")["status"] == "not_found"
        assert registry.get_record("sdxl-base")["status"] == "not_found"

    def test_unrelated_file_in_diffusers_dir_does_not_mark_pipelines_ready(self):
        models_dir = tempfile.mkdtemp()
        diffusers = os.path.join(models_dir, "diffusers")
        os.makedirs(diffusers, exist_ok=True)
        with open(os.path.join(diffusers, "stray.txt"), "w", encoding="utf-8") as handle:
            handle.write("stub")

        registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
        assert registry.get_record("sd3.5-large")["status"] == "not_found"
        assert registry.get_record("animatediff")["status"] == "not_found"

    def test_checkpoint_present_when_id_named_dir_is_populated(self):
        models_dir = tempfile.mkdtemp()
        target = os.path.join(models_dir, "checkpoints", "sdxl-base")
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "sdxl-base.safetensors"), "w", encoding="utf-8") as handle:
            handle.write("stub")

        registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
        assert registry.get_record("sdxl-base")["status"] == "ready"

    def test_status_provider_overrides_dir_check_for_flat_single_file(self):
        # The dir-based check cannot see a flat single-file artifact; a wired
        # provider (model_manager) can, and is authoritative.
        registry = ModelRegistry(
            models_dir=tempfile.mkdtemp(),
            catalog_path=CATALOG_PATH,
            status_provider=lambda mid: "ready" if mid == "flux-dev" else None,
        )
        assert registry.get_record("flux-dev")["status"] == "ready"

    def test_status_provider_surfaces_downloading_in_list_and_get(self):
        registry = ModelRegistry(
            models_dir=tempfile.mkdtemp(),
            catalog_path=CATALOG_PATH,
            status_provider=lambda mid: "downloading" if mid == "sdxl-base" else None,
        )
        assert registry.get_record("sdxl-base")["status"] == "downloading"
        sdxl = next(r for r in registry.list_records() if r["id"] == "sdxl-base")
        assert sdxl["status"] == "downloading"

    def test_status_provider_none_falls_back_to_disk_detection(self):
        models_dir = tempfile.mkdtemp()
        bundle = os.path.join(models_dir, "diffusers", "ltx-video")
        os.makedirs(bundle, exist_ok=True)
        with open(os.path.join(bundle, "model_index.json"), "w", encoding="utf-8") as handle:
            handle.write("{}")
        registry = ModelRegistry(
            models_dir=models_dir,
            catalog_path=CATALOG_PATH,
            status_provider=lambda mid: None,
        )
        assert registry.get_record("ltx-video")["status"] == "ready"
        assert registry.get_record("flux-dev")["status"] == "not_found"

    def test_status_provider_is_keyed_by_canonical_id_through_alias(self):
        # Requesting via a legacy alias must consult the provider with the
        # canonical id, not the alias string.
        registry = ModelRegistry(
            models_dir=tempfile.mkdtemp(),
            catalog_path=CATALOG_PATH,
            status_provider=lambda mid: "ready" if mid == "sd-1-5" else None,
        )
        registry.legacy_aliases["sd15"] = "sd-1-5"
        assert registry.get_record("sd15")["status"] == "ready"


class TransientLayerTests(unittest.TestCase):
    def test_transient_records_resolvable_but_not_listed(self):
        registry = make_registry()
        record = ModelRecord(
            id="search-hf--org-model", name="model", artifact_type="diffusers-pipeline",
            capability="image", base_architecture="sdxl", source="huggingface",
            repo_id="org/model", tier="compatible", tier_reason="x",
        )
        registry.register_transient([record])
        self.assertIsNotNone(registry.get_record("search-hf--org-model"))
        listed_ids = {r["id"] for r in registry.list_records()}
        self.assertNotIn("search-hf--org-model", listed_ids)

    def test_transient_never_shadows_catalog_or_indexed(self):
        registry = make_registry()
        catalog_id = next(iter(registry.records))
        shadow = ModelRecord(
            id=catalog_id, name="shadow", artifact_type="checkpoint",
            capability="image", base_architecture="flux", source="huggingface",
        )
        registry.register_transient([shadow])
        self.assertNotEqual(registry.get_record(catalog_id)["name"], "shadow")

    def test_register_transient_replaces_wholesale(self):
        registry = make_registry()
        a = ModelRecord(id="search-hf--a", name="a", artifact_type="checkpoint",
                        capability="image", base_architecture="sdxl", source="huggingface")
        b = ModelRecord(id="search-hf--b", name="b", artifact_type="checkpoint",
                        capability="image", base_architecture="sdxl", source="huggingface")
        registry.register_transient([a])
        registry.register_transient([b])
        self.assertIsNone(registry.get_record("search-hf--a"))
        self.assertIsNotNone(registry.get_record("search-hf--b"))

    def test_transient_status_is_not_found(self):
        registry = make_registry()
        a = ModelRecord(id="search-hf--a", name="a", artifact_type="checkpoint",
                        capability="image", base_architecture="sdxl", source="huggingface",
                        status="ready")  # lies from outside are normalized
        registry.register_transient([a])
        self.assertEqual(registry.get_record("search-hf--a")["status"], "not_found")


if __name__ == "__main__":
    unittest.main()
