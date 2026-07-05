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


# -- apply half: scales, masks, always-restore context manager -----------------


def test_sd_scales_are_one_adapter_with_per_image_scales():
    from guided.ip_adapter import ip_adapter_scales

    stack = resolve_ip_reference_stack(REFS, "sd15", _ready)
    assert ip_adapter_scales(stack) == [[1.2, 0.8]]


def test_flux_scales_are_one_scalar_per_instance():
    from guided.ip_adapter import ip_adapter_scales

    stack = resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-dev")
    assert ip_adapter_scales(stack) == [1.2, 0.8]


class _FakeIPPipeline:
    """Records the diffusers IP-Adapter mixin calls in order."""

    dtype = "fp16"

    def __init__(self):
        self.events = []
        self.image_encoder = None

    def register_modules(self, **modules):
        self.events.append(("register", sorted(modules)))
        self.image_encoder = modules.get("image_encoder")

    def load_ip_adapter(self, path, **kwargs):
        self.events.append(("load", kwargs))

    def set_ip_adapter_scale(self, scale):
        self.events.append(("scale", scale))

    def unload_ip_adapter(self):
        self.events.append(("unload",))


def _torch_available():
    try:
        import torch  # noqa: F401

        return True
    except Exception:
        return False


@pytest.mark.skipif(not _torch_available(), reason="requires torch")
def test_mask_tensor_shape_matches_the_attention_contract():
    from PIL import Image

    from guided.ip_adapter import ip_adapter_mask_tensor

    masks = [Image.new("L", (64, 64), 255), Image.new("L", (64, 64), 0)]
    tensors = ip_adapter_mask_tensor(masks, height=128, width=128)
    assert len(tensors) == 1  # one entry per adapter
    assert tuple(tensors[0].shape) == (1, 2, 128, 128)


def test_ip_adapter_applied_loads_scales_and_always_unloads(monkeypatch):
    from guided import ip_adapter as ip_mod

    monkeypatch.setattr(ip_mod, "_load_image_encoder",
                        lambda encoder_dir, dtype, device: {"encoder": encoder_dir})
    stack = resolve_ip_reference_stack(REFS, "sd15", _ready)
    pipe = _FakeIPPipeline()
    with ip_mod.ip_adapter_applied(pipe, stack, "adapter-dir", "encoder-dir", "cpu"):
        pass
    kinds = [event[0] for event in pipe.events]
    assert kinds == ["register", "load", "scale", "unload"]
    load_kwargs = pipe.events[1][1]
    assert load_kwargs["weight_name"] == ["ip-adapter_sd15.safetensors"]
    assert load_kwargs["subfolder"] == "models"
    assert load_kwargs["image_encoder_folder"] is None
    assert pipe.events[2][1] == [[1.2, 0.8]]


def test_ip_adapter_applied_unloads_even_when_the_body_raises(monkeypatch):
    from guided import ip_adapter as ip_mod

    monkeypatch.setattr(ip_mod, "_load_image_encoder",
                        lambda encoder_dir, dtype, device: object())
    stack = resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-dev")
    pipe = _FakeIPPipeline()
    with pytest.raises(RuntimeError):
        with ip_mod.ip_adapter_applied(pipe, stack, "a", "e", "cpu"):
            raise RuntimeError("boom")
    assert ("unload",) in pipe.events
    load_kwargs = [event for event in pipe.events if event[0] == "load"][0][1]
    assert load_kwargs["weight_name"] == ["ip_adapter.safetensors"] * 2
    assert "image_encoder_folder" not in load_kwargs
