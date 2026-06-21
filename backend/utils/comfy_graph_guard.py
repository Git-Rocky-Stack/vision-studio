"""
Authoritative safety gate for imported ComfyUI graphs (M8 Codex gate).

Imported graphs are untrusted input. Before any graph reaches the ComfyUI server,
every node's class_type must be in the first-class allow-list and every path/model
field must survive sanitization unchanged. Refusals are structured and leak-free:
the message is user-facing and never contains a path, token, or traceback.
"""

from __future__ import annotations

from typing import Dict

from utils.sanitization import sanitize_model_name, sanitize_path

FIRST_CLASS_NODES = {
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImage",
    "PreviewImage",
    "LoraLoader",
    "VAELoader",
}

_MODEL_FIELDS = ("ckpt_name", "lora_name", "vae_name")
_PATH_FIELDS = ("filename_prefix", "image")

# Untrusted graphs must not drive resource exhaustion on the Comfy server. A
# real workflow is a handful of nodes; cap the count and bound the numeric
# inputs that scale work (latent size, batch, sampling steps). Node connections
# arrive as [node_id, slot] lists and are intentionally left alone here.
MAX_NODES = 256
_NUMERIC_BOUNDS = {
    "EmptyLatentImage": {
        "width": (16, 8192),
        "height": (16, 8192),
        "batch_size": (1, 64),
    },
    "KSampler": {
        "steps": (1, 250),
    },
}


class GraphValidationError(Exception):
    """Raised when an imported graph fails the safety gate. Message is user-facing."""


def validate_comfy_graph(graph: Dict) -> None:
    if not isinstance(graph, dict) or not graph:
        raise GraphValidationError("The workflow graph is empty or malformed.")

    if len(graph) > MAX_NODES:
        raise GraphValidationError(
            f"This workflow has too many nodes ({len(graph)}); the maximum is {MAX_NODES}."
        )

    for node in graph.values():
        if not isinstance(node, dict):
            raise GraphValidationError("The workflow graph has a malformed node.")

        class_type = node.get("class_type")
        if class_type not in FIRST_CLASS_NODES:
            raise GraphValidationError(
                f"This workflow uses an unsupported node ({class_type!r}) that cannot run safely."
            )

        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            raise GraphValidationError("The workflow graph has malformed node inputs.")

        for field in _MODEL_FIELDS:
            value = inputs.get(field)
            if isinstance(value, str) and sanitize_model_name(value) != value:
                raise GraphValidationError("The workflow references an unsafe model name.")

        for field in _PATH_FIELDS:
            value = inputs.get(field)
            if isinstance(value, str) and sanitize_path(value) != value:
                raise GraphValidationError("The workflow references an unsafe file path.")

        bounds = _NUMERIC_BOUNDS.get(class_type)
        if bounds:
            for field, (low, high) in bounds.items():
                value = inputs.get(field)
                # Only literal numbers are bounded; bools and node-connection
                # lists ([node_id, slot]) are left for the server to resolve.
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    continue
                if not low <= value <= high:
                    raise GraphValidationError(
                        f"The workflow sets {field} outside the allowed range ({low}-{high})."
                    )
