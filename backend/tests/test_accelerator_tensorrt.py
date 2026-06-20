"""TensorRT engine cache key + allowlist + decision (M9 S7). Pure helpers - no
TRT dep; the decision tests patch the TRT-backend probe so they run on stub CI."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator
from foundry.accelerator import AccelerationSettings, resolve_acceleration
from foundry.hardware import HardwareProfile
from foundry.tensorrt_engine import (
    TRT_PROVEN_FAMILIES,
    engine_cache_key,
    engine_cache_path,
    is_trt_eligible,
)


class CacheKeyTests(unittest.TestCase):
    def _key(self, **kw):
        base = dict(family="sdxl", pipeline_class="StableDiffusionXLPipeline",
                    precision="bf16", resolution_bucket="1024x1024",
                    compute_capability=(8, 9), trt_version="10.0.1")
        base.update(kw)
        return engine_cache_key(**base)

    def test_key_is_stable(self):
        self.assertEqual(self._key(), self._key())

    def test_key_varies_with_gpu_capability(self):
        self.assertNotEqual(self._key(compute_capability=(8, 9)),
                            self._key(compute_capability=(8, 6)))

    def test_key_varies_with_resolution(self):
        self.assertNotEqual(self._key(resolution_bucket="1024x1024"),
                            self._key(resolution_bucket="768x768"))

    def test_cache_path_uses_key(self):
        key = self._key()
        path = engine_cache_path("/tmp/engines", key)
        self.assertTrue(path.endswith(f"{key}.plan"))


class AllowlistTests(unittest.TestCase):
    def test_proven_families_are_eligible(self):
        for family in TRT_PROVEN_FAMILIES:
            self.assertTrue(is_trt_eligible(family))

    def test_unvetted_family_not_eligible(self):
        self.assertFalse(is_trt_eligible("ltx"))
        self.assertFalse(is_trt_eligible(None))


class _FakePlan:
    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


def _gpu():
    return HardwareProfile(gpu_available=True, compute_major=8, compute_minor=9)


class TensorrtDecisionTests(unittest.TestCase):
    def setUp(self):
        # Pretend a TRT backend is importable for these decision tests.
        self._p = mock.patch.object(accelerator, "_trt_backend_available", lambda: True)
        self._p.start()

    def tearDown(self):
        self._p.stop()

    def test_auto_does_not_build_trt_for_unvetted_family(self):
        accel = resolve_acceleration(_FakePlan("FluxPipeline"), _gpu(), AccelerationSettings())
        self.assertFalse(accel.tensorrt)

    def test_auto_enables_trt_for_proven_family(self):
        accel = resolve_acceleration(_FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings())
        self.assertTrue(accel.tensorrt)

    def test_trt_forces_compile_off(self):
        accel = resolve_acceleration(_FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings())
        self.assertTrue(accel.tensorrt)
        self.assertFalse(accel.compile)
        self.assertTrue(any("tensorrt" in n.lower() and "compile" in n.lower() for n in accel.notes))

    def test_explicit_on_enables_for_any_family(self):
        accel = resolve_acceleration(
            _FakePlan("FluxPipeline"), _gpu(), AccelerationSettings(tensorrt="on"))
        self.assertTrue(accel.tensorrt)

    def test_off_disables(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings(tensorrt="off"))
        self.assertFalse(accel.tensorrt)
