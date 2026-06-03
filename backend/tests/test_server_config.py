import os
import pathlib
import sys
import unittest
from unittest import mock


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import main  # type: ignore[import-not-found]
    HAS_MAIN = True
except ImportError:
    HAS_MAIN = False


@unittest.skipUnless(HAS_MAIN, "Requires FastAPI and backend dependencies (run inside venv)")
class ServerConfigTests(unittest.TestCase):
    def test_make_console_safe_strips_unencodable_characters(self):
        rendered = main.make_console_safe("🚀 Starting Vision Studio Backend...", encoding="cp1252")

        rendered.encode("cp1252")
        self.assertIn("Starting Vision Studio Backend...", rendered)

    def test_uvicorn_config_binds_loopback_by_default(self):
        # Local-first desktop app: the backend must not be reachable from the LAN
        # by default, since /outputs and the docs routes are auth-exempt.
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VISION_STUDIO_BACKEND_HOST", None)
            config = main.get_uvicorn_config()

        self.assertEqual(config["host"], "127.0.0.1")
        self.assertEqual(config["port"], 8000)

    def test_uvicorn_config_disables_reload_by_default(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VISION_STUDIO_BACKEND_RELOAD", None)
            config = main.get_uvicorn_config()

        self.assertFalse(config["reload"])

    def test_uvicorn_config_allows_explicit_host_override(self):
        # Deliberate LAN/debug exposure is opt-in via VISION_STUDIO_BACKEND_HOST.
        # 192.0.2.10 is a TEST-NET-1 (RFC 5737) sentinel proving the env is read.
        with mock.patch.dict(os.environ, {"VISION_STUDIO_BACKEND_HOST": "192.0.2.10"}):
            config = main.get_uvicorn_config()

        self.assertEqual(config["host"], "192.0.2.10")

    def test_uvicorn_config_allows_explicit_reload_override(self):
        config = main.get_uvicorn_config(reload_enabled=True)

        self.assertTrue(config["reload"])


if __name__ == "__main__":
    unittest.main()
