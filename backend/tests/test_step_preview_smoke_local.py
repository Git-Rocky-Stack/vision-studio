"""#33 local acceptance smoke: a real SD1.5 run produces decoded step frames.

Runs ONLY with VS_REAL_SMOKE=1, the full backend, the locally installed
sd-1-5 weights, and fetched preview decoders. Maintainer gate for #33.
"""
import asyncio
import base64
import io
import os
import pathlib
import sys

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
DECODERS_DIR = str(BACKEND_ROOT.parent / "resources" / "preview-decoders")


def test_sd15_run_streams_decoded_step_frames(tmp_path, monkeypatch):
    import numpy as np
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")
    if not os.path.isfile(os.path.join(
            DECODERS_DIR, "taesd", "diffusion_pytorch_model.safetensors")):
        pytest.skip("run scripts/fetch-preview-decoders.cjs to run this smoke")

    monkeypatch.setenv("VISION_STUDIO_PREVIEW_DECODERS_DIR", DECODERS_DIR)

    import preview.decoders as decoders
    import utils.direct_generator as dg
    from preview.step_preview import StepPreviewService

    decoders._clear_decoder_cache()
    service = StepPreviewService()
    monkeypatch.setattr(dg, "step_preview_service", service)

    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=str(tmp_path))
    result = asyncio.run(generator.generate_image(
        job_id="preview-smoke",
        prompt="a red apple on a white table, studio photo",
        width=256, height=256, steps=4, cfg_scale=7.0, seed=1234,
        model_name="sd-1-5", scheduler="Euler a",
    ))
    assert result["images"], "the run itself must produce an image"

    latest = service.latest("preview-smoke")
    assert latest is not None, "no step frame was decoded during the run"
    assert latest.step == 4 and latest.total_steps == 4
    assert latest.revision >= 2, "throttle should still allow multiple CPU-step decodes"

    prefix = "data:image/jpeg;base64,"
    assert latest.image.startswith(prefix)
    frame = Image.open(io.BytesIO(base64.b64decode(latest.image[len(prefix):])))
    assert max(frame.size) <= 512
    pixels = np.asarray(frame, dtype="float32")
    assert float(pixels.std()) > 5.0, "decoded frame is degenerate (flat image)"
