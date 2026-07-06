"""Foundry-record resolution for the real edit tools (#34 second half).

Weights arrive ONLY as consent-gated Foundry records under
``<models>/edit-model/<record-id>/`` (the download manager's direct-URL
layout). No module here ever downloads anything; missing weights refuse
loudly with the record id so the user knows exactly what to install.
User-facing messages never contain filesystem paths.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

_FORMAT_EXTENSIONS = {"pickle": ".ckpt", "onnx": ".onnx"}


class EditModelUnavailable(RuntimeError):
    """Missing runtime dependency or uninstalled weights (user-facing)."""


class EditToolError(RuntimeError):
    """Invalid input or processing failure (user-facing, path-free)."""


class EditCancelled(RuntimeError):
    """The job was cancelled between tiles/faces."""


def expected_weights_filename(record_id: str, record: Dict[str, Any]) -> str:
    """Mirrors download_manager._direct_filename so resolution and
    acquisition can never disagree on the on-disk name."""
    fmt = (record.get("format") or "safetensors").lower()
    return f"{record_id}{_FORMAT_EXTENSIONS.get(fmt, '.safetensors')}"


def require_edit_weights(
    record_id: str,
    resolve_record: RecordResolver,
    models_dir: str,
    label: str,
) -> str:
    """Installed weight-file path for a record, or a loud, honest refusal."""
    record = resolve_record(record_id) or {}
    if record.get("status") != "ready":
        raise EditModelUnavailable(
            f"The {label} weights are not installed - "
            f"install '{record_id}' from the Foundry first."
        )
    path = os.path.join(
        models_dir, "edit-model", record_id, expected_weights_filename(record_id, record)
    )
    if not os.path.isfile(path):
        raise EditModelUnavailable(
            f"The {label} weights look incomplete on disk - "
            f"reinstall '{record_id}' from the Foundry."
        )
    return path
