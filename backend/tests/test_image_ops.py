import pathlib
import sys
import tempfile
import unittest

from PIL import Image


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.image_ops import apply_crop_and_transform, upscale_image_file  # type: ignore[import-not-found]


class ImageOpsTests(unittest.TestCase):
    def test_apply_crop_and_transform_writes_expected_dimensions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = pathlib.Path(temp_dir) / "source.png"
            output_path = pathlib.Path(temp_dir) / "cropped.png"
            Image.new("RGB", (120, 90), color="red").save(source_path)

            result = apply_crop_and_transform(
                str(source_path),
                str(output_path),
                crop_box={"left": 10, "top": 5, "width": 40, "height": 30},
                rotation=90,
                flip_horizontal=False,
                flip_vertical=False,
            )

            with Image.open(result["output_path"]) as saved:
                self.assertEqual(saved.size, (30, 40))

    def test_upscale_image_file_doubles_image_size(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = pathlib.Path(temp_dir) / "source.png"
            output_path = pathlib.Path(temp_dir) / "upscaled.png"
            Image.new("RGB", (32, 24), color="blue").save(source_path)

            result = upscale_image_file(
                str(source_path),
                str(output_path),
                scale_factor=2,
            )

            with Image.open(result["output_path"]) as saved:
                self.assertEqual(saved.size, (64, 48))


if __name__ == "__main__":
    unittest.main()
