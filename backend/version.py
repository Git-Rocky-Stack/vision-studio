"""Single source for the version the backend reports about itself.

The backend used to carry its own literal, and it drifted two releases behind
the app: a 3.2.0 install served ``3.1.1`` in its OpenAPI spec and sent
``VisionStudio/3.1.1`` as the User-Agent to Hugging Face and CivitAI. There is
no way to keep two hand-edited numbers in step, so there is only one number now.

Resolution order:

1. ``VISION_STUDIO_VERSION`` from the environment. This is the authoritative
   case: in a packaged install the backend is a PyInstaller binary with no
   ``package.json`` within reach, and Electron - which knows the real version
   from ``app.getVersion()`` - passes it down when it spawns the process.
2. ``package.json`` at the repository root, for ``python main.py`` from a
   checkout and for the test suite.
3. ``0.0.0-dev``, so an unknown version is visibly unknown rather than a
   plausible-looking lie.
"""
import json
import os
import pathlib
from typing import Mapping, Optional

_HERE = pathlib.Path(__file__).resolve().parent
_PACKAGE_JSON = _HERE.parent / "package.json"

UNKNOWN_VERSION = "0.0.0-dev"


def _read_package_version() -> Optional[str]:
    try:
        manifest = json.loads(_PACKAGE_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    version = manifest.get("version")
    return version if isinstance(version, str) and version.strip() else None


def resolve_app_version(env: Optional[Mapping[str, str]] = None) -> str:
    """Resolve the app version from the environment, then the manifest."""
    environment = os.environ if env is None else env
    from_env = environment.get("VISION_STUDIO_VERSION")
    if isinstance(from_env, str) and from_env.strip():
        return from_env.strip()
    return _read_package_version() or UNKNOWN_VERSION


APP_VERSION = resolve_app_version()

#: What the backend identifies itself as to third-party model hosts.
USER_AGENT = f"VisionStudio/{APP_VERSION}"
