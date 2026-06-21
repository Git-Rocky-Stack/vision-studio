"""
Tests for ControlNet API endpoints.
"""

import base64
import io
import pathlib
import sys
import unittest
from unittest import mock

from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

from api.controlnet import router  # type: ignore[import-not-found]
from fastapi import FastAPI
import services.controlnet_service as controlnet_service  # type: ignore[import-not-found]

# Create test app with ControlNet router
app = FastAPI()
app.include_router(router)
client = TestClient(app)


def create_test_base64_image(width: int = 64, height: int = 64, color: str = "red") -> str:
    """Helper to create a base64-encoded test image."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class ControlNetAPITests(unittest.TestCase):
    """Tests for ControlNet API endpoints."""

    def setUp(self):
        # Force the diffusers-absent stub path so generation is deterministic on
        # any machine (a host WITH diffusers but without cached weights would
        # attempt a real load that fails offline, and a real failure now raises
        # rather than masquerading - M10.1). Mirrors CI, where diffusers is absent.
        patcher = mock.patch.object(controlnet_service, "DIFFUSERS_AVAILABLE", False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_generate_success(self):
        """Test successful ControlNet generation."""
        test_image = create_test_base64_image(64, 64, "blue")

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a beautiful landscape with mountains",
                "init_image": test_image,
                "control_image": test_image,
                "model": "canny",
                "steps": 5,
                "width": 64,
                "height": 64,
                "seed": 42,
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("images", data)
        self.assertIsInstance(data["images"], list)
        self.assertGreater(len(data["images"]), 0)
        self.assertIn("seed", data)
        self.assertEqual(data["seed"], 42)
        self.assertIn("processing_time_ms", data)
        self.assertEqual(data["model_used"], "canny")

    def test_generate_empty_prompt_returns_400(self):
        """Test that empty prompt returns HTTP 400 error."""
        test_image = create_test_base64_image(64, 64)

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "",
                "init_image": test_image,
                "control_image": test_image,
                "model": "canny",
            },
        )

        # Schema validation catches empty prompt - returns 422
        self.assertEqual(response.status_code, 422)

    def test_generate_invalid_model_returns_422(self):
        """Test that invalid model type returns validation error."""
        test_image = create_test_base64_image(64, 64)

        # This should fail at the Pydantic validation level
        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a test",
                "init_image": test_image,
                "control_image": test_image,
                "model": "invalid_model_type",
            },
        )

        # Pydantic validation error returns 422
        self.assertEqual(response.status_code, 422)

    def test_generate_missing_init_image_returns_422(self):
        """Test that missing init_image returns validation error."""
        test_image = create_test_base64_image(64, 64)

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a test",
                "control_image": test_image,
                "model": "canny",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_generate_missing_control_image_returns_422(self):
        """Test that missing control_image returns validation error."""
        test_image = create_test_base64_image(64, 64)

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a test",
                "init_image": test_image,
                "model": "canny",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_generate_multiple_images(self):
        """Test generating multiple images in one request."""
        test_image = create_test_base64_image(64, 64, "green")

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a scenic view",
                "init_image": test_image,
                "control_image": test_image,
                "model": "depth",
                "num_images": 4,
                "seed": 12345,
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["images"]), 4)
        self.assertEqual(data["seed"], 12345)

    def test_generate_all_model_types(self):
        """Test generation with each ControlNet model type."""
        test_image = create_test_base64_image(64, 64)
        model_types = ["canny", "depth", "normal", "openpose", "segmentation", "mlsd", "lineart", "softedge"]

        for model_type in model_types:
            response = client.post(
                "/api/v1/controlnet/generate",
                json={
                    "prompt": f"test with {model_type}",
                    "init_image": test_image,
                    "control_image": test_image,
                    "model": model_type,
                    "steps": 1,
                },
            )

            self.assertEqual(response.status_code, 200, f"Failed for model: {model_type}")
            data = response.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["model_used"], model_type)

    def test_generate_with_custom_parameters(self):
        """Test generation with custom parameters."""
        test_image = create_test_base64_image(64, 64)

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a detailed portrait",
                "init_image": test_image,
                "control_image": test_image,
                "model": "canny",
                "conditioning_scale": 1.5,
                "guidance_start": 0.1,
                "guidance_end": 0.9,
                "steps": 20,
                "guidance_scale": 10.0,
                "width": 128,
                "height": 128,
                "seed": 999,
                "negative_prompt": "blurry, distorted",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["model_used"], "canny")

    def test_generate_with_data_url_images(self):
        """Test generation with data URL format images."""
        test_image = create_test_base64_image(64, 64)
        data_url = f"data:image/png;base64,{test_image}"

        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "a test with data URL",
                "init_image": data_url,
                "control_image": data_url,
                "model": "canny",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_unload_success(self):
        """Test successful model unload."""
        response = client.post("/api/v1/controlnet/unload")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("message", data)
        self.assertEqual(data["message"], "ControlNet model unloaded successfully")

    def test_list_models(self):
        """Test listing available ControlNet models."""
        response = client.get("/api/v1/controlnet/models")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

        # Check structure of each model
        for model in data:
            self.assertIn("id", model)
            self.assertIn("name", model)
            self.assertIn("description", model)

        # Verify all expected models are present
        model_ids = [m["id"] for m in data]
        expected_models = ["canny", "depth", "normal", "openpose", "segmentation", "mlsd", "lineart", "softedge"]
        for expected in expected_models:
            self.assertIn(expected, model_ids)

    def test_unload_multiple_times(self):
        """Test that unloading multiple times is safe."""
        # First unload
        response1 = client.post("/api/v1/controlnet/unload")
        self.assertEqual(response1.status_code, 200)

        # Second unload (should still succeed)
        response2 = client.post("/api/v1/controlnet/unload")
        self.assertEqual(response2.status_code, 200)

    def test_generate_after_unload(self):
        """Test that generation works after unloading."""
        # Unload first
        client.post("/api/v1/controlnet/unload")

        # Generate should still work (will reload model)
        test_image = create_test_base64_image(64, 64)
        response = client.post(
            "/api/v1/controlnet/generate",
            json={
                "prompt": "test after unload",
                "init_image": test_image,
                "control_image": test_image,
                "model": "canny",
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])


if __name__ == "__main__":
    unittest.main()
