"""
Tests for ControlNet Pydantic schema validation.
"""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from pydantic import ValidationError

from schemas.controlnet import (  # type: ignore[import-not-found]
    ControlNetModel,
    ControlNetRequest,
    ControlNetResponse,
    ControlNetErrorResponse,
)


class ControlNetModelTests(unittest.TestCase):
    """Tests for ControlNetModel enum."""

    def test_controlnet_model_enum_values(self):
        """Test all ControlNet model enum values exist."""
        self.assertEqual(ControlNetModel.CANNY.value, "canny")
        self.assertEqual(ControlNetModel.DEPTH.value, "depth")
        self.assertEqual(ControlNetModel.NORMAL.value, "normal")
        self.assertEqual(ControlNetModel.OPENPOSE.value, "openpose")
        self.assertEqual(ControlNetModel.SEGMENTATION.value, "segmentation")
        self.assertEqual(ControlNetModel.MLSD.value, "mlsd")
        self.assertEqual(ControlNetModel.LINEART.value, "lineart")
        self.assertEqual(ControlNetModel.SOFTEDGE.value, "softedge")

    def test_controlnet_model_from_string(self):
        """Test creating ControlNetModel from string values."""
        model = ControlNetModel("canny")
        self.assertEqual(model, ControlNetModel.CANNY)

        model = ControlNetModel("depth")
        self.assertEqual(model, ControlNetModel.DEPTH)


class ControlNetRequestSchemaTests(unittest.TestCase):
    """Tests for ControlNetRequest schema validation."""

    def test_valid_minimal_request(self):
        """Test valid request with minimal required fields."""
        request = ControlNetRequest(
            prompt="a beautiful landscape",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
        )

        self.assertEqual(request.prompt, "a beautiful landscape")
        self.assertEqual(request.model, ControlNetModel.CANNY)
        self.assertEqual(request.conditioning_scale, 1.0)
        self.assertEqual(request.steps, 25)
        self.assertEqual(request.guidance_scale, 7.5)
        self.assertEqual(request.width, 512)
        self.assertEqual(request.height, 512)
        self.assertEqual(request.num_images, 1)
        self.assertEqual(request.seed, -1)

    def test_valid_full_request(self):
        """Test valid request with all fields specified."""
        request = ControlNetRequest(
            prompt="a cyberpunk city at night, neon lights, highly detailed",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="] * 3,
            model=ControlNetModel.DEPTH,
            conditioning_scale=1.5,
            guidance_start=0.2,
            guidance_end=0.8,
            steps=50,
            guidance_scale=12.0,
            width=1024,
            height=768,
            seed=42,
            num_images=4,
            negative_prompt="blurry, low quality, distorted",
        )

        self.assertEqual(request.prompt, "a cyberpunk city at night, neon lights, highly detailed")
        self.assertEqual(len(request.images), 3)
        self.assertEqual(request.conditioning_scale, 1.5)
        self.assertEqual(request.guidance_start, 0.2)
        self.assertEqual(request.guidance_end, 0.8)
        self.assertEqual(request.steps, 50)
        self.assertEqual(request.guidance_scale, 12.0)
        self.assertEqual(request.width, 1024)
        self.assertEqual(request.height, 768)
        self.assertEqual(request.seed, 42)
        self.assertEqual(request.num_images, 4)

    def test_empty_prompt_allowed_by_schema(self):
        """Test that empty prompt is allowed by schema (validated in API layer)."""
        # Schema allows empty prompt - API layer validates it
        request = ControlNetRequest(
            prompt="",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
        )

        self.assertEqual(request.prompt, "")

    def test_prompt_too_long_raises_validation_error(self):
        """Test that prompt over 2000 characters raises validation error."""
        long_prompt = "a " * 1001  # 2002 characters

        with self.assertRaises(ValidationError) as context:
            ControlNetRequest(
                prompt=long_prompt,
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
            )

        self.assertIn("prompt", str(context.exception))

    def test_empty_images_list_raises_validation_error(self):
        """Test that empty images list raises validation error."""
        with self.assertRaises(ValidationError) as context:
            ControlNetRequest(
                prompt="a landscape",
                images=[],
                model=ControlNetModel.CANNY,
            )

        self.assertIn("images", str(context.exception))

    def test_conditioning_scale_bounds(self):
        """Test conditioning_scale must be between 0 and 2."""
        # Valid at boundaries
        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            conditioning_scale=0.0,
        )
        self.assertEqual(request.conditioning_scale, 0.0)

        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            conditioning_scale=2.0,
        )
        self.assertEqual(request.conditioning_scale, 2.0)

        # Invalid: too low
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                conditioning_scale=-0.1,
            )

        # Invalid: too high
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                conditioning_scale=2.1,
            )

    def test_steps_bounds(self):
        """Test steps must be between 1 and 150."""
        # Valid at boundaries
        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            steps=1,
        )
        self.assertEqual(request.steps, 1)

        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            steps=150,
        )
        self.assertEqual(request.steps, 150)

        # Invalid: too low
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                steps=0,
            )

        # Invalid: too high
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                steps=151,
            )

    def test_dimensions_bounds(self):
        """Test width and height must be between 64 and 2048."""
        # Valid at boundaries
        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            width=64,
            height=64,
        )
        self.assertEqual(request.width, 64)
        self.assertEqual(request.height, 64)

        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            width=2048,
            height=2048,
        )
        self.assertEqual(request.width, 2048)
        self.assertEqual(request.height, 2048)

        # Invalid: too small
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                width=63,
            )

        # Invalid: too large
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                width=2049,
            )

    def test_num_images_bounds(self):
        """Test num_images must be between 1 and 8."""
        # Valid at boundaries
        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            num_images=1,
        )
        self.assertEqual(request.num_images, 1)

        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            num_images=8,
        )
        self.assertEqual(request.num_images, 8)

        # Invalid: too many
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                num_images=9,
            )

    def test_guidance_scale_bounds(self):
        """Test guidance_scale must be between 1 and 30."""
        # Valid at boundaries
        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            guidance_scale=1.0,
        )
        self.assertEqual(request.guidance_scale, 1.0)

        request = ControlNetRequest(
            prompt="test",
            images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
            model=ControlNetModel.CANNY,
            guidance_scale=30.0,
        )
        self.assertEqual(request.guidance_scale, 30.0)

        # Invalid: too low
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                guidance_scale=0.5,
            )

        # Invalid: too high
        with self.assertRaises(ValidationError):
            ControlNetRequest(
                prompt="test",
                images=["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="],
                model=ControlNetModel.CANNY,
                guidance_scale=31.0,
            )


