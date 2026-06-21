"""Regression: changing Performance-panel acceleration settings must evict and
rebuild a cached pipeline, not silently reuse the first load's settings (M10.1).

load_model short-circuited on ``model_name in self.pipelines`` without comparing
the requested acceleration settings, so toggling compile/quantization/slicing in
the Performance panel was silently ignored on a re-load of an already-cached
model - and the applied/skipped/fell-back readout reported the stale first load.

Torch-free (heavy seams patched) so it runs in the lightweight CI env.
"""

import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import utils.direct_generator as dg  # noqa: E402
from foundry.accelerator import AccelerationSettings, AppliedAcceleration  # noqa: E402


class _FakeCuda:
    @staticmethod
    def is_available():
        return False

    @staticmethod
    def empty_cache():
        return None


class _FakeTorch:
    cuda = _FakeCuda()


class AccelerationCacheTests(unittest.TestCase):
    """A changed acceleration request rebuilds; an identical one reuses cache."""

    def _generator(self):
        with mock.patch.object(dg, "torch", _FakeTorch()), \
                mock.patch.object(dg, "DIFFUSERS_AVAILABLE", True), \
                mock.patch("foundry.accelerator.configure_inductor_cache",
                           lambda *a, **k: None):
            tmp = tempfile.mkdtemp()
            self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
            return dg.DirectGenerator(tmp, tmp)

    def test_changed_settings_rebuild_same_settings_reuse(self):
        gen = self._generator()

        builds = []

        def fake_load_from_plan(model_name, plan, slicing_max):
            builds.append(model_name)
            return mock.MagicMock(name=f"pipeline-{len(builds)}")

        plan = mock.MagicMock(refusal=None, fallback_ladder=[],
                              pipeline_class="StableDiffusionXLPipeline", precision="bf16")
        settings_a = AccelerationSettings()                 # default
        settings_b = AccelerationSettings(compile="on")     # explicit override

        with mock.patch.object(dg, "torch", _FakeTorch()), \
                mock.patch.object(dg, "resolve_plan", return_value=plan), \
                mock.patch.object(dg, "accelerate_pipeline", return_value=AppliedAcceleration()), \
                mock.patch.object(gen, "_load_from_plan", side_effect=fake_load_from_plan):
            first = gen.load_model("m", acceleration_settings=settings_a)
            cached = gen.load_model("m", acceleration_settings=settings_a)  # identical -> reuse
            rebuilt = gen.load_model("m", acceleration_settings=settings_b)  # changed -> rebuild

        self.assertEqual(builds, ["m", "m"])  # build, cache-hit (no build), rebuild
        self.assertIs(first, cached)
        self.assertIsNot(first, rebuilt)
        # The readout reflects the most recent (settings_b) build.
        self.assertEqual(gen._loaded_acceleration["m"], settings_b)


if __name__ == "__main__":
    unittest.main()
