"""#34 PR1: guided branch in _generate_sync - img2img/inpaint via fake pipelines.
Mirrors test_direct_generator_loras.py (skips without torch+diffusers)."""
import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}],
        "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}, "brush_size": None}


class _FakePipeline:
    """Records call kwargs; returns a real PIL image. Accepts guided kwargs."""

    def __init__(self, calls, image):
        self._calls = calls
        self._image = image

    def __call__(self, prompt=None, negative_prompt=None, image=None,
                 mask_image=None, strength=0.75, width=None, height=None,
                 num_inference_steps=25, guidance_scale=7.5, generator=None,
                 callback_on_step_end=None, control_image=None,
                 controlnet_conditioning_scale=None,
                 control_guidance_start=None, control_guidance_end=None,
                 control_mode=None):
        self._calls.append({
            "prompt": prompt, "image": image, "mask_image": mask_image,
            "strength": strength, "width": width, "height": height,
            "control_image": control_image,
            "controlnet_conditioning_scale": controlnet_conditioning_scale,
            "control_guidance_start": control_guidance_start,
            "control_guidance_end": control_guidance_end,
            "control_mode": control_mode,
        })

        class _Out:
            pass

        out = _Out()
        out.images = [self._image]
        return out


def _generator(tmp_path, calls, monkeypatch, fake=None, family="sd15"):
    from PIL import Image
    from utils import direct_generator as dg

    gen = dg.DirectGenerator.__new__(dg.DirectGenerator)
    gen.device = "cpu"
    gen.output_dir = str(tmp_path)
    gen.models_dir = str(tmp_path)
    gen.applied_acceleration = {}

    fake = fake or _FakePipeline(calls, Image.new("RGB", (8, 8)))
    loaded = []
    monkeypatch.setattr(gen, "load_model",
                        lambda name, **k: loaded.append(name) or fake)
    monkeypatch.setattr(gen, "_configure_scheduler", lambda p, s: p)
    monkeypatch.setattr(dg, "_resolve_record",
                        lambda _id: {"base_architecture": family, "status": "ready",
                                     "id": _id, "name": _id})
    # Derivation returns the same fake (component sharing is diffusers' job).
    derived = []
    monkeypatch.setattr(
        dg, "derive_variant",
        lambda base, kind, controlnet=None, loader="controlnet":
            derived.append({"kind": kind, "controlnet": controlnet,
                            "loader": loader}) or base)
    monkeypatch.setattr(
        dg, "combine_controlnets",
        lambda models, loader: {"combined": list(models), "loader": loader})
    # Real preprocessing is covered by test_guided_preprocessors + the local
    # smoke; unit tests thread shapes, not pixels.
    from PIL import Image as _PILImage
    monkeypatch.setattr(
        dg, "produce_control_image",
        lambda layer, width, height, annotators_dir:
            _PILImage.new("RGB", (width, height)))

    attached = []

    class _FakeAttached:
        def __init__(self, dirs, dtype, device):
            attached.append({"dirs": list(dirs), "dtype": dtype,
                             "device": device, "released": False})
            self._entry = attached[-1]

        def __enter__(self):
            return ["cn-model"] * len(self._entry["dirs"])

        def __exit__(self, *exc):
            self._entry["released"] = True
            return False

    monkeypatch.setattr(
        dg, "controlnets_attached",
        lambda dirs, dtype, device, loader="controlnet":
            _FakeAttached(dirs, dtype, device))
    return gen, loaded, attached, derived


def _base_image(tmp_path):
    from PIL import Image

    path = tmp_path / "base.png"
    Image.new("RGB", (16, 16), (200, 30, 30)).save(path)
    return str(path)


def _run(gen, tmp_path, guided):
    return gen._generate_sync(
        prompt="a castle", negative_prompt="", width=8, height=8, steps=1,
        cfg_scale=7.5, seed=1, model_name="sd-1.5", scheduler="euler",
        progress_callback_fn=lambda *a: None, output_dir=str(tmp_path),
        loras=None, guided=guided,
    )


def test_txt2img_unchanged_when_no_guided(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch)
    result = _run(gen, tmp_path, guided=None)
    assert calls[0]["image"] is None
    assert calls[0]["width"] == 8
    assert result["guided"] is None


