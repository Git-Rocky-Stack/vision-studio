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
    cuda_unsupported_reason,
    cuda_usable,
    empty_device_cache,
    is_out_of_memory,
    process_reserved_vram_bytes,
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


# The arch list the cu132 wheels report: kernels for Turing (7.5) and newer,
# plus PTX for the newest so later cards JIT-compile forward.
CU132_ARCHES = ["sm_75", "sm_80", "sm_86", "sm_89", "sm_90", "sm_100", "sm_120", "compute_120"]


def _cuda_torch(capability, arch_list=CU132_ARCHES, name="NVIDIA GeForce GTX 1080",
                cuda_version="13.2", mps=False):
    """A stub torch whose CUDA device has ``capability`` against ``arch_list``."""
    torch, recorder = _torch(cuda=True, mps=mps)
    torch.cuda.get_device_capability = lambda index=0: capability
    torch.cuda.get_device_name = lambda index=0: name
    torch.cuda.memory_reserved = lambda: 123
    if arch_list is not None:
        torch.cuda.get_arch_list = lambda: list(arch_list)

    class _Version:
        cuda = cuda_version

    torch.version = _Version()
    return torch, recorder


class CudaCompatibilityTests(unittest.TestCase):
    """A device torch can see is not a device this build can run on."""

    def test_pascal_card_is_unsupported_by_cu132_and_says_why(self):
        torch, _ = _cuda_torch((6, 1))
        reason = cuda_unsupported_reason(torch)
        self.assertIsNotNone(reason)
        self.assertIn("NVIDIA GeForce GTX 1080", reason)
        self.assertIn("compute capability 6.1", reason)
        self.assertIn("CUDA 13.2", reason)
        self.assertIn("7.5 or newer", reason)
        self.assertIn("runs on the CPU", reason)
        self.assertFalse(cuda_usable(torch))

    def test_volta_is_below_the_turing_floor(self):
        torch, _ = _cuda_torch((7, 0), name="Tesla V100")
        self.assertFalse(cuda_usable(torch))

    def test_turing_ampere_ada_and_blackwell_are_supported(self):
        for capability in [(7, 5), (8, 6), (8, 9), (9, 0), (12, 0)]:
            with self.subTest(capability=capability):
                torch, _ = _cuda_torch(capability)
                self.assertIsNone(cuda_unsupported_reason(torch))
                self.assertTrue(cuda_usable(torch))

    def test_a_card_newer_than_every_cubin_runs_on_the_ptx(self):
        torch, _ = _cuda_torch((13, 0))
        self.assertTrue(cuda_usable(torch))

    def test_suffixed_arch_entries_parse(self):
        torch, _ = _cuda_torch((7, 5), arch_list=["sm_90a", "sm_100a", "sm_120a"])
        self.assertFalse(cuda_usable(torch))

    def test_unreadable_arch_list_is_no_evidence_of_a_gap(self):
        # Never turn CUDA off on a guess: a build that cannot say what it was
        # compiled for keeps the is_available() answer.
        for arch_list in (None, [], ["not-an-arch"]):
            with self.subTest(arch_list=arch_list):
                torch, _ = _cuda_torch((6, 1), arch_list=arch_list)
                self.assertIsNone(cuda_unsupported_reason(torch))
                self.assertTrue(cuda_usable(torch))

    def test_unreadable_capability_is_no_evidence_of_a_gap(self):
        torch, _ = _cuda_torch((6, 1))

        def broken(index=0):
            raise RuntimeError("driver wedged")

        torch.cuda.get_device_capability = broken
        self.assertIsNone(cuda_unsupported_reason(torch))
        self.assertTrue(cuda_usable(torch))

    def test_no_cuda_is_not_usable_and_has_no_reason(self):
        torch, _ = _torch(cuda=False)
        self.assertIsNone(cuda_unsupported_reason(torch))
        self.assertFalse(cuda_usable(torch))
        self.assertFalse(cuda_usable(None))

    def test_unsupported_card_resolves_to_the_next_backend(self):
        torch, _ = _cuda_torch((6, 1))
        self.assertEqual(resolve_device(torch), "cpu")

    def test_unsupported_card_is_never_touched_by_memory_helpers(self):
        # Any CUDA call on a card without kernels can raise; the helpers must
        # treat it like no CUDA at all.
        torch, recorder = _cuda_torch((6, 1))
        empty_device_cache(torch)
        self.assertEqual(recorder.calls, [])
        self.assertEqual(process_reserved_vram_bytes(torch), 0)

    def test_supported_card_memory_helpers_use_cuda(self):
        torch, recorder = _cuda_torch((8, 6))
        empty_device_cache(torch)
        self.assertEqual(recorder.calls, ["cuda.empty_cache"])
        self.assertEqual(process_reserved_vram_bytes(torch), 123)


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
