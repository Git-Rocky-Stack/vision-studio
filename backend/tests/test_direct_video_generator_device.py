"""DirectVideoGenerator device placement mirrors DirectGenerator exactly.

_apply_plan_runtime_flags is the seam: offload rides the resolved device
explicitly (diffusers defaults to CUDA, which would break the macOS/MPS
bundle) and degrades to plain CPU placement when no accelerator exists.
Torch-free - runs in the lightweight CI env.
"""

import pathlib
import sys
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils import direct_video_generator as dvg  # noqa: E402


def _gen(device):
    gen = dvg.DirectVideoGenerator.__new__(dvg.DirectVideoGenerator)
    gen.device = device
    return gen


def _plan(**kw):
    base = dict(offload=False, vae_tiling=False)
    base.update(kw)
    return mock.MagicMock(**base)


def test_offload_plan_rides_the_resolved_cuda_device():
    pipeline = mock.MagicMock()
    _gen("cuda")._apply_plan_runtime_flags(pipeline, _plan(offload=True), False)
    pipeline.enable_model_cpu_offload.assert_called_once_with(device="cuda")
    pipeline.to.assert_not_called()


def test_offload_plan_rides_the_resolved_mps_device():
    pipeline = mock.MagicMock()
    _gen("mps")._apply_plan_runtime_flags(pipeline, _plan(offload=True), False)
    pipeline.enable_model_cpu_offload.assert_called_once_with(device="mps")
    pipeline.to.assert_not_called()


def test_offload_plan_on_cpu_only_machine_places_on_cpu():
    pipeline = mock.MagicMock()
    _gen("cpu")._apply_plan_runtime_flags(pipeline, _plan(offload=True), False)
    pipeline.enable_model_cpu_offload.assert_not_called()
    pipeline.to.assert_called_once_with("cpu")


def test_non_offload_plan_places_on_the_resolved_device():
    pipeline = mock.MagicMock()
    _gen("mps")._apply_plan_runtime_flags(pipeline, _plan(), False)
    pipeline.enable_model_cpu_offload.assert_not_called()
    pipeline.to.assert_called_once_with("mps")
