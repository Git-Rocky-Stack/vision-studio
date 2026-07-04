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
                 callback_on_step_end=None):
        self._calls.append({
            "prompt": prompt, "image": image, "mask_image": mask_image,
            "strength": strength, "width": width, "height": height,
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
    gen.applied_acceleration = {}

    fake = fake or _FakePipeline(calls, Image.new("RGB", (8, 8)))
    loaded = []
    monkeypatch.setattr(gen, "load_model",
                        lambda name, **k: loaded.append(name) or fake)
    monkeypatch.setattr(gen, "_configure_scheduler", lambda p, s: p)
    monkeypatch.setattr(dg, "_resolve_record",
                        lambda _id: {"base_architecture": family})
    # Derivation returns the same fake (component sharing is diffusers' job).
    monkeypatch.setattr(dg, "derive_variant", lambda base, kind: base)
    return gen, loaded


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
    gen, _ = _generator(tmp_path, calls, monkeypatch)
    result = _run(gen, tmp_path, guided=None)
    assert calls[0]["image"] is None
    assert calls[0]["width"] == 8
    assert result["guided"] is None


def test_img2img_passes_init_image_and_strength(monkeypatch, tmp_path):
    calls = []
    gen, _ = _generator(tmp_path, calls, monkeypatch)
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
    gen, _ = _generator(tmp_path, calls, monkeypatch)
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
    gen, loaded = _generator(tmp_path, calls, monkeypatch, family="flux")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    _run(gen, tmp_path, guided)
    assert loaded == ["flux-fill"]


def test_empty_mask_fails_the_job(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _ = _generator(tmp_path, calls, monkeypatch)
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
    gen, _ = _generator(tmp_path, [], monkeypatch, fake=fake, family="flux")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    result = _run(gen, tmp_path, guided)
    assert fake.calls
    assert "strength" in result["guided"]["dropped_params"]
