import base64
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


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

# Plan-consumption tests additionally need real torch/diffusers (absent on the
# lightweight CI tier) - separate flag so the pure-helper tests above keep
# running there.
try:
    import diffusers
    import torch

    from utils.direct_generator import ModelLoadRefusedError  # type: ignore[import-not-found]
    from utils.direct_video_generator import DirectVideoGenerator  # type: ignore[import-not-found]

    HAS_TORCH_DEPS = HAS_DEPS
except ImportError:
    HAS_TORCH_DEPS = False


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


def _video_plan(**kw):
    """A MagicMock RuntimePlan with the loader-relevant fields pinned."""
    base = dict(
        refusal=None,
        pipeline_class="LTXPipeline",
        precision="bf16",
        offload=False,
        vae_tiling=False,
        attention_slicing=True,
        single_file=False,
        config_catalog_id=None,
        fallback_ladder=[],
    )
    base.update(kw)
    return mock.MagicMock(**base)


@unittest.skipUnless(HAS_TORCH_DEPS, "Requires torch, diffusers and backend dependencies (run inside venv)")
class VideoPlanConsumptionTests(unittest.TestCase):
    """load_model mirrors the image generator: plan-driven class, dtype, refusals."""

    def _generator(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # No local bundles - the plan's source must be used.
            return DirectVideoGenerator(temp_dir, temp_dir)

    def test_plan_decides_pipeline_class_and_dtype_for_ltx(self):
        generator = self._generator()
        plan = _video_plan(pipeline_class="LTXPipeline", precision="bf16")
        with mock.patch("utils.direct_video_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.LTXPipeline, "from_pretrained") as loader:
            generator.load_model("ltx-video")
        self.assertEqual(loader.call_args.kwargs["torch_dtype"], torch.bfloat16)
        self.assertIs(loader.call_args.kwargs["use_safetensors"], True)

    def test_refusal_raises_typed_error_and_never_loads(self):
        generator = self._generator()
        plan = mock.MagicMock(refusal="pickle weights - convert first")
        with mock.patch("utils.direct_video_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.LTXPipeline, "from_pretrained") as loader:
            with self.assertRaises(ModelLoadRefusedError) as ctx:
                generator.load_model("sketchy-video-model")
        self.assertIn("convert", str(ctx.exception))
        loader.assert_not_called()

    def test_animatediff_keeps_motion_adapter_load(self):
        generator = self._generator()
        plan = _video_plan(pipeline_class="AnimateDiffPipeline", precision="fp16")
        with mock.patch("utils.direct_video_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.MotionAdapter, "from_pretrained") as adapter_loader, \
                mock.patch.object(diffusers.AnimateDiffPipeline, "from_pretrained") as loader:
            generator.load_model("animatediff")
        adapter_loader.assert_called_once()
        self.assertIs(adapter_loader.call_args.kwargs["use_safetensors"], True)
        self.assertIn("motion_adapter", loader.call_args.kwargs)
        self.assertEqual(loader.call_args.kwargs["torch_dtype"], torch.float16)


if __name__ == "__main__":
    unittest.main()
