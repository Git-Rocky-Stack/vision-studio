"""Tests for LoRA service."""
import asyncio
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

import services.lora_service as lora_service  # noqa: E402
from services.lora_service import (  # type: ignore[import-not-found]
    LoRAService,
    GeneratedImage,
    decode_base64_image,
    encode_image_base64,
)


def create_test_base64_image(width: int = 64, height: int = 64, color: str = "red") -> str:
    """Helper to create a base64-encoded test image."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class LoRAUtilityTests(unittest.TestCase):
    """Tests for LoRA utility functions."""

    def test_encode_decode_roundtrip(self):
        """Test that encoding and decoding an image returns the same image."""
        original = Image.new("RGB", (100, 100), color=(255, 0, 0))
        encoded = encode_image_base64(original)
        decoded = decode_base64_image(encoded)

        self.assertEqual(decoded.width, original.width)
        self.assertEqual(decoded.height, original.height)
        self.assertEqual(decoded.mode, original.mode)

    def test_decode_data_url(self):
        """Test decoding a data URL format."""
        original = Image.new("RGB", (50, 50), color=(0, 255, 0))
        encoded = encode_image_base64(original)
        data_url = f"data:image/png;base64,{encoded}"

        decoded = decode_base64_image(data_url)

        self.assertEqual(decoded.width, 50)
        self.assertEqual(decoded.height, 50)

    def test_decode_invalid_base64_raises_error(self):
        """Test that invalid base64 raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            decode_base64_image("not_valid_base64!!!")
        self.assertIn("Failed to decode", str(ctx.exception))


