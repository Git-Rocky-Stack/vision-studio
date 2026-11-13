"""Allow-listed resolution of renderer-supplied media paths.

Every route that READS a media file the renderer names (crop, frame
extraction, timeline export layers and audio, edit tools, guided passes,
image-to-video) resolves it here first. A path is accepted only when, after
``Path.resolve()`` (which collapses ``..`` and follows symlinks), it lies inside
one of the allowed roots:

* the outputs directory (generations, ``imports/`` and ``edits/`` live there);
* every registered model library root (``RootsStore``);
* any extra roots the desktop shell passes in ``VISION_STUDIO_MEDIA_ROOTS``
  (``os.pathsep``-separated) - e.g. earlier output folders the user switched
  away from, whose assets are still on the timeline.

Anything else - another absolute path on disk, ``/outputs/../secrets`` - is a
``MediaPathError``, which routes map to HTTP 400. Messages never echo the
rejected path.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from threading import Lock
from typing import Callable, Iterable, List, Optional, Union
from urllib.parse import unquote

MEDIA_ROOTS_ENV = "VISION_STUDIO_MEDIA_ROOTS"

_OUTPUTS_URL_PREFIX = "/outputs/"
_FILE_URL_PREFIX = "file:///"
_DRIVE_AFTER_SLASH = re.compile(r"^/[A-Za-z]:/")


class MediaPathError(ValueError):
    """A media path outside every allowed root (or otherwise unusable)."""


def env_media_roots(environ: Optional[dict] = None) -> List[str]:
    """Extra roots from ``VISION_STUDIO_MEDIA_ROOTS``; blank entries dropped."""
    raw = (environ if environ is not None else os.environ).get(MEDIA_ROOTS_ENV, "")
    return [part.strip() for part in raw.split(os.pathsep) if part.strip()]


class MediaPathPolicy:
    """Resolve renderer paths against a live set of allowed roots.

    ``output_dir`` (a path, or a zero-argument callable returning one) anchors
    ``/outputs/...`` URLs; it and ``roots_provider`` are read on every resolve
    so a changed outputs folder or a library root added or removed at run time
    takes effect immediately.
    """

    def __init__(self, output_dir: Union[str, Callable[[], str]],
                 roots_provider: Callable[[], Iterable[str]]):
        self._output_dir_source = output_dir
        self._roots_provider = roots_provider

    @property
    def _output_dir(self) -> str:
        source = self._output_dir_source
        return source() if callable(source) else source

    def allowed_roots(self) -> List[Path]:
        roots: List[Path] = []
        for candidate in [self._output_dir, *self._roots_provider()]:
            if not candidate:
                continue
            try:
                resolved = Path(candidate).expanduser().resolve()
            except (OSError, RuntimeError):
                continue
            if resolved not in roots:
                roots.append(resolved)
        return roots

    def _to_local(self, source_path: str) -> Path:
        normalized = source_path.replace("\\", "/")
        if normalized.startswith(_OUTPUTS_URL_PREFIX):
            relative = normalized[len(_OUTPUTS_URL_PREFIX):]
            return Path(self._output_dir) / relative
        if normalized.startswith(_FILE_URL_PREFIX):
            # file:///home/x -> /home/x ; file:///C:/x -> C:/x
            normalized = unquote(normalized[len(_FILE_URL_PREFIX) - 1:])
            if _DRIVE_AFTER_SLASH.match(normalized):
                normalized = normalized[1:]
        candidate = Path(normalized).expanduser()
        if not candidate.is_absolute():
            # A bare relative path is relative to the outputs folder, never to
            # the backend's working directory.
            candidate = Path(self._output_dir) / candidate
        return candidate

    def resolve(self, source_path: str) -> str:
        """The resolved, normalized local path - or ``MediaPathError``."""
        if not isinstance(source_path, str) or not source_path.strip() or "\x00" in source_path:
            raise MediaPathError("A media path is required.")
        try:
            resolved = self._to_local(source_path.strip()).resolve()
        except (OSError, RuntimeError) as exc:
            raise MediaPathError("The media path could not be resolved.") from exc
        for root in self.allowed_roots():
            if resolved == root or resolved.is_relative_to(root):
                return str(resolved).replace("\\", "/")
        raise MediaPathError(
            "The media file is outside the folders Vision Studio may read "
            "(the outputs folder and your linked libraries)."
        )


_policy_lock = Lock()
_policy: Optional[MediaPathPolicy] = None


def configure_media_paths(output_dir: Union[str, Callable[[], str]],
                          roots_provider: Callable[[], Iterable[str]]) -> MediaPathPolicy:
    """Install the process-wide policy (main.py, at import time)."""
    global _policy
    with _policy_lock:
        _policy = MediaPathPolicy(output_dir, roots_provider)
        return _policy


def resolve_media_path(source_path: str) -> str:
    """Resolve through the process-wide policy; unconfigured = refuse all."""
    policy = _policy
    if policy is None:
        raise MediaPathError("Media path policy is not configured.")
    return policy.resolve(source_path)
