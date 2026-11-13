"""P3/P4: guided-pass and edit-tool model caches.

ControlNet / IP-Adapter encoder / LoRA weights used to be re-read from disk on
every run, and the edit-tool caches (Real-ESRGAN, GFPGAN, face helper, U^2-Net)
were never freed. Now they are cached and every cache is registered with the
shared release path, so a model switch frees them. Torch-free fakes.
"""

import os
import types
from unittest import mock

import pytest

from foundry import lora
from guided import ip_adapter as ip_mod
from guided import pipelines as gp
from guided import preprocessors
from guided.fit import guided_fit_refusal
from edit_tools import background, faces, service, upscale
from utils import pipeline_cache


@pytest.fixture(autouse=True)
def _clean_caches(monkeypatch):
    monkeypatch.setattr(gp, "free_accelerator_memory", lambda *a: None)
    monkeypatch.setattr(ip_mod, "free_accelerator_memory", lambda *a: None)
    gp._controlnet_cache.clear()
    ip_mod._encoder_cache.clear()
    yield
    gp._controlnet_cache.clear()
    ip_mod._encoder_cache.clear()


# -- ControlNet LRU ----------------------------------------------------------

def _fake_controlnet_diffusers(loads):
    class _Model:
        def __init__(self, model_dir):
            self.model_dir = model_dir

        def to(self, device):
            return self

    class ControlNetModel:
        @classmethod
        def from_pretrained(cls, model_dir, torch_dtype=None):
            loads.append(model_dir)
            return _Model(model_dir)

    return types.SimpleNamespace(ControlNetModel=ControlNetModel)


def test_controlnet_is_loaded_once_across_runs(monkeypatch, tmp_path):
    loads = []
    monkeypatch.setattr(gp, "diffusers", _fake_controlnet_diffusers(loads))
    cn = str(tmp_path / "cn-canny")
    os.makedirs(cn)

    with gp.controlnets_attached([cn], "fp16", "cuda") as first:
        pass
    with gp.controlnets_attached([cn], "fp16", "cuda") as second:
        pass

    assert loads == [cn]  # second run served from the cache
    assert first == [] and second == []  # the per-job handle list is cleared


def test_controlnet_cache_key_includes_dtype_and_device(monkeypatch, tmp_path):
    loads = []
    monkeypatch.setattr(gp, "diffusers", _fake_controlnet_diffusers(loads))
    cn = str(tmp_path / "cn")
    os.makedirs(cn)
    with gp.controlnets_attached([cn], "fp16", "cuda"):
        pass
    with gp.controlnets_attached([cn], "bf16", "cuda"):
        pass
    assert loads == [cn, cn]


def test_controlnet_cache_is_bounded_lru(monkeypatch, tmp_path):
    loads = []
    monkeypatch.setattr(gp, "diffusers", _fake_controlnet_diffusers(loads))
    dirs = []
    for name in ("a", "b", "c"):
        path = str(tmp_path / name)
        os.makedirs(path)
        dirs.append(path)
    for path in dirs:
        with gp.controlnets_attached([path], "fp16", "cuda"):
            pass
    assert len(gp._controlnet_cache) == gp.CONTROLNET_CACHE_SIZE
    with gp.controlnets_attached([dirs[0]], "fp16", "cuda"):  # evicted -> reload
        pass
    assert loads == dirs + [dirs[0]]


def test_a_stack_larger_than_the_cap_never_evicts_its_own_models(monkeypatch, tmp_path):
    loads = []
    monkeypatch.setattr(gp, "diffusers", _fake_controlnet_diffusers(loads))
    dirs = [str(tmp_path / n) for n in ("x", "y", "z")]
    for path in dirs:
        os.makedirs(path)
    with gp.controlnets_attached(dirs, "fp16", "cuda") as models:
        assert [m.model_dir for m in models] == dirs
    assert len(gp._controlnet_cache) == 3  # all in use by the last stack


def test_model_switch_release_drops_the_controlnet_cache(monkeypatch, tmp_path):
    loads = []
    monkeypatch.setattr(gp, "diffusers", _fake_controlnet_diffusers(loads))
    cn = str(tmp_path / "cn")
    os.makedirs(cn)
    with gp.controlnets_attached([cn], "fp16", "cuda"):
        pass
    pipeline_cache.release_other_pipeline_caches("image")
    assert gp._controlnet_cache == {}


# -- IP-Adapter encoder ------------------------------------------------------

