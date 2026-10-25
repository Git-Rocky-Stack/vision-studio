"""Upscale refuses oversized canvases before allocating, and runs fp16 on CUDA.

A 10000px image at 4x asked PIL for a 40000x40000 canvas (~4.8 GB) before a
single tile ran. The working canvas is the model's scale (2x runs the 4x
model), so the gate checks long_edge * max(scale, model_scale).

Integration tier for the endpoint check (the _api.py suffix disables the
local-auth middleware); the rest is torch-free with fakes.
"""
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import api.edit as edit_api  # noqa: E402
from edit_tools import upscale as upscale_module  # noqa: E402
from edit_tools.weights import EditToolError  # noqa: E402


def _never_called(_tile):
    raise AssertionError("a tile ran for an oversized image")


class SizeGateTests(unittest.TestCase):
    def test_oversized_input_is_refused_before_allocating(self):
        image = Image.new("RGB", (4097, 10))
        with mock.patch.object(upscale_module.Image, "new",
                               side_effect=AssertionError("allocated")):
            with self.assertRaises(EditToolError) as ctx:
                upscale_module.upscale(image, 4, run_tile=_never_called, model_scale=4)
        self.assertIn("4096px", str(ctx.exception))

    def test_two_x_is_gated_on_the_4x_working_canvas(self):
        with self.assertRaises(EditToolError):
            upscale_module.check_upscale_size(5000, 100, 2, model_scale=4)

    def test_largest_allowed_input_passes(self):
        upscale_module.check_upscale_size(4096, 4096, 4, model_scale=4)
        upscale_module.check_upscale_size(4096, 1, 2, model_scale=4)

    def test_gate_runs_before_weights_load(self):
        with mock.patch.object(upscale_module, "_make_runner",
                               side_effect=AssertionError("weights loaded")):
            with self.assertRaises(EditToolError):
                upscale_module.upscale(Image.new("RGB", (8000, 8)), 2, model_path="x.pth")


class HalfPrecisionTests(unittest.TestCase):
    class _FakeTorch:
        float16, float32 = "fp16", "fp32"

    def _descriptor(self, supports_half=True, fails=False):
        descriptor = mock.MagicMock(supports_half=supports_half)
        descriptor.half.side_effect = RuntimeError("no") if fails else None
        descriptor.half.return_value = descriptor
        return descriptor

    def test_cuda_with_half_support_runs_fp16(self):
        with mock.patch.object(upscale_module, "torch", self._FakeTorch()):
            descriptor = self._descriptor()
            result, dtype = upscale_module._half_precision(descriptor, "cuda")
        self.assertEqual(dtype, "fp16")
        descriptor.half.assert_called_once()

    def test_cpu_and_mps_stay_fp32(self):
        with mock.patch.object(upscale_module, "torch", self._FakeTorch()):
            for device in ("cpu", "mps"):
                descriptor = self._descriptor()
                _, dtype = upscale_module._half_precision(descriptor, device)
                self.assertEqual(dtype, "fp32")
                descriptor.half.assert_not_called()

    def test_architecture_without_half_support_stays_fp32(self):
        with mock.patch.object(upscale_module, "torch", self._FakeTorch()):
            _, dtype = upscale_module._half_precision(
                self._descriptor(supports_half=False), "cuda")
        self.assertEqual(dtype, "fp32")

    def test_failed_conversion_falls_back_to_fp32(self):
        with mock.patch.object(upscale_module, "torch", self._FakeTorch()):
            descriptor = self._descriptor(fails=True)
            result, dtype = upscale_module._half_precision(descriptor, "cuda")
        self.assertEqual(dtype, "fp32")
        self.assertIs(result, descriptor)


class UpscaleEndpointLimitTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp_path = pathlib.Path(tmp.name)
        app = FastAPI()
        app.include_router(edit_api.router)
        previous = (edit_api._job_manager, edit_api._output_dir,
                    edit_api._models_dir, edit_api._resolve_record)
        self.addCleanup(lambda: edit_api.configure(*previous))
        self.manager = mock.MagicMock()
        edit_api.configure(self.manager, str(self.tmp_path / "outputs"),
                           str(self.tmp_path / "models"), lambda _id: {"status": "ready"})
        self.client = TestClient(app)

    def test_oversized_upscale_is_422_and_creates_no_job(self):
        source = self.tmp_path / "big.png"
        Image.new("RGB", (4100, 16)).save(source)

        response = self.client.post("/api/v1/edit/upscale",
                                    json={"source_path": str(source), "scale": 4})

        self.assertEqual(response.status_code, 422)
        self.assertIn("too large", response.json()["detail"])
        self.manager.add_job.assert_not_called()

    def test_normal_upscale_is_accepted(self):
        source = self.tmp_path / "small.png"
        Image.new("RGB", (64, 64)).save(source)
        with mock.patch.object(edit_api, "run_edit_operation", return_value={"images": []}):
            response = self.client.post("/api/v1/edit/upscale",
                                        json={"source_path": str(source), "scale": 2})
        self.assertEqual(response.status_code, 202)


if __name__ == "__main__":
    unittest.main()
