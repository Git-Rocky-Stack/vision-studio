"""#34 PR2: AI Expand pre-step - grow the canvas and build the border mask.

Pure PIL + numpy (both on stub CI). The expanded image gets a mirrored-edge
prefill so the inpaint pass sees plausible local statistics under the mask;
the mask covers the new border plus a small seam band inside the original so
the pass blends the boundary instead of leaving a hard edge.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

import numpy as np
from PIL import Image

DIRECTIONS = ("up", "down", "left", "right")
# The mask reaches this far into the original image so the seam is repainted.
SEAM_OVERLAP = 16


def normalize_directions(directions: Iterable[str]) -> List[str]:
    """Validated, order-preserving, de-duplicated direction list."""
    seen: List[str] = []
    for direction in directions or []:
        if direction not in DIRECTIONS:
            raise ValueError(f"unknown outpaint direction '{direction}'")
        if direction not in seen:
            seen.append(direction)
    if not seen:
        raise ValueError("outpaint needs at least one direction")
    return seen


def expand_canvas(
    image: Image.Image, directions: Iterable[str], pixels: int
) -> Tuple[Image.Image, Image.Image]:
    """(expanded RGB image, L-mode border mask) for an outpaint pass.

    The border prefill mirrors edge content (numpy 'symmetric'); when the
    pad is wider than the source the unconditionally safe 'edge' repeat is
    used instead. White (255) mask = repaint: every padded border plus a
    SEAM_OVERLAP band just inside the original.
    """
    resolved = normalize_directions(directions)
    pixels = int(pixels)
    if pixels <= 0:
        raise ValueError("outpaint pixels must be positive")

    pads: Dict[str, int] = {
        side: (pixels if side in resolved else 0) for side in DIRECTIONS
    }
    array = np.asarray(image.convert("RGB"))
    height, width = array.shape[:2]
    pad_spec = ((pads["up"], pads["down"]), (pads["left"], pads["right"]), (0, 0))
    mode = "symmetric" if pixels <= min(height, width) else "edge"
    expanded = Image.fromarray(np.pad(array, pad_spec, mode=mode))

    mask = np.full(
        (height + pads["up"] + pads["down"], width + pads["left"] + pads["right"]),
        255,
        dtype=np.uint8,
    )
    # The interior (original content) stays black, minus a seam band on each
    # expanded side so the pass can blend across the boundary.
    top = pads["up"] + (SEAM_OVERLAP if pads["up"] else 0)
    bottom = pads["down"] + (SEAM_OVERLAP if pads["down"] else 0)
    left = pads["left"] + (SEAM_OVERLAP if pads["left"] else 0)
    right = pads["right"] + (SEAM_OVERLAP if pads["right"] else 0)
    interior_height = mask.shape[0] - top - bottom
    interior_width = mask.shape[1] - left - right
    if interior_height > 0 and interior_width > 0:
        mask[top:top + interior_height, left:left + interior_width] = 0
    return expanded, Image.fromarray(mask, mode="L")