class ControlNetResponseSchemaTests(unittest.TestCase):
    """Tests for ControlNetResponse schema."""

    def test_valid_response(self):
        """Test valid ControlNetResponse."""
        response = ControlNetResponse(
            images=["/outputs/job-123/image_001.png", "/outputs/job-123/image_002.png"],
            seed=42,
            processing_time_ms=1234.56,
            model_used="canny",
        )

        self.assertTrue(response.success)
        self.assertEqual(len(response.images), 2)
        self.assertEqual(response.seed, 42)
        self.assertEqual(response.processing_time_ms, 1234.56)
        self.assertEqual(response.model_used, "canny")
        self.assertIsNone(response.warning)

    def test_response_with_warning(self):
        """Test ControlNetResponse with warning message."""
        response = ControlNetResponse(
            images=["/outputs/job-123/image_001.png"],
            seed=42,
            processing_time_ms=500.0,
            model_used="depth",
            warning="Low resolution input detected, output may be affected",
        )

        self.assertTrue(response.success)
        self.assertEqual(response.warning, "Low resolution input detected, output may be affected")


class ControlNetErrorResponseSchemaTests(unittest.TestCase):
    """Tests for ControlNetErrorResponse schema."""

    def test_valid_error_response(self):
        """Test valid ControlNetErrorResponse."""
        response = ControlNetErrorResponse(
            error="Model not found",
            error_code="MODEL_NOT_FOUND",
        )

        self.assertFalse(response.success)
        self.assertEqual(response.error, "Model not found")
        self.assertEqual(response.error_code, "MODEL_NOT_FOUND")
        self.assertIsNone(response.details)

    def test_error_response_with_details(self):
        """Test ControlNetErrorResponse with additional details."""
        response = ControlNetErrorResponse(
            error="Invalid model type",
            error_code="INVALID_MODEL",
            details={"provided": "invalid", "valid_options": "canny, depth, normal"},
        )

        self.assertFalse(response.success)
        self.assertEqual(response.details["provided"], "invalid")


if __name__ == "__main__":
    unittest.main()
