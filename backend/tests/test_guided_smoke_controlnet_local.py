"""#34 PR2 acceptance smoke: a canny ControlNet layer measurably constrains
SD 1.5 output. Runs ONLY with VS_REAL_SMOKE=1, the full backend, and the
controlnet-canny-sd15 record installed. Maintainer gate before merging PR2.
"""
import os

import pytest

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


def test_canny_controlnet_constrains_sd15_output(tmp_path):
    import cv2
    import numpy as np
    from PIL import Image

    from utils.direct_generator import DirectGenerator

    cn_dir = os.path.join(MODELS_DIR, "controlnet", "controlnet-canny-sd15")
    if not os.path.isdir(cn_dir):
        pytest.skip("install controlnet-canny-sd15 from the Foundry to run this smoke")

    # A high-contrast circle: its canny edges are the control signal.
    array = np.zeros((512, 512, 3), dtype=np.uint8)
    cv2.circle(array, (256, 256), 140, (255, 255, 255), -1)
    source_path = str(tmp_path / "circle.png")
    Image.fromarray(array).save(source_path)

    layer = {"layer_id": "c1", "layer_name": "Circle", "source_path": source_path,
             "preprocessor": "canny", "strength": 1.0, "start_step": 0.0, "end_step": 1.0,
             "mask": {"type": "rectangle", "points": [{"x": 0, "y": 0}],
                      "bounds": {"x": 0, "y": 0, "width": 512, "height": 512}},
             "prompt": None, "negative_prompt": None}
    guided = {"controlnet": [layer], "reference_images": [], "inpaint": None,
              "denoising_strength": 0.75}

    def run(out_name, guided_payload):
        out_dir = tmp_path / out_name
        out_dir.mkdir()
        gen = DirectGenerator(models_dir=MODELS_DIR, output_dir=str(out_dir))
        result = gen._generate_sync(
            "a stained glass window", "", 512, 512, 12, 7.5, 7, "sd-1-5", "euler",
            lambda *a: None, str(out_dir), None, None, guided_payload,
        )
        return np.asarray(Image.open(out_dir / "generated.png"), dtype=np.int32), result

    guided_image, result = run("guided", guided)
    plain_image, _ = run("plain", None)

    assert result["guided"]["controlnet"][0]["record_id"] == "controlnet-canny-sd15"
    diff = np.abs(guided_image - plain_image).mean()
    assert diff > 10, "the control layer did not change the output - ControlNet is not real"

    control_edges = cv2.Canny(array[:, :, 0], 100, 200) > 0
    guided_edges = cv2.Canny(guided_image.astype(np.uint8)[:, :, 0], 100, 200) > 0
    plain_edges = cv2.Canny(plain_image.astype(np.uint8)[:, :, 0], 100, 200) > 0
    guided_overlap = (guided_edges & control_edges).sum() / max(control_edges.sum(), 1)
    plain_overlap = (plain_edges & control_edges).sum() / max(control_edges.sum(), 1)
    assert guided_overlap > plain_overlap, "output edges do not follow the control map"


# -- #34 PR3: per-family smokes (each self-skips until its weights are
# installed through the Foundry consent flow) ----------------------------------

def _circle_layer(tmp_path, preprocessor="canny", size=512):
    import cv2
    import numpy as np
    from PIL import Image

    array = np.zeros((size, size, 3), dtype=np.uint8)
    cv2.circle(array, (size // 2, size // 2), int(size * 0.27), (255, 255, 255), -1)
    source_path = str(tmp_path / f"circle-{preprocessor}.png")
    Image.fromarray(array).save(source_path)
    return array, {
        "layer_id": "c1", "layer_name": "Circle", "source_path": source_path,
        "preprocessor": preprocessor, "strength": 1.0, "start_step": 0.0, "end_step": 1.0,
        "mask": {"type": "rectangle", "points": [{"x": 0, "y": 0}],
                 "bounds": {"x": 0, "y": 0, "width": size, "height": size}},
        "prompt": None, "negative_prompt": None,
    }


def _smoke(tmp_path, model_name, cn_record_id, base_dirs, preprocessor="canny",
           size=512, steps=8):
    import numpy as np
    from PIL import Image

    from utils.direct_generator import DirectGenerator

    for required in [os.path.join(MODELS_DIR, "controlnet", cn_record_id)] + base_dirs:
        if not os.path.exists(required):
            pytest.skip(f"install {os.path.basename(required)} from the Foundry to run this smoke")

    array, layer = _circle_layer(tmp_path, preprocessor, size)
    guided = {"controlnet": [layer], "reference_images": [], "inpaint": None,
              "denoising_strength": 0.75}

    def run(out_name, guided_payload):
        out_dir = tmp_path / out_name
        out_dir.mkdir()
        gen = DirectGenerator(models_dir=MODELS_DIR, output_dir=str(out_dir))
        result = gen._generate_sync(
            "a stained glass window", "", size, size, steps, 7.5, 7, model_name,
            "euler", lambda *a: None, str(out_dir), None, None, guided_payload,
        )
        return np.asarray(Image.open(out_dir / "generated.png"), dtype=np.int32), result

    guided_image, result = run("guided", guided)
    plain_image, _ = run("plain", None)
    assert result["guided"]["controlnet"][0]["record_id"] == cn_record_id
    diff = np.abs(guided_image - plain_image).mean()
    assert diff > 10, "the control layer did not change the output - ControlNet is not real"
    return array, guided_image


def test_sdxl_union_scribble_constrains_output(tmp_path):
    _smoke(tmp_path, "sdxl-base", "controlnet-union-sdxl",
           [os.path.join(MODELS_DIR, "checkpoints")], preprocessor="scribble",
           size=1024, steps=8)


def test_flux_union_canny_constrains_output(tmp_path):
    _smoke(tmp_path, "flux-dev", "controlnet-union-flux",
           [os.path.join(MODELS_DIR, "checkpoints")], preprocessor="canny",
           size=512, steps=4)


def test_sd35_large_canny_constrains_output(tmp_path):
    _smoke(tmp_path, "sd3.5-large", "controlnet-canny-sd35",
           [os.path.join(MODELS_DIR, "diffusers", "sd3.5-large")], preprocessor="canny",
           size=512, steps=8)