class LoRAServiceTests(unittest.TestCase):
    """Tests for LoRAService class."""

    def setUp(self):
        """Set up test fixtures.

        Force the diffusers-absent stub path so these tests are deterministic on
        any machine. Without it, a host WITH diffusers attempts real model loads
        that fail offline; they previously "passed" only because load_lora
        masqueraded load failures as success (the M10.1 bug now fixed).
        """
        patcher = mock.patch.object(lora_service, "DIFFUSERS_AVAILABLE", False)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.service = LoRAService()

    def test_service_initialization(self):
        """Test that service initializes correctly."""
        self.assertFalse(self.service._model_loaded)
        self.assertIsNone(self.service._current_lora)
        self.assertEqual(self.service._current_scale, 0.0)
        self.assertIsNone(self.service._pipeline)

    def test_load_lora_stub_mode(self):
        """Test loading a LoRA in stub mode."""
        async def run_test():
            result = await self.service.load_lora(
                base_model="runwayml/stable-diffusion-v1-5",
                lora_path="path/to/lora.safetensors",
                scale=0.8,
            )
            return result

        result = asyncio.run(run_test())

        self.assertTrue(result)
        self.assertEqual(self.service._current_lora, "path/to/lora.safetensors")
        self.assertEqual(self.service._current_scale, 0.8)
        self.assertTrue(self.service._model_loaded)

    def test_load_lora_invalid_path_raises_error(self):
        """Test that invalid LoRA path raises ValueError."""
        async def run_test():
            try:
                await self.service.load_lora(
                    base_model="model",
                    lora_path="invalid_path",
                    scale=0.8,
                )
                return False
            except ValueError:
                return True

        result = asyncio.run(run_test())
        self.assertTrue(result)

    def test_generate_without_load_raises_error(self):
        """Test that generate raises RuntimeError if LoRA not loaded."""
        async def run_test():
            try:
                await self.service.generate(
                    prompt="A test prompt",
                    width=512,
                    height=512,
                )
                return False
            except RuntimeError:
                return True

        result = asyncio.run(run_test())
        self.assertTrue(result)

    def test_generate_creates_images(self):
        """Test that generate creates images after loading."""
        async def run_test():
            # Load LoRA first
            await self.service.load_lora(
                base_model="runwayml/stable-diffusion-v1-5",
                lora_path="path/to/lora.safetensors",
                scale=0.8,
            )

            # Generate images
            results = await self.service.generate(
                prompt="A beautiful landscape",
                width=64,
                height=64,
                num_images=2,
            )

            return results

        results = asyncio.run(run_test())

        self.assertEqual(len(results), 2)
        self.assertTrue(all(isinstance(r.image, Image.Image) for r in results))
        self.assertTrue(all(r.width == 64 for r in results))
        self.assertTrue(all(r.height == 64 for r in results))
        self.assertTrue(all(isinstance(r.seed, int) for r in results))

    def test_generate_with_seed(self):
        """Test that generate uses provided seed."""
        async def run_test():
            await self.service.load_lora(
                base_model="model",
                lora_path="lora.safetensors",
                scale=0.8,
            )

            results = await self.service.generate(
                prompt="test",
                seed=42,
                width=32,
                height=32,
            )

            return results

        results = asyncio.run(run_test())
        self.assertEqual(results[0].seed, 42)

    def test_generate_with_random_seed(self):
        """Test that generate creates random seed when None provided."""
        async def run_test():
            await self.service.load_lora(
                base_model="model",
                lora_path="lora.safetensors",
                scale=0.8,
            )

            results = await self.service.generate(
                prompt="test",
                seed=None,
                width=32,
                height=32,
            )

            return results

        results = asyncio.run(run_test())
        self.assertIsInstance(results[0].seed, int)
        self.assertGreaterEqual(results[0].seed, 0)

    def test_unload(self):
        """Test unloading a LoRA."""
        async def run_test():
            # Load first
            await self.service.load_lora(
                base_model="model",
                lora_path="lora.safetensors",
                scale=0.8,
            )
            self.assertTrue(self.service._model_loaded)

            # Unload
            await self.service.unload()

            return self.service._model_loaded

        result = asyncio.run(run_test())
        self.assertFalse(result)
        self.assertIsNone(self.service._current_lora)
        self.assertEqual(self.service._current_scale, 0.0)
        self.assertIsNone(self.service._pipeline)

    def test_unload_when_not_loaded(self):
        """Test that unload is safe to call when nothing is loaded."""
        async def run_test():
            await self.service.unload()  # Should not raise
            return self.service._model_loaded

        result = asyncio.run(run_test())
        self.assertFalse(result)

    def test_is_loaded(self):
        """Test is_loaded method."""
        self.assertFalse(self.service.is_loaded())

        async def run_test():
            await self.service.load_lora("model", "lora.safetensors", 0.8)
            loaded = self.service.is_loaded()
            await self.service.unload()
            return loaded

        result = asyncio.run(run_test())
        self.assertTrue(result)
        self.assertFalse(self.service.is_loaded())

    def test_get_current_lora(self):
        """Test get_current_lora method."""
        self.assertIsNone(self.service.get_current_lora())

        async def run_test():
            await self.service.load_lora("model", "path/to/lora.safetensors", 0.8)
            return self.service.get_current_lora()

        result = asyncio.run(run_test())
        self.assertEqual(result, "path/to/lora.safetensors")

    def test_get_current_scale(self):
        """Test get_current_scale method."""
        self.assertEqual(self.service.get_current_scale(), 0.0)

        async def run_test():
            await self.service.load_lora("model", "lora.safetensors", 1.5)
            return self.service.get_current_scale()

        result = asyncio.run(run_test())
        self.assertEqual(result, 1.5)

    def test_generate_with_progress_callback(self):
        """Test that progress callback is called during generation."""
        async def run_test():
            await self.service.load_lora("model", "lora.safetensors", 0.8)

            progress_values = []
            def track_progress(progress: float):
                progress_values.append(progress)

            await self.service.generate(
                prompt="test",
                width=32,
                height=32,
                num_images=3,
                progress_callback=track_progress,
            )

            return progress_values

        progress_values = asyncio.run(run_test())
        # Should have 3 progress updates (0%, 50%, 100% approximately)
        self.assertEqual(len(progress_values), 3)

    def test_generate_multiple_images_same_seed(self):
        """Test that multiple images use the same seed."""
        async def run_test():
            await self.service.load_lora("model", "lora.safetensors", 0.8)

            results = await self.service.generate(
                prompt="test",
                seed=123,
                width=32,
                height=32,
                num_images=4,
            )

            return results

        results = asyncio.run(run_test())
        # All images should have the same seed
        self.assertTrue(all(r.seed == 123 for r in results))


class LoRALoadFailureTests(unittest.TestCase):
    """A real load failure must surface as an error, never a silent success.

    Regression: the except block used to set _model_loaded=True with
    _pipeline=None, so generate() emitted placeholder output as a 200 OK.
    """

    def test_real_load_failure_raises_and_stays_unloaded(self):
        import services.lora_service as ls

        service = LoRAService()
        fake_torch = mock.MagicMock()
        fake_diffusers = mock.MagicMock()
        fake_diffusers.StableDiffusionPipeline.from_pretrained.side_effect = RuntimeError("weights corrupt")

        with mock.patch.object(ls, "DIFFUSERS_AVAILABLE", True), \
                mock.patch.object(ls, "torch", fake_torch), \
                mock.patch.dict("sys.modules", {"diffusers": fake_diffusers}):

            async def run_test():
                with self.assertRaises(RuntimeError):
                    await service.load_lora("base-model", "lora.safetensors", 0.8)

            asyncio.run(run_test())

        # Must remain unloaded so generate() refuses instead of returning a
        # placeholder masquerading as a real result.
        self.assertFalse(service._model_loaded)
        self.assertIsNone(service._current_lora)


if __name__ == "__main__":
    unittest.main()
