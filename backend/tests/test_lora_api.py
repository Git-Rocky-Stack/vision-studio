"""
Tests for LoRA API endpoints.
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

from api.lora import router  # type: ignore[import-not-found]
from fastapi import FastAPI
import services.lora_service as lora_service  # type: ignore[import-not-found]

# Create test app with LoRA router
app = FastAPI()
app.include_router(router)
client = TestClient(app)


def create_test_base64_image(width: int = 64, height: int = 64, color: str = "red") -> str:
    """Helper to create a base64-encoded test image."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class LoRAAPITests(unittest.TestCase):
    """Tests for LoRA API endpoints."""

    def setUp(self):
        # Force the diffusers-absent stub path so generation is deterministic on
        # any machine; a host WITH diffusers would attempt a real model load that
        # fails offline (these tests previously "passed" only via the
        # load-failure masquerade, fixed in M10.1). Mirrors CI, where diffusers
        # is absent.
        patcher = mock.patch.object(lora_service, "DIFFUSERS_AVAILABLE", False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_generate_success(self):
        """Test successful LoRA generation."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "runwayml/stable-diffusion-v1-5",
                "lora_path": "path/to/lora.safetensors",
                "lora_scale": 0.8,
                "prompt": "a beautiful landscape with mountains",
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
        self.assertEqual(data["lora_applied"], "path/to/lora.safetensors")
        self.assertEqual(data["lora_scale"], 0.8)

    def test_generate_empty_prompt_returns_422(self):
        """Test that empty prompt returns HTTP 422 error."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "runwayml/stable-diffusion-v1-5",
                "lora_path": "path/to/lora.safetensors",
                "prompt": "",
            },
        )

        # Schema validation catches empty prompt - returns 422
        self.assertEqual(response.status_code, 422)

    def test_generate_invalid_lora_scale_returns_422(self):
        """Test that invalid lora_scale returns validation error."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "model",
                "lora_path": "lora.safetensors",
                "prompt": "a test",
                "lora_scale": 3.0,  # Out of range (max 2.0)
            },
        )

        # Pydantic validation error returns 422
        self.assertEqual(response.status_code, 422)

    def test_generate_missing_base_model_returns_422(self):
        """Test that missing base_model returns validation error."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "lora_path": "lora.safetensors",
                "prompt": "a test",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_generate_missing_lora_path_returns_422(self):
        """Test that missing lora_path returns validation error."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "runwayml/stable-diffusion-v1-5",
                "prompt": "a test",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_generate_multiple_images(self):
        """Test generating multiple images in one request."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "runwayml/stable-diffusion-v1-5",
                "lora_path": "path/to/lora.safetensors",
                "prompt": "a scenic view",
                "num_images": 4,
                "seed": 12345,
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["images"]), 4)
        self.assertEqual(data["seed"], 12345)

    def test_generate_with_negative_prompt(self):
        """Test generation with negative prompt."""
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "model",
                "lora_path": "lora.safetensors",
                "prompt": "a beautiful scene",
                "negative_prompt": "ugly, blurry, low quality",
                "width": 64,
                "height": 64,
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_unload_success(self):
        """Test successful model unload."""
        response = client.post("/api/v1/lora/unload")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("message", data)
        self.assertEqual(data["message"], "LoRA model unloaded successfully")

    def test_generate_dimensions_bounds(self):
        """Test that dimensions outside bounds return 422."""
        # Width too small
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "model",
                "lora_path": "lora.safetensors",
                "prompt": "test",
                "width": 32,  # Below minimum 64
            },
        )
        self.assertEqual(response.status_code, 422)

        # Height too large
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "model",
                "lora_path": "lora.safetensors",
                "prompt": "test",
                "height": 4096,  # Above maximum 2048
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_generate_num_images_bounds(self):
        """Test that num_images outside bounds returns 422."""
        # Too many images
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "model",
                "lora_path": "lora.safetensors",
                "prompt": "test",
                "num_images": 10,  # Above maximum 8
            },
        )
        self.assertEqual(response.status_code, 422)

        # Zero images
        response = client.post(
            "/api/v1/lora/generate",
            json={
                "base_model": "model",
                "lora_path": "lora.safetensors",
                "prompt": "test",
                "num_images": 0,
            },
        )
        self.assertEqual(response.status_code, 422)
