"""#34 PR1: variant derivation + signature-filtered kwargs. Stub CI safe."""
import types

import pytest

import guided.pipelines as gp
from guided.pipelines import derive_variant, filter_call_kwargs


class _FakeAutoPipeline:
    seen = None
    seen_kwargs = None

    @classmethod
    def from_pipe(cls, base, **kwargs):
        cls.seen = base
        cls.seen_kwargs = kwargs
        return ("derived", base)


def _fake_diffusers():
    module = types.SimpleNamespace()
    module.AutoPipelineForText2Image = type("T2I", (_FakeAutoPipeline,), {})
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


def test_derive_variant_none_requires_controlnet(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers())
    with pytest.raises(ValueError):
        derive_variant(object(), "none")


def test_derive_variant_passes_controlnet_to_from_pipe(monkeypatch):
    fake = _fake_diffusers()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "none", controlnet=["cn"]) == ("derived", base)
    assert fake.AutoPipelineForText2Image.seen is base
    assert fake.AutoPipelineForText2Image.seen_kwargs == {"controlnet": ["cn"]}
    assert derive_variant(base, "img2img", controlnet=["cn"]) == ("derived", base)
    assert fake.AutoPipelineForImage2Image.seen_kwargs == {"controlnet": ["cn"]}
    # Without a controlnet, from_pipe gets NO controlnet kwarg (PR1 behavior).
    assert derive_variant(base, "inpaint") == ("derived", base)
    assert fake.AutoPipelineForInpainting.seen_kwargs == {}


def test_controlnets_attached_loads_and_always_releases(monkeypatch):
    events = []

    class _FakeModel:
        def __init__(self, name):
            self.name = name

        def to(self, device):
            events.append(("to", self.name, device))
            return self

    class _FakeControlNetModel:
        @classmethod
        def from_pretrained(cls, model_dir, torch_dtype=None):
            events.append(("load", model_dir, torch_dtype))
            return _FakeModel(model_dir)

    fake = types.SimpleNamespace(ControlNetModel=_FakeControlNetModel)
    monkeypatch.setattr(gp, "diffusers", fake)

    with gp.controlnets_attached(["dir-a", "dir-b"], "dtype", "cpu") as models:
        assert [m.name for m in models] == ["dir-a", "dir-b"]
    assert ("load", "dir-a", "dtype") in events and ("to", "dir-b", "cpu") in events

    with pytest.raises(RuntimeError):
        with gp.controlnets_attached(["dir-a"], "dtype", "cpu"):
            raise RuntimeError("boom")
    # No assertion on empty_cache (torch may be absent) - the contract is that
    # the manager exits cleanly and clears its model list either way.


def test_controlnets_attached_without_diffusers_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", None)
    with pytest.raises(RuntimeError):
        with gp.controlnets_attached(["dir-a"], None, "cpu"):
            pass


# -- #34 PR3: loader-specific model classes + explicit variant classes ---------

def _fake_diffusers_pr3():
    module = _fake_diffusers()

    class _FakeLoaderModel:
        loads = []

        def __init__(self, model_dir):
            self.model_dir = model_dir

        @classmethod
        def from_pretrained(cls, model_dir, torch_dtype=None):
            cls.loads.append((cls.__name__, model_dir, torch_dtype))
            return cls(model_dir)

        def to(self, device):
            return self

    for name in ("ControlNetModel", "ControlNetUnionModel",
                 "FluxControlNetModel", "SD3ControlNetModel"):
        setattr(module, name, type(name, (_FakeLoaderModel,), {"loads": []}))

    class _FakeExplicitPipeline:
        seen = None
        seen_kwargs = None

        @classmethod
        def from_pipe(cls, base, **kwargs):
            cls.seen = base
            cls.seen_kwargs = kwargs
            return (cls.__name__, base)

    for name in ("StableDiffusionXLControlNetUnionPipeline",
                 "StableDiffusionXLControlNetUnionImg2ImgPipeline",
                 "StableDiffusionXLControlNetUnionInpaintPipeline",
                 "FluxControlNetPipeline", "FluxControlNetImg2ImgPipeline",
                 "StableDiffusion3ControlNetPipeline"):
        setattr(module, name, type(name, (_FakeExplicitPipeline,), {}))

    module.FluxMultiControlNetModel = lambda models: ("flux-multi", list(models))
    module.SD3MultiControlNetModel = lambda models: ("sd3-multi", list(models))
    return module


def test_controlnets_attached_uses_loader_class(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    with gp.controlnets_attached(["dir-u"], "dtype", "cpu", loader="controlnet-union") as models:
        assert models[0].model_dir == "dir-u"
    assert fake.ControlNetUnionModel.loads == [("ControlNetUnionModel", "dir-u", "dtype")]

    with gp.controlnets_attached(["dir-f"], "dtype", "cpu", loader="flux-controlnet"):
        pass
    assert fake.FluxControlNetModel.loads == [("FluxControlNetModel", "dir-f", "dtype")]

    with gp.controlnets_attached(["dir-s"], "dtype", "cpu", loader="sd3-controlnet"):
        pass
    assert fake.SD3ControlNetModel.loads == [("SD3ControlNetModel", "dir-s", "dtype")]


def test_controlnets_attached_unknown_loader_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers_pr3())
    with pytest.raises(ValueError):
        with gp.controlnets_attached(["d"], None, "cpu", loader="nope"):
            pass


def test_derive_variant_explicit_classes_per_loader(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()

    assert derive_variant(base, "none", controlnet="u", loader="controlnet-union") == \
        ("StableDiffusionXLControlNetUnionPipeline", base)
    assert fake.StableDiffusionXLControlNetUnionPipeline.seen_kwargs == {"controlnet": "u"}
    assert derive_variant(base, "img2img", controlnet="u", loader="controlnet-union") == \
        ("StableDiffusionXLControlNetUnionImg2ImgPipeline", base)
    assert derive_variant(base, "inpaint", controlnet="u", loader="controlnet-union") == \
        ("StableDiffusionXLControlNetUnionInpaintPipeline", base)
    assert derive_variant(base, "none", controlnet="f", loader="flux-controlnet") == \
        ("FluxControlNetPipeline", base)
    assert derive_variant(base, "img2img", controlnet="f", loader="flux-controlnet") == \
        ("FluxControlNetImg2ImgPipeline", base)
    assert derive_variant(base, "none", controlnet="s", loader="sd3-controlnet") == \
        ("StableDiffusion3ControlNetPipeline", base)


def test_derive_variant_unshipped_combo_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers_pr3())
    # The registry declines these earlier; derive_variant is the backstop.
    with pytest.raises(ValueError):
        derive_variant(object(), "inpaint", controlnet="f", loader="flux-controlnet")
    with pytest.raises(ValueError):
        derive_variant(object(), "img2img", controlnet="s", loader="sd3-controlnet")


def test_derive_variant_dedicated_loader_keeps_auto_path(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "none", controlnet=["cn"], loader="controlnet") == ("derived", base)
    assert fake.AutoPipelineForText2Image.seen_kwargs == {"controlnet": ["cn"]}


def test_combine_controlnets_shapes_by_loader(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    assert gp.combine_controlnets(["a", "b"], "controlnet") == ["a", "b"]
    assert gp.combine_controlnets(["u"], "controlnet-union") == "u"
    assert gp.combine_controlnets(["f"], "flux-controlnet") == ("flux-multi", ["f"])
    assert gp.combine_controlnets(["s1", "s2"], "sd3-controlnet") == ("sd3-multi", ["s1", "s2"])
