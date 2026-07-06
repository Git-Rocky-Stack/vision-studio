import os
import pathlib
import sys
import tempfile
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.model_manager import ModelInfo, ModelManager  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


class ModelManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_civitai_headers_include_bearer_token(self):
        manager = ModelManager(tempfile.mkdtemp())

        previous = os.environ.get("CIVITAI_API_TOKEN")
        os.environ["CIVITAI_API_TOKEN"] = "secret-token"
        try:
            headers = manager._build_civitai_headers()  # type: ignore[attr-defined]
        finally:
            if previous is None:
                os.environ.pop("CIVITAI_API_TOKEN", None)
            else:
                os.environ["CIVITAI_API_TOKEN"] = previous

        self.assertEqual(headers["Authorization"], "Bearer secret-token")

    async def test_civitai_download_requires_download_url(self):
        manager = ModelManager(tempfile.mkdtemp())
        model = ModelInfo(
            id="civitai-test",
            name="CivitAI Test",
            type="checkpoint",
            source="civitai",
            filename="model.safetensors",
        )

        with self.assertRaises(ValueError):
            await manager._download_from_civitai(model)

    async def test_diffusers_models_resolve_to_bundle_directories(self):
        manager = ModelManager(tempfile.mkdtemp())
        model = ModelInfo(
            id="ltx-video",
            name="LTX Video",
            type="diffusers",
            source="huggingface",
            repo_id="Lightricks/LTX-Video",
        )

        local_path = manager._get_local_path(model)

        self.assertTrue(local_path.endswith("diffusers/ltx-video") or local_path.endswith("diffusers\\ltx-video"))

    async def test_embedding_artifacts_have_a_dedicated_subdir(self):
        manager = ModelManager(tempfile.mkdtemp())
        self.assertIn("embedding", manager.subdirs)
        self.assertTrue(os.path.isdir(manager.subdirs["embedding"]))

    async def test_get_record_status_is_none_before_scan(self):
        manager = ModelManager(tempfile.mkdtemp())
        self.assertIsNone(manager.get_record_status("flux-dev"))

    async def test_get_record_status_maps_not_downloaded_to_not_found(self):
        manager = ModelManager(tempfile.mkdtemp())
        await manager.scan_models()
        self.assertEqual(manager.get_record_status("flux-dev"), "not_found")

    async def test_get_record_status_reports_ready_for_flat_single_file(self):
        manager = ModelManager(tempfile.mkdtemp())
        flat = os.path.join(manager.subdirs["checkpoint"], "flux1-dev.safetensors")
        with open(flat, "w", encoding="utf-8") as handle:
            handle.write("stub")
        await manager.scan_models()
        self.assertEqual(manager.get_record_status("flux-dev"), "ready")

    async def test_registry_reports_flat_single_file_ready_via_manager(self):
        # The regression, reproduced and fixed: a flat single-file artifact is
        # reported ready by the registry only when it delegates to the manager.
        models_dir = tempfile.mkdtemp()
        manager = ModelManager(models_dir)
        flat = os.path.join(manager.subdirs["checkpoint"], "flux1-dev.safetensors")
        with open(flat, "w", encoding="utf-8") as handle:
            handle.write("stub")
        await manager.scan_models()

        wired = ModelRegistry(
            models_dir=models_dir,
            catalog_path=CATALOG_PATH,
            status_provider=manager.get_record_status,
        )
        self.assertEqual(wired.get_record("flux-dev")["status"], "ready")

        bare = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
        self.assertEqual(bare.get_record("flux-dev")["status"], "not_found")

    async def test_get_record_status_passes_through_error_state(self):
        manager = ModelManager(tempfile.mkdtemp())
        await manager.scan_models()
        manager.available_models["flux-dev"].status = "error"
        self.assertEqual(manager.get_record_status("flux-dev"), "error")

    async def test_get_record_status_degrades_unknown_status_to_not_found(self):
        manager = ModelManager(tempfile.mkdtemp())
        await manager.scan_models()
        manager.available_models["flux-dev"].status = "some-future-state"
        self.assertEqual(manager.get_record_status("flux-dev"), "not_found")

    async def test_edit_model_record_reports_ready_from_per_id_dir(self):
        models_dir = tempfile.mkdtemp()
        manager = ModelManager(models_dir)
        target = os.path.join(models_dir, "edit-model", "edit-u2net")
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "edit-u2net.onnx"), "w", encoding="utf-8") as handle:
            handle.write("stub")
        await manager.scan_models()
        self.assertEqual(manager.get_record_status("edit-u2net"), "ready")

    async def test_get_record_status_self_heals_after_a_post_scan_install(self):
        # Pre-existing wart fixed in #34: a Foundry install completing after
        # the startup scan must flip to ready without a backend restart.
        models_dir = tempfile.mkdtemp()
        manager = ModelManager(models_dir)
        await manager.scan_models()
        self.assertEqual(manager.get_record_status("edit-u2net"), "not_found")
        target = os.path.join(models_dir, "edit-model", "edit-u2net")
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "edit-u2net.onnx"), "w", encoding="utf-8") as handle:
            handle.write("stub")
        self.assertEqual(manager.get_record_status("edit-u2net"), "ready")


if __name__ == "__main__":
    unittest.main()
