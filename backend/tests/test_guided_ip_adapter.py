"""#34 PR4: reference layers -> installed IP-Adapter records (pure, stub-safe)."""
import pathlib
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from guided.ip_adapter import (  # noqa: E402
    LOADER_FLUX,
    LOADER_SD,
    MSG_SD35_SINGLE_IMAGE,
    NOTICE_REFERENCE_MASKS_GLOBAL,
    resolve_ip_reference_stack,
)
from guided.passes import GuidedValidationError  # noqa: E402

REFS = [
    {"layer_id": "r1", "layer_name": "Face", "source_path": "a.png", "strength": 1.2,
     "mask": {"type": "rectangle", "points": [{"x": 0, "y": 0}],
              "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}},
    {"layer_id": "r2", "layer_name": "Style", "source_path": "b.png", "strength": 0.8,
     "mask": {"type": "rectangle", "points": [{"x": 4, "y": 4}],
              "bounds": {"x": 4, "y": 4, "width": 4, "height": 4}}},
]


def _ready(record_id):
    return {"id": record_id, "name": record_id, "status": "ready"}


def test_single_or_no_reference_is_not_this_seams_business():
    assert resolve_ip_reference_stack([], "sd15", _ready) is None
    assert resolve_ip_reference_stack([REFS[0]], "sd15", _ready) is None


def test_sd15_resolves_one_masked_adapter():
    stack = resolve_ip_reference_stack(REFS, "sd15", _ready)
    assert stack.adapter_record_id == "ip-adapter-sd15"
    assert stack.encoder_record_id == "ip-adapter-encoder-vit-h"
    assert stack.adapter_subfolder == "models"
    assert stack.weight_name == "ip-adapter_sd15.safetensors"
    assert stack.loader == LOADER_SD
    assert stack.masked is True
    assert stack.instances == 1
    assert stack.notices == []
    assert [ref["layer_id"] for ref in stack.references] == ["r1", "r2"]


def test_sdxl_resolves_the_vit_h_variant_with_shared_encoder():
    stack = resolve_ip_reference_stack(REFS, "sdxl", _ready)
    assert stack.adapter_record_id == "ip-adapter-sdxl"
    assert stack.adapter_subfolder == "sdxl_models"
    assert stack.weight_name == "ip-adapter_sdxl_vit-h.safetensors"
    assert stack.encoder_record_id == "ip-adapter-encoder-vit-h"
    assert stack.masked is True


def test_flux_loads_one_instance_per_reference_and_carries_the_global_notice():
    stack = resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-dev")
    assert stack.adapter_record_id == "ip-adapter-flux"
    assert stack.encoder_record_id == "ip-adapter-encoder-clip-vit-l"
    assert stack.loader == LOADER_FLUX
    assert stack.masked is False
    assert stack.instances == 2
    assert stack.notices == [NOTICE_REFERENCE_MASKS_GLOBAL]


def test_sd35_declines_multi_reference():
    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "sd35", _ready)
    assert str(exc.value) == MSG_SD35_SINGLE_IMAGE


def test_unknown_family_declines_with_supported_list():
    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "sd2", _ready)
    assert "Multiple reference images are not supported" in str(exc.value)


def test_flux_schnell_declines_by_checkpoint_id():
    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-schnell")
    assert "distilled" in str(exc.value)
    assert "FLUX.1 [dev]" in str(exc.value)


def test_missing_adapter_or_encoder_names_the_record():
    def missing_encoder(record_id):
        status = "not_found" if record_id == "ip-adapter-encoder-vit-h" else "ready"
        return {"id": record_id, "name": record_id, "status": status}

    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "sd15", missing_encoder)
    assert "ip-adapter-encoder-vit-h" in str(exc.value)
    assert "Foundry" in str(exc.value)
