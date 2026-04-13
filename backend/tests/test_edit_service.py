"""
Tests for Edit service functionality.
"""

import asyncio
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.edit_service import (  # type: ignore[import-not-found]
    EditService,
    decode_base64_image,
    encode_image_base64,
    validate_base64_image,
)

from PIL import Image

# Sample base64 image for testing (1x1 pixel blue PNG)
SAMPLE_BASE64_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC"

# Larger test image (2x2 pixels red PNG)
SAMPLE_2X2_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8zwACTGCSAQANHQEDgslx/wAAAABJRU5ErkJggg=="


class DecodeBase64ImageTests(unittest.TestCase):
    """Tests for decode_base64_image utility function."""

    def test_decode_valid_base64_image(self):
        """Test decoding a valid base64 image."""
        img = decode_base64_image(SAMPLE_BASE64_IMAGE)
        self.assertIsInstance(img, Image.Image)
        self.assertEqual(img.mode, "RGB")

    def test_decode_data_url_format(self):
        """Test decoding data URL format."""
        data_url = f"data:image/png;base64,{SAMPLE_BASE64_IMAGE}"
        img = decode_base64_image(data_url)
        self.assertIsInstance(img, Image.Image)

    def test_decode_invalid_base64_raises_error(self):
        """Test that invalid base64 raises ValueError."""
        with self.assertRaises(ValueError):
            decode_base64_image("not-valid-base64!")

    def test_decode_empty_string_raises_error(self):
        """Test that empty string raises ValueError."""
        with self.assertRaises(ValueError):
            decode_base64_image("")


class EncodeImageBase64Tests(unittest.TestCase):
    """Tests for encode_image_base64 utility function."""

    def test_encode_image_to_base64(self):
        """Test encoding an image to base64."""
        img = Image.new("RGB", (10, 10), color="red")
        encoded = encode_image_base64(img)
        self.assertIsInstance(encoded, str)
        self.assertTrue(len(encoded) > 0)

    def test_encode_decode_roundtrip(self):
        """Test that encode/decode roundtrip preserves image."""
        original = Image.new("RGB", (50, 50), color="blue")
        encoded = encode_image_base64(original)
        decoded = decode_base64_image(encoded)
        self.assertEqual(decoded.size, original.size)
        self.assertEqual(decoded.mode, original.mode)


class ValidateBase64ImageTests(unittest.TestCase):
    """Tests for validate_base64_image utility function."""

    def test_validate_valid_image(self):
        """Test validating a valid image."""
        # Should not raise
        validate_base64_image(SAMPLE_BASE64_IMAGE)

    def test_validate_data_url_format(self):
        """Test validating data URL format."""
        data_url = f"data:image/png;base64,{SAMPLE_BASE64_IMAGE}"
        validate_base64_image(data_url)  # Should not raise

    def test_validate_empty_string_raises(self):
        """Test that empty string raises ValueError."""
        with self.assertRaises(ValueError):
            validate_base64_image("")

    def test_validate_invalid_base64_raises(self):
        """Test that invalid base64 raises ValueError."""
        with self.assertRaises(ValueError):
            validate_base64_image("not-valid-base64!!!")


class EditServiceTests(unittest.TestCase):
    """Tests for EditService class."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = EditService()

    def test_service_initialization(self):
        """Test service initializes correctly."""
        self.assertIsNotNone(self.service.models_dir)
        self.assertFalse(self.service._models_loaded["rembg"])
        self.assertFalse(self.service._models_loaded["realesrgan"])
        self.assertFalse(self.service._models_loaded["gfpgan"])

    def test_service_with_custom_models_dir(self):
        """Test service initialization with custom models directory."""
        service = EditService(models_dir="/custom/models/path")
        self.assertEqual(service.models_dir, "/custom/models/path")


class RemoveBackgroundTests(unittest.TestCase):
    """Tests for remove_background method."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = EditService()

    def test_remove_background_basic(self):
        """Test basic background removal."""
        result_image, processing_time = asyncio.run(
            self.service.remove_background(SAMPLE_BASE64_IMAGE)
        )

        self.assertIsInstance(result_image, str)
        self.assertTrue(len(result_image) > 0)
        self.assertIsInstance(processing_time, float)
        self.assertGreater(processing_time, 0)

    def test_remove_background_with_alpha_matting(self):
        """Test background removal with alpha matting enabled."""
        result_image, processing_time = asyncio.run(
            self.service.remove_background(
                SAMPLE_BASE64_IMAGE,
                alpha_matting=True,
                alpha_matting_foreground_threshold=200,
                alpha_matting_background_threshold=50,
            )
        )

        self.assertIsInstance(result_image, str)
        self.assertGreater(len(result_image), 0)

    def test_remove_background_invalid_image_raises_error(self):
        """Test that invalid image raises ValueError."""
        with self.assertRaises(ValueError):
            asyncio.run(self.service.remove_background("invalid-base64"))

    def test_remove_background_empty_image_raises_error(self):
        """Test that empty image raises ValueError."""
        with self.assertRaises(ValueError):
            asyncio.run(self.service.remove_background(""))


