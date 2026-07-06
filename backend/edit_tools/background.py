"""Real background removal: U^2-Net salient-object segmentation (#34).

Runs the Foundry-installed u2net.onnx directly on onnxruntime (CPU EP) -
deliberately NOT via the rembg wrapper, whose session layer auto-downloads
weights to ~/.u2net (a hidden network path the consent-gated Foundry
contract forbids). Pre/post-processing follows the reference u2net recipe:
320x320 bilinear, max-normalize, ImageNet mean/std, min-max rescale of the
saliency map, bilinear upscale back, alpha composition. The Edge Refinement
slider is a real Gaussian feather on the alpha mask (0-100 -> 0-8 px).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

import numpy as np
from PIL import Image, ImageFilter

from edit_tools.weights import EditModelUnavailable

try:  # stub CI / slim install - import fine, refuse loudly at run time
    import onnxruntime
except ImportError:
    onnxruntime = None

_SESSIONS: Dict[str, Any] = {}
_SIDE = 320
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
_MAX_FEATHER_PX = 8.0

RunSession = Callable[[np.ndarray], np.ndarray]


def feather_radius_px(edge_refinement: int) -> float:
    """Edge Refinement slider (0-100) -> Gaussian feather radius in px."""
    clamped = max(0, min(100, int(edge_refinement)))
    return clamped * _MAX_FEATHER_PX / 100.0


def _session_runner(model_path: str) -> RunSession:
    if onnxruntime is None:
        raise EditModelUnavailable(
            "this build is missing the onnxruntime runtime - reinstall Vision Studio."
        )
    if model_path not in _SESSIONS:
        _SESSIONS[model_path] = onnxruntime.InferenceSession(
            model_path, providers=["CPUExecutionProvider"]
        )
    session = _SESSIONS[model_path]
    input_name = session.get_inputs()[0].name

    def run(inputs: np.ndarray) -> np.ndarray:
        return session.run(None, {input_name: inputs})[0]

    return run


def _preprocess(image: Image.Image) -> np.ndarray:
    resized = image.convert("RGB").resize((_SIDE, _SIDE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32)
    arr = arr / max(float(arr.max()), 1e-6)
    arr = (arr - _MEAN) / _STD
    return arr.transpose(2, 0, 1)[np.newaxis, :].astype(np.float32)


def _postprocess(pred: np.ndarray, size: tuple) -> Image.Image:
    saliency = pred[0, 0, :, :]
    lo, hi = float(saliency.min()), float(saliency.max())
    saliency = (saliency - lo) / max(hi - lo, 1e-6)
    mask = Image.fromarray((saliency * 255.0).astype(np.uint8), mode="L")
    return mask.resize(size, Image.Resampling.BILINEAR)


def remove_background(
    image: Image.Image,
    edge_refinement: int,
    model_path: Optional[str] = None,
    run: Optional[RunSession] = None,
) -> Image.Image:
    """RGBA cutout of ``image`` with the u2net saliency map as alpha."""
    if run is None:
        run = _session_runner(model_path or "")
    mask = _postprocess(run(_preprocess(image)), image.size)
    radius = feather_radius_px(edge_refinement)
    if radius > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius))
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result
