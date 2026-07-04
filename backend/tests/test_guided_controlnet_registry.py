"""#34 PR2/PR3: (family, preprocessor) -> Foundry record resolution + honest declines."""
import pytest

from guided.controlnet_registry import (
    LOADER_CONTROLNET,
    LOADER_FLUX,
    LOADER_SD3,
    LOADER_UNION_SDXL,
    SUPPORTED_FAMILIES,
    resolve_controlnet_stack,
)
from guided.passes import GuidedValidationError

LAYER = {"layer_id": "c1", "layer_name": "Edges", "source_path": "s.png",
         "preprocessor": "canny", "strength": 1.2, "start_step": 0.1,
         "end_step": 0.9, "mask": {}, "prompt": None, "negative_prompt": None}


def _ready_registry(record_id_status=None):
    statuses = record_id_status or {}

    def resolve(record_id):
        return {"id": record_id, "name": record_id,
                "status": statuses.get(record_id, "ready")}

    return resolve


def test_supported_families_cover_all_four():
    assert SUPPORTED_FAMILIES == {"sd15", "sdxl", "flux", "sd35"}


def test_empty_stack_resolves_to_empty():
    assert resolve_controlnet_stack([], "sd15", _ready_registry()) == []
    assert resolve_controlnet_stack(None, "flux", _ready_registry()) == []


def test_canny_resolves_per_family():
    sd15 = resolve_controlnet_stack([dict(LAYER)], "sd15", _ready_registry())
    sdxl = resolve_controlnet_stack([dict(LAYER)], "sdxl", _ready_registry())
    assert sd15[0].record_id == "controlnet-canny-sd15"
    assert sdxl[0].record_id == "controlnet-canny-sdxl"
    assert sd15[0].annotator_record_id is None
    assert sd15[0].layer["strength"] == 1.2
    assert sd15[0].loader == LOADER_CONTROLNET and sd15[0].control_mode is None
    assert sdxl[0].loader == LOADER_CONTROLNET and sdxl[0].control_mode is None


def test_depth_carries_its_annotator():
    resolved = resolve_controlnet_stack(
        [dict(LAYER, preprocessor="depth")], "sd15", _ready_registry())
    assert resolved[0].record_id == "controlnet-depth-sd15"
    assert resolved[0].annotator_record_id == "annotator-midas"


# -- #34 PR3: FLUX / SD3.5 / SDXL union -----------------------------------------

def test_flux_resolves_through_the_union_with_modes():
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth"),
         dict(LAYER, layer_id="c3", preprocessor="openpose")],
        "flux", _ready_registry())
    assert [item.record_id for item in resolved] == ["controlnet-union-flux"] * 3
    assert [item.control_mode for item in resolved] == [0, 2, 4]
    assert all(item.loader == LOADER_FLUX for item in resolved)
    assert resolved[1].annotator_record_id == "annotator-midas"


def test_sdxl_scribble_routes_through_the_union():
    resolved = resolve_controlnet_stack(
        [dict(LAYER, preprocessor="scribble")], "sdxl", _ready_registry())
    assert resolved[0].record_id == "controlnet-union-sdxl"
    assert resolved[0].loader == LOADER_UNION_SDXL
    assert resolved[0].control_mode == 2
    assert resolved[0].annotator_record_id is None


def test_sdxl_mixed_stack_routes_every_layer_through_the_union():
    """Dedicated + union models cannot mix in one MultiControlNet - when any
    layer needs the union, the whole stack rides it (deterministic routing)."""
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="normal")],
        "sdxl", _ready_registry())
    assert [item.record_id for item in resolved] == ["controlnet-union-sdxl"] * 2
    assert [item.control_mode for item in resolved] == [3, 4]  # canny=3, normal=4


def test_sdxl_dedicated_stack_keeps_pr2_routing():
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth")],
        "sdxl", _ready_registry())
    assert [item.record_id for item in resolved] == [
        "controlnet-canny-sdxl", "controlnet-depth-sdxl",
    ]
    assert all(item.loader == LOADER_CONTROLNET and item.control_mode is None
               for item in resolved)


def test_sd35_resolves_dedicated_records():
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth")],
        "sd35", _ready_registry())
    assert [item.record_id for item in resolved] == [
        "controlnet-canny-sd35", "controlnet-depth-sd35",
    ]
    assert all(item.loader == LOADER_SD3 and item.control_mode is None
               for item in resolved)


def test_flux_schnell_declines_with_checkpoint_reason():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "flux", _ready_registry(),
                                 model_id="flux-schnell")
    message = str(excinfo.value)
    assert "schnell" in message and "FLUX.1 [dev]" in message


def test_sd35_medium_declines_with_checkpoint_reason():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "sd35", _ready_registry(),
                                 model_id="sd3.5-medium")
    assert "SD 3.5 Large" in str(excinfo.value)


def test_flux_inpaint_composition_declines():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "flux", _ready_registry(),
                                 kind="inpaint")
    assert "FLUX.1 Fill" in str(excinfo.value)


def test_sd35_img2img_and_inpaint_composition_decline():
    for kind in ("img2img", "inpaint"):
        with pytest.raises(GuidedValidationError) as excinfo:
            resolve_controlnet_stack([dict(LAYER)], "sd35", _ready_registry(),
                                     kind=kind)
        assert "SD 3.5" in str(excinfo.value)


def test_unknown_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "svd", _ready_registry())
    message = str(excinfo.value)
    assert "not supported" in message and "SD 3.5 Large" in message


def test_unsupported_preprocessor_on_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="scribble")], "flux", _ready_registry())
    message = str(excinfo.value)
    assert "scribble" in message and "FLUX" in message
    assert "canny" in message  # lists what IS supported


def test_uninstalled_union_declines_with_foundry_hint():
    registry = _ready_registry({"controlnet-union-sdxl": "not_found"})
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="scribble")], "sdxl", registry)
    message = str(excinfo.value)
    assert "controlnet-union-sdxl" in message and "Foundry" in message


def test_uninstalled_controlnet_record_declines_with_foundry_hint():
    registry = _ready_registry({"controlnet-canny-sd15": "not_found"})
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "sd15", registry)
    message = str(excinfo.value)
    assert "controlnet-canny-sd15" in message and "Foundry" in message


def test_uninstalled_annotator_declines_with_foundry_hint():
    registry = _ready_registry({"annotator-openpose": "not_found"})
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="openpose")], "sd15", registry)
    assert "annotator-openpose" in str(excinfo.value)


def test_multi_layer_stack_resolves_in_order():
    layers = [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth")]
    resolved = resolve_controlnet_stack(layers, "sd15", _ready_registry())
    assert [item.record_id for item in resolved] == [
        "controlnet-canny-sd15", "controlnet-depth-sd15",
    ]


def test_every_registry_preprocessor_exists():
    from guided.preprocessors import PREPROCESSORS
    from guided.controlnet_registry import _DEDICATED, _UNIONS

    for family_map in _DEDICATED.values():
        for preprocessor in family_map:
            assert preprocessor in PREPROCESSORS
    for union in _UNIONS.values():
        for preprocessor in union["modes"]:
            assert preprocessor in PREPROCESSORS
