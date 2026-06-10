"""safetensors header reading + artifact-type classification (Model Foundry M3).

Replaces substring-guessing with the real 8-byte-LE-length + JSON header block
(spec section 4.4). Tensor-shape ARCHITECTURE detection is deliberately out of
scope until Spike C / M4 — this module only assigns artifact_type.
"""

import json
import os
import struct
from typing import Any, Dict

# A real safetensors header is small JSON; anything claiming >100 MB is not one.
_MAX_HEADER_BYTES = 100_000_000


class HeaderError(ValueError):
    """The file is not a readable safetensors artifact."""


def read_safetensors_header(path: str) -> Dict[str, Any]:
    try:
        with open(path, "rb") as handle:
            prefix = handle.read(8)
            if len(prefix) != 8:
                raise HeaderError(f"truncated safetensors prefix: {path}")
            (length,) = struct.unpack("<Q", prefix)
            if length > _MAX_HEADER_BYTES:
                raise HeaderError(f"implausible header length {length}: {path}")
            raw = handle.read(length)
            if len(raw) != length:
                raise HeaderError(f"truncated safetensors header: {path}")
            header = json.loads(raw)
            if not isinstance(header, dict):
                raise HeaderError(f"safetensors header is not a JSON object: {path}")
            return header
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HeaderError(f"unreadable safetensors header: {path}: {exc}") from exc


def classify_safetensors(header: Dict[str, Any]) -> str:
    """checkpoint | lora | vae | controlnet | unknown — from tensor-key patterns."""
    keys = [key for key in header if key != "__metadata__"]
    if any(
        key.startswith(("lora_unet_", "lora_te_")) or ".lora_down." in key or ".lora_up." in key
        for key in keys
    ):
        return "lora"
    if any(key.startswith("model.diffusion_model.") for key in keys):
        return "checkpoint"
    if any(key.startswith(("control_model.", "input_hint_block.")) for key in keys):
        return "controlnet"
    if any(key.startswith(("encoder.", "decoder.")) for key in keys):
        return "vae"
    return "unknown"


def detect_diffusers_dir(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "model_index.json"))
