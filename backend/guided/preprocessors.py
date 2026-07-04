"""#34 PR2: source image -> control image for ControlNet guided passes.

canny/scribble run on the already-shipped OpenCV (zero downloads). depth /
normal / openpose need controlnet_aux plus annotator weights that arrive ONLY
as consent-gated Foundry records (models/annotators/) - never a runtime
download. The layer's vector mask gates the control map: signal is zeroed
outside the mask. Imports cleanly with no torch/controlnet_aux (stub CI).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:  # pragma: no cover - opencv ships in requirements
    cv2 = None  # type: ignore[assignment]

try:
    from controlnet_aux import MidasDetector, NormalBaeDetector, OpenposeDetector
except ImportError:  # stub CI / slim install - annotator passes fail loudly
    MidasDetector = None  # type: ignore[assignment]
    NormalBaeDetector = None  # type: ignore[assignment]
    OpenposeDetector = None  # type: ignore[assignment]

from guided.masks import mask_coverage, rasterize_mask
from guided.passes import GuidedValidationError

# Detector instances are expensive to build; cache per (name, weights dir).
_DETECTORS: Dict[str, Any] = {}


@dataclass(frozen=True)
class PreprocessorSpec:
    name: str
    annotator_record_id: Optional[str]  # Foundry record with the weights; None = zero-download
    run: Callable[[Image.Image, Optional[str]], Image.Image]


def _require_cv2() -> None:
    if cv2 is None:
        raise RuntimeError(
            "OpenCV is not available - the canny/scribble preprocessors need "
            "the backend's shipped opencv-python."
        )


def _gray(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.uint8)


def _edges_to_rgb(edges: np.ndarray) -> Image.Image:
    return Image.fromarray(np.stack([edges] * 3, axis=-1))


def _canny(image: Image.Image, annotators_dir: Optional[str] = None) -> Image.Image:
    _require_cv2()
    return _edges_to_rgb(cv2.Canny(_gray(image), 100, 200))


def _scribble(image: Image.Image, annotators_dir: Optional[str] = None) -> Image.Image:
    _require_cv2()
    edges = cv2.Canny(_gray(image), 100, 200)
    thick = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    return _edges_to_rgb(thick)


def _detector(name: str, detector_class: Any, annotators_dir: Optional[str]) -> Any:
    if detector_class is None:
        raise RuntimeError(
            f"The '{name}' preprocessor needs controlnet_aux, which is not "
            "installed - guided ControlNet passes require the full backend."
        )
    if not annotators_dir or not os.path.isdir(annotators_dir):
        raise RuntimeError(
            f"The '{name}' preprocessor's annotator weights are missing - "
            "install the annotator from the Foundry first."
        )
    key = f"{name}:{annotators_dir}"
    if key not in _DETECTORS:
        _DETECTORS[key] = detector_class.from_pretrained(annotators_dir)
    return _DETECTORS[key]


def _depth(image: Image.Image, annotators_dir: Optional[str]) -> Image.Image:
    return _detector("depth", MidasDetector, annotators_dir)(image)


def _normal(image: Image.Image, annotators_dir: Optional[str]) -> Image.Image:
    return _detector("normal", NormalBaeDetector, annotators_dir)(image)


def _openpose(image: Image.Image, annotators_dir: Optional[str]) -> Image.Image:
    return _detector("openpose", OpenposeDetector, annotators_dir)(image)


PREPROCESSORS: Dict[str, PreprocessorSpec] = {
    "canny": PreprocessorSpec("canny", None, _canny),
    "scribble": PreprocessorSpec("scribble", None, _scribble),
    "depth": PreprocessorSpec("depth", "annotator-midas", _depth),
    "normal": PreprocessorSpec("normal", "annotator-normalbae", _normal),
    "openpose": PreprocessorSpec("openpose", "annotator-openpose", _openpose),
}


def produce_control_image(
    layer: Dict[str, Any], width: int, height: int, annotators_dir: Optional[str]
) -> Image.Image:
    """Preprocess one ControlNet layer into its mask-gated control image."""
    preprocessor = (layer.get("preprocessor") or "").strip()
    spec = PREPROCESSORS.get(preprocessor)
    if spec is None:
        supported = ", ".join(sorted(PREPROCESSORS))
        raise GuidedValidationError(
            f"Unknown ControlNet preprocessor '{preprocessor}' - supported: {supported}."
        )

    source = Image.open(layer["source_path"]).convert("RGB")
    base_width, base_height = source.size

    # Mask coordinates are intrinsic source pixels: rasterize at source size,
    # then resize alongside the control map.
    mask_image = rasterize_mask(layer.get("mask") or {}, base_width, base_height)
    if mask_coverage(mask_image) == 0.0:
        name = layer.get("layer_name") or layer.get("layer_id") or "the ControlNet layer"
        raise GuidedValidationError(
            f"The mask on '{name}' is empty - draw a mask region on the canvas first."
        )

    control = spec.run(source.resize((width, height), Image.Resampling.LANCZOS), annotators_dir)
    control = control.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)

    mask_array = np.asarray(mask_image.resize((width, height), Image.Resampling.NEAREST))
    control_array = np.asarray(control, dtype=np.uint8).copy()
    control_array[mask_array == 0] = 0
    return Image.fromarray(control_array)
