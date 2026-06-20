"""accelerator.py - pure decision layer (M9 S3/S4). No torch at decision time."""

import builtins
import importlib
import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator
from foundry.accelerator import (
    AccelerationPlan,
    AccelerationSettings,
    AppliedAcceleration,
    family_for_plan,
)


class _FakePlan:
    """A RuntimePlan stand-in - only the fields the decision layer reads."""

    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


class DataclassDefaultsTests(unittest.TestCase):
    def test_settings_default_to_auto(self):
        s = AccelerationSettings()
        self.assertTrue(s.master_enable)
        for field in ("sdpa", "channels_last", "compile", "quantization",
                      "attention_slicing", "tensorrt"):
            self.assertEqual(getattr(s, field), "auto")

    def test_plan_defaults_are_conservative(self):
        p = AccelerationPlan()
        self.assertFalse(p.compile)
        self.assertTrue(p.sdpa)
        self.assertIsNone(p.attention_slicing)
        self.assertIsNone(p.quantization)
        self.assertFalse(p.tensorrt)
        self.assertEqual(p.notes, [])

    def test_applied_defaults_empty(self):
        a = AppliedAcceleration()
        self.assertEqual((a.applied, a.skipped, a.fell_back), ([], [], []))


class FamilyMapTests(unittest.TestCase):
    def test_pipeline_class_maps_to_family(self):
        self.assertEqual(family_for_plan(_FakePlan("FluxPipeline")), "flux")
        self.assertEqual(family_for_plan(_FakePlan("FluxFillPipeline")), "flux")
        self.assertEqual(family_for_plan(_FakePlan("StableDiffusionXLPipeline")), "sdxl")
        self.assertEqual(family_for_plan(_FakePlan("StableVideoDiffusionPipeline")), "svd")

    def test_unknown_pipeline_class_is_none(self):
        self.assertIsNone(family_for_plan(_FakePlan("TotallyMadeUpPipeline")))


class ImportSafetyTests(unittest.TestCase):
    def test_imports_without_torch(self):
        # Simulate the stub-CI machine: torch absent. The module must still
        # import and the decision layer must work.
        real_import = builtins.__import__

        def _blocked(name, *args, **kwargs):
            if name == "torch" or name.startswith("torch."):
                raise ModuleNotFoundError("No module named 'torch'")
            return real_import(name, *args, **kwargs)

        with mock.patch.object(builtins, "__import__", _blocked):
            reloaded = importlib.reload(accelerator)
            self.assertIsNone(reloaded.torch)
        importlib.reload(accelerator)  # restore real module state for other tests


if __name__ == "__main__":
    unittest.main()
