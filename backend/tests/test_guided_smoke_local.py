"""#34 PR1 acceptance smoke: a real inpaint pass edits ONLY the masked region.

Runs ONLY when VS_REAL_SMOKE=1 (real model download/VRAM) - skipped on CI and
in normal local runs. Maintainer gate before merging PR1.
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


def test_inpaint_changes_masked_region_only(tmp_path):
    import numpy as np
    from PIL import Image

    from guided.masks import rasterize_mask
    from guided.pipelines import derive_variant, filter_call_kwargs
    from utils.direct_generator import DirectGenerator

    gen = DirectGenerator(
        models_dir=os.environ.get("VS_MODELS_DIR", "models"),
        output_dir=str(tmp_path),
    )
    base = Image.new("RGB", (512, 512), (40, 90, 40))
    mask = {"type": "rectangle", "points": [{"x": 128, "y": 128}],
            "bounds": {"x": 128, "y": 128, "width": 256, "height": 256},
            "brush_size": None}

    pipeline = gen.load_model("sd-1.5")
    variant = derive_variant(pipeline, "inpaint")
    kwargs, _ = filter_call_kwargs(variant, {
        "prompt": "a bright red metal door, photo",
        "image": base,
        "mask_image": rasterize_mask(mask, 512, 512),
        "strength": 1.0,
        "num_inference_steps": 12,
        "guidance_scale": 7.5,
    })
    result = variant(**kwargs).images[0]

    before = np.asarray(base, dtype=np.int32)
    after = np.asarray(result.resize(base.size), dtype=np.int32)
    diff = np.abs(after - before).sum(axis=2)
    inside = diff[160:352, 160:352].mean()
    outside_strip = diff[:96, :].mean()
    assert inside > 30, "masked region did not change - inpaint is not real"
    assert inside > outside_strip * 2, "edit leaked far outside the mask"
