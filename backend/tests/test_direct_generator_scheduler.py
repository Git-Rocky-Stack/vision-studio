"""_configure_scheduler: flow-matching pipelines keep their scheduler; SD/SDXL swaps
derive from the scheduler the pipeline was loaded with.

FLUX, FLUX Fill and SD 3.5 ship a FlowMatchEulerDiscreteScheduler. Swapping
Euler/DPM/DDIM/UniPC onto them broke generation on every cached-pipeline run.
Torch/diffusers-free: the scheduler classes are recording fakes patched onto
the module.
"""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import utils.direct_generator as dg  # noqa: E402


def _scheduler_class(name):
    """A fake diffusers scheduler class that records from_config calls."""

    def from_config(cls, config, **kwargs):
        instance = cls()
        instance.config = dict(config, **kwargs)
        instance.built_from = config
        instance.kwargs = kwargs
        return instance

    return type(name, (), {"config": {}, "from_config": classmethod(from_config)})


FlowMatchEulerDiscreteScheduler = _scheduler_class("FlowMatchEulerDiscreteScheduler")
FakeEuler = _scheduler_class("EulerDiscreteScheduler")
FakeEulerA = _scheduler_class("EulerAncestralDiscreteScheduler")
FakeDPM = _scheduler_class("DPMSolverMultistepScheduler")
FakeDDIM = _scheduler_class("DDIMScheduler")
FakeUniPC = _scheduler_class("UniPCMultistepScheduler")


class _Pipeline:
    def __init__(self, scheduler):
        self.scheduler = scheduler


class ConfigureSchedulerTests(unittest.TestCase):
    def setUp(self):
        for name, value in (
            ("EulerDiscreteScheduler", FakeEuler),
            ("EulerAncestralDiscreteScheduler", FakeEulerA),
            ("DPMSolverMultistepScheduler", FakeDPM),
            ("DDIMScheduler", FakeDDIM),
            ("UniPCMultistepScheduler", FakeUniPC),
        ):
            patcher = mock.patch.object(dg, name, value, create=True)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.gen = dg.DirectGenerator.__new__(dg.DirectGenerator)
        self.gen._scheduler_origins = dg.weakref.WeakKeyDictionary()

    def test_flow_matching_scheduler_is_never_swapped(self):
        original = FlowMatchEulerDiscreteScheduler()
        original.config = {"shift": 3.0}
        pipeline = _Pipeline(original)

        for name in ("euler", "Euler a", "DPM++ 2M Karras", "ddim", "unipc"):
            self.gen._configure_scheduler(pipeline, name)
            self.assertIs(pipeline.scheduler, original, name)

    def test_sdxl_like_pipeline_swaps_scheduler(self):
        original = FakeEulerA()
        original.config = {"num_train_timesteps": 1000}
        pipeline = _Pipeline(original)

        self.gen._configure_scheduler(pipeline, "ddim")

        self.assertIsInstance(pipeline.scheduler, FakeDDIM)
        self.assertEqual(pipeline.scheduler.config["num_train_timesteps"], 1000)

    def test_swaps_derive_from_the_loaded_scheduler_not_the_previous_swap(self):
        original = FakeEulerA()
        original.config = {"num_train_timesteps": 1000}
        pipeline = _Pipeline(original)

        self.gen._configure_scheduler(pipeline, "DPM++ 2M Karras")
        self.gen._configure_scheduler(pipeline, "euler")

        self.assertIsInstance(pipeline.scheduler, FakeEuler)
        self.assertIs(pipeline.scheduler.built_from, original.config)
        # The karras flag of the earlier swap does not leak into the next one.
        self.assertNotIn("use_karras_sigmas", pipeline.scheduler.config)

    def test_karras_is_a_constructor_argument(self):
        original = FakeEulerA()
        original.config = {}
        pipeline = _Pipeline(original)

        self.gen._configure_scheduler(pipeline, "DPM++ 2M Karras")

        self.assertIsInstance(pipeline.scheduler, FakeDPM)
        self.assertEqual(pipeline.scheduler.kwargs, {"use_karras_sigmas": True})

    def test_non_karras_dpm_gets_no_karras_flag(self):
        pipeline = _Pipeline(FakeEulerA())

        self.gen._configure_scheduler(pipeline, "DPM++ 2M")

        self.assertIsInstance(pipeline.scheduler, FakeDPM)
        self.assertEqual(pipeline.scheduler.kwargs, {})


if __name__ == "__main__":
    unittest.main()
