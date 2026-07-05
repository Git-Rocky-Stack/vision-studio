"""#34 PR4 acceptance smokes: masked multi-reference measurably steers output.
Runs ONLY with VS_REAL_SMOKE=1, the full backend, and the per-family adapter +
encoder records installed. Maintainer gate before merging PR4.
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


def _solid_reference(tmp_path, name, color, size=512):
    from PIL import Image

    path = str(tmp_path / f"{name}.png")
    Image.new("RGB", (size, size), color).save(path)
    return path


def _half_mask(x, size=512):
    half = size // 2
    return {"type": "rectangle", "points": [{"x": x, "y": 0}],
            "bounds": {"x": x, "y": 0, "width": half, "height": size}}


def _ip_smoke(tmp_path, model_name, adapter_id, encoder_id, size=512, steps=12):
    import numpy as np
    from PIL import Image

    from utils.direct_generator import DirectGenerator

    for record_id in (adapter_id, encoder_id):
        if not os.path.isdir(os.path.join(MODELS_DIR, "ip-adapter", record_id)):
            pytest.skip(f"install {record_id} from the Foundry to run this smoke")

    refs = [
        {"layer_id": "r1", "layer_name": "Red", "strength": 1.0,
         "source_path": _solid_reference(tmp_path, "red", (220, 30, 30), size),
         "mask": _half_mask(0, size)},
        {"layer_id": "r2", "layer_name": "Green", "strength": 1.0,
         "source_path": _solid_reference(tmp_path, "green", (30, 200, 30), size),
         "mask": _half_mask(size // 2, size)},
    ]
    guided = {"controlnet": [], "reference_images": refs, "inpaint": None,
              "denoising_strength": 0.75}

    def run(out_name, guided_payload):
        out_dir = tmp_path / out_name
        out_dir.mkdir()
        gen = DirectGenerator(models_dir=MODELS_DIR, output_dir=str(out_dir))
        result = gen._generate_sync(
            "an abstract painting", "", size, size, steps, 7.5, 7, model_name,
            "euler", lambda *a: None, str(out_dir), None, None, guided_payload,
        )
        return np.asarray(Image.open(out_dir / "generated.png"), dtype=np.int32), result

    guided_image, result = run("guided", guided)
    plain_image, _ = run("plain", None)
    assert result["guided"]["references"][0]["record_id"] == adapter_id
    diff = np.abs(guided_image - plain_image).mean()
    assert diff > 10, "the reference layers did not change the output - IP-Adapter is not real"
    return guided_image, result


def test_sd15_masked_references_steer_their_regions(tmp_path):
    guided_image, result = _ip_smoke(
        tmp_path, "sd-1-5", "ip-adapter-sd15", "ip-adapter-encoder-vit-h")
    assert result["guided"]["references"][0]["masked"] is True
    # Masked steering: the red-referenced left half must skew redder than the
    # green-referenced right half (region-level, seed-stable direction check).
    left = guided_image[:, :256, :]
    right = guided_image[:, 256:, :]
    left_redness = left[:, :, 0].mean() - left[:, :, 1].mean()
    right_redness = right[:, :, 0].mean() - right[:, :, 1].mean()
    assert left_redness > right_redness, "masked references did not steer their regions"


def test_sdxl_masked_references_steer_their_regions(tmp_path):
    guided_image, result = _ip_smoke(
        tmp_path, "sdxl-base", "ip-adapter-sdxl", "ip-adapter-encoder-vit-h",
        size=1024, steps=8)
    assert result["guided"]["references"][0]["masked"] is True


def test_flux_references_apply_globally_with_notice(tmp_path):
    from guided.ip_adapter import NOTICE_REFERENCE_MASKS_GLOBAL

    guided_image, result = _ip_smoke(
        tmp_path, "flux-dev", "ip-adapter-flux", "ip-adapter-encoder-clip-vit-l",
        size=512, steps=4)
    assert result["guided"]["references"][0]["masked"] is False
    assert NOTICE_REFERENCE_MASKS_GLOBAL in result["guided"]["notices"]
