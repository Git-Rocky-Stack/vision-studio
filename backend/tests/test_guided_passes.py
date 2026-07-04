"""#34 PR1: guided-pass resolution + honesty-rail validation. Pure - stub CI safe."""
import pytest

from guided.passes import GuidedValidationError, resolve_guided_pass

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}], "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}


def test_no_guided_fields_resolves_none():
    plan = resolve_guided_pass([], [], None, 0.75)
    assert plan.kind == "none"
    assert plan.notices == []


def test_controlnet_layers_are_declined_until_pr2():
    layer = {"layer_id": "c1", "source_path": "x.png", "preprocessor": "canny", "mask": MASK}
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([layer], [], None, 0.75)
    assert "ControlNet" in str(ctx.value)


def test_single_reference_resolves_img2img_with_mask_notice():
    ref = {"layer_id": "r1", "source_path": "ref.png", "mask": MASK, "strength": 1.0}
    plan = resolve_guided_pass([], [ref], None, 0.6)
    assert plan.kind == "img2img"
    assert plan.image_path == "ref.png"
    assert plan.strength == 0.6
    assert any("mask" in n.lower() for n in plan.notices)


def test_multiple_references_are_declined_until_pr4():
    refs = [
        {"layer_id": "r1", "source_path": "a.png", "mask": MASK},
        {"layer_id": "r2", "source_path": "b.png", "mask": MASK},
    ]
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([], refs, None, 0.75)
    assert "reference" in str(ctx.value).lower()


def test_inpaint_resolves_with_prompt_overrides():
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK,
               "prompt": "a red door", "negative_prompt": "blurry"}
    plan = resolve_guided_pass([], [], inpaint, 0.9)
    assert plan.kind == "inpaint"
    assert plan.image_path == "base.png"
    assert plan.mask == MASK
    assert plan.strength == 0.9
    assert plan.prompt_override == "a red door"
    assert plan.negative_prompt_override == "blurry"


def test_inpaint_blank_prompt_override_is_none():
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK, "prompt": "  "}
    plan = resolve_guided_pass([], [], inpaint, 0.75)
    assert plan.prompt_override is None


def test_inpaint_plus_reference_is_declined():
    ref = {"layer_id": "r1", "source_path": "ref.png", "mask": MASK}
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK}
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass([], [ref], inpaint, 0.75)


def test_error_messages_never_contain_paths():
    refs = [
        {"layer_id": "r1", "source_path": "C:/secret/a.png", "mask": MASK},
        {"layer_id": "r2", "source_path": "C:/secret/b.png", "mask": MASK},
    ]
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([], refs, None, 0.75)
    assert "secret" not in str(ctx.value)
