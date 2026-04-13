"""
Tests for Edit API endpoints.

Note: These tests use a minimal FastAPI app with just the edit router
to avoid dependencies on torch/imageio that main.py requires.
"""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.edit import router as edit_router  # type: ignore[import-not-found]

# Create minimal test app
app = FastAPI()
app.include_router(edit_router)

# Sample base64 image for testing (1x1 pixel blue PNG)
SAMPLE_BASE64_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC"


class RemoveBackgroundApiTests(unittest.TestCase):
    """Tests for POST /api/v1/edit/remove-background endpoint."""

    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)

    def test_remove_background_success(self):
        """Test successful background removal."""
        response = self.client.post(
            "/api/v1/edit/remove-background",
            json={"image": SAMPLE_BASE64_IMAGE},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("image", data)
        self.assertIn("processing_time_ms", data)
        self.assertTrue(data["image"].startswith("data:image/png;base64,"))

    def test_remove_background_with_alpha_matting(self):
        """Test background removal with alpha matting options."""
        response = self.client.post(
            "/api/v1/edit/remove-background",
            json={
                "image": SAMPLE_BASE64_IMAGE,
                "alpha_matting": True,
                "alpha_matting_foreground_threshold": 200,
                "alpha_matting_background_threshold": 50,
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_remove_background_empty_image_returns_422(self):
        """Test that empty image returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/remove-background",
            json={"image": ""},
        )

        self.assertEqual(response.status_code, 422)

    def test_remove_background_missing_image_returns_422(self):
        """Test that missing image returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/remove-background",
            json={},
        )

        self.assertEqual(response.status_code, 422)

    def test_remove_background_invalid_threshold_returns_422(self):
        """Test that invalid threshold returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/remove-background",
            json={
                "image": SAMPLE_BASE64_IMAGE,
                "alpha_matting_foreground_threshold": 500,  # Out of range
            },
        )

        self.assertEqual(response.status_code, 422)


class UpscaleApiTests(unittest.TestCase):
    """Tests for POST /api/v1/edit/upscale endpoint."""

    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)

    def test_upscale_success_default_scale(self):
        """Test successful upscaling with default scale (4x)."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={"image": SAMPLE_BASE64_IMAGE},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("image", data)
        self.assertIn("original_size", data)
        self.assertIn("new_size", data)
        self.assertIn("processing_time_ms", data)

    def test_upscale_scale_2(self):
        """Test successful 2x upscaling."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={"image": SAMPLE_BASE64_IMAGE, "scale": 2},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_upscale_scale_4(self):
        """Test successful 4x upscaling."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={"image": SAMPLE_BASE64_IMAGE, "scale": 4},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_upscale_scale_8(self):
        """Test successful 8x upscaling."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={"image": SAMPLE_BASE64_IMAGE, "scale": 8},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_upscale_with_face_enhance(self):
        """Test upscaling with face enhancement enabled."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={
                "image": SAMPLE_BASE64_IMAGE,
                "scale": 4,
                "face_enhance": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_upscale_invalid_scale_returns_422(self):
        """Test that invalid scale returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={"image": SAMPLE_BASE64_IMAGE, "scale": 3},
        )

        self.assertEqual(response.status_code, 422)

    def test_upscale_missing_image_returns_422(self):
        """Test that missing image returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/upscale",
            json={"scale": 4},
        )

        self.assertEqual(response.status_code, 422)


class RestoreFacesApiTests(unittest.TestCase):
    """Tests for POST /api/v1/edit/restore-faces endpoint."""

    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)

    def test_restore_faces_success_default_fidelity(self):
        """Test successful face restoration with default fidelity."""
        response = self.client.post(
            "/api/v1/edit/restore-faces",
            json={"image": SAMPLE_BASE64_IMAGE},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("image", data)
        self.assertIn("faces_detected", data)
        self.assertIn("processing_time_ms", data)
        self.assertIsInstance(data["faces_detected"], int)

    def test_restore_faces_fidelity_zero(self):
        """Test face restoration with fidelity=0.0."""
        response = self.client.post(
            "/api/v1/edit/restore-faces",
            json={"image": SAMPLE_BASE64_IMAGE, "fidelity": 0.0},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_restore_faces_fidelity_one(self):
        """Test face restoration with fidelity=1.0."""
        response = self.client.post(
            "/api/v1/edit/restore-faces",
            json={"image": SAMPLE_BASE64_IMAGE, "fidelity": 1.0},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_restore_faces_fidelity_half(self):
        """Test face restoration with fidelity=0.5."""
        response = self.client.post(
            "/api/v1/edit/restore-faces",
            json={"image": SAMPLE_BASE64_IMAGE, "fidelity": 0.5},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])

    def test_restore_faces_invalid_fidelity_returns_422(self):
        """Test that invalid fidelity returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/restore-faces",
            json={"image": SAMPLE_BASE64_IMAGE, "fidelity": 1.5},
        )

        self.assertEqual(response.status_code, 422)

    def test_restore_faces_missing_image_returns_422(self):
        """Test that missing image returns 422 validation error."""
        response = self.client.post(
            "/api/v1/edit/restore-faces",
            json={"fidelity": 0.5},
        )

        self.assertEqual(response.status_code, 422)


class ListModelsApiTests(unittest.TestCase):
    """Tests for GET /api/v1/edit/models endpoint."""

    def setUp(self):
        """Set up test client."""
        self.client = TestClient(app)

    def test_list_models_success(self):
        """Test successful model listing."""
        response = self.client.get("/api/v1/edit/models")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("models", data)
        self.assertIn("rembg", data["models"])
        self.assertIn("realesrgan", data["models"])
        self.assertIn("gfpgan", data["models"])

    def test_list_models_contains_required_fields(self):
        """Test that model info contains required fields."""
        response = self.client.get("/api/v1/edit/models")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        for model_name in ["rembg", "realesrgan", "gfpgan"]:
            model_info = data["models"][model_name]
            self.assertIn("name", model_info)
            self.assertIn("description", model_info)
            self.assertIn("loaded", model_info)
            self.assertIsInstance(model_info["loaded"], bool)


if __name__ == "__main__":
    unittest.main()
