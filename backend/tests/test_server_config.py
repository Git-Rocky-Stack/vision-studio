import pathlib
import sys
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # type: ignore[import-not-found]


class ServerConfigTests(unittest.TestCase):
    def test_make_console_safe_strips_unencodable_characters(self):
        rendered = main.make_console_safe("🚀 Starting Vision Studio Backend...", encoding="cp1252")

        rendered.encode("cp1252")
        self.assertIn("Starting Vision Studio Backend...", rendered)

    def test_uvicorn_config_disables_reload_by_default(self):
        config = main.get_uvicorn_config()

        self.assertEqual(config["host"], "0.0.0.0")
        self.assertEqual(config["port"], 8000)
        self.assertFalse(config["reload"])

    def test_uvicorn_config_allows_explicit_reload_override(self):
        config = main.get_uvicorn_config(reload_enabled=True)

        self.assertTrue(config["reload"])


if __name__ == "__main__":
    unittest.main()
