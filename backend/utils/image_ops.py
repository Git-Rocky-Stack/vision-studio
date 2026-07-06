"""
Image transformation helpers for crop, rotate, flip, and upscale.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from PIL import Image


def _ensure_parent_dir(output_path: str) -> Path:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    return output


def apply_crop_and_transform(
    source_path: str,
    output_path: str,
    crop_box: Optional[Dict[str, int]] = None,
    rotation: int = 0,
    flip_horizontal: bool = False,
    flip_vertical: bool = False,
) -> Dict[str, object]:
    output = _ensure_parent_dir(output_path)

    with Image.open(source_path) as image:
        edited = image.convert("RGBA")

        if crop_box:
            left = max(0, int(crop_box["left"]))
            top = max(0, int(crop_box["top"]))
            width = max(1, int(crop_box["width"]))
            height = max(1, int(crop_box["height"]))
            edited = edited.crop((left, top, left + width, top + height))

        if rotation:
            edited = edited.rotate(-rotation, expand=True)

        if flip_horizontal:
            edited = edited.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

        if flip_vertical:
            edited = edited.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

        edited.save(output, "PNG")

    return {
        "output_path": str(output).replace("\\", "/"),
        "width": edited.width,
        "height": edited.height,
    }
