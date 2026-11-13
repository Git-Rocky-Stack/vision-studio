"""#136: apply installed LoRA adapters onto a diffusers pipeline.

Named adapters stay RESIDENT on the pipeline between generations and are
switched with ``set_adapters`` (P3): reading a LoRA from disk and injecting it
into the UNet/transformer on every run was the dominant cost of a LoRA
generation. Per job:

1. every requested adapter not yet resident is loaded once
   (``load_lora_weights(path, adapter_name=id)``); one whose file changed on
   disk since it was loaded (re-download) is replaced;
2. ``enable_lora()`` + ``set_adapters(ids, weights)`` activates exactly the
   requested stack at the requested weights;
3. after the run ``disable_lora()`` returns the cached pipeline to base-model
   behavior, so the next job without LoRAs is untouched - but the adapter
   weights stay loaded for the next job that asks for them.

At most ``MAX_RESIDENT_ADAPTERS`` adapters stay loaded per pipeline; the least
recently used ones are deleted (``delete_adapters``) beyond that. Unloading the
pipeline (model switch) drops every adapter with it.

Fail-soft: a LoRA that is not installed or fails to load is skipped and
reported, never crashing the generation. Multi-adapter set_adapters requires
``peft``.

Intentionally free of heavy imports (no torch/diffusers) so it loads on CI and is
unit-testable with a mock pipeline and a fake record resolver.
"""
from __future__ import annotations

import logging
import os
import threading
import weakref
from collections import OrderedDict
from contextlib import contextmanager
from typing import Any, Callable, Dict, List, Optional, Tuple

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

_log = logging.getLogger(__name__)

#: Adapters kept loaded per pipeline (LRU beyond this are deleted). LoRAs are
#: tens to a few hundred MB each; four covers a typical stack without letting
#: a long session accumulate unbounded VRAM.
MAX_RESIDENT_ADAPTERS = 4

# (path, mtime_ns, size) - a re-downloaded file gets a new fingerprint.
Fingerprint = Tuple[str, int, int]

_registry_lock = threading.Lock()
_resident_by_pipeline: "weakref.WeakKeyDictionary[Any, OrderedDict]" = weakref.WeakKeyDictionary()
_RESIDENT_ATTR = "_vision_studio_resident_loras"


def resolve_lora_path(record: Optional[Dict[str, Any]]) -> Optional[str]:
    """First local .safetensors location for a LoRA record, else None."""
    if not record:
        return None
    for location in record.get("locations") or []:
        if isinstance(location, str) and location.endswith(".safetensors") and os.path.isfile(location):
            return location
    return None


def _fingerprint(path: str) -> Fingerprint:
    try:
        stat = os.stat(path)
        return (path, int(stat.st_mtime_ns), int(stat.st_size))
    except OSError:
        return (path, 0, 0)


def resident_adapters(pipeline) -> "OrderedDict[str, Fingerprint]":
    """The adapters currently loaded on ``pipeline`` (LRU order, oldest first)."""
    with _registry_lock:
        try:
            resident = _resident_by_pipeline.get(pipeline)
            if resident is None:
                resident = OrderedDict()
                _resident_by_pipeline[pipeline] = resident
            return resident
        except TypeError:
            # Not weak-referenceable: keep the registry on the object itself.
            resident = getattr(pipeline, _RESIDENT_ATTR, None)
            if resident is None:
                resident = OrderedDict()
                try:
                    setattr(pipeline, _RESIDENT_ATTR, resident)
                except (AttributeError, TypeError):
                    pass  # untrackable object: nothing can be resident on it
            return resident


def _call(pipeline, name: str, *args) -> bool:
    """Call an optional pipeline method; True when it exists and succeeded."""
    method = getattr(pipeline, name, None)
    if not callable(method):
        return False
    try:
        method(*args)
        return True
    except Exception as exc:  # noqa: BLE001 - adapter housekeeping is best-effort
        _log.warning("LoRA %s failed: %s: %s", name, type(exc).__name__, exc)
        return False


def _reset_all(pipeline, resident) -> None:
    """Last resort: unload every adapter (the registry restarts empty)."""
    _call(pipeline, "unload_lora_weights")
    resident.clear()


def _delete_adapter(pipeline, resident, adapter_id: str) -> None:
    resident.pop(adapter_id, None)
    if not _call(pipeline, "delete_adapters", [adapter_id]):
        # Without a targeted delete the only clean state is no adapters at all.
        _reset_all(pipeline, resident)


def _evict_to_capacity(pipeline, resident, keep: List[str]) -> None:
    """Delete least-recently-used adapters until one more fits (never `keep`)."""
    while len(resident) >= MAX_RESIDENT_ADAPTERS:
        victim = next((name for name in resident if name not in keep), None)
        if victim is None:
            return
        _delete_adapter(pipeline, resident, victim)


def apply_loras(
    pipeline,
    loras: List[Dict[str, Any]],
    resolve_record: RecordResolver,
    *,
    logger=None,
) -> Dict[str, List[Dict[str, Any]]]:
    """Make exactly the requested LoRAs active on ``pipeline``. Fail-soft per adapter."""
    applied: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    resident = resident_adapters(pipeline)
    requested = [s.get("id") for s in loras or [] if s.get("id")]
    for selection in loras or []:
        lora_id = selection.get("id")
        if not lora_id:
            continue
        weight = float(selection.get("weight", 1.0))
        path = resolve_lora_path(resolve_record(lora_id))
        if path is None:
            skipped.append({"id": lora_id, "reason": "not installed"})
            continue
        fingerprint = _fingerprint(path)
        if resident.get(lora_id) == fingerprint:
            resident.move_to_end(lora_id)
            applied.append({"id": lora_id, "weight": weight})
            continue
        if lora_id in resident:
            # The file changed since it was loaded (re-download): replace it.
            _delete_adapter(pipeline, resident, lora_id)
        _evict_to_capacity(pipeline, resident, keep=requested)
        try:
            pipeline.load_lora_weights(path, adapter_name=lora_id)
            resident[lora_id] = fingerprint
            applied.append({"id": lora_id, "weight": weight})
        except Exception as exc:  # incompatible base / corrupt weights: fail-soft
            skipped.append({"id": lora_id, "reason": f"load failed: {type(exc).__name__}"})
            # A failed load can leave a half-injected adapter behind.
            _delete_adapter(pipeline, resident, lora_id)
    if applied:
        _call(pipeline, "enable_lora")
        pipeline.set_adapters([a["id"] for a in applied], [a["weight"] for a in applied])
    elif resident:
        # Adapters are loaded but none was requested: base-model behavior.
        _call(pipeline, "disable_lora")
    if logger and skipped:
        logger.info("LoRA skipped: %s", skipped)
    return {"applied": applied, "skipped": skipped}


def clear_loras(pipeline) -> None:
    """Return the cached pipeline to base-model behavior after a run.

    Resident adapters are DISABLED, not unloaded - the next job that asks for
    them re-activates them without touching the disk. A pipeline without
    ``disable_lora`` falls back to unloading everything (honest base state).
    """
    resident = resident_adapters(pipeline)
    if not resident:
        return
    if not _call(pipeline, "disable_lora"):
        _reset_all(pipeline, resident)


@contextmanager
def loras_applied(pipeline, loras: List[Dict[str, Any]], resolve_record: RecordResolver, *, logger=None):
    """Activate LoRAs for the duration of one generation, then always deactivate them."""
    result = apply_loras(pipeline, loras, resolve_record, logger=logger)
    try:
        yield result
    finally:
        clear_loras(pipeline)
