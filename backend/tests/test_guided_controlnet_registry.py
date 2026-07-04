"""#34 PR2: (family, preprocessor) -> Foundry record resolution + honest declines."""
import pytest

from guided.controlnet_registry import (
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


def test_supported_families_are_sd15_and_sdxl():
    assert SUPPORTED_FAMILIES == {"sd15", "sdxl"}


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


def test_depth_carries_its_annotator():
    resolved = resolve_controlnet_stack(
        [dict(LAYER, preprocessor="depth")], "sd15", _ready_registry())
    assert resolved[0].record_id == "controlnet-depth-sd15"
    assert resolved[0].annotator_record_id == "annotator-midas"


def test_unsupported_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "flux", _ready_registry())
    message = str(excinfo.value)
    assert "FLUX" in message and "PR3" in message


def test_unsupported_preprocessor_on_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="scribble")], "sdxl", _ready_registry())
    message = str(excinfo.value)
    assert "scribble" in message and "SDXL" in message


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
    from guided.controlnet_registry import _STACKS

    for family_map in _STACKS.values():
        for preprocessor in family_map:
            assert preprocessor in PREPROCESSORS
