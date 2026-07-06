"""#34: u2net pre/post-processing against an injected fake session (no onnxruntime)."""
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.background import (  # type: ignore[import-not-found]
    feather_radius_px,
    remove_background,
)
from edit_tools.weights import EditModelUnavailable  # type: ignore[import-not-found]


def _left_half_foreground(inputs: np.ndarray) -> np.ndarray:
    """Fake u2net: saliency 1.0 on the left half, 0.0 on the right."""
    assert inputs.shape == (1, 3, 320, 320), inputs.shape
    assert inputs.dtype == np.float32
    pred = np.zeros((1, 1, 320, 320), dtype=np.float32)
    pred[:, :, :, :160] = 1.0
    return pred


class RemoveBackgroundTests(unittest.TestCase):
    def test_alpha_follows_the_saliency_map(self):
        image = Image.new("RGB", (64, 32), (200, 30, 30))
        result = remove_background(image, edge_refinement=0, run=_left_half_foreground)
        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(result.size, (64, 32))
        alpha = np.asarray(result.split()[-1])
        self.assertGreater(int(alpha[16, 8]), 240)    # left = kept
        self.assertLess(int(alpha[16, 56]), 15)       # right = removed
        rgb = np.asarray(result.convert("RGB"))
        self.assertEqual(tuple(rgb[16, 8]), (200, 30, 30))  # subject pixels intact

    def test_feather_blurs_the_edge(self):
        image = Image.new("RGB", (64, 32), (0, 0, 0))
        hard = np.asarray(remove_background(image, 0, run=_left_half_foreground).split()[-1])
        soft = np.asarray(remove_background(image, 100, run=_left_half_foreground).split()[-1])
        # A feathered edge has strictly more intermediate alpha values.
        hard_mid = int(((hard > 20) & (hard < 235)).sum())
        soft_mid = int(((soft > 20) & (soft < 235)).sum())
        self.assertGreater(soft_mid, hard_mid)

    def test_feather_radius_mapping(self):
        self.assertEqual(feather_radius_px(0), 0.0)
        self.assertAlmostEqual(feather_radius_px(50), 4.0)
        self.assertAlmostEqual(feather_radius_px(100), 8.0)
        self.assertEqual(feather_radius_px(-5), 0.0)
        self.assertAlmostEqual(feather_radius_px(500), 8.0)

    def test_missing_runtime_refuses_loudly(self):
        import edit_tools.background as bg
        original = bg.onnxruntime
        bg.onnxruntime = None
        try:
            with self.assertRaises(EditModelUnavailable):
                remove_background(Image.new("RGB", (8, 8)), 0, model_path="whatever")
        finally:
            bg.onnxruntime = original


if __name__ == "__main__":
    unittest.main()
