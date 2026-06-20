"""TensorRT example-input recipes + engine-param derivation (M10 PR1). Pure /
torch-free assertions only, so they run on stub CI without torch_tensorrt."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import tensorrt_engine
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


if __name__ == "__main__":
    unittest.main()
