from contextlib import suppress
from unittest.mock import MagicMock

from foundry.lora import apply_loras, clear_loras, loras_applied, resolve_lora_path


def _record(path):
    return {"locations": [path]}


def test_resolve_lora_path_picks_local_safetensors(tmp_path):
    f = tmp_path / "a.safetensors"
    f.write_bytes(b"x")
    assert resolve_lora_path(_record(str(f))) == str(f)
    assert resolve_lora_path({"locations": ["/nope/x.safetensors"]}) is None
    assert resolve_lora_path(None) is None


def test_apply_loads_named_adapters_and_sets_weights(tmp_path):
    a = tmp_path / "a.safetensors"
    a.write_bytes(b"x")
    b = tmp_path / "b.safetensors"
    b.write_bytes(b"x")
    resolve = {"a": _record(str(a)), "b": _record(str(b))}.get
    pipe = MagicMock()
    result = apply_loras(pipe, [{"id": "a", "weight": 0.8}, {"id": "b", "weight": 1.2}], resolve)
    assert pipe.load_lora_weights.call_count == 2
    pipe.set_adapters.assert_called_once_with(["a", "b"], [0.8, 1.2])
    assert [x["id"] for x in result["applied"]] == ["a", "b"]
    assert result["skipped"] == []


def test_apply_skips_uninstalled():
    pipe = MagicMock()
    result = apply_loras(pipe, [{"id": "ghost", "weight": 1.0}], lambda _id: None)
    pipe.load_lora_weights.assert_not_called()
    pipe.set_adapters.assert_not_called()
    assert result["skipped"] == [{"id": "ghost", "reason": "not installed"}]


def test_apply_is_failsoft_on_load_error(tmp_path):
    good = tmp_path / "g.safetensors"
    good.write_bytes(b"x")
    bad = tmp_path / "b.safetensors"
    bad.write_bytes(b"x")
    resolve = {"good": _record(str(good)), "bad": _record(str(bad))}.get
    pipe = MagicMock()
    pipe.load_lora_weights.side_effect = [None, RuntimeError("size mismatch")]
    result = apply_loras(pipe, [{"id": "good", "weight": 1.0}, {"id": "bad", "weight": 1.0}], resolve)
    assert [x["id"] for x in result["applied"]] == ["good"]
    assert result["skipped"][0]["id"] == "bad"
    pipe.set_adapters.assert_called_once_with(["good"], [1.0])
    assert pipe.unload_lora_weights.call_count == 1  # cleared partial state on failure


def test_loras_applied_clears_even_on_error(tmp_path):
    a = tmp_path / "a.safetensors"
    a.write_bytes(b"x")
    pipe = MagicMock()
    with suppress(ValueError):
        with loras_applied(pipe, [{"id": "a", "weight": 1.0}], lambda _id: _record(str(a))):
            raise ValueError("boom")
    pipe.unload_lora_weights.assert_called_once()


def test_clear_loras_is_noop_without_unload_method():
    clear_loras(object())  # must not raise
