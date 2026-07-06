"""#34 acceptance: real-weight edit-tool smokes (VS_REAL_SMOKE=1 only).

Requires onnxruntime/spandrel/facexlib importable, the six edit-model
records installed under VS_MODELS_DIR (real Foundry consent flow), and the
sd-1-5 record for the source images. Generates a subject image and a
portrait with the real pipeline, then asserts each tool does real work -
not identity passthrough. Maintainer gate for the #34 second half.
"""
import asyncio
import os
import pathlib
import sys
import tempfile

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RUN = os.getenv("VS_REAL_SMOKE") == "1"
HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401
    import onnxruntime  # noqa: F401
    import spandrel  # noqa: F401
    import facexlib  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(
    not (RUN and HAS_DEPS), reason="set VS_REAL_SMOKE=1 with the full backend to run"
)

MODELS_DIR = os.environ.get("VS_MODELS_DIR", "models")

_EXTENSIONS = {"edit-u2net": ".onnx"}


def _weights(record_id: str) -> str:
    extension = _EXTENSIONS.get(record_id, ".ckpt")
    return os.path.join(MODELS_DIR, "edit-model", record_id, f"{record_id}{extension}")


def _require(record_id: str) -> str:
    path = _weights(record_id)
    if not os.path.isfile(path):
        pytest.skip(f"install '{record_id}' from the Foundry to run this smoke")
    return path


def _laplacian_variance(image) -> float:
    import numpy as np

    gray = np.asarray(image.convert("L"), dtype="float32")
    lap = (
        -4 * gray
        + np.roll(gray, 1, 0) + np.roll(gray, -1, 0)
        + np.roll(gray, 1, 1) + np.roll(gray, -1, 1)
    )
    return float(lap.var())


@pytest.fixture(scope="module")
def generated_images():
    """One real SD1.5 subject image + one portrait, generated once per module."""
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")

    import utils.direct_generator as dg

    output_dir = tempfile.mkdtemp()
    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=output_dir)

    def generate(job_id: str, prompt: str, seed: int):
        result = asyncio.run(generator.generate_image(
            job_id=job_id,
            prompt=prompt,
            width=512, height=512, steps=6, cfg_scale=7.0, seed=seed,
            model_name="sd-1-5", scheduler="Euler a",
        ))
        assert result["images"], f"the {job_id} generation must produce an image"
        relative = result["images"][0]
        return Image.open(os.path.join(output_dir, relative.split("/outputs/")[-1])).convert("RGB")

    subject = generate(
        "edit-smoke-subject",
        "product photo of a single red apple centered on a plain white table, "
        "white background, studio lighting",
        4321,
    )
    portrait = generate(
        "edit-smoke-portrait",
        "portrait photo of a person's face looking at the camera, head and "
        "shoulders, photorealistic, soft studio light",
        1234,
    )
    return {"subject": subject, "portrait": portrait}


def test_background_removal_produces_a_real_cutout(generated_images):
    import numpy as np
    from edit_tools.background import remove_background

    model_path = _require("edit-u2net")
    subject = generated_images["subject"]
    result = remove_background(subject, 50, model_path=model_path)

    assert result.mode == "RGBA"
    alpha = np.asarray(result.split()[-1], dtype="float32")
    height, width = alpha.shape
    center = alpha[height // 3: 2 * height // 3, width // 3: 2 * width // 3]
    corners = np.concatenate([
        alpha[:24, :24].ravel(), alpha[:24, -24:].ravel(),
        alpha[-24:, :24].ravel(), alpha[-24:, -24:].ravel(),
    ])
    assert float(center.mean()) > 150.0, "subject region should be kept"
    assert float(corners.mean()) < 80.0, "background corners should be removed"
    # The RGB pixels themselves stay untouched - only alpha changes.
    np.testing.assert_array_equal(
        np.asarray(subject), np.asarray(result.convert("RGB")))


def test_upscale_beats_the_lanczos_baseline(generated_images):
    from PIL import Image
    from edit_tools.upscale import upscale

    model_path = _require("edit-realesrgan-x4plus")
    subject = generated_images["subject"]
    result = upscale(subject, 4, model_path=model_path)

    assert result.size == (subject.width * 4, subject.height * 4)
    baseline = subject.resize(result.size, Image.Resampling.LANCZOS)
    assert _laplacian_variance(result) > _laplacian_variance(baseline), (
        "Real-ESRGAN output must be measurably sharper than a plain LANCZOS resize"
    )


def test_upscale_two_x_returns_exact_dimensions(generated_images):
    from edit_tools.upscale import upscale

    model_path = _require("edit-realesrgan-x4plus")
    subject = generated_images["subject"]
    result = upscale(subject, 2, model_path=model_path)
    assert result.size == (subject.width * 2, subject.height * 2)


def test_face_restore_detects_and_changes_a_real_face(generated_images):
    import numpy as np
    from edit_tools.faces import restore_faces

    gfpgan = _require("edit-gfpgan-v14")
    detection = _require("edit-face-detection")
    parsing = _require("edit-face-parsing")
    portrait = generated_images["portrait"]

    result, faces = restore_faces(
        portrait, 80,
        gfpgan_path=gfpgan, detection_path=detection, parsing_path=parsing)

    assert faces >= 1, "RetinaFace must find the generated portrait's face"
    diff = np.abs(
        np.asarray(result, dtype="int16")
        - np.asarray(portrait.convert("RGB"), dtype="int16"))
    assert float(diff.mean()) > 0.5, "restoration must measurably change the face"


def test_face_restore_is_honest_about_zero_faces(generated_images):
    import numpy as np
    from edit_tools.faces import restore_faces

    gfpgan = _require("edit-gfpgan-v14")
    detection = _require("edit-face-detection")
    parsing = _require("edit-face-parsing")
    subject = generated_images["subject"]

    result, faces = restore_faces(
        subject, 80,
        gfpgan_path=gfpgan, detection_path=detection, parsing_path=parsing)

    assert faces == 0, "an apple is not a face"
    np.testing.assert_array_equal(
        np.asarray(result), np.asarray(subject.convert("RGB")))
