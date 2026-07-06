"""#34: guided-pass resolution + honesty-rail validation. Pure - stub CI safe."""
import pytest

from guided.passes import GuidedValidationError, resolve_guided_pass

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}], "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}

CN_LAYER = {"layer_id": "c1", "layer_name": "Edges", "source_path": "s.png",
            "preprocessor": "canny", "strength": 1.0, "start_step": 0.0,
            "end_step": 1.0, "mask": MASK, "prompt": None, "negative_prompt": None}


def test_no_guided_fields_resolves_none():
    plan = resolve_guided_pass([], [], None, 0.75)
    assert plan.kind == "none"
    assert plan.notices == []
    assert plan.controlnet == []


def test_controlnet_layers_thread_into_the_plan():
    plan = resolve_guided_pass([dict(CN_LAYER)], [], None, 0.75)
    assert plan.kind == "none"
    assert plan.controlnet == [CN_LAYER]
    assert plan.notices == []


def test_controlnet_composes_with_inpaint():
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK,
               "prompt": None, "negative_prompt": None}
    plan = resolve_guided_pass([dict(CN_LAYER)], [], inpaint, 0.6)
    assert plan.kind == "inpaint"
    assert plan.controlnet == [CN_LAYER]


def test_controlnet_layer_prompt_gets_an_ignored_notice():
    from guided.passes import NOTICE_CONTROLNET_PROMPT_IGNORED

    plan = resolve_guided_pass([dict(CN_LAYER, prompt="  regional  ")], [], None, 0.75)
    assert NOTICE_CONTROLNET_PROMPT_IGNORED in plan.notices


def test_single_reference_resolves_img2img_with_mask_notice():
    ref = {"layer_id": "r1", "source_path": "ref.png", "mask": MASK, "strength": 1.0}
    plan = resolve_guided_pass([], [ref], None, 0.6)
    assert plan.kind == "img2img"
    assert plan.image_path == "ref.png"
    assert plan.strength == 0.6
    assert any("mask" in n.lower() for n in plan.notices)


def test_two_references_resolve_to_ip_adapter_plan():
    refs = [
        {"layer_id": "r1", "source_path": "a.png", "mask": MASK, "strength": 1.2},
        {"layer_id": "r2", "source_path": "b.png", "mask": MASK, "strength": 0.8},
    ]
    plan = resolve_guided_pass([], refs, None, 0.75)
    assert plan.kind == "none"
    assert plan.image_path is None
    assert [ref["layer_id"] for ref in plan.ip_references] == ["r1", "r2"]
    assert plan.ip_references[0]["strength"] == 1.2


def test_single_reference_notice_points_at_the_multi_reference_path():
    from guided.passes import NOTICE_REFERENCE_MASK_IGNORED

    ref = {"layer_id": "r1", "source_path": "ref.png", "mask": MASK}
    plan = resolve_guided_pass([], [ref], None, 0.6)
    assert plan.ip_references == []
    assert NOTICE_REFERENCE_MASK_IGNORED in plan.notices
    assert "second visible reference layer" in NOTICE_REFERENCE_MASK_IGNORED


def test_multi_reference_composes_with_controlnet_layers():
    refs = [
        {"layer_id": "r1", "source_path": "a.png", "mask": MASK},
        {"layer_id": "r2", "source_path": "b.png", "mask": MASK},
    ]
    plan = resolve_guided_pass([dict(CN_LAYER)], refs, None, 0.75)
    assert plan.kind == "none"
    assert plan.controlnet == [CN_LAYER]
    assert len(plan.ip_references) == 2


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
    ref = {"layer_id": "r1", "source_path": "C:/secret/a.png", "mask": MASK}
    inpaint = {"layer_id": "i1", "image_path": "C:/secret/base.png", "mask": MASK}
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([], [ref], inpaint, 0.75)
    assert "secret" not in str(ctx.value)


OUTPAINT = {"image_path": "base.png", "directions": ["right", "up"], "pixels": 128}


def test_outpaint_resolves_to_an_inpaint_plan_with_pre_step():
    plan = resolve_guided_pass(None, None, None, 1.0,
                               outpaint=dict(OUTPAINT, prompt="more sky"))
    assert plan.kind == "inpaint"
    assert plan.image_path == "base.png"
    assert plan.mask is None
    assert plan.outpaint == {"directions": ["right", "up"], "pixels": 128}
    assert plan.prompt_override == "more sky"
    assert plan.strength == 1.0


def test_outpaint_plus_inpaint_is_refused():
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, None,
            {"image_path": "b.png", "mask": {"type": "brush", "points": []}},
            0.8, outpaint=dict(OUTPAINT))


def test_outpaint_plus_reference_is_refused():
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, [{"layer_id": "r1", "source_path": "r.png"}], None,
            0.8, outpaint=dict(OUTPAINT))


def test_outpaint_direction_and_pixel_validation():
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(None, None, None, 1.0,
                            outpaint=dict(OUTPAINT, directions=["diagonal"]))
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(None, None, None, 1.0,
                            outpaint=dict(OUTPAINT, directions=[]))
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(None, None, None, 1.0,
                            outpaint=dict(OUTPAINT, pixels=0))


def test_no_outpaint_leaves_existing_plans_unchanged():
    plan = resolve_guided_pass(None, None, None, 0.75)
    assert plan.kind == "none"
    assert plan.outpaint is None
    assert plan.background_replace is False


def test_background_replace_resolves_to_an_inpaint_plan():
    plan = resolve_guided_pass(
        None, None, None, 1.0,
        background_replace={"image_path": "base.png"})
    assert plan.kind == "inpaint"
    assert plan.image_path == "base.png"
    assert plan.mask is None
    assert plan.background_replace is True
    assert plan.outpaint is None


def test_background_replace_conflicts_are_refused():
    bg = {"image_path": "base.png"}
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, None,
            {"image_path": "b.png", "mask": {"type": "brush", "points": []}},
            1.0, background_replace=bg)
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, [{"layer_id": "r1", "source_path": "r.png"}], None,
            1.0, background_replace=bg)
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, None, None, 1.0, outpaint=dict(OUTPAINT),
            background_replace=bg)
