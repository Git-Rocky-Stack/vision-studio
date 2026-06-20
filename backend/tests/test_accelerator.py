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
    resolve_acceleration,
)
from foundry.hardware import HardwareProfile


def _gpu_profile(**kw):
    base = dict(gpu_available=True, compute_major=8, compute_minor=6,
                vram_total_bytes=24 * 2**30)
    base.update(kw)
    return HardwareProfile(**base)


def _cpu_profile():
    return HardwareProfile(gpu_available=False)


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


class ResolveDecisionTests(unittest.TestCase):
    def test_refusal_disables_everything(self):
        accel = resolve_acceleration(
            _FakePlan(refusal="pickle weights - convert first"),
            _gpu_profile(), AccelerationSettings())
        self.assertFalse(accel.sdpa)
        self.assertFalse(accel.compile)
        self.assertTrue(any("refus" in n.lower() for n in accel.notes))

    def test_master_disable_disables_everything(self):
        accel = resolve_acceleration(
            _FakePlan(), _gpu_profile(), AccelerationSettings(master_enable=False))
        self.assertFalse(accel.sdpa)
        self.assertFalse(accel.compile)

    def test_sdpa_on_by_default(self):
        accel = resolve_acceleration(_FakePlan(), _gpu_profile(), AccelerationSettings())
        self.assertTrue(accel.sdpa)

    def test_channels_last_on_for_conv_unet_gpu(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _gpu_profile(), AccelerationSettings())
        self.assertTrue(accel.channels_last)

    def test_channels_last_off_for_dit_family(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _gpu_profile(), AccelerationSettings())
        self.assertFalse(accel.channels_last)
        self.assertTrue(any("channels_last" in n for n in accel.notes))

    def test_channels_last_off_on_cpu(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _cpu_profile(), AccelerationSettings())
        self.assertFalse(accel.channels_last)

    def test_compile_on_by_default_with_gpu(self):
        accel = resolve_acceleration(_FakePlan(), _gpu_profile(), AccelerationSettings())
        self.assertTrue(accel.compile)
        self.assertEqual(accel.compile_mode, "reduce-overhead")
        self.assertTrue(accel.compile_dynamic)

    def test_compile_auto_off_on_cpu(self):
        accel = resolve_acceleration(_FakePlan(), _cpu_profile(), AccelerationSettings())
        self.assertFalse(accel.compile)

    def test_explicit_off_overrides_auto(self):
        accel = resolve_acceleration(
            _FakePlan(), _gpu_profile(), AccelerationSettings(compile="off", sdpa="off"))
        self.assertFalse(accel.compile)
        self.assertFalse(accel.sdpa)

    def test_explicit_on_overrides_cpu_default(self):
        accel = resolve_acceleration(
            _FakePlan(), _cpu_profile(), AccelerationSettings(compile="on"))
        self.assertTrue(accel.compile)

    def test_slicing_off_when_model_fits_with_headroom(self):
        # The perf fix: abundant VRAM -> slicing OFF (was unconditionally on).
        accel = resolve_acceleration(_FakePlan(fit="fits"), _gpu_profile(), AccelerationSettings())
        self.assertIsNone(accel.attention_slicing)

    def test_slicing_auto_under_tight_fit(self):
        accel = resolve_acceleration(
            _FakePlan(fit="fits-with-offload"), _gpu_profile(), AccelerationSettings())
        self.assertEqual(accel.attention_slicing, "auto")

    def test_slicing_forced_off_by_setting(self):
        accel = resolve_acceleration(
            _FakePlan(fit="fits-with-offload"), _gpu_profile(),
            AccelerationSettings(attention_slicing="off"))
        self.assertIsNone(accel.attention_slicing)


if __name__ == "__main__":
    unittest.main()