class _IPPipeline:
    dtype = "fp16"

    def __init__(self):
        self.image_encoder = None

    def register_modules(self, **modules):
        self.image_encoder = modules.get("image_encoder")

    def load_ip_adapter(self, *_a, **_k):
        pass

    def set_ip_adapter_scale(self, _scale):
        pass

    def unload_ip_adapter(self):
        self.image_encoder = None


def _stack():
    return types.SimpleNamespace(
        loader=ip_mod.LOADER_SD, weight_name="w.safetensors", instances=1,
        adapter_subfolder="models", references=[{"strength": 1.0}, {"strength": 1.0}])


def test_ip_encoder_is_loaded_once_across_runs(monkeypatch):
    loads = []
    monkeypatch.setattr(ip_mod, "_load_image_encoder",
                        lambda d, dtype, device: loads.append(d) or {"encoder": d})
    for _ in range(3):
        pipe = _IPPipeline()
        with ip_mod.ip_adapter_applied(pipe, _stack(), "adapter", "encoder-h", "cuda"):
            assert pipe.image_encoder == {"encoder": "encoder-h"}
    assert loads == ["encoder-h"]


def test_a_different_encoder_replaces_the_cached_one_and_release_drops_it(monkeypatch):
    monkeypatch.setattr(ip_mod, "_load_image_encoder", lambda d, dtype, device: {"encoder": d})
    with ip_mod.ip_adapter_applied(_IPPipeline(), _stack(), "a", "encoder-h", "cuda"):
        pass
    with ip_mod.ip_adapter_applied(_IPPipeline(), _stack(), "a", "encoder-l", "cuda"):
        pass
    assert len(ip_mod._encoder_cache) == 1
    pipeline_cache.release_other_pipeline_caches("video")
    assert ip_mod._encoder_cache == {}


# -- LoRA residency ----------------------------------------------------------

class _LoraPipeline:
    def __init__(self):
        self.calls = []

    def load_lora_weights(self, path, adapter_name=None):
        self.calls.append(("load", adapter_name))

    def set_adapters(self, names, weights):
        self.calls.append(("set", list(names), list(weights)))

    def enable_lora(self):
        self.calls.append(("enable",))

    def disable_lora(self):
        self.calls.append(("disable",))

    def delete_adapters(self, names):
        self.calls.append(("delete", list(names)))

    def unload_lora_weights(self):
        self.calls.append(("unload",))


def _lora_files(tmp_path, *names):
    records = {}
    for name in names:
        path = tmp_path / f"{name}.safetensors"
        path.write_bytes(b"x")
        records[name] = {"locations": [str(path)]}
    return records


def test_lora_stays_resident_and_is_switched_not_reloaded(tmp_path):
    records = _lora_files(tmp_path, "a", "b")
    pipe = _LoraPipeline()
    with lora.loras_applied(pipe, [{"id": "a", "weight": 0.8}], records.get):
        pass
    with lora.loras_applied(pipe, [{"id": "a", "weight": 0.5}, {"id": "b", "weight": 1.0}],
                            records.get):
        pass
    loads = [c for c in pipe.calls if c[0] == "load"]
    assert loads == [("load", "a"), ("load", "b")]  # "a" loaded exactly once
    assert ("set", ["a", "b"], [0.5, 1.0]) in pipe.calls
    assert ("unload",) not in pipe.calls
    assert pipe.calls[-1] == ("disable",)  # base behavior restored after each run


def test_a_run_without_loras_disables_resident_adapters(tmp_path):
    records = _lora_files(tmp_path, "a")
    pipe = _LoraPipeline()
    with lora.loras_applied(pipe, [{"id": "a", "weight": 1.0}], records.get):
        pass
    pipe.calls.clear()
    with lora.loras_applied(pipe, [], records.get) as result:
        assert result == {"applied": [], "skipped": []}
    assert ("set",) not in [c[:1] for c in pipe.calls]
    assert ("disable",) in pipe.calls


def test_a_changed_lora_file_is_reloaded(tmp_path):
    records = _lora_files(tmp_path, "a")
    pipe = _LoraPipeline()
    with lora.loras_applied(pipe, [{"id": "a"}], records.get):
        pass
    path = records["a"]["locations"][0]
    with open(path, "wb") as handle:
        handle.write(b"redownloaded-weights")
    with lora.loras_applied(pipe, [{"id": "a"}], records.get):
        pass
    assert [c for c in pipe.calls if c[0] in ("load", "delete")] == [
        ("load", "a"), ("delete", ["a"]), ("load", "a")]


