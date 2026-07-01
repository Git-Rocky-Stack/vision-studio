"""#136: apply installed LoRA adapters onto a diffusers pipeline (approach A).

Runtime named adapters: load each LoRA as a named adapter, set the stack weights
for the job, and unload afterward so the cached base pipeline is never mutated.
Fail-soft: a LoRA that is not installed or fails to load is skipped and reported,
never crashing the generation. Multi-adapter set_adapters requires ``peft``.

Intentionally free of heavy imports (no torch/diffusers) so it loads on CI and is
unit-testable with a mock pipeline and a fake record resolver.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Callable, Dict, List, Optional

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]


def resolve_lora_path(record: Optional[Dict[str, Any]]) -> Optional[str]:
    """First local .safetensors location for a LoRA record, else None."""
    if not record:
        return None
    for location in record.get("locations") or []:
        if isinstance(location, str) and location.endswith(".safetensors") and os.path.isfile(location):
            return location
    return None


def apply_loras(
    pipeline,
    loras: List[Dict[str, Any]],
    resolve_record: RecordResolver,
    *,
    logger=None,
) -> Dict[str, List[Dict[str, Any]]]:
    """Load + activate the requested LoRAs on ``pipeline``. Fail-soft per adapter."""
    applied: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    for selection in loras or []:
        lora_id = selection.get("id")
        if not lora_id:
            continue
        weight = float(selection.get("weight", 1.0))
        path = resolve_lora_path(resolve_record(lora_id))
        if path is None:
            skipped.append({"id": lora_id, "reason": "not installed"})
            continue
        try:
            pipeline.load_lora_weights(path, adapter_name=lora_id)
            applied.append({"id": lora_id, "weight": weight})
        except Exception as exc:  # incompatible base / corrupt weights: fail-soft
            skipped.append({"id": lora_id, "reason": f"load failed: {type(exc).__name__}"})
            try:
                pipeline.unload_lora_weights()
            except Exception:
                pass
    if applied:
        pipeline.set_adapters([a["id"] for a in applied], [a["weight"] for a in applied])
    if logger and skipped:
        logger.info("LoRA skipped: %s", skipped)
    return {"applied": applied, "skipped": skipped}


def clear_loras(pipeline) -> None:
    """Restore the cached base pipeline to a LoRA-free state (best-effort)."""
    unload = getattr(pipeline, "unload_lora_weights", None)
    if callable(unload):
        try:
            unload()
        except Exception:
            pass


@contextmanager
def loras_applied(pipeline, loras: List[Dict[str, Any]], resolve_record: RecordResolver, *, logger=None):
    """Apply LoRAs for the duration of one generation, then always clear them."""
    result = apply_loras(pipeline, loras, resolve_record, logger=logger)
    try:
        yield result
    finally:
        clear_loras(pipeline)
