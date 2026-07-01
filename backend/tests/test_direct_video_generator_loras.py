import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")


class _FakeVideoPipeline:
    def __init__(self, calls):
        self._calls = calls

    def load_lora_weights(self, path, adapter_name=None):
        self._calls.append("load_lora_weights")

    def set_adapters(self, names, weights):
        self._calls.append("set_adapters")

    def unload_lora_weights(self):
        self._calls.append("unload_lora_weights")

    def __call__(self, *args, **kwargs):
        self._calls.append("__call__")

        class _Out:
            frames = [[object()]]

        return _Out()


def _make_gen(monkeypatch, tmp_path, calls):
    from utils import direct_video_generator as dvg

    gen = dvg.DirectVideoGenerator.__new__(dvg.DirectVideoGenerator)
    gen.device = "cpu"
    gen.output_dir = str(tmp_path)
    gen.applied_acceleration = {}
    monkeypatch.setattr(gen, "load_model", lambda *a, **k: _FakeVideoPipeline(calls))
    monkeypatch.setattr(dvg, "resolve_video_model_strategy", lambda *a, **k: "text-to-video")
    monkeypatch.setattr(gen, "_export_frames_to_video", lambda *a, **k: None)
    return dvg, gen


def test_video_generate_sync_brackets_loras_for_text_to_video(monkeypatch, tmp_path):
    calls = []
    dvg, gen = _make_gen(monkeypatch, tmp_path, calls)
    lora_file = tmp_path / "l1.safetensors"
    lora_file.write_bytes(b"x")
    monkeypatch.setattr(dvg, "_resolve_lora_record", lambda _id: {"locations": [str(lora_file)]})

    result = gen._generate_sync(
        prompt="x",
        image_path=None,
        width=64,
        height=64,
        fps=8,
        duration=1,
        steps=1,
        model_name="animate-diff",
        seed=0,
        output_dir=str(tmp_path),
        loras=[{"id": "l1", "weight": 1.0}],
    )
    assert calls[:2] == ["load_lora_weights", "set_adapters"]
    assert "unload_lora_weights" in calls
    assert result["loras"]["applied"] == [{"id": "l1", "weight": 1.0}]


def test_video_generate_sync_skips_loras_for_svd(monkeypatch, tmp_path):
    calls = []
    _dvg, gen = _make_gen(monkeypatch, tmp_path, calls)

    result = gen._generate_sync(
        prompt="x",
        image_path=None,
        width=64,
        height=64,
        fps=8,
        duration=1,
        steps=1,
        model_name="svd",
        seed=0,
        output_dir=str(tmp_path),
        loras=[{"id": "l1", "weight": 1.0}],
    )
    assert "load_lora_weights" not in calls
    assert "set_adapters" not in calls
    assert result["loras"]["applied"] == []
