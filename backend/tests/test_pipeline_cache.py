"""One resident pipeline per generator, and loading in one generator releases
the other generator's cache (utils.pipeline_cache).

Both caches used to grow without bound: switching models (or going from an
image run to a video run) kept every previous multi-GB pipeline resident.
Torch-free: _load_from_plan / resolve_plan / accelerate_pipeline are faked.
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
import utils.direct_video_generator as dvg  # noqa: E402
from foundry.accelerator import AppliedAcceleration  # noqa: E402
from utils import pipeline_cache  # noqa: E402


def _plan():
    return mock.MagicMock(refusal=None, fallback_ladder=[],
                          pipeline_class="FakePipeline", precision="bf16")


class PipelineCacheTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
        self.addCleanup(pipeline_cache._owners.clear)
        self.cache_releases = []
        for target, name, value in (
            (dg, "DIFFUSERS_AVAILABLE", True),
            (dvg, "VIDEO_DIFFUSERS_AVAILABLE", True),
            (dg, "resolve_plan", lambda *a, **k: _plan()),
            (dvg, "resolve_plan", lambda *a, **k: _plan()),
            (dg, "accelerate_pipeline", lambda *a, **k: AppliedAcceleration()),
            (dvg, "accelerate_pipeline", lambda *a, **k: AppliedAcceleration()),
            (dg, "empty_device_cache", lambda *_: self.cache_releases.append("image")),
            (dvg, "empty_device_cache", lambda *_: self.cache_releases.append("video")),
        ):
            patcher = mock.patch.object(target, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        with mock.patch("foundry.accelerator.configure_inductor_cache", lambda *a, **k: None):
            self.image = dg.DirectGenerator(tmp, tmp)
            self.video = dvg.DirectVideoGenerator(tmp, tmp)
        for gen in (self.image, self.video):
            gen._load_from_plan = lambda name, plan, slicing: mock.MagicMock(name=name)

    def test_loading_a_second_model_unloads_the_first(self):
        first = self.image.load_model("sdxl")
        self.assertIs(self.image.load_model("sdxl"), first)  # cache hit
        self.image.load_model("flux-dev")

        self.assertEqual(list(self.image.pipelines), ["flux-dev"])
        self.assertNotIn("sdxl", self.image.applied_acceleration)
        self.assertIn("image", self.cache_releases)

    def test_video_load_releases_the_image_cache(self):
        self.image.load_model("sdxl")
        self.video.load_model("ltx-video")

        self.assertEqual(self.image.pipelines, {})
        self.assertEqual(list(self.video.pipelines), ["ltx-video"])

    def test_image_load_releases_the_video_cache(self):
        self.video.load_model("ltx-video")
        self.image.load_model("sdxl")

        self.assertEqual(self.video.pipelines, {})
        self.assertEqual(list(self.image.pipelines), ["sdxl"])

    def test_a_cache_hit_releases_nothing(self):
        self.image.load_model("sdxl")
        self.video.load_model("ltx-video")
        self.cache_releases.clear()

        self.video.load_model("ltx-video")
        self.assertEqual(self.cache_releases, [])

    def test_a_failing_release_never_fails_the_load(self):
        self.video.unload_all = mock.MagicMock(side_effect=RuntimeError("wedged"))
        pipeline_cache.register_pipeline_owner("video", self.video.unload_all.__call__)

        with self.assertLogs("utils.pipeline_cache", level="WARNING"):
            pipeline = self.image.load_model("sdxl")
        self.assertIsNotNone(pipeline)

    def test_collected_owner_is_skipped(self):
        class Owner:
            def release(self):
                raise AssertionError("released after collection")

        owner = Owner()
        pipeline_cache.register_pipeline_owner("ghost", owner.release)
        del owner
        pipeline_cache.release_other_pipeline_caches("image")  # no raise


if __name__ == "__main__":
    unittest.main()
