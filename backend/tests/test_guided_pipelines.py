"""#34 PR1: variant derivation + signature-filtered kwargs. Stub CI safe."""
import types

import pytest

import guided.pipelines as gp
from guided.pipelines import derive_variant, filter_call_kwargs


class _FakeAutoPipeline:
    seen = None

    @classmethod
    def from_pipe(cls, base):
        cls.seen = base
        return ("derived", base)


def _fake_diffusers():
    module = types.SimpleNamespace()
    module.AutoPipelineForImage2Image = type("A2I", (_FakeAutoPipeline,), {})
    module.AutoPipelineForInpainting = type("A2P", (_FakeAutoPipeline,), {})
    return module


def test_derive_img2img_uses_from_pipe(monkeypatch):
    fake = _fake_diffusers()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "img2img") == ("derived", base)
    assert fake.AutoPipelineForImage2Image.seen is base


def test_derive_inpaint_uses_from_pipe(monkeypatch):
    fake = _fake_diffusers()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "inpaint") == ("derived", base)
    assert fake.AutoPipelineForInpainting.seen is base


def test_derive_unknown_kind_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers())
    with pytest.raises(ValueError):
        derive_variant(object(), "controlnet")


def test_derive_without_diffusers_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", None)
    with pytest.raises(RuntimeError):
        derive_variant(object(), "img2img")


class _StrengthlessPipeline:
    def __call__(self, prompt, image, mask_image, num_inference_steps=25,
                 guidance_scale=7.5, generator=None, callback_on_step_end=None,
                 width=None, height=None):
        return None


def test_filter_call_kwargs_drops_and_reports_unsupported():
    kwargs = {
        "prompt": "x", "image": "img", "mask_image": "mask",
        "strength": 0.75, "negative_prompt": "bad",
        "num_inference_steps": 4, "guidance_scale": 7.5,
    }
    filtered, dropped = filter_call_kwargs(_StrengthlessPipeline(), kwargs)
    assert "strength" not in filtered
    assert "negative_prompt" not in filtered
    assert filtered["prompt"] == "x"
    assert sorted(dropped) == ["negative_prompt", "strength"]


def test_filter_call_kwargs_keeps_everything_supported():
    class Full:
        def __call__(self, prompt, negative_prompt=None, strength=0.8, image=None):
            return None

    filtered, dropped = filter_call_kwargs(Full(), {"prompt": "x", "strength": 0.5})
    assert filtered == {"prompt": "x", "strength": 0.5}
    assert dropped == []
