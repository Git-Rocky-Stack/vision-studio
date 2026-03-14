import base64
import io
import pathlib
import sys
import tempfile
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    from PIL import Image
    from utils.direct_video_generator import (  # type: ignore[import-not-found]
        build_video_result,
        decode_data_url_to_image,
        resolve_video_model_source,
        resolve_video_model_strategy,
    )
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@unittest.skipUnless(HAS_DEPS, "Requires Pillow, imageio and backend dependencies (run inside venv)")
class VideoServiceTests(unittest.TestCase):
    def test_resolve_video_model_strategy(self):
        self.assertEqual(resolve_video_model_strategy("ltx-video", has_input_image=False), "text-to-video")
        self.assertEqual(resolve_video_model_strategy("svd", has_input_image=True), "image-to-video")

        with self.assertRaises(ValueError):
            resolve_video_model_strategy("svd", has_input_image=False)

    def test_build_video_result_returns_output_metadata(self):
        result = build_video_result(
            job_id="job-123",
            relative_video_path="/outputs/job-123/video.mp4",
            frame_count=48,
            fps=24,
            duration=2,
        )

        self.assertEqual(result["video"], "/outputs/job-123/video.mp4")
        self.assertEqual(result["frames"], 48)
        self.assertEqual(result["fps"], 24)

    def test_resolve_video_model_source_prefers_local_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            local_bundle = pathlib.Path(temp_dir) / "diffusers" / "ltx-video"
            local_bundle.mkdir(parents=True)

            source = resolve_video_model_source(temp_dir, "ltx-video")

            self.assertEqual(source, str(local_bundle).replace("\\", "/"))

    def test_decode_data_url_to_image_reads_inline_reference_images(self):
        buffer = io.BytesIO()
        Image.new("RGB", (2, 3), color="green").save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        data_url = f"data:image/png;base64,{encoded}"

        with decode_data_url_to_image(data_url) as image:
            self.assertIsInstance(image, Image.Image)
            self.assertEqual(image.size, (2, 3))


if __name__ == "__main__":
    unittest.main()
