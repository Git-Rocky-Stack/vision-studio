"""DirectVideoGenerator M9 wiring mirrors the image generator."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import diffusers  # noqa: F401
    import torch  # noqa: F401

    import main  # noqa: F401
    from foundry.accelerator import AppliedAcceleration
    from utils.direct_video_generator import DirectVideoGenerator

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@unittest.skipUnless(HAS_DEPS, "Requires torch, diffusers and backend deps (run inside venv)")
class VideoGeneratorAccelWiringTests(unittest.TestCase):
    def _plan(self):
        return mock.MagicMock(
            refusal=None, pipeline_class="LTXPipeline", precision="bf16",
            offload=False, vae_tiling=False, single_file=False, fallback_ladder=[],
            fit="fits", hardware_profile=mock.MagicMock(gpu_available=True))

    def test_load_model_accelerates_and_stores(self):
        gen = DirectVideoGenerator("models", "outputs")
        fake_pipeline = mock.MagicMock()
        applied = AppliedAcceleration(applied=["sdpa"])
        with mock.patch("utils.direct_video_generator.resolve_plan", return_value=self._plan()), \
             mock.patch.object(gen, "_load_from_plan", return_value=fake_pipeline), \
             mock.patch("utils.direct_video_generator.accelerate_pipeline", return_value=applied) as accel:
            gen.load_model("ltx-video")
        accel.assert_called_once()
        self.assertEqual(gen.applied_acceleration["ltx-video"], applied)


if __name__ == "__main__":
    unittest.main()
