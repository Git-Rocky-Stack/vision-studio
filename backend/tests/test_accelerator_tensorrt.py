"""TensorRT engine cache key + allowlist + decision (M9 S7). Pure helpers - no
TRT dep; the decision tests patch the TRT-backend probe so they run on stub CI."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator, tensorrt_engine
from foundry.accelerator import AccelerationSettings, resolve_acceleration
from foundry.hardware import HardwareProfile
from foundry.tensorrt_engine import (
    TRT_PROVEN_FAMILIES,
    engine_cache_key,
    engine_cache_path,
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
    def test_production_allowlist_is_empty_until_blessed(self):
        # M10 honesty rail: no family is auto-eligible until a CUDA sweep
        # blesses it (docs/TENSORRT_VERIFICATION.md). Auto must never build.
        self.assertEqual(TRT_PROVEN_FAMILIES, set())

    def test_eligibility_follows_the_allowlist(self):
        with mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", {"sdxl"}):
            self.assertTrue(tensorrt_engine.is_trt_eligible("sdxl"))
            self.assertFalse(tensorrt_engine.is_trt_eligible("ltx"))
            self.assertFalse(tensorrt_engine.is_trt_eligible(None))


class _FakePlan:
    def __init__(self, pipeline_class="StableDiffusionXLPipeline", fit="fits", refusal=None):
        self.pipeline_class = pipeline_class
        self.fit = fit
        self.refusal = refusal


def _gpu():
    return HardwareProfile(gpu_available=True, compute_major=8, compute_minor=9)


class TensorrtDecisionTests(unittest.TestCase):
    def setUp(self):
        # Pretend a TRT backend is importable AND bless sdxl, so these tests
        # exercise the decision logic independent of the (empty) production
        # allowlist.
        self._p = mock.patch.object(accelerator, "_trt_backend_available", lambda: True)
        self._p.start()
        self._a = mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", {"sdxl"})
        self._a.start()

    def tearDown(self):
        self._a.stop()
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


class TensorrtProductionDefaultTests(unittest.TestCase):
    def setUp(self):
        self._p = mock.patch.object(accelerator, "_trt_backend_available", lambda: True)
        self._p.start()  # backend present, but the REAL (empty) allowlist stands

    def tearDown(self):
        self._p.stop()

    def test_auto_stays_off_when_allowlist_empty(self):
        accel = resolve_acceleration(
            _FakePlan("StableDiffusionXLPipeline"), _gpu(), AccelerationSettings())
        self.assertFalse(accel.tensorrt)
