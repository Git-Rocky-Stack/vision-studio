"""Reference-never-copy link materialization (Model Foundry M3, Spike B).

Spike-B law (docs/superpowers/spikes/2026-06-09-windows-linking.md):
- junction detection NEVER uses os.path.islink (False for junctions);
  "is this our link?" is answered by the LinkLedger first, reparse attrs second.
- reparse-point SOURCE files (OneDrive placeholders) are copy-only.
- predicate-first (st_dev), fallback-always (any OSError -> copy).
- no elevation, ever: junction/hardlink/copy on Windows; symlink only on POSIX.
"""

import json
import logging
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass
from typing import Dict, List

_FILE_ATTRIBUTE_REPARSE_POINT = 0x400
_log = logging.getLogger(__name__)


def same_volume(path_a: str, path_b: str) -> bool:
    """Cheap same-volume predicate via st_dev (volume serial on Windows). Raises OSError on nonexistent paths — callers apply Spike-B fallback-always."""
    return os.stat(path_a).st_dev == os.stat(path_b).st_dev


def is_reparse_point(path: str) -> bool:
    """True for junctions/symlinks/OneDrive placeholders. NOT os.path.islink."""
    if sys.platform != "win32":
        return os.path.islink(path)
    try:
        return bool(os.lstat(path).st_file_attributes & _FILE_ATTRIBUTE_REPARSE_POINT)
    except OSError:
        return False


def _normalize(path: str) -> str:
    return os.path.normcase(os.path.normpath(os.path.abspath(path)))


class LinkLedger:
    """JSON-persisted record of every link/copy the Foundry materializes."""

    def __init__(self, path: str):
        self._path = path
        self._entries: List[Dict[str, str]] = []
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    loaded = json.load(handle)
                if not isinstance(loaded, list) or not all(isinstance(e, dict) for e in loaded):
                    raise ValueError("ledger is not a list of entries")
                self._entries = loaded
            except (OSError, ValueError) as exc:
                # Fail-safe: an empty ledger under-claims ownership (we refuse
                # deletions rather than delete wrongly). Keep the corrupt file
                # for diagnostics and start fresh.
                _log.error("LinkLedger: corrupt ledger at %s (%s); preserving as .corrupt", path, exc)
                try:
                    os.replace(path, path + ".corrupt")
                except OSError:
                    pass

    def _save(self) -> None:
        parent = os.path.dirname(self._path)
        os.makedirs(parent, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(self._entries, handle, indent=2)
            os.replace(tmp, self._path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def add(self, mechanism: str, source: str, dest: str) -> None:
        normalized = _normalize(dest)
        self._entries = [entry for entry in self._entries if entry["dest"] != normalized]
        self._entries.append({"mechanism": mechanism, "source": source, "dest": normalized})
        self._save()

    def remove(self, dest: str) -> bool:
        needle = _normalize(dest)
        before = len(self._entries)
        self._entries = [entry for entry in self._entries if entry["dest"] != needle]
        if len(self._entries) != before:
            self._save()
            return True
        return False

    def is_foundry_link(self, path: str) -> bool:
        needle = _normalize(path)
        return any(entry["dest"] == needle for entry in self._entries)

    def entries(self) -> List[Dict[str, str]]:
        return list(self._entries)


@dataclass
class LinkResult:
    mechanism: str  # hardlink | junction | symlink | copy
    source: str
    dest: str


def _copy(source: str, dest: str) -> str:
    if os.path.isdir(source):
        shutil.copytree(source, dest)
    else:
        shutil.copy2(source, dest)
    return "copy"


def materialize_link(source: str, dest: str, ledger: LinkLedger) -> LinkResult:
    """Materialize a concrete path for a referenced artifact.

    Ladder (Spike B): reparse-point source -> copy; cross-volume -> copy
    (no link attempt); same-volume dir -> junction (win) / symlink (posix);
    same-volume file -> hardlink; ANY OSError from a link attempt -> copy.
    """
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    mechanism = "copy"
    if is_reparse_point(source) or not same_volume(source, os.path.dirname(dest)):
        mechanism = _copy(source, dest)
    elif os.path.isdir(source):
        try:
            if sys.platform == "win32":
                import _winapi

                _winapi.CreateJunction(source, dest)
                mechanism = "junction"
            else:
                os.symlink(source, dest, target_is_directory=True)
                mechanism = "symlink"
        except OSError:
            mechanism = _copy(source, dest)
    else:
        try:
            os.link(source, dest)
            mechanism = "hardlink"
        except OSError:
            mechanism = _copy(source, dest)
    ledger.add(mechanism=mechanism, source=source, dest=dest)
    return LinkResult(mechanism=mechanism, source=source, dest=dest)


def safe_remove(path: str, ledger: LinkLedger, app_root: str) -> bool:
    """Delete ONLY app-managed paths or recorded Foundry links. Never user bytes.

    Returns False (and deletes nothing) for any other path.
    """
    normalized = _normalize(path)
    app = _normalize(app_root)
    is_ours = ledger.is_foundry_link(path)
    inside_app = normalized.startswith(app + os.sep) or normalized == app
    if not (is_ours or inside_app):
        return False
    if os.path.isdir(path) and not os.path.islink(path):
        if sys.platform == "win32" and is_reparse_point(path):
            os.rmdir(path)  # remove the junction itself, never its target's content
        else:
            shutil.rmtree(path)
    elif os.path.exists(path) or os.path.islink(path):
        os.remove(path)
    else:
        return False
    if is_ours:
        ledger.remove(path)
    return True
