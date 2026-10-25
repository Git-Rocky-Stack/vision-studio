"""Shared pipeline-cache coordination between the direct image and video generators.

Each generator keeps at most ONE resident pipeline. Before loading a new one
it releases its own cache and asks every other registered generator to
release theirs, so an image run after a video run (or the reverse) never
stacks two multi-GB pipelines in VRAM.

Owners are held by weak reference: a generator that is garbage collected
drops out of the registry on its own. Release is fail-soft - a release that
raises is logged and skipped; it never fails the load that asked for it.
Imports no torch.
"""

from __future__ import annotations

import logging
import threading
import weakref
from typing import Any, Callable, Dict

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_owners: Dict[str, "weakref.WeakMethod[Callable[[], Any]]"] = {}


def register_pipeline_owner(name: str, release: Callable[[], Any]) -> None:
    """Register a bound release method under name (re-registering replaces it)."""
    with _lock:
        _owners[name] = weakref.WeakMethod(release)


def release_other_pipeline_caches(requester: str) -> None:
    """Ask every registered owner except requester to drop its pipelines."""
    with _lock:
        owners = [(name, ref) for name, ref in _owners.items() if name != requester]
    for name, ref in owners:
        release = ref()
        if release is None:
            continue
        try:
            release()
        except Exception as exc:  # noqa: BLE001 - cache release is best-effort
            logger.warning("Could not release the %s pipeline cache: %s", name, exc)
