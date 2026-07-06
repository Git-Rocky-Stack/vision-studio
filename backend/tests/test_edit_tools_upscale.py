"""#34: tiled super-resolution assembly against a fake x4 tile runner (no torch)."""
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.upscale import upscale  # type: ignore[import-not-found]
from edit_tools.weights import EditCancelled, EditModelUnavailable  # type: ignore[import-not-found]


def _nearest_x4(tile: Image.Image) -> Image.Image:
    return tile.resize((tile.width * 4, tile.height * 4), Image.Resampling.NEAREST)


def _gradient_image(width: int, height: int) -> Image.Image:
    xs = np.linspace(0, 255, width, dtype=np.uint8)
    row = np.stack([xs, xs[::-1], np.full(width, 40, dtype=np.uint8)], axis=-1)
    return Image.fromarray(np.tile(row[np.newaxis, :, :], (height, 1, 1)))


class UpscaleTests(unittest.TestCase):
    def test_output_matches_single_pass_exactly_across_tile_seams(self):
        # 300x280 forces a 2x2 tile grid (TILE=256). Nearest-neighbor x4 is
        # deterministic, so tiled assembly must equal the untiled reference.
        image = _gradient_image(300, 280)
        tiled = upscale(image, 4, run_tile=_nearest_x4, model_scale=4)
        reference = _nearest_x4(image)
        self.assertEqual(tiled.size, (1200, 1120))
        np.testing.assert_array_equal(np.asarray(tiled), np.asarray(reference))

    def test_scale_two_downsamples_the_x4_output(self):
        image = _gradient_image(100, 60)
        result = upscale(image, 2, run_tile=_nearest_x4, model_scale=4)
        self.assertEqual(result.size, (200, 120))

    def test_progress_is_monotonic_and_complete(self):
        calls = []
        upscale(_gradient_image(300, 280), 4, run_tile=_nearest_x4, model_scale=4,
                progress_cb=lambda done, total: calls.append((done, total)))
        self.assertEqual(calls[-1][0], calls[-1][1])
        self.assertEqual(len(calls), 4)  # 2x2 grid
        self.assertEqual([c[0] for c in calls], sorted(c[0] for c in calls))

    def test_cancellation_between_tiles(self):
        ran = []

        def cancelling_tile(tile):
            ran.append(1)
            return _nearest_x4(tile)

        with self.assertRaises(EditCancelled):
            upscale(_gradient_image(300, 280), 4, run_tile=cancelling_tile,
                    model_scale=4, cancel_check=lambda: len(ran) >= 1)
        self.assertEqual(len(ran), 1)  # stopped after the first tile

    def test_invalid_scale_refuses(self):
        with self.assertRaises(ValueError):
            upscale(_gradient_image(10, 10), 3, run_tile=_nearest_x4, model_scale=4)

    def test_missing_runtime_refuses_loudly(self):
        import edit_tools.upscale as up
        original = up.ModelLoader
        up.ModelLoader = None
        try:
            with self.assertRaises(EditModelUnavailable):
                upscale(_gradient_image(10, 10), 4, model_path="whatever")
        finally:
            up.ModelLoader = original


if __name__ == "__main__":
    unittest.main()
