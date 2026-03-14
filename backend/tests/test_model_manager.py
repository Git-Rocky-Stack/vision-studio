import os
import pathlib
import sys
import tempfile
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.model_manager import ModelInfo, ModelManager  # type: ignore[import-not-found]


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


if __name__ == "__main__":
    unittest.main()
