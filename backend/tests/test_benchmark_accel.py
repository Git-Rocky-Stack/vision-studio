"""benchmark_accel pure helpers (M9 S8). The harness is CUDA-gated; only the
torch-free helpers are unit-tested here."""

import importlib
import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _load_helpers():
    # The module fires _check_cuda() at import; patch it out so the pure
    # helpers can be imported on a CPU CI box.
    with mock.patch.dict(sys.modules):
        import tools.benchmark_accel as mod  # noqa: PLC0415
        return importlib.reload(mod)


class ToleranceTests(unittest.TestCase):
    def setUp(self):
        with mock.patch("tools.benchmark_accel._check_cuda", lambda: None):
            self.mod = _load_helpers()

    def test_identical_outputs_pass(self):
        a = [[0.0, 0.5, 1.0]]
        self.assertTrue(self.mod.outputs_within_tolerance(a, a, threshold=0.01))

    def test_large_drift_fails(self):
        a = [[0.0, 0.0, 0.0]]
        b = [[1.0, 1.0, 1.0]]
        self.assertFalse(self.mod.outputs_within_tolerance(a, b, threshold=0.01))

    def test_perf_patch_excludes_failed_correctness(self):
        patch = self.mod.build_perf_patch(
            "flux-dev", baseline_s=10.0, accel_s=4.0, vram_bytes=8 * 2**30,
            accel_label="compile+int8", correct=False)
        self.assertEqual(patch["correctness"], "FAILED")
        self.assertNotIn("speedup", patch)

    def test_perf_patch_records_speedup_when_correct(self):
        patch = self.mod.build_perf_patch(
            "flux-dev", baseline_s=10.0, accel_s=4.0, vram_bytes=8 * 2**30,
            accel_label="compile+int8", correct=True)
        self.assertEqual(patch["correctness"], "OK")
        self.assertAlmostEqual(patch["speedup"], 2.5, places=2)


if __name__ == "__main__":
    unittest.main()
