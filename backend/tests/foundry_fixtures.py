"""Shared fixture builders for foundry indexer tests (from Spike B's probe)."""

import json
import os
import struct
from typing import Dict, List, Optional


def make_safetensors(
    path: str,
    tensors: Dict[str, List[int]],
    metadata: Optional[Dict[str, str]] = None,
) -> str:
    """Write a tiny VALID safetensors file: 8-byte LE header length + JSON + zero data."""
    header: Dict[str, object] = {}
    offset = 0
    for name, shape in tensors.items():
        size = 2  # bytes per F16 element
        for dim in shape:
            size *= dim
        header[name] = {"dtype": "F16", "shape": shape, "data_offsets": [offset, offset + size]}
        offset += size
    if metadata:
        header["__metadata__"] = metadata
    encoded = json.dumps(header).encode("utf-8")
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<Q", len(encoded)))
        handle.write(encoded)
        handle.write(b"\x00" * offset)
    return path


CHECKPOINT_TENSORS = {
    "model.diffusion_model.input_blocks.0.0.weight": [4, 4],
    "model.diffusion_model.out.2.bias": [4],
}
LORA_TENSORS = {"lora_unet_down_blocks_0_attentions_0.lora_down.weight": [4, 4]}
VAE_TENSORS = {"encoder.conv_in.weight": [4, 4], "decoder.conv_out.bias": [4]}
CONTROLNET_TENSORS = {"control_model.input_blocks.0.0.weight": [4, 4]}
