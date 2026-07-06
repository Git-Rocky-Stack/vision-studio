"""Real face restoration: GFPGAN v1.4 via spandrel + facexlib (#34).

facexlib provides the canonical detect -> align -> paste-back pipeline
(RetinaFace ResNet50 + ParseNet). Its weights arrive ONLY as Foundry
records; a staging directory with facexlib's canonical filenames is
assembled beside the records so its loader finds them and never downloads.
``strength`` (0-100) alpha-blends each restored 512x512 crop over the
original crop BEFORE paste-back - GFPGAN exposes no finer controls, so the
panel offers none. faces_detected is the honest RetinaFace count; zero
faces returns the input unchanged.
"""

from __future__ import annotations

import os
import shutil
from typing import Any, Callable, Dict, Optional, Tuple

import numpy as np
from PIL import Image

from edit_tools.weights import EditCancelled, EditModelUnavailable

try:  # stub CI / slim install
    import torch
except ImportError:
    torch = None

try:
    from spandrel import ModelLoader
except ImportError:
    ModelLoader = None

try:
    from facexlib.utils.face_restoration_helper import FaceRestoreHelper
except ImportError:
    FaceRestoreHelper = None

# facexlib resolves weights by URL basename; the staging dir maps our
# record-id filenames onto the names its loader expects.
_STAGED_NAMES = {
    "detection": "detection_Resnet50_Final.pth",
    "parsing": "parsing_parsenet.pth",
}

RestoreCrop = Callable[[np.ndarray], np.ndarray]
ProgressCb = Callable[[int, int], None]
CancelCheck = Callable[[], bool]

_GFPGAN_RUNNERS: Dict[str, RestoreCrop] = {}


def _require_runtime() -> None:
    if torch is None or ModelLoader is None or FaceRestoreHelper is None:
        raise EditModelUnavailable(
            "this build is missing the facexlib/spandrel runtime - reinstall Vision Studio."
        )


def _staging_dir(detection_path: str, parsing_path: str) -> str:
    """Assemble <models>/edit-model/.facexlib/ with canonical filenames."""
    root = os.path.join(os.path.dirname(os.path.dirname(detection_path)), ".facexlib")
    os.makedirs(root, exist_ok=True)
    for source, name in ((detection_path, _STAGED_NAMES["detection"]),
                         (parsing_path, _STAGED_NAMES["parsing"])):
        target = os.path.join(root, name)
        if not os.path.isfile(target) or os.path.getsize(target) != os.path.getsize(source):
            shutil.copy2(source, target)
    return root


def _make_helper(detection_path: str, parsing_path: str) -> Any:
    _require_runtime()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    staging = _staging_dir(detection_path, parsing_path)
    return FaceRestoreHelper(
        upscale_factor=1,
        face_size=512,
        crop_ratio=(1, 1),
        det_model="retinaface_resnet50",
        save_ext="png",
        use_parse=True,
        device=device,
        model_rootpath=staging,
    )


def _make_gfpgan_runner(gfpgan_path: str) -> RestoreCrop:
    _require_runtime()
    if gfpgan_path in _GFPGAN_RUNNERS:
        return _GFPGAN_RUNNERS[gfpgan_path]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    descriptor = ModelLoader().load_from_file(gfpgan_path).to(device).eval()

    def restore(crop_bgr: np.ndarray) -> np.ndarray:
        rgb = crop_bgr[:, :, ::-1].astype(np.float32) / 255.0
        tensor = torch.from_numpy(rgb.copy()).permute(2, 0, 1).unsqueeze(0).to(device)
        with torch.no_grad():
            out = descriptor(tensor)
        out = out.squeeze(0).permute(1, 2, 0).clamp(0.0, 1.0).cpu().numpy()
        return (out[:, :, ::-1] * 255.0).round().astype(np.uint8)

    _GFPGAN_RUNNERS[gfpgan_path] = restore
    return restore


def restore_faces(
    image: Image.Image,
    strength: int,
    gfpgan_path: Optional[str] = None,
    detection_path: Optional[str] = None,
    parsing_path: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
    cancel_check: Optional[CancelCheck] = None,
    helper: Optional[Any] = None,
    restore_crop: Optional[RestoreCrop] = None,
) -> Tuple[Image.Image, int]:
    """(restored image, honest face count). Zero faces -> input unchanged."""
    if helper is None:
        helper = _make_helper(detection_path or "", parsing_path or "")
    if restore_crop is None:
        restore_crop = _make_gfpgan_runner(gfpgan_path or "")

    weight = max(0, min(100, int(strength))) / 100.0
    source = image.convert("RGB")
    bgr = np.asarray(source)[:, :, ::-1].copy()

    helper.clean_all()
    helper.read_image(bgr)
    helper.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    helper.align_warp_face()

    faces = list(helper.cropped_faces)
    if not faces:
        return source, 0

    for index, cropped in enumerate(faces):
        if cancel_check is not None and cancel_check():
            raise EditCancelled("face restoration cancelled")
        restored = restore_crop(cropped)
        blended = (
            cropped.astype(np.float32) * (1.0 - weight)
            + restored.astype(np.float32) * weight
        ).round().astype(np.uint8)
        helper.add_restored_face(blended)
        if progress_cb is not None:
            progress_cb(index + 1, len(faces))

    helper.get_inverse_affine(None)
    pasted = helper.paste_faces_to_input_image()
    return Image.fromarray(pasted[:, :, ::-1]), len(faces)
