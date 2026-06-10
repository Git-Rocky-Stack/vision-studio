"""Reference-never-copy link materialization (Model Foundry M3, Spike B).

Spike-B law (docs/superpowers/spikes/2026-06-09-windows-linking.md):
- junction detection NEVER uses os.path.islink (False for junctions);
  "is this our link?" is answered by the LinkLedger first, reparse attrs second.
- reparse-point SOURCE files (OneDrive placeholders) are copy-only.
- predicate-first (st_dev), fallback-always (any OSError -> copy).
- no elevation, ever: junction/hardlink/copy on Windows; symlink only on POSIX.
"""

import json
import os
import shutil
import sys
from dataclasses import dataclass
from typing import Dict, List

_FILE_ATTRIBUTE_REPARSE_POINT = 0x400


def same_volume(path_a: str, path_b: str) -> bool:
    """Cheap same-volume predicate via st_dev (volume serial on Windows)."""
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
            with open(path, "r", encoding="utf-8") as handle:
                self._entries = json.load(handle)

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as handle:
            json.dump(self._entries, handle, indent=2)

    def add(self, mechanism: str, source: str, dest: str) -> None:
        self._entries.append(
            {"mechanism": mechanism, "source": source, "dest": _normalize(dest)}
        )
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
