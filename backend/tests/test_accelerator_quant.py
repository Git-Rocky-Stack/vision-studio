"""Quantization decision + backend probe (M9 S5). Pure - no real quant deps."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.accelerator import QuantBackends, quant_backends_available


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


if __name__ == "__main__":
    unittest.main()