def test_img2img_passes_init_image_and_strength(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch)
    guided = {"controlnet": [], "denoising_strength": 0.6, "inpaint": None,
              "reference_images": [{"layer_id": "r1", "source_path": _base_image(tmp_path),
                                    "mask": MASK, "strength": 1.0}]}
    result = _run(gen, tmp_path, guided)
    assert calls[0]["image"] is not None
    assert calls[0]["mask_image"] is None
    assert calls[0]["strength"] == 0.6
    assert result["guided"]["pass"] == "img2img"
    assert any("mask" in n.lower() for n in result["guided"]["notices"])


def test_inpaint_passes_image_and_rasterized_mask(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch)
    guided = {"controlnet": [], "denoising_strength": 0.9, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": "a red door", "negative_prompt": None}}
    result = _run(gen, tmp_path, guided)
    assert calls[0]["image"] is not None
    assert calls[0]["mask_image"] is not None
    assert calls[0]["mask_image"].size == (8, 8)
    assert calls[0]["prompt"] == "a red door"   # inpaint prompt override wins
    assert result["guided"]["pass"] == "inpaint"


def test_flux_inpaint_routes_to_flux_fill(monkeypatch, tmp_path):
    calls = []
    gen, loaded, _, _ = _generator(tmp_path, calls, monkeypatch, family="flux")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    _run(gen, tmp_path, guided)
    assert loaded == ["flux-fill"]


def test_empty_mask_fails_the_job(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch)
    empty_mask = dict(MASK, type="erase")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": empty_mask, "prompt": None, "negative_prompt": None}}
    with pytest.raises(GuidedValidationError):
        _run(gen, tmp_path, guided)
    assert calls == []  # never reached the pipeline - no silent unguided output


def test_dropped_params_are_reported(monkeypatch, tmp_path):
    from PIL import Image

    class _NoStrength:
        def __init__(self, image):
            self._image = image
            self.calls = []

        def __call__(self, prompt=None, image=None, mask_image=None, width=None,
                     height=None, num_inference_steps=25, guidance_scale=7.5,
                     generator=None, callback_on_step_end=None):
            self.calls.append(True)
            out = type("O", (), {})()
            out.images = [self._image]
            return out

    fake = _NoStrength(Image.new("RGB", (8, 8)))
    gen, _, _, _ = _generator(tmp_path, [], monkeypatch, fake=fake, family="flux")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    result = _run(gen, tmp_path, guided)
    assert fake.calls
    assert "strength" in result["guided"]["dropped_params"]


# -- #34 PR2: ControlNet execution --------------------------------------------

def _cn_source(tmp_path):
    import numpy as np
    from PIL import Image

    array = np.zeros((16, 16, 3), dtype=np.uint8)
    array[4:12, 4:12] = 255
    path = tmp_path / "cn-source.png"
    Image.fromarray(array).save(path)
    return str(path)


def _cn_layer(tmp_path, **overrides):
    layer = {"layer_id": "c1", "layer_name": "Edges", "source_path": _cn_source(tmp_path),
             "preprocessor": "canny", "strength": 1.4, "start_step": 0.2,
             "end_step": 0.8, "mask": MASK, "prompt": None, "negative_prompt": None}
    layer.update(overrides)
    return layer


def _cn_model_dir(tmp_path, record_id):
    import os

    path = tmp_path / "controlnet" / record_id
    path.mkdir(parents=True)
    (path / "config.json").write_text("{}")
    return str(path)


def test_controlnet_txt2img_threads_controls_and_scales(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, derived = _generator(tmp_path, calls, monkeypatch)
    expected_dir = _cn_model_dir(tmp_path, "controlnet-canny-sd15")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert isinstance(call["image"], list) and len(call["image"]) == 1
    assert call["width"] == 8 and call["height"] == 8
    assert call["controlnet_conditioning_scale"] == [1.4]
    assert call["control_guidance_start"] == [0.2]
    assert call["control_guidance_end"] == [0.8]
    assert result["guided"]["pass"] == "none"
    assert result["guided"]["controlnet"] == [
        {"layer_id": "c1", "preprocessor": "canny",
         "record_id": "controlnet-canny-sd15", "control_mode": None},
    ]
    assert attached[0]["dirs"] == [expected_dir]
    assert attached[0]["released"] is True
    assert derived[0]["loader"] == "controlnet"
    assert derived[0]["controlnet"] == {"combined": ["cn-model"], "loader": "controlnet"}


def test_controlnet_composes_with_img2img(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch)
    _cn_model_dir(tmp_path, "controlnet-canny-sd15")
    guided = {"controlnet": [_cn_layer(tmp_path)], "denoising_strength": 0.6,
              "inpaint": None,
              "reference_images": [{"layer_id": "r1", "source_path": _base_image(tmp_path),
                                    "mask": MASK, "strength": 1.0}]}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert call["image"] is not None and not isinstance(call["image"], list)  # init image
    assert isinstance(call["control_image"], list)                            # control map
    assert call["strength"] == 0.6
    assert result["guided"]["pass"] == "img2img"


def test_controlnet_missing_model_dir_fails_before_pipeline(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch)
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    with pytest.raises(GuidedValidationError) as excinfo:
        _run(gen, tmp_path, guided)
    assert calls == []
    assert str(tmp_path) not in str(excinfo.value)  # no paths in the message


def test_controlnet_on_unknown_family_fails_loudly(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch, family="svd")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    with pytest.raises(GuidedValidationError):
        _run(gen, tmp_path, guided)
    assert calls == []


# -- #34 PR3: union / FLUX / SD3.5 execution -----------------------------------

def test_flux_union_txt2img_threads_control_modes(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, derived = _generator(tmp_path, calls, monkeypatch, family="flux")
    union_dir = _cn_model_dir(tmp_path, "controlnet-union-flux")
    guided = {"controlnet": [_cn_layer(tmp_path),
                             _cn_layer(tmp_path, layer_id="c2", strength=0.5)],
              "reference_images": [], "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    # Non-dedicated loaders take the control maps as control_image even for
    # txt2img, plus the per-condition mode list.
    assert isinstance(call["control_image"], list) and len(call["control_image"]) == 2
    assert call["image"] is None
    assert call["control_mode"] == [0, 0]                       # canny twice
    assert call["controlnet_conditioning_scale"] == [1.4, 0.5]
    # ONE shared union record -> the weights load exactly once.
    assert attached[0]["dirs"] == [union_dir]
    assert attached[0]["released"] is True
    assert derived[0]["loader"] == "flux-controlnet"
    assert result["guided"]["controlnet"][0]["record_id"] == "controlnet-union-flux"
    assert result["guided"]["controlnet"][0]["control_mode"] == 0


def test_sdxl_union_mixed_stack_shares_one_model(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, derived = _generator(tmp_path, calls, monkeypatch, family="sdxl")
    union_dir = _cn_model_dir(tmp_path, "controlnet-union-sdxl")
    guided = {"controlnet": [_cn_layer(tmp_path),
                             _cn_layer(tmp_path, layer_id="c2", preprocessor="scribble")],
              "reference_images": [], "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert call["control_mode"] == [3, 2]                       # canny=3, scribble=2
    assert attached[0]["dirs"] == [union_dir]                   # deduped: loaded once
    assert derived[0]["loader"] == "controlnet-union"
    assert len(result["guided"]["controlnet"]) == 2


def test_sd35_dedicated_stack_loads_each_record(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, _ = _generator(tmp_path, calls, monkeypatch, family="sd35")
    canny_dir = _cn_model_dir(tmp_path, "controlnet-canny-sd35")
    depth_dir = _cn_model_dir(tmp_path, "controlnet-depth-sd35")
    guided = {"controlnet": [_cn_layer(tmp_path),
                             _cn_layer(tmp_path, layer_id="c2", preprocessor="depth")],
              "reference_images": [], "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert call["control_mode"] is None                         # dedicated: no modes
    assert attached[0]["dirs"] == [canny_dir, depth_dir]
    assert result["guided"]["pass"] == "none"


def test_flux_controlnet_with_inpaint_fails_before_pipeline(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch, family="flux")
    _cn_model_dir(tmp_path, "controlnet-union-flux")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "denoising_strength": 0.75,
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    with pytest.raises(GuidedValidationError) as excinfo:
        _run(gen, tmp_path, guided)
    assert calls == []
    assert "FLUX.1 Fill" in str(excinfo.value)