class UpscaleTests(unittest.TestCase):
    """Tests for upscale method."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = EditService()

    def test_upscale_2x(self):
        """Test 2x upscaling."""
        result_image, original_size, new_size, processing_time = asyncio.run(
            self.service.upscale(SAMPLE_2X2_IMAGE, scale=2)
        )

        self.assertIsInstance(result_image, str)
        self.assertEqual(original_size, (2, 2))
        self.assertEqual(new_size, (4, 4))
        self.assertGreater(processing_time, 0)

    def test_upscale_4x(self):
        """Test 4x upscaling."""
        result_image, original_size, new_size, processing_time = asyncio.run(
            self.service.upscale(SAMPLE_2X2_IMAGE, scale=4)
        )

        self.assertEqual(original_size, (2, 2))
        self.assertEqual(new_size, (8, 8))

    def test_upscale_8x(self):
        """Test 8x upscaling."""
        result_image, original_size, new_size, processing_time = asyncio.run(
            self.service.upscale(SAMPLE_2X2_IMAGE, scale=8)
        )

        self.assertEqual(original_size, (2, 2))
        self.assertEqual(new_size, (16, 16))

    def test_upscale_with_face_enhance(self):
        """Test upscaling with face enhancement enabled."""
        result_image, original_size, new_size, processing_time = asyncio.run(
            self.service.upscale(SAMPLE_2X2_IMAGE, scale=4, face_enhance=True)
        )

        self.assertIsInstance(result_image, str)
        self.assertEqual(original_size, (2, 2))

    def test_upscale_invalid_scale_raises_error(self):
        """Test that invalid scale raises ValueError."""
        with self.assertRaises(ValueError):
            asyncio.run(self.service.upscale(SAMPLE_BASE64_IMAGE, scale=3))

        with self.assertRaises(ValueError):
            asyncio.run(self.service.upscale(SAMPLE_BASE64_IMAGE, scale=5))

    def test_upscale_invalid_image_raises_error(self):
        """Test that invalid image raises ValueError."""
        with self.assertRaises(ValueError):
            asyncio.run(self.service.upscale("invalid-base64"))


class RestoreFacesTests(unittest.TestCase):
    """Tests for restore_faces method."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = EditService()

    def test_restore_faces_basic(self):
        """Test basic face restoration."""
        result_image, faces_detected, processing_time = asyncio.run(
            self.service.restore_faces(SAMPLE_BASE64_IMAGE)
        )

        self.assertIsInstance(result_image, str)
        self.assertIsInstance(faces_detected, int)
        self.assertGreaterEqual(faces_detected, 0)
        self.assertGreater(processing_time, 0)

    def test_restore_faces_fidelity_zero(self):
        """Test face restoration with fidelity=0.0."""
        result_image, faces_detected, processing_time = asyncio.run(
            self.service.restore_faces(SAMPLE_BASE64_IMAGE, fidelity=0.0)
        )

        self.assertIsInstance(result_image, str)

    def test_restore_faces_fidelity_one(self):
        """Test face restoration with fidelity=1.0."""
        result_image, faces_detected, processing_time = asyncio.run(
            self.service.restore_faces(SAMPLE_BASE64_IMAGE, fidelity=1.0)
        )

        self.assertIsInstance(result_image, str)

    def test_restore_faces_fidelity_half(self):
        """Test face restoration with fidelity=0.5."""
        result_image, faces_detected, processing_time = asyncio.run(
            self.service.restore_faces(SAMPLE_BASE64_IMAGE, fidelity=0.5)
        )

        self.assertIsInstance(result_image, str)

    def test_restore_faces_invalid_fidelity_raises_error(self):
        """Test that invalid fidelity raises ValueError."""
        with self.assertRaises(ValueError):
            asyncio.run(self.service.restore_faces(SAMPLE_BASE64_IMAGE, fidelity=-0.1))

        with self.assertRaises(ValueError):
            asyncio.run(self.service.restore_faces(SAMPLE_BASE64_IMAGE, fidelity=1.5))

    def test_restore_faces_invalid_image_raises_error(self):
        """Test that invalid image raises ValueError."""
        with self.assertRaises(ValueError):
            asyncio.run(self.service.restore_faces("invalid-base64"))


class ModelManagementTests(unittest.TestCase):
    """Tests for model loading/unloading methods."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = EditService()

    def test_load_models(self):
        """Test loading all models."""
        asyncio.run(self.service.load_models())

        self.assertTrue(self.service.is_model_loaded("rembg"))
        self.assertTrue(self.service.is_model_loaded("realesrgan"))
        self.assertTrue(self.service.is_model_loaded("gfpgan"))

    def test_unload_models(self):
        """Test unloading all models."""
        asyncio.run(self.service.load_models())
        asyncio.run(self.service.unload_models())

        self.assertFalse(self.service.is_model_loaded("rembg"))
        self.assertFalse(self.service.is_model_loaded("realesrgan"))
        self.assertFalse(self.service.is_model_loaded("gfpgan"))

    def test_is_model_loaded_unknown_model(self):
        """Test is_model_loaded with unknown model name."""
        self.assertFalse(self.service.is_model_loaded("unknown_model"))


if __name__ == "__main__":
    unittest.main()
