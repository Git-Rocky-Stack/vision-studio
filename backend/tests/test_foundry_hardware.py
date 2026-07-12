"""HardwareProfile probe - lazy torch/psutil, never raises, truthful no-CUDA."""

import pathlib
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hardware import HardwareProfile, probe_hardware  # type: ignore[import-not-found]


def _torch(available=True, free=8 * 2**30, total=12 * 2**30, cap=(8, 6),
           name="NVIDIA GeForce RTX 3060", cuda="12.1",
           mps_available=False, mps_total=24 * 2**30, mps_allocated=4 * 2**30):
    t = mock.MagicMock()
    t.cuda.is_available.return_value = available
    t.cuda.mem_get_info.return_value = (free, total)
    t.cuda.get_device_capability.return_value = cap
    t.cuda.get_device_name.return_value = name
    t.version.cuda = cuda
    # Pinned explicitly: a MagicMock auto-child would read as MPS-available
    # and silently flip every no-CUDA test onto the MPS branch.
    t.backends.mps.is_available.return_value = mps_available
    t.mps.recommended_max_memory.return_value = mps_total
    t.mps.driver_allocated_memory.return_value = mps_allocated
    return t


def _psutil(total=32 * 2**30, available=20 * 2**30):
    p = mock.MagicMock()
    p.virtual_memory.return_value = mock.MagicMock(total=total, available=available)
    return p


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-hw-")

    def _probe(self, torch_mod, psutil_mod):
        with mock.patch.dict(sys.modules, {"torch": torch_mod, "psutil": psutil_mod}):
            return probe_hardware(self.tmp)

    def test_cuda_profile_is_complete(self):
        profile = self._probe(_torch(), _psutil())
        self.assertTrue(profile.gpu_available)
        self.assertEqual(profile.gpu_name, "NVIDIA GeForce RTX 3060")
        self.assertEqual(profile.vram_total_bytes, 12 * 2**30)
        self.assertEqual(profile.vram_free_bytes, 8 * 2**30)
        self.assertEqual((profile.compute_major, profile.compute_minor), (8, 6))
        self.assertEqual(profile.cuda_version, "12.1")
        self.assertEqual(profile.system_ram_total_bytes, 32 * 2**30)
        self.assertGreater(profile.disk_free_bytes, 0)

    def test_no_cuda_machine_is_truthful(self):
        # THIS dev machine: torch CUDA-built, no device (Spike D environment).
        profile = self._probe(_torch(available=False), _psutil())
        self.assertFalse(profile.gpu_available)
        self.assertIsNone(profile.gpu_name)
        self.assertEqual(profile.vram_total_bytes, 0)
        self.assertEqual(profile.vram_free_bytes, 0)
        # RAM and disk are still real - CPU paths budget against them.
        self.assertEqual(profile.system_ram_available_bytes, 20 * 2**30)
        self.assertGreater(profile.disk_free_bytes, 0)

    def test_torch_missing_never_raises(self):
        profile = self._probe(None, _psutil())  # import torch -> ImportError
        self.assertFalse(profile.gpu_available)
        self.assertFalse(profile.torch_available)

    def test_psutil_missing_never_raises(self):
        profile = self._probe(_torch(available=False), None)
        self.assertEqual(profile.system_ram_total_bytes, 0)

    def test_cuda_query_failure_degrades_to_no_gpu(self):
        t = _torch()
        t.cuda.mem_get_info.side_effect = RuntimeError("driver wedged")
        profile = self._probe(t, _psutil())
        self.assertFalse(profile.gpu_available)

    def test_mps_profile_reports_unified_memory_budget(self):
        # macOS arm64 bundle: no CUDA, Metal/MPS active. "VRAM" is the
        # recommended working-set budget minus what the driver already holds.
        t = _torch(available=False, mps_available=True,
                   mps_total=24 * 2**30, mps_allocated=4 * 2**30)
        profile = self._probe(t, _psutil())
        self.assertTrue(profile.gpu_available)
        self.assertIn("(MPS)", profile.gpu_name)
        self.assertEqual(profile.vram_total_bytes, 24 * 2**30)
        self.assertEqual(profile.vram_free_bytes, 20 * 2**30)
        # CUDA-capability gates stay conservatively closed on MPS.
        self.assertEqual((profile.compute_major, profile.compute_minor), (0, 0))
        self.assertIsNone(profile.cuda_version)
        self.assertFalse(profile.supports_bf16)
        self.assertFalse(profile.supports_fp8)

    def test_cuda_wins_over_mps_when_both_report_available(self):
        t = _torch(available=True, mps_available=True)
        profile = self._probe(t, _psutil())
        self.assertEqual(profile.gpu_name, "NVIDIA GeForce RTX 3060")
        self.assertEqual(profile.cuda_version, "12.1")

    def test_mps_query_failure_degrades_to_no_gpu(self):
        t = _torch(available=False, mps_available=True)
        t.mps.recommended_max_memory.side_effect = RuntimeError("Metal wedged")
        profile = self._probe(t, _psutil())
        self.assertFalse(profile.gpu_available)
        self.assertIsNone(profile.gpu_name)


if __name__ == "__main__":
    unittest.main()