def test_resident_adapters_are_bounded(tmp_path, monkeypatch):
    monkeypatch.setattr(lora, "MAX_RESIDENT_ADAPTERS", 2)
    records = _lora_files(tmp_path, "a", "b", "c")
    pipe = _LoraPipeline()
    for name in ("a", "b", "c"):
        with lora.loras_applied(pipe, [{"id": name}], records.get):
            pass
    assert list(lora.resident_adapters(pipe)) == ["b", "c"]
    assert ("delete", ["a"]) in pipe.calls


# -- edit tools + annotators register with the shared release path -----------

def test_edit_and_annotator_caches_are_freed_on_model_switch(monkeypatch):
    monkeypatch.setattr(upscale, "free_accelerator_memory", lambda *a: None)
    monkeypatch.setattr(faces, "free_accelerator_memory", lambda *a: None)
    monkeypatch.setattr(preprocessors, "free_accelerator_memory", lambda *a: None)
    upscale._RUNNERS["x4"] = (lambda tile: tile, 4)
    faces._GFPGAN_RUNNERS["gfpgan"] = lambda crop: crop
    faces._HELPERS[("det", "parse", "cuda")] = object()
    background._SESSIONS["u2net"] = object()
    preprocessors._DETECTORS["depth:dir"] = object()

    pipeline_cache.release_other_pipeline_caches("image")

    assert upscale._RUNNERS == {}
    assert faces._GFPGAN_RUNNERS == {} and faces._HELPERS == {}
    assert background._SESSIONS == {}
    assert preprocessors._DETECTORS == {}


def test_face_helper_is_built_once(monkeypatch, tmp_path):
    built = []

    class _Helper:
        def __init__(self, **kwargs):
            built.append(kwargs)

    monkeypatch.setattr(faces, "torch", object())
    monkeypatch.setattr(faces, "ModelLoader", object())
    monkeypatch.setattr(faces, "FaceRestoreHelper", _Helper)
    monkeypatch.setattr(faces, "resolve_device", lambda _torch: "cuda")
    monkeypatch.setattr(faces, "_staging_dir", lambda d, p: str(tmp_path))
    faces._HELPERS.clear()
    try:
        first = faces._make_helper("det.pth", "parse.pth")
        second = faces._make_helper("det.pth", "parse.pth")
    finally:
        faces._HELPERS.clear()
    assert first is second
    assert len(built) == 1


def test_gpu_edit_operations_hold_the_gate_and_cpu_ones_do_not(monkeypatch):
    held = []

    def fake_gpu_work(label, **_kwargs):
        held.append(label)
        from contextlib import nullcontext
        return nullcontext()

    monkeypatch.setattr(service, "gpu_work", fake_gpu_work)
    monkeypatch.setattr(service, "_run_operation", lambda *a: {"images": []})
    service.run_edit_operation("j1", "upscale", {}, "out", "models", lambda _r: None)
    service.run_edit_operation("j2", "restore-faces", {}, "out", "models", lambda _r: None)
    service.run_edit_operation("j3", "remove-background", {}, "out", "models", lambda _r: None)
    assert held == ["edit upscale j1", "edit restore-faces j2"]


# -- guided fit: memory this process holds is reclaimable --------------------

def _fit_inputs(tmp_path, monkeypatch):
    monkeypatch.setattr("guided.fit.installed_weight_bytes", lambda _d: 2 * 2**30)
    plan = types.SimpleNamespace(
        refusal=None,
        vram_plan=types.SimpleNamespace(total_bytes=8 * 2**30, weight_bytes=6 * 2**30,
                                        basis="estimated"))
    # 24 GB card with the same 8 GB checkpoint already resident -> 16 GB "free".
    profile = types.SimpleNamespace(gpu_available=True, vram_total_bytes=24 * 2**30,
                                    vram_free_bytes=8 * 2**30,
                                    system_ram_available_bytes=0)
    return plan, profile


def test_guided_fit_counts_resident_memory_as_reclaimable(tmp_path, monkeypatch):
    plan, profile = _fit_inputs(tmp_path, monkeypatch)
    # Without the credit the resident checkpoint is counted twice -> refused.
    assert guided_fit_refusal(plan, "sdxl", profile, cn_model_dirs=["cn"]) is not None
    assert guided_fit_refusal(plan, "sdxl", profile, cn_model_dirs=["cn"],
                              reclaimable_bytes=8 * 2**30) is None


def test_guided_fit_credit_never_exceeds_the_card(tmp_path, monkeypatch):
    plan, profile = _fit_inputs(tmp_path, monkeypatch)
    plan.vram_plan.total_bytes = 30 * 2**30
    refusal = guided_fit_refusal(plan, "sdxl", profile, cn_model_dirs=["cn"],
                                 reclaimable_bytes=100 * 2**30)
    assert refusal is not None and "24.0 GB is available" in refusal
