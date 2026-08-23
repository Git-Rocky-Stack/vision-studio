"""The backend's self-reported version must track the app, not a literal."""
import json
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from version import APP_VERSION, resolve_app_version  # noqa: E402


def _package_version() -> str:
    return json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))["version"]


def test_environment_wins_because_the_shell_knows_the_real_version():
    # In a packaged install the backend is a PyInstaller binary with no
    # package.json anywhere near it; Electron passes the version down instead.
    assert resolve_app_version({"VISION_STUDIO_VERSION": "9.9.9"}) == "9.9.9"


def test_falls_back_to_package_json_when_run_standalone():
    # `python main.py` from a checkout, or the test suite, has no env var.
    assert resolve_app_version({}) == _package_version()


def test_blank_environment_value_is_not_treated_as_a_version():
    assert resolve_app_version({"VISION_STUDIO_VERSION": "   "}) == _package_version()


def test_module_constant_matches_the_shipped_package_version():
    assert APP_VERSION == _package_version()


def test_no_module_hardcodes_a_version_literal():
    # This is the drift that put 3.1.1 in the OpenAPI spec of a 3.2.0 release.
    expected = _package_version()
    offenders = []
    for path in [BACKEND_ROOT / "main.py", BACKEND_ROOT / "utils" / "model_manager.py"]:
        text = path.read_text(encoding="utf-8")
        for line in text.splitlines():
            if "VisionStudio/" in line and "APP_VERSION" not in line:
                offenders.append(f"{path.name}: {line.strip()}")
            if f'"{expected}"' in line or "version=\"3." in line:
                offenders.append(f"{path.name}: {line.strip()}")
    assert offenders == [], offenders
