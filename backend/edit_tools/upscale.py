"""Real AI upscaling: Real-ESRGAN via spandrel, tiled for bounded memory (#34).

spandrel (MIT - ComfyUI's loader) loads the .pth checkpoints into clean
reimplementations; the unmaintained basicsr/realesrgan packages never enter
the tree. Tiles are processed with an overlap margin and center-cropped on
paste, so tiled output is pixel-identical to a single pass. 2x runs the 4x
model and LANCZOS-downsamples (reported honestly by the service layer).
"""

from __future__ import annotations

from typing import Callable, Dict, Optional, Tuple

from PIL import Image

from edit_tools.weights import EditCancelled, EditModelUnavailable, EditToolError
from utils.device import resolve_device

try:  # stub CI / slim install
    import torch
except ImportError:
    torch = None

try:
    import numpy as np
except ImportError:  # numpy is a base dep; guard anyway for symmetry
    np = None

try:
    from spandrel import ModelLoader
except ImportError:
    ModelLoader = None

TILE = 256
OVERLAP = 16
# Longest edge of the canvas upscale() allocates. The working canvas is the
# MODEL's scale (2x runs the 4x model, then downsamples), so a 2x request
# allocates 4x too. 16384^2 RGB is already ~800 MB.
MAX_UPSCALE_EDGE = 16384

RunTile = Callable[[Image.Image], Image.Image]
ProgressCb = Callable[[int, int], None]
CancelCheck = Callable[[], bool]

_RUNNERS: Dict[str, Tuple[RunTile, int]] = {}


def check_upscale_size(width: int, height: int, scale: int, model_scale: int = 4) -> None:
    """Refuse (EditToolError) before any canvas is allocated when the working
    canvas would exceed MAX_UPSCALE_EDGE on its long edge."""
    working_scale = max(scale, model_scale)
    long_edge = max(width, height)
    if long_edge * working_scale > MAX_UPSCALE_EDGE:
        largest = MAX_UPSCALE_EDGE // working_scale
        raise EditToolError(
            f"This image is too large to upscale: {width}x{height} at {scale}x needs a "
            f"{long_edge * working_scale}px working canvas (the limit is "
            f"{MAX_UPSCALE_EDGE}px). Resize or crop it to at most {largest}px on the "
            "long edge first."
        )


def _half_precision(descriptor, device: str):
    """(descriptor, torch dtype): fp16 on CUDA when the architecture supports
    it - about half the VRAM and faster on tensor cores - else fp32. Fail-soft:
    any trouble converting keeps the fp32 model."""
    if device != "cuda" or not getattr(descriptor, "supports_half", False):
        return descriptor, torch.float32
    try:
        return descriptor.half(), torch.float16
    except Exception:  # noqa: BLE001 - fp32 always works
        return descriptor, torch.float32


def _make_runner(model_path: str) -> Tuple[RunTile, int]:
    if torch is None or ModelLoader is None or np is None:
        raise EditModelUnavailable(
            "this build is missing the spandrel/torch runtime - reinstall Vision Studio."
        )
    if model_path in _RUNNERS:
        return _RUNNERS[model_path]

    device = resolve_device(torch)
    descriptor = ModelLoader().load_from_file(model_path).to(device).eval()
    descriptor, dtype = _half_precision(descriptor, device)

    def run(tile: Image.Image) -> Image.Image:
        arr = np.asarray(tile.convert("RGB"), dtype=np.float32) / 255.0
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(device, dtype=dtype)
        with torch.no_grad():
            out = descriptor(tensor)
        out = out.float().squeeze(0).permute(1, 2, 0).clamp(0.0, 1.0).cpu().numpy()
        return Image.fromarray((out * 255.0).round().astype(np.uint8))

    _RUNNERS[model_path] = (run, int(descriptor.scale))
    return _RUNNERS[model_path]


def upscale(
    image: Image.Image,
    scale: int,
    model_path: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
    cancel_check: Optional[CancelCheck] = None,
    run_tile: Optional[RunTile] = None,
    model_scale: int = 4,
) -> Image.Image:
    """Super-resolve ``image`` by ``scale`` (2 or 4) with seam-free tiling."""
    if scale not in (2, 4):
        raise ValueError(f"Unsupported scale factor: {scale}. Must be 2 or 4.")
    # Size gate first: never load weights for, or allocate, an oversized canvas.
    check_upscale_size(image.width, image.height, scale, model_scale)
    if run_tile is None:
        run_tile, model_scale = _make_runner(model_path or "")
        check_upscale_size(image.width, image.height, scale, model_scale)

    source = image.convert("RGB")
    width, height = source.size
    tiles = [
        (x, y, min(TILE, width - x), min(TILE, height - y))
        for y in range(0, height, TILE)
        for x in range(0, width, TILE)
    ]
    output = Image.new("RGB", (width * model_scale, height * model_scale))
    for index, (x, y, w, h) in enumerate(tiles):
        if cancel_check is not None and cancel_check():
            raise EditCancelled("upscale cancelled")
        x0, y0 = max(0, x - OVERLAP), max(0, y - OVERLAP)
        x1, y1 = min(width, x + w + OVERLAP), min(height, y + h + OVERLAP)
        scaled = run_tile(source.crop((x0, y0, x1, y1)))
        left, top = (x - x0) * model_scale, (y - y0) * model_scale
        output.paste(
            scaled.crop((left, top, left + w * model_scale, top + h * model_scale)),
            (x * model_scale, y * model_scale),
        )
        if progress_cb is not None:
            progress_cb(index + 1, len(tiles))

    if scale != model_scale:
        output = output.resize((width * scale, height * scale), Image.Resampling.LANCZOS)
    return output
