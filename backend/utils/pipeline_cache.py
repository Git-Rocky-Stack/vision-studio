"""Shared release path for every model cache that holds accelerator memory.

Each generator keeps at most ONE resident pipeline. Before loading a new one
it releases its own cache and asks every other registered owner to release
theirs, so an image run after a video run (or the reverse) never stacks two
multi-GB pipelines in VRAM. The same path frees the auxiliary model caches -
cached ControlNet / IP-Adapter encoder weights (guided passes), the
Real-ESRGAN / GFPGAN / face-helper runners and the U^2-Net session (edit
tools), and the ControlNet annotators - so a model switch frees everything,
not just the base pipeline.

Releases run while holding the process-wide GPU gate (utils.gpu_gate): a
release requested while another thread is mid-generation waits for that run
to finish instead of pulling its pipeline out from under it.

Owners registered as bound methods are held by weak reference: a generator
that is garbage collected drops out of the registry on its own. Plain
functions (module-level caches) are held strongly - a module never goes
away. Release is fail-soft - a release that raises is logged and skipped; it
never fails the load that asked for it. Imports no torch.
"""

from __future__ import annotations

import inspect
import logging
import threading
import weakref
from typing import Any, Callable, Dict, Optional

from utils.gpu_gate import gpu_gate

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_owners: Dict[str, Callable[[], Optional[Callable[[], Any]]]] = {}


def _reference(release: Callable[[], Any]) -> Callable[[], Optional[Callable[[], Any]]]:
    if inspect.ismethod(release):
        return weakref.WeakMethod(release)
    return lambda: release


def register_pipeline_owner(name: str, release: Callable[[], Any]) -> None:
    """Register a release callable under name (re-registering replaces it)."""
    with _lock:
        _owners[name] = _reference(release)


def _release_where(keep: Callable[[str], bool]) -> None:
    with _lock:
        owners = [(name, ref) for name, ref in _owners.items() if not keep(name)]
    if not owners:
        return
    with gpu_gate.hold("release model caches"):
        for name, ref in owners:
            release = ref()
            if release is None:
                continue
            try:
                release()
            except Exception as exc:  # noqa: BLE001 - cache release is best-effort
                logger.warning("Could not release the %s model cache: %s", name, exc)


def release_other_pipeline_caches(requester: str) -> None:
    """Ask every registered owner except requester to drop its models."""
    _release_where(lambda name: name == requester)


def release_all_pipeline_caches() -> None:
    """Drop every registered cache (e.g. before deleting model files)."""
    _release_where(lambda _name: False)
