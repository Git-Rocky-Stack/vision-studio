import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")


class _FakePipeline:
    """Records the LoRA + call sequence and returns a real PIL image."""

    def __init__(self, calls, image):
        self._calls = calls
        self._image = image

    def load_lora_weights(self, path, adapter_name=None):
        self._calls.append("load_lora_weights")

    def set_adapters(self, names, weights):
        self._calls.append("set_adapters")

    def unload_lora_weights(self):
        self._calls.append("unload_lora_weights")

    def __call__(self, **kwargs):
        self._calls.append("__call__")

        class _Out:
            pass

        out = _Out()
        out.images = [self._image]
        return out


def test_generate_sync_brackets_pipeline_call_with_loras(monkeypatch, tmp_path):
    from utils import direct_generator as dg
    from PIL import Image

    gen = dg.DirectGenerator.__new__(dg.DirectGenerator)  # bypass heavy __init__
    gen.device = "cpu"
    gen.output_dir = str(tmp_path)
    gen.applied_acceleration = {}

    calls = []
    fake = _FakePipeline(calls, Image.new("RGB", (8, 8)))
    monkeypatch.setattr(gen, "load_model", lambda *a, **k: fake)
    monkeypatch.setattr(gen, "_configure_scheduler", lambda p, s: p)

    lora_file = tmp_path / "l1.safetensors"
    lora_file.write_bytes(b"x")
    monkeypatch.setattr(dg, "_resolve_lora_record", lambda _id: {"locations": [str(lora_file)]})

    result = gen._generate_sync(
        prompt="x",
        negative_prompt="",
        width=8,
        height=8,
        steps=1,
        cfg_scale=7.5,
        seed=1,
        model_name="sdxl-base",
        scheduler="euler",
        progress_callback_fn=lambda *a: None,
        output_dir=str(tmp_path),
        loras=[{"id": "l1", "weight": 0.9}],
    )

    assert calls == ["load_lora_weights", "set_adapters", "__call__", "unload_lora_weights"]
    assert result["loras"]["applied"] == [{"id": "l1", "weight": 0.9}]
    assert result["loras"]["skipped"] == []


def test_generate_sync_without_loras_still_clears(monkeypatch, tmp_path):
    from utils import direct_generator as dg
    from PIL import Image

    gen = dg.DirectGenerator.__new__(dg.DirectGenerator)
    gen.device = "cpu"
    gen.output_dir = str(tmp_path)
    gen.applied_acceleration = {}

    calls = []
    fake = _FakePipeline(calls, Image.new("RGB", (8, 8)))
    monkeypatch.setattr(gen, "load_model", lambda *a, **k: fake)
    monkeypatch.setattr(gen, "_configure_scheduler", lambda p, s: p)

    result = gen._generate_sync(
        prompt="x",
        negative_prompt="",
        width=8,
        height=8,
        steps=1,
        cfg_scale=7.5,
        seed=1,
        model_name="sdxl-base",
        scheduler="euler",
        progress_callback_fn=lambda *a: None,
        output_dir=str(tmp_path),
        loras=None,
    )

    assert "load_lora_weights" not in calls
    assert "set_adapters" not in calls
    assert calls == ["__call__", "unload_lora_weights"]
    assert result["loras"]["applied"] == []
