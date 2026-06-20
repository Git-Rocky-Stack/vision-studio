"""apply_acceleration - guarded, non-fatal apply layer (M9 S6). Uses a fake
pipeline and a stubbed torch so it runs on stub CI without real torch."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import accelerator
from foundry.accelerator import AccelerationPlan, AppliedAcceleration, apply_acceleration


class _FakeModule:
    def __init__(self):
        self.memory_format = None

    def to(self, *, memory_format=None):
        self.memory_format = memory_format
        return self


class _FakePipeline:
    def __init__(self, *, unet=True, transformer=False):
        self.unet = _FakeModule() if unet else None
        self.transformer = _FakeModule() if transformer else None
        self.attn_processor = None
        self.slicing = None

    def set_attn_processor(self, processor):
        self.attn_processor = processor

    def enable_attention_slicing(self, level=None):
        self.slicing = level or "default"


class _StubTorch:
    """Minimal torch surface apply_acceleration touches."""

    channels_last = "channels_last_format"

    @staticmethod
    def compile(module, mode=None, dynamic=None):
        module._compiled = (mode, dynamic)
        return module


class ApplyTests(unittest.TestCase):
    def setUp(self):
        self._patch = mock.patch.object(accelerator, "torch", _StubTorch)
        self._patch.start()
        # SDPA processor import is best-effort; stub it so apply records "applied".
        self._sdpa = mock.patch.object(
            accelerator, "_sdpa_processor", lambda: object())
        self._sdpa.start()

    def tearDown(self):
        self._patch.stop()
        self._sdpa.stop()

    def test_no_torch_skips_all(self):
        with mock.patch.object(accelerator, "torch", None):
            result = apply_acceleration(_FakePipeline(), AccelerationPlan(), "sdxl")
        self.assertTrue(any("torch unavailable" in s for s in result.skipped))

    def test_sdpa_channels_last_compile_applied_for_conv(self):
        pipe = _FakePipeline(unet=True)
        accel = AccelerationPlan(sdpa=True, channels_last=True, compile=True)
        result = apply_acceleration(pipe, accel, "sdxl")
        self.assertIn("sdpa", result.applied)
        self.assertIn("channels_last", result.applied)
        self.assertEqual(pipe.unet.memory_format, "channels_last_format")
        self.assertTrue(any(a.startswith("compile:") for a in result.applied))

    def test_channels_last_skipped_for_non_conv_family(self):
        pipe = _FakePipeline()
        accel = AccelerationPlan(channels_last=True)
        result = apply_acceleration(pipe, accel, "flux")
        self.assertEqual(pipe.unet.memory_format, None)
        self.assertTrue(any("channels_last" in s for s in result.skipped))

    def test_slicing_applied_when_requested(self):
        pipe = _FakePipeline()
        result = apply_acceleration(pipe, AccelerationPlan(attention_slicing="auto"), "sdxl")
        self.assertEqual(pipe.slicing, "default")
        self.assertTrue(any(a.startswith("attention_slicing") for a in result.applied))

    def test_slicing_max_override(self):
        pipe = _FakePipeline()
        result = apply_acceleration(
            pipe, AccelerationPlan(attention_slicing=None), "sdxl", slicing_max=True)
        self.assertEqual(pipe.slicing, "max")

    def test_compile_failure_is_non_fatal(self):
        pipe = _FakePipeline()

        def _boom(module, mode=None, dynamic=None):
            raise RuntimeError("inductor exploded")

        with mock.patch.object(_StubTorch, "compile", staticmethod(_boom)):
            result = apply_acceleration(pipe, AccelerationPlan(compile=True), "sdxl")
        self.assertTrue(any("compile" in f for f in result.fell_back))
        # never raised - the pipeline is still usable
        self.assertIsInstance(result, AppliedAcceleration)


class QuantApplyTests(unittest.TestCase):
    def setUp(self):
        self._patch = mock.patch.object(accelerator, "torch", _StubTorch)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()

    def test_quant_applied_records_method(self):
        pipe = _FakePipeline()
        called = {}

        def _fake_quant(pipeline, method, result):
            called["method"] = method
            result.applied.append(f"quantization:{method}")

        with mock.patch.object(accelerator, "_apply_quant", _fake_quant):
            result = apply_acceleration(pipe, AccelerationPlan(quantization="int8"), "sdxl")
        self.assertEqual(called["method"], "int8")
        self.assertIn("quantization:int8", result.applied)

    def test_quant_missing_backend_is_skipped_not_fatal(self):
        pipe = _FakePipeline()
        # _apply_quant catches ImportError internally; simulate the missing
        # backend by making the quanto import helper raise.
        with mock.patch.object(accelerator, "_quantize_module", side_effect=ImportError("x")):
            result = apply_acceleration(pipe, AccelerationPlan(quantization="int8"), "sdxl")
        self.assertTrue(any("quantization" in s for s in result.skipped))
        self.assertIsInstance(result, AppliedAcceleration)


class TensorrtApplyTests(unittest.TestCase):
    def setUp(self):
        self._patch = mock.patch.object(accelerator, "torch", _StubTorch)
        self._patch.start()

    def tearDown(self):
        self._patch.stop()

    def test_tensorrt_applied_records_state(self):
        pipe = _FakePipeline()
        with mock.patch.object(accelerator, "_run_tensorrt", return_value="cached"):
            result = apply_acceleration(pipe, AccelerationPlan(tensorrt=True), "sdxl")
        self.assertTrue(any(a.startswith("tensorrt") for a in result.applied))

    def test_tensorrt_build_failure_falls_back(self):
        pipe = _FakePipeline()
        with mock.patch.object(accelerator, "_run_tensorrt", side_effect=RuntimeError("build failed")):
            result = apply_acceleration(pipe, AccelerationPlan(tensorrt=True), "sdxl")
        self.assertTrue(any("tensorrt" in f for f in result.fell_back))
        self.assertIsInstance(result, AppliedAcceleration)


if __name__ == "__main__":
    unittest.main()
