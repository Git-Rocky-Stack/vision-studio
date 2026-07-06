"""Edit-operation dispatch: validated source file -> tool pass -> saved PNG (#34).

Runs inside a worker thread under the job manager (api/edit.py); everything
here is synchronous. Results use the image-job shape ({"images": [relative
URLs]}) so job polling, WS updates, asset sync, and orphan cleanup work
untouched. Every raised message is user-facing and path-free.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

from PIL import Image, ImageOps

from edit_tools.background import remove_background
from edit_tools.faces import restore_faces
from edit_tools.upscale import upscale
from edit_tools.weights import (
    EditToolError,
    RecordResolver,
    require_edit_weights,
)

UPSCALE_RECORDS = {
    "general": "edit-realesrgan-x4plus",
    "anime": "edit-realesrgan-x4plus-anime",
}
MODEL_SCALE = 4  # both Real-ESRGAN records are 4x models
FACE_ENHANCE_STRENGTH = 50  # fixed blend for the upscale face_enhance pass

ProgressCb = Callable[[int, int], None]
CancelCheck = Callable[[], bool]


def _load_source(source_path: str) -> Image.Image:
    try:
        image = Image.open(source_path)
        image.load()
        return ImageOps.exif_transpose(image)
    except Exception:
        raise EditToolError(
            "The source image could not be read - re-export the frame and try again."
        )


def _face_paths(models_dir: str, resolve_record: RecordResolver) -> Dict[str, str]:
    return {
        "gfpgan_path": require_edit_weights(
            "edit-gfpgan-v14", resolve_record, models_dir, "face restoration"),
        "detection_path": require_edit_weights(
            "edit-face-detection", resolve_record, models_dir, "face detection"),
        "parsing_path": require_edit_weights(
            "edit-face-parsing", resolve_record, models_dir, "face parsing"),
    }


def run_edit_operation(
    job_id: str,
    operation: str,
    params: Dict[str, Any],
    output_root: str,
    models_dir: str,
    resolve_record: RecordResolver,
    progress_cb: Optional[ProgressCb] = None,
    cancel_check: Optional[CancelCheck] = None,
) -> Dict[str, Any]:
    image = _load_source(params["source_path"])
    metadata: Dict[str, Any] = {}

    if operation == "remove-background":
        model_path = require_edit_weights(
            "edit-u2net", resolve_record, models_dir, "background removal")
        result = remove_background(
            image, int(params.get("edge_refinement", 50)), model_path=model_path)

    elif operation == "upscale":
        record_id = UPSCALE_RECORDS.get(params.get("model") or "general",
                                        UPSCALE_RECORDS["general"])
        model_path = require_edit_weights(
            record_id, resolve_record, models_dir, "AI upscale")
        scale = int(params.get("scale", 2))
        face_enhance = bool(params.get("face_enhance"))
        face_paths = _face_paths(models_dir, resolve_record) if face_enhance else None

        # face_enhance splits the progress budget: tiles 0-80%, faces 80-100%.
        def tile_progress(done: int, total: int) -> None:
            if progress_cb is not None:
                span = 80 if face_enhance else 100
                progress_cb(done * span, total * 100)

        result = upscale(image, scale, model_path=model_path,
                         progress_cb=tile_progress, cancel_check=cancel_check)
        metadata.update({
            "model_used": record_id,
            "model_scale": MODEL_SCALE,
            "output_scale": scale,
            "original_size": [image.width, image.height],
        })
        if face_enhance:
            def face_progress(done: int, total: int) -> None:
                if progress_cb is not None:
                    progress_cb(80 * total + done * 20, total * 100)

            result, faces_detected = restore_faces(
                result, FACE_ENHANCE_STRENGTH, progress_cb=face_progress,
                cancel_check=cancel_check, **face_paths)
            metadata["faces_detected"] = faces_detected
        metadata["new_size"] = [result.width, result.height]

    elif operation == "restore-faces":
        face_paths = _face_paths(models_dir, resolve_record)
        result, faces_detected = restore_faces(
            image, int(params.get("strength", 50)), progress_cb=progress_cb,
            cancel_check=cancel_check, **face_paths)
        metadata["faces_detected"] = faces_detected

    else:
        raise EditToolError(f"Unknown edit operation '{operation}'.")

    output_dir = os.path.join(output_root, job_id)
    os.makedirs(output_dir, exist_ok=True)
    name = f"edit_{operation}.png"
    result.save(os.path.join(output_dir, name))
    return {"images": [f"/outputs/{job_id}/{name}"], **metadata}
