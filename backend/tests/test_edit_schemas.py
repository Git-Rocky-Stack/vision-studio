"""
Tests for Edit tools Pydantic schema validation.
"""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from pydantic import ValidationError

from schemas.edit import (  # type: ignore[import-not-found]
    BackgroundRemoveRequest,
    BackgroundRemoveResponse,
    UpscaleRequest,
    UpscaleResponse,
    FaceRestoreRequest,
    FaceRestoreResponse,
    EditErrorResponse,
)

# Sample base64 image for testing (1x1 pixel blue PNG)
SAMPLE_BASE64_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC"


class BackgroundRemoveRequestTests(unittest.TestCase):
    """Tests for BackgroundRemoveRequest schema validation."""

    def test_valid_minimal_request(self):
        """Test valid request with minimal required fields."""
        request = BackgroundRemoveRequest(image=SAMPLE_BASE64_IMAGE)

        self.assertEqual(request.image, SAMPLE_BASE64_IMAGE)
        self.assertFalse(request.alpha_matting)
        self.assertEqual(request.alpha_matting_foreground_threshold, 240)
        self.assertEqual(request.alpha_matting_background_threshold, 10)

    def test_valid_full_request(self):
        """Test valid request with all fields specified."""
        request = BackgroundRemoveRequest(
            image=SAMPLE_BASE64_IMAGE,
            alpha_matting=True,
            alpha_matting_foreground_threshold=200,
            alpha_matting_background_threshold=50,
        )

        self.assertTrue(request.alpha_matting)
        self.assertEqual(request.alpha_matting_foreground_threshold, 200)
        self.assertEqual(request.alpha_matting_background_threshold, 50)

    def test_empty_image_raises_validation_error(self):
        """Test that empty image raises validation error."""
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(image="")

    def test_missing_image_raises_validation_error(self):
        """Test that missing image raises validation error."""
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest()

    def test_foreground_threshold_out_of_range_raises_error(self):
        """Test that foreground threshold outside 0-255 raises error."""
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(
                image=SAMPLE_BASE64_IMAGE,
                alpha_matting_foreground_threshold=300,
            )

        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(
                image=SAMPLE_BASE64_IMAGE,
                alpha_matting_foreground_threshold=-10,
            )

    def test_background_threshold_out_of_range_raises_error(self):
        """Test that background threshold outside 0-255 raises error."""
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(
                image=SAMPLE_BASE64_IMAGE,
                alpha_matting_background_threshold=500,
            )


class UpscaleRequestTests(unittest.TestCase):
    """Tests for UpscaleRequest schema validation."""

    def test_valid_minimal_request(self):
        """Test valid request with minimal required fields."""
        request = UpscaleRequest(image=SAMPLE_BASE64_IMAGE)

        self.assertEqual(request.image, SAMPLE_BASE64_IMAGE)
        self.assertEqual(request.scale, 4)
        self.assertFalse(request.face_enhance)

    def test_valid_scale_2(self):
        """Test valid request with scale=2."""
        request = UpscaleRequest(image=SAMPLE_BASE64_IMAGE, scale=2)
        self.assertEqual(request.scale, 2)

    def test_valid_scale_4(self):
        """Test valid request with scale=4."""
        request = UpscaleRequest(image=SAMPLE_BASE64_IMAGE, scale=4)
        self.assertEqual(request.scale, 4)

    def test_valid_scale_8(self):
        """Test valid request with scale=8."""
        request = UpscaleRequest(image=SAMPLE_BASE64_IMAGE, scale=8)
        self.assertEqual(request.scale, 8)

    def test_valid_with_face_enhance(self):
        """Test valid request with face enhancement enabled."""
        request = UpscaleRequest(
            image=SAMPLE_BASE64_IMAGE,
            scale=4,
            face_enhance=True,
        )
        self.assertTrue(request.face_enhance)

    def test_invalid_scale_raises_error(self):
        """Test that invalid scale values raise error."""
        with self.assertRaises(ValidationError):
            UpscaleRequest(image=SAMPLE_BASE64_IMAGE, scale=1)

        with self.assertRaises(ValidationError):
            UpscaleRequest(image=SAMPLE_BASE64_IMAGE, scale=3)

        with self.assertRaises(ValidationError):
            UpscaleRequest(image=SAMPLE_BASE64_IMAGE, scale=5)

    def test_empty_image_raises_validation_error(self):
        """Test that empty image raises validation error."""
        with self.assertRaises(ValidationError):
            UpscaleRequest(image="")

    def test_missing_image_raises_validation_error(self):
        """Test that missing image raises validation error."""
        with self.assertRaises(ValidationError):
            UpscaleRequest()


