"""TensorRT example-input recipes + engine-param derivation (M10 PR1). Pure /
torch-free assertions only, so they run on stub CI without torch_tensorrt."""

import pathlib
import sys
import unittest
import unittest.mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator, tensorrt_engine
from foundry.tensorrt_engine import _bucket_pixels, example_input_shapes


class BucketPixelsTests(unittest.TestCase):
    def test_parses_square_bucket(self):
        self.assertEqual(_bucket_pixels("1024x1024"), 1024)
        self.assertEqual(_bucket_pixels("512x512"), 512)


class ExampleInputShapeTests(unittest.TestCase):
    def test_sdxl_shapes_at_1024(self):
        shapes = example_input_shapes("sdxl", "1024x1024")
        self.assertEqual(shapes["sample"], (2, 4, 128, 128))
        self.assertEqual(shapes["encoder_hidden_states"], (2, 77, 2048))
        self.assertEqual(shapes["text_embeds"], (2, 1280))
        self.assertEqual(shapes["time_ids"], (2, 6))

    def test_sd15_shapes_at_512(self):
        shapes = example_input_shapes("sd15", "512x512")
        self.assertEqual(shapes["sample"], (2, 4, 64, 64))
        self.assertEqual(shapes["encoder_hidden_states"], (2, 77, 768))
        self.assertNotIn("text_embeds", shapes)

    def test_unknown_family_raises(self):
        with self.assertRaises(ValueError):
            example_input_shapes("flux", "1024x1024")


class _FakeConfig:
    def __init__(self, sample_size):
        self.sample_size = sample_size


class _FakeUnet:
    def __init__(self, sample_size=128, dtype="torch.bfloat16"):
        self.config = _FakeConfig(sample_size)
        self.dtype = dtype  # str() mirrors a real torch dtype repr


class _FakePipe:
    def __init__(self, sample_size=128, dtype="torch.bfloat16", vae_scale_factor=8):
        self.unet = _FakeUnet(sample_size, dtype)
        self.transformer = None
        self.vae_scale_factor = vae_scale_factor


class ParamDerivationTests(unittest.TestCase):
    def test_precision_from_unet_dtype(self):
        self.assertEqual(accelerator._pipeline_precision(_FakePipe(dtype="torch.bfloat16")), "bf16")
        self.assertEqual(accelerator._pipeline_precision(_FakePipe(dtype="torch.float16")), "fp16")
        self.assertEqual(accelerator._pipeline_precision(_FakePipe(dtype="torch.float32")), "fp32")

    def test_resolution_bucket_from_sample_size(self):
        self.assertEqual(accelerator._resolution_bucket(_FakePipe(sample_size=128)), "1024x1024")
        self.assertEqual(accelerator._resolution_bucket(_FakePipe(sample_size=64)), "512x512")

    def test_resolution_bucket_defaults_when_unknown(self):
        pipe = _FakePipe()
        pipe.unet.config.sample_size = None
        self.assertEqual(accelerator._resolution_bucket(pipe), "1024x1024")

    def test_device_capability_safe_without_cuda(self):
        with unittest.mock.patch.object(accelerator, "torch", None):
            self.assertEqual(accelerator._device_capability(), (0, 0))

    def test_trt_version_unknown_when_backend_absent(self):
        # On stub CI neither tensorrt nor torch_tensorrt is installed.
        self.assertEqual(accelerator._trt_version(), "unknown")


if __name__ == "__main__":
    unittest.main()
