"""DirectGenerator M9 wiring: resolve_plan attaches hardware_profile and
load_model runs accelerate_pipeline once, surfacing AppliedAcceleration."""

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
    from utils.direct_generator import DirectGenerator

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@unittest.skipUnless(HAS_DEPS, "Requires torch, diffusers and backend deps (run inside venv)")
class GeneratorAccelWiringTests(unittest.TestCase):
    def _plan(self):
        return mock.MagicMock(
            refusal=None, pipeline_class="StableDiffusionXLPipeline", precision="bf16",
            offload=False, vae_tiling=False, single_file=False, fallback_ladder=[],
            fit="fits", hardware_profile=mock.MagicMock(gpu_available=True))

    def test_load_model_calls_accelerate_pipeline_and_stores_result(self):
        gen = DirectGenerator("models", "outputs")
        fake_pipeline = mock.MagicMock()
        applied = AppliedAcceleration(applied=["sdpa", "compile:reduce-overhead"])
        with mock.patch("utils.direct_generator.resolve_plan", return_value=self._plan()), \
             mock.patch.object(gen, "_load_from_plan", return_value=fake_pipeline), \
             mock.patch("utils.direct_generator.accelerate_pipeline", return_value=applied) as accel:
            gen.load_model("sdxl-base")
        accel.assert_called_once()
        self.assertEqual(gen.applied_acceleration["sdxl-base"], applied)


if __name__ == "__main__":
    unittest.main()
