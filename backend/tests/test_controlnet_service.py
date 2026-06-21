"""
Tests for ControlNet service layer.
"""

import asyncio
import base64
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import services.controlnet_service as controlnet_service  # noqa: E402
from services.controlnet_service import (  # type: ignore[import-not-found]
    ControlNetService,
    GeneratedImage,
    decode_base64_image,
    encode_image_base64,
    resize_control_image,
)


def create_test_base64_image(width: int = 64, height: int = 64, color: str = "red") -> str:
    """Helper to create a base64-encoded test image."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class ControlNetUtilityTests(unittest.TestCase):
    """Tests for ControlNet utility functions."""

    def test_decode_base64_image_raw(self):
        """Test decoding raw base64 image string."""
        base64_img = create_test_base64_image(32, 24, "blue")
        image = decode_base64_image(base64_img)

        self.assertIsInstance(image, Image.Image)
        self.assertEqual(image.size, (32, 24))
        self.assertEqual(image.mode, "RGB")

    def test_decode_base64_image_data_url(self):
        """Test decoding data URL format base64 image."""
        base64_img = create_test_base64_image(16, 16, "green")
        data_url = f"data:image/png;base64,{base64_img}"
        image = decode_base64_image(data_url)

        self.assertIsInstance(image, Image.Image)
        self.assertEqual(image.size, (16, 16))

    def test_decode_base64_image_invalid_raises(self):
        """Test that invalid base64 raises ValueError."""
        with self.assertRaises(ValueError):
            decode_base64_image("not-valid-base64!!!")

    def test_encode_image_base64(self):
        """Test encoding PIL Image to base64."""
        img = Image.new("RGB", (64, 64), color="red")
        encoded = encode_image_base64(img)

        self.assertIsInstance(encoded, str)
        # Verify we can decode it back
        decoded = decode_base64_image(encoded)
        self.assertEqual(decoded.size, (64, 64))

    def test_resize_control_image(self):
        """Test resizing control image to target dimensions."""
        source = Image.new("RGB", (100, 100), color="blue")
        resized = resize_control_image(source, 50, 75)

        self.assertEqual(resized.size, (50, 75))
        self.assertIsInstance(resized, Image.Image)


class GeneratedImageTests(unittest.TestCase):
    """Tests for GeneratedImage dataclass."""

    def test_generated_image_creation(self):
        """Test creating GeneratedImage instance."""
        img = Image.new("RGB", (512, 512), color="purple")
        generated = GeneratedImage(
            image=img,
            seed=42,
            width=512,
            height=512,
        )

        self.assertEqual(generated.seed, 42)
        self.assertEqual(generated.width, 512)
        self.assertEqual(generated.height, 512)
        self.assertIsInstance(generated.image, Image.Image)


class ControlNetServiceTests(unittest.TestCase):
    """Tests for ControlNetService class."""

    def setUp(self):
        """Set up test fixtures.

        Force the diffusers-absent stub path so these tests are deterministic on
        any machine (no dependency on locally-cached models or the old
        load-failure masquerade, fixed in M10.1).
        """
        patcher = mock.patch.object(controlnet_service, "DIFFUSERS_AVAILABLE", False)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.service = ControlNetService()
        self.test_image = create_test_base64_image(64, 64, "red")

    def test_service_initialization(self):
        """Test ControlNetService initializes correctly."""
        service = ControlNetService()

        self.assertIsNotNone(service.models_dir)
        self.assertIn(service.device, ["cuda", "cpu"])
        self.assertFalse(service.is_model_loaded())
        self.assertIsNone(service.get_current_model_type())

    def test_service_custom_device(self):
        """Test ControlNetService with custom device."""
        service = ControlNetService(device="cpu")

        self.assertEqual(service.device, "cpu")

    def test_load_model_stub(self):
        """Test load_model returns True (stub implementation)."""
        async def run_test():
            result = await self.service.load_model("canny")
            return result

        result = asyncio.run(run_test())
        self.assertTrue(result)
        self.assertTrue(self.service.is_model_loaded())

    def test_load_model_unsupported_type_raises(self):
        """Test load_model raises ValueError for unsupported model type."""
        async def run_test():
            try:
                await self.service.load_model("invalid_model")
                return False
            except ValueError:
                return True

        result = asyncio.run(run_test())
        self.assertTrue(result)

    def test_load_multiple_models_unloads_previous(self):
        """Test loading a new model unloads the previous one."""
        async def run_test():
            await self.service.load_model("canny")
            self.assertEqual(self.service.get_current_model_type(), "canny")

            await self.service.load_model("depth")
            self.assertEqual(self.service.get_current_model_type(), "depth")

        asyncio.run(run_test())

    def test_generate_basic(self):
        """Test basic image generation."""
        async def run_test():
            # Load model first
            await self.service.load_model("canny")

            # Generate image
            results = await self.service.generate(
                prompt="a beautiful landscape",
                init_image=self.test_image,
                control_image=self.test_image,
                model_type="canny",
                width=64,
                height=64,
                steps=1,
                seed=42,
            )

            return results

        results = asyncio.run(run_test())

        self.assertEqual(len(results), 1)
        self.assertIsInstance(results[0], GeneratedImage)
        self.assertEqual(results[0].seed, 42)
        self.assertEqual(results[0].width, 64)
        self.assertEqual(results[0].height, 64)

    def test_generate_multiple_images(self):
        """Test generating multiple images."""
        async def run_test():
            await self.service.load_model("canny")

            results = await self.service.generate(
                prompt="a landscape",
                init_image=self.test_image,
                control_image=self.test_image,
                model_type="canny",
                width=64,
                height=64,
                num_images=4,
                seed=123,
            )

            return results

        results = asyncio.run(run_test())

        self.assertEqual(len(results), 4)
        for result in results:
            self.assertIsInstance(result, GeneratedImage)
            self.assertEqual(result.seed, 123)

    def test_generate_without_loading_model_raises(self):
        """Test generate raises RuntimeError if model not loaded."""
        async def run_test():
            fresh_service = ControlNetService()

            try:
                await fresh_service.generate(
                    prompt="test",
                    init_image=self.test_image,
                    control_image=self.test_image,
                    model_type="canny",
                    width=64,
                    height=64,
                )
                return False
            except RuntimeError:
                return True

        result = asyncio.run(run_test())
        self.assertTrue(result)

    def test_generate_with_progress_callback(self):
        """Test generate calls progress callback."""
        progress_calls = []

        def progress_callback(progress: float):
            progress_calls.append(progress)

        async def run_test():
            await self.service.load_model("canny")

            results = await self.service.generate(
                prompt="test",
                init_image=self.test_image,
                control_image=self.test_image,
                model_type="canny",
                width=64,
                height=64,
                num_images=2,
                progress_callback=progress_callback,
            )

            return results

        asyncio.run(run_test())

        # Progress callback should be called at least once per image
        self.assertGreater(len(progress_calls), 0)

    def test_generate_resizes_control_image(self):
        """Test generate resizes control image to target dimensions."""
        async def run_test():
            await self.service.load_model("canny")

            # Create a 100x100 image
            large_image = create_test_base64_image(100, 100)

            results = await self.service.generate(
                prompt="test",
                init_image=large_image,
                control_image=large_image,
                model_type="canny",
                width=64,
                height=64,
                seed=999,
            )

            return results

        results = asyncio.run(run_test())

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].width, 64)
        self.assertEqual(results[0].height, 64)

    def test_unload_model(self):
        """Test unload_model clears model from memory."""
        async def run_test():
            await self.service.load_model("canny")
            self.assertTrue(self.service.is_model_loaded())

            await self.service.unload_model()

            self.assertFalse(self.service.is_model_loaded())
            self.assertIsNone(self.service.get_current_model_type())

        asyncio.run(run_test())

    def test_unload_model_when_not_loaded(self):
        """Test unload_model is safe when no model is loaded."""
        async def run_test():
            fresh_service = ControlNetService()
            self.assertFalse(fresh_service.is_model_loaded())

            # Should not raise
            await fresh_service.unload_model()

            self.assertFalse(fresh_service.is_model_loaded())

        asyncio.run(run_test())


class ControlNetLoadFailureTests(unittest.TestCase):
    """A real load failure must surface as an error, never a silent success.

    Regression: the except block used to set _model_loaded=True with
    _pipeline=None, so generate() emitted a gray placeholder image as a 200 OK.
    """

    def test_real_load_failure_raises_and_stays_unloaded(self):
        import services.controlnet_service as cs

        service = ControlNetService(device="cpu")
        fake_torch = mock.MagicMock()

        with mock.patch.object(cs, "DIFFUSERS_AVAILABLE", True), \
                mock.patch.object(cs, "torch", fake_torch), \
                mock.patch.object(cs, "ControlNetModel", create=True) as controlnet_model:
            controlnet_model.from_pretrained.side_effect = RuntimeError("weights corrupt")

            async def run_test():
                with self.assertRaises(RuntimeError):
                    await service.load_model("canny")

            asyncio.run(run_test())

        # Must remain unloaded so generate() refuses instead of returning a
        # placeholder masquerading as a real result.
        self.assertFalse(service.is_model_loaded())
        self.assertIsNone(service.get_current_model_type())


if __name__ == "__main__":
    unittest.main()