class FaceRestoreRequestTests(unittest.TestCase):
    """Tests for FaceRestoreRequest schema validation."""

    def test_valid_minimal_request(self):
        """Test valid request with minimal required fields."""
        request = FaceRestoreRequest(image=SAMPLE_BASE64_IMAGE)

        self.assertEqual(request.image, SAMPLE_BASE64_IMAGE)
        self.assertEqual(request.fidelity, 0.5)

    def test_valid_full_request(self):
        """Test valid request with all fields specified."""
        request = FaceRestoreRequest(
            image=SAMPLE_BASE64_IMAGE,
            fidelity=0.8,
        )
        self.assertEqual(request.fidelity, 0.8)

    def test_fidelity_zero_valid(self):
        """Test that fidelity=0.0 is valid."""
        request = FaceRestoreRequest(image=SAMPLE_BASE64_IMAGE, fidelity=0.0)
        self.assertEqual(request.fidelity, 0.0)

    def test_fidelity_one_valid(self):
        """Test that fidelity=1.0 is valid."""
        request = FaceRestoreRequest(image=SAMPLE_BASE64_IMAGE, fidelity=1.0)
        self.assertEqual(request.fidelity, 1.0)

    def test_fidelity_out_of_range_raises_error(self):
        """Test that fidelity outside 0.0-1.0 raises error."""
        with self.assertRaises(ValidationError):
            FaceRestoreRequest(image=SAMPLE_BASE64_IMAGE, fidelity=-0.1)

        with self.assertRaises(ValidationError):
            FaceRestoreRequest(image=SAMPLE_BASE64_IMAGE, fidelity=1.5)

    def test_empty_image_raises_validation_error(self):
        """Test that empty image raises validation error."""
        with self.assertRaises(ValidationError):
            FaceRestoreRequest(image="")

    def test_missing_image_raises_validation_error(self):
        """Test that missing image raises validation error."""
        with self.assertRaises(ValidationError):
            FaceRestoreRequest()


class ResponseSchemaTests(unittest.TestCase):
    """Tests for response schemas."""

    def test_background_remove_response_valid(self):
        """Test valid BackgroundRemoveResponse."""
        response = BackgroundRemoveResponse(
            success=True,
            image=SAMPLE_BASE64_IMAGE,
            processing_time_ms=123.45,
        )

        self.assertTrue(response.success)
        self.assertEqual(response.image, SAMPLE_BASE64_IMAGE)
        self.assertEqual(response.processing_time_ms, 123.45)

    def test_upscale_response_valid(self):
        """Test valid UpscaleResponse."""
        response = UpscaleResponse(
            success=True,
            image=SAMPLE_BASE64_IMAGE,
            original_size=(512, 512),
            new_size=(2048, 2048),
            processing_time_ms=456.78,
        )

        self.assertTrue(response.success)
        self.assertEqual(response.original_size, (512, 512))
        self.assertEqual(response.new_size, (2048, 2048))

    def test_face_restore_response_valid(self):
        """Test valid FaceRestoreResponse."""
        response = FaceRestoreResponse(
            success=True,
            image=SAMPLE_BASE64_IMAGE,
            faces_detected=3,
            processing_time_ms=789.01,
        )

        self.assertTrue(response.success)
        self.assertEqual(response.faces_detected, 3)

    def test_error_response_valid(self):
        """Test valid EditErrorResponse."""
        response = EditErrorResponse(
            success=False,
            error="Image processing failed",
            error_code="PROCESSING_ERROR",
        )

        self.assertFalse(response.success)
        self.assertEqual(response.error, "Image processing failed")
        self.assertEqual(response.error_code, "PROCESSING_ERROR")


if __name__ == "__main__":
    unittest.main()
