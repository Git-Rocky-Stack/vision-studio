"""Persisted user library roots + layout hints (Model Foundry M3, spec 4.2)."""

import json
import logging
import os
import tempfile
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

_log = logging.getLogger(__name__)

VALID_HINTS = {"comfyui", "a1111", "generic"}

# Known-layout subdir name -> artifact_type. Header detection (Task 6) trumps
# these when they disagree — the hint is a fast default, not an authority.
LAYOUT_SUBDIR_TYPES: Dict[str, Dict[str, str]] = {
    "comfyui": {
        "checkpoints": "checkpoint",
        "diffusers": "diffusers-pipeline",
        "loras": "lora",
        "vae": "vae",
        "vaes": "vae",  # the app-managed tree uses 'vaes'; harmless comfy alias
        "controlnet": "controlnet",
        "embeddings": "embedding",
    },
    "a1111": {
        "Stable-diffusion": "checkpoint",
        "Lora": "lora",
        "VAE": "vae",
        "ControlNet": "controlnet",
        "embeddings": "embedding",
    },
}


def layout_type_for(layout_hint: str, relative_path: str) -> Optional[str]:
    """artifact_type implied by the layout hint for a path inside the root."""
    mapping = LAYOUT_SUBDIR_TYPES.get(layout_hint)
    if not mapping:
        return None
    for segment in relative_path.replace("\\", "/").split("/"):
        if segment in mapping:
            return mapping[segment]
    return None


@dataclass
class LibraryRoot:
    id: str
    path: str
    layout_hint: str
    added_at: str

    def to_dict(self) -> Dict[str, str]:
        return asdict(self)


class RootsStore:
    """JSON-persisted record of user library roots registered with the Foundry."""

    def __init__(self, path: str):
        self._path = path
        self._roots: List[LibraryRoot] = []
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    loaded = json.load(handle)
                if not isinstance(loaded, list) or not all(isinstance(e, dict) for e in loaded):
                    raise ValueError("store is not a list of entries")
                self._roots = [LibraryRoot(**entry) for entry in loaded]
            except (OSError, ValueError, TypeError) as exc:
                # Fail-safe: an empty store under-claims knowledge of roots.
                # Keep the corrupt file for diagnostics and start fresh.
                _log.error(
                    "RootsStore: corrupt store at %s (%s); preserving as .corrupt",
                    path,
                    exc,
                )
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
                json.dump([root.to_dict() for root in self._roots], handle, indent=2)
            os.replace(tmp, self._path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def add(self, path: str, layout_hint: str) -> LibraryRoot:
        if layout_hint not in VALID_HINTS:
            raise ValueError(f"unknown layout hint: {layout_hint!r}")
        if not os.path.isdir(path):
            raise ValueError(f"library root does not exist: {path!r}")
        normalized = os.path.normcase(os.path.normpath(os.path.abspath(path)))
        # First-writer wins: re-adding an existing path returns the original root (original hint retained).
        for root in self._roots:
            if os.path.normcase(os.path.normpath(os.path.abspath(root.path))) == normalized:
                return root  # idempotent
        root = LibraryRoot(
            id=uuid.uuid4().hex[:12],
            path=os.path.abspath(path),
            layout_hint=layout_hint,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
        self._roots.append(root)
        self._save()
        return root

    def remove(self, root_id: str) -> bool:
        before = len(self._roots)
        self._roots = [root for root in self._roots if root.id != root_id]
        if len(self._roots) != before:
            self._save()
            return True
        return False

    def list(self) -> List[LibraryRoot]:
        return list(self._roots)
