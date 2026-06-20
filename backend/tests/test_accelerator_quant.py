"""Quantization decision + backend probe (M9 S5). Pure - no real quant deps."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.accelerator import (
    AccelerationSettings,
    QuantBackends,
    quant_backends_available,
    resolve_acceleration,
)
from foundry.hardware import HardwareProfile


class QuantBackendProbeTests(unittest.TestCase):
    def test_probe_is_import_free(self):
        with mock.patch("importlib.util.find_spec", return_value=object()):
            backends = quant_backends_available()
        self.assertTrue(backends.int8)
        self.assertTrue(backends.fp8)

    def test_probe_reports_missing(self):
        with mock.patch("importlib.util.find_spec", return_value=None):
            backends = quant_backends_available()
        self.assertFalse(backends.int8)
        self.assertFalse(backends.fp8)


class _FakePlan:
    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


def _profile(gpu=True, major=8, minor=6):
    return HardwareProfile(gpu_available=gpu, compute_major=major, compute_minor=minor)


_ALL = QuantBackends(int8=True, fp8=True)


class QuantDecisionTests(unittest.TestCase):
    def test_auto_prefers_fp8_on_ada_flux(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=9),
            AccelerationSettings(), backends=_ALL)
        self.assertEqual(accel.quantization, "fp8")

    def test_auto_falls_back_to_int8_on_ampere(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _profile(major=8, minor=6),
            AccelerationSettings(), backends=_ALL)
        self.assertEqual(accel.quantization, "int8")

    def test_auto_none_for_off_allowlist_family(self):
        accel = resolve_acceleration(
            _FakePlan("LTXPipeline"), _profile(), AccelerationSettings(), backends=_ALL)
        self.assertIsNone(accel.quantization)

    def test_no_fp16_family_gets_explicit_method_not_silent_downgrade(self):
        # flux is no-fp16 but IS allowlisted for int8/fp8 - the safe VRAM claw-back.
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=6),
            AccelerationSettings(), backends=_ALL)
        self.assertEqual(accel.quantization, "int8")

    def test_forced_method_blocked_when_backend_missing(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=9),
            AccelerationSettings(quantization="fp8"), backends=QuantBackends(int8=False, fp8=False))
        self.assertIsNone(accel.quantization)
        self.assertTrue(any("backend unavailable" in n for n in accel.notes))

    def test_forced_fp8_blocked_on_old_gpu(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=0),
            AccelerationSettings(quantization="fp8"), backends=_ALL)
        self.assertIsNone(accel.quantization)
        self.assertTrue(any("8.9" in n for n in accel.notes))

    def test_off_disables_quant(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(major=8, minor=9),
            AccelerationSettings(quantization="off"), backends=_ALL)
        self.assertIsNone(accel.quantization)

    def test_quant_none_without_gpu(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _profile(gpu=False),
            AccelerationSettings(quantization="int8"), backends=_ALL)
        self.assertIsNone(accel.quantization)


if __name__ == "__main__":
    unittest.main()
