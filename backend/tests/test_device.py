"""utils.device - the single compute-device seam (CUDA > MPS > CPU).

Torch-free: every case drives the resolver with a stub torch module, so the
suite runs identically in the lightweight CI env, the CUDA dev venv, and the
macOS arm64 bundle build.
"""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.device import (  # noqa: E402
    empty_device_cache,
    is_out_of_memory,
    resolve_device,
)


class _Recorder:
    def __init__(self):
        self.calls = []


class _CudaNS:
    def __init__(self, available, recorder, probe_error=None):
        self._available = available
        self._recorder = recorder
        self._probe_error = probe_error

    def is_available(self):
        if self._probe_error is not None:
            raise self._probe_error
        return self._available

    def empty_cache(self):
        self._recorder.calls.append("cuda.empty_cache")


class _MpsBackendNS:
    def __init__(self, available):
        self._available = available

    def is_available(self):
        return self._available


class _MpsNS:
    def __init__(self, recorder, clear_error=None):
        self._recorder = recorder
        self._clear_error = clear_error

    def empty_cache(self):
        if self._clear_error is not None:
            raise self._clear_error
        self._recorder.calls.append("mps.empty_cache")


class _Backends:
    def __init__(self, mps_backend):
        if mps_backend is not None:
            self.mps = mps_backend


def _torch(cuda=False, mps=False, cuda_probe_error=None, mps_namespace=True,
           mps_clear_error=None):
    """A stub torch module; ``recorder.calls`` records cache releases."""
    recorder = _Recorder()

    class _Torch:
        pass

    torch = _Torch()
    torch.cuda = _CudaNS(cuda, recorder, probe_error=cuda_probe_error)
    torch.backends = _Backends(_MpsBackendNS(mps) if mps_namespace else None)
    torch.mps = _MpsNS(recorder, clear_error=mps_clear_error)
    return torch, recorder


class ResolveDeviceTests(unittest.TestCase):
    def test_cuda_wins_over_mps(self):
        torch, _ = _torch(cuda=True, mps=True)
        self.assertEqual(resolve_device(torch), "cuda")

    def test_mps_when_cuda_absent(self):
        torch, _ = _torch(cuda=False, mps=True)
        self.assertEqual(resolve_device(torch), "mps")

    def test_cpu_when_no_accelerator(self):
        torch, _ = _torch(cuda=False, mps=False)
        self.assertEqual(resolve_device(torch), "cpu")

    def test_cpu_when_torch_missing(self):
        self.assertEqual(resolve_device(None), "cpu")

    def test_wedged_cuda_probe_degrades_to_next_backend(self):
        torch, _ = _torch(cuda=True, mps=True,
                          cuda_probe_error=RuntimeError("driver wedged"))
        self.assertEqual(resolve_device(torch), "mps")

    def test_torch_build_without_mps_namespace_is_cpu(self):
        # Older/minimal builds have no torch.backends.mps at all.
        torch, _ = _torch(cuda=False, mps=False, mps_namespace=False)
        self.assertEqual(resolve_device(torch), "cpu")


class EmptyDeviceCacheTests(unittest.TestCase):
    def test_cuda_cache_released_when_cuda_active(self):
        torch, recorder = _torch(cuda=True, mps=True)
        empty_device_cache(torch)
        self.assertEqual(recorder.calls, ["cuda.empty_cache"])

    def test_mps_cache_released_when_only_mps_active(self):
        torch, recorder = _torch(cuda=False, mps=True)
        empty_device_cache(torch)
        self.assertEqual(recorder.calls, ["mps.empty_cache"])

    def test_cpu_only_is_a_no_op(self):
        torch, recorder = _torch(cuda=False, mps=False)
        empty_device_cache(torch)
        self.assertEqual(recorder.calls, [])

    def test_missing_torch_never_raises(self):
        empty_device_cache(None)

    def test_mps_release_failure_is_swallowed(self):
        # Cache release is an optimization - a Metal hiccup must not turn a
        # successful unload into a crash.
        torch, recorder = _torch(cuda=False, mps=True,
                                 mps_clear_error=RuntimeError("Metal hiccup"))
        empty_device_cache(torch)
        self.assertEqual(recorder.calls, [])


class _StubOutOfMemoryError(RuntimeError):
    """Same NAME as torch.cuda.OutOfMemoryError - matched by name, not identity."""


_StubOutOfMemoryError.__name__ = "OutOfMemoryError"


class IsOutOfMemoryTests(unittest.TestCase):
    def test_cuda_out_of_memory_error_matches_by_class_name(self):
        self.assertTrue(is_out_of_memory(_StubOutOfMemoryError("CUDA OOM")))

    def test_mps_runtime_error_matches_by_message(self):
        exc = RuntimeError(
            "MPS backend out of memory (MPS allocated: 17.11 GB, other "
            "allocations: 388.61 MB, max allowed: 18.13 GB)."
        )
        self.assertTrue(is_out_of_memory(exc))

    def test_plain_runtime_error_is_not_oom(self):
        # A refusal (ModelLoadRefusedError subclasses RuntimeError) or any
        # other real failure must re-raise, never consume the fallback ladder.
        self.assertFalse(is_out_of_memory(RuntimeError("pickle weights - convert first")))

    def test_non_runtime_error_is_not_oom(self):
        self.assertFalse(is_out_of_memory(ValueError("out of memory")))


if __name__ == "__main__":
    unittest.main()
