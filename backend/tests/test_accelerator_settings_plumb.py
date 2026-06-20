"""acceleration_settings request parsing (M9 S8)."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.accelerator import (
    DEFAULT_ACCELERATION_SETTINGS,
    accel_settings_from_dict,
)


class SettingsParseTests(unittest.TestCase):
    def test_none_returns_defaults(self):
        self.assertEqual(accel_settings_from_dict(None), DEFAULT_ACCELERATION_SETTINGS)

    def test_partial_dict_merges_over_defaults(self):
        s = accel_settings_from_dict({"compile": "off", "master_enable": False})
        self.assertEqual(s.compile, "off")
        self.assertFalse(s.master_enable)
        self.assertEqual(s.sdpa, "auto")  # untouched

    def test_unknown_keys_ignored(self):
        s = accel_settings_from_dict({"bogus": "x", "sdpa": "on"})
        self.assertEqual(s.sdpa, "on")

    def test_invalid_tristate_falls_back_to_auto(self):
        s = accel_settings_from_dict({"compile": "turbo"})
        self.assertEqual(s.compile, "auto")


if __name__ == "__main__":
    unittest.main()
