"""#34 PR1: rasterize canvas vector masks into PIL L-mode mask images.

The canvas drawer (RegionMaskDrawer) emits points in intrinsic image pixel
coordinates. Rasterize at the base image's size, then resize alongside it.
White (255) = selected. Pure PIL - loads and runs on stub CI.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from PIL import Image, ImageDraw

# Brush strokes without a recorded width get a radius proportional to the
# canvas diagonal (matches the drawer's visual default closely enough to be
# unsurprising), floored so tiny canvases still get a visible stroke.
DEFAULT_BRUSH_FRACTION = 0.02
MIN_BRUSH_RADIUS = 6.0

_KNOWN_TYPES = {"rectangle", "polygon", "brush", "erase"}


def _clamped_points(mask: Dict[str, Any], width: int, height: int) -> List[Tuple[float, float]]:
    points = []
    for point in mask.get("points") or []:
        x = min(max(float(point.get("x", 0.0)), 0.0), float(width))
        y = min(max(float(point.get("y", 0.0)), 0.0), float(height))
        points.append((x, y))
    return points


def _brush_radius(mask: Dict[str, Any], width: int, height: int) -> float:
    brush_size = mask.get("brush_size")
    if brush_size:
        return max(1.0, float(brush_size) / 2.0)
    return max(MIN_BRUSH_RADIUS, DEFAULT_BRUSH_FRACTION * math.hypot(width, height))


def _draw_stroke(draw: ImageDraw.ImageDraw, points: List[Tuple[float, float]], radius: float) -> None:
    if len(points) >= 2:
        draw.line(points, fill=255, width=max(1, int(round(radius * 2))))
    # Round caps/joints so sharp direction changes stay solid.
    for x, y in points:
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=255)


def rasterize_mask(mask: Dict[str, Any], width: int, height: int) -> Image.Image:
    """Vector mask payload -> L-mode image at (width, height). White = selected.

    A standalone 'erase' mask subtracts from nothing and therefore rasterizes
    empty - callers detect that via mask_coverage() and refuse honestly.
    """
    mask_type = mask.get("type")
    if mask_type not in _KNOWN_TYPES:
        raise ValueError(f"unknown mask type '{mask_type}'")

    image = Image.new("L", (max(1, int(width)), max(1, int(height))), 0)
    points = _clamped_points(mask, width, height)
    if not points or mask_type == "erase":
        return image

    draw = ImageDraw.Draw(image)
    if mask_type == "rectangle":
        bounds = mask.get("bounds") or {}
        x1 = min(max(float(bounds.get("x", 0.0)), 0.0), float(width))
        y1 = min(max(float(bounds.get("y", 0.0)), 0.0), float(height))
        x2 = min(x1 + max(0.0, float(bounds.get("width", 0.0))), float(width))
        y2 = min(y1 + max(0.0, float(bounds.get("height", 0.0))), float(height))
        draw.rectangle([x1, y1, x2, y2], fill=255)
    elif mask_type == "polygon":
        if len(points) >= 3:
            draw.polygon(points, fill=255)
        else:
            _draw_stroke(draw, points, _brush_radius(mask, width, height))
    else:  # brush
        _draw_stroke(draw, points, _brush_radius(mask, width, height))
    return image


def mask_coverage(image: Image.Image) -> float:
    """Fraction of nonzero pixels (0.0-1.0)."""
    histogram = image.histogram()
    total = image.size[0] * image.size[1]
    if total == 0:
        return 0.0
    return 1.0 - (histogram[0] / total)
