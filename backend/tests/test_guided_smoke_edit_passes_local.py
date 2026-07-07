"""#34 PR2 acceptance: real Edit-page guided-pass smokes (VS_REAL_SMOKE=1 only).

Requires torch + diffusers and the sd-1-5 record under VS_MODELS_DIR (the
background-replace smoke additionally needs edit-u2net + onnxruntime).
Generates a source scene, then runs the two new pre-step passes through the
real inpaint pipeline - the maintainer gate for AI Expand and Background
Replacement.
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

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(
    not (RUN and HAS_DEPS), reason="set VS_REAL_SMOKE=1 with the full backend to run"
)

MODELS_DIR = os.environ.get("VS_MODELS_DIR", "models")


def test_outpaint_expands_a_real_image():
    import numpy as np
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")

    import utils.direct_generator as dg

    output_dir = tempfile.mkdtemp()
    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=output_dir)
    prompt = "a wide green meadow under a blue sky, distant horizon"

    source = asyncio.run(generator.generate_image(
        job_id="outpaint-smoke-src", prompt=prompt,
        width=384, height=384, steps=6, cfg_scale=7.0, seed=99,
        model_name="sd-1-5", scheduler="Euler a",
    ))
    source_path = os.path.join(
        output_dir, source["images"][0].split("/outputs/")[-1])

    expanded = asyncio.run(generator.generate_image(
        job_id="outpaint-smoke-run", prompt=prompt,
        width=512, height=384, steps=6, cfg_scale=7.0, seed=100,
        model_name="sd-1-5", scheduler="Euler a",
        guided={
            "outpaint": {"image_path": source_path,
                         "directions": ["right"], "pixels": 128},
            "denoising_strength": 1.0,
        },
    ))
    assert expanded["guided"]["pass"] == "outpaint"
    out = Image.open(os.path.join(
        output_dir, expanded["images"][0].split("/outputs/")[-1]))
    assert out.size == (512, 384)
    # The expanded band must carry real generated content, not a flat fill.
    band = np.asarray(out.convert("L"), dtype="float32")[:, 384:]
    assert float(band.var()) > 1.0


def test_background_replace_repaints_behind_a_real_subject():
    import numpy as np
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")
    if not os.path.isfile(os.path.join(
            MODELS_DIR, "edit-model", "edit-u2net", "edit-u2net.onnx")):
        pytest.skip("install 'edit-u2net' from the Foundry to run this smoke")
    try:
        import onnxruntime  # noqa: F401
    except Exception:
        pytest.skip("onnxruntime missing")

    import utils.direct_generator as dg

    output_dir = tempfile.mkdtemp()
    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=output_dir)

    source = asyncio.run(generator.generate_image(
        job_id="bgreplace-smoke-src",
        prompt=("product photo of a single red apple centered on a plain "
                "white table, white background, studio lighting"),
        width=384, height=384, steps=6, cfg_scale=7.0, seed=4321,
        model_name="sd-1-5", scheduler="Euler a",
    ))
    source_path = os.path.join(
        output_dir, source["images"][0].split("/outputs/")[-1])
    source_image = Image.open(source_path).convert("RGB")

    replaced = asyncio.run(generator.generate_image(
        job_id="bgreplace-smoke-run",
        prompt="a sandy beach at sunset, ocean waves in the distance",
        width=384, height=384, steps=6, cfg_scale=7.0, seed=4322,
        model_name="sd-1-5", scheduler="Euler a",
        guided={
            "background_replace": {"image_path": source_path},
            "denoising_strength": 1.0,
        },
    ))
    assert replaced["guided"]["pass"] == "background-replace"
    out = Image.open(os.path.join(
        output_dir, replaced["images"][0].split("/outputs/")[-1])).convert("RGB")
    assert out.size == source_image.size
    diff = np.abs(
        np.asarray(out, dtype="int16") - np.asarray(source_image, dtype="int16"))
    height, width = diff.shape[:2]
    center = diff[height // 3: 2 * height // 3, width // 3: 2 * width // 3]
    corners = np.concatenate([
        diff[:32, :32].ravel(), diff[:32, -32:].ravel(),
        diff[-32:, :32].ravel(), diff[-32:, -32:].ravel(),
    ])
    assert float(corners.mean()) > 10.0, "the background must actually change"
    assert float(center.mean()) < float(corners.mean()), (
        "the subject region must change less than the repainted background")
