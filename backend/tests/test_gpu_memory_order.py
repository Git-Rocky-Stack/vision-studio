"""B4/P1 + B3: unload-before-measure ordering, the free-memory helper, and the
generators' use of the process-wide GPU gate.

The bug: both generators resolved the runtime plan - which probes free VRAM -
while the previous multi-GB pipeline was still resident, then unloaded it.
Every model switch planned precision/offload against memory about to be
freed. Required order: refusal check, then unload + release other caches +
gc.collect + empty_cache, then measure and plan. Torch-free fakes throughout.
"""

import asyncio
import threading
import types
from unittest import mock

import pytest

import utils.device as device
import utils.direct_generator as dg
import utils.direct_video_generator as dvg
from foundry.accelerator import AppliedAcceleration
from utils import pipeline_cache
from utils.gpu_gate import gpu_gate
from utils.job_manager import GenerationCancelled


class _Vram:
    """A fake device: resident pipelines hold memory until freed."""

    TOTAL = 24

    def __init__(self):
        self.held = 0
        self.pending_free = 0

    @property
    def free(self):
        return self.TOTAL - self.held


def _plan(refusal=None, free_seen=None):
    plan = mock.MagicMock(refusal=refusal, fallback_ladder=[],
                          pipeline_class="FakePipeline", precision="bf16")
    plan.free_seen = free_seen
    return plan


@pytest.fixture
def harness(monkeypatch, tmp_path):
    events = []
    vram = _Vram()
    refusals = {}

    def resolve_plan(model_name, overrides=None):
        events.append(("plan", vram.free))
        return _plan(refusal=refusals.get(model_name), free_seen=vram.free)

    def free_memory(*_args):
        events.append("free")
        vram.held -= vram.pending_free
        vram.pending_free = 0

    for module in (dg, dvg):
        monkeypatch.setattr(module, "resolve_plan", resolve_plan)
        monkeypatch.setattr(module, "accelerate_pipeline", lambda *a, **k: AppliedAcceleration())
        monkeypatch.setattr(module, "free_accelerator_memory", free_memory)
    monkeypatch.setattr(dg, "DIFFUSERS_AVAILABLE", True)
    monkeypatch.setattr(dvg, "VIDEO_DIFFUSERS_AVAILABLE", True)

    with mock.patch("foundry.accelerator.configure_inductor_cache", lambda *a, **k: None):
        image = dg.DirectGenerator(str(tmp_path), str(tmp_path))
        video = dvg.DirectVideoGenerator(str(tmp_path), str(tmp_path))

    for gen, kind in ((image, "image"), (video, "video")):
        def load(name, plan, slicing, _kind=kind):
            events.append(("load", name, plan.free_seen))
            vram.held += 10  # every fake pipeline holds 10 units
            return mock.MagicMock(name=f"{_kind}:{name}")
        gen._load_from_plan = load

        original_unload = gen.unload_model

        def unload(name, _original=original_unload, _gen=gen):
            if name in _gen.pipelines:
                events.append(("unload", name))
                vram.pending_free += 10  # returned by the next gc+empty_cache
            _original(name)
        gen.unload_model = unload

    yield types.SimpleNamespace(image=image, video=video, events=events,
                                vram=vram, refusals=refusals)
    pipeline_cache._owners.pop("image", None)
    pipeline_cache._owners.pop("video", None)


def test_image_switch_unloads_and_frees_before_measuring(harness):
    harness.image.load_model("sdxl")
    harness.events.clear()

    harness.image.load_model("flux-dev")

    events = harness.events
    first_plan = events.index(("plan", 14))  # refusal check: old pipeline resident
    unload = events.index(("unload", "sdxl"))
    last_free = max(i for i, e in enumerate(events) if e == "free")
    second_plan = events.index(("plan", 24))  # measured AFTER the memory came back
    load = events.index(("load", "flux-dev", 24))
    assert first_plan < unload < last_free < second_plan < load


def test_video_load_releases_the_image_pipeline_before_measuring(harness):
    harness.image.load_model("sdxl")
    harness.events.clear()

    harness.video.load_model("ltx-video")

    events = harness.events
    assert events[0] == ("plan", 14)
    assert ("unload", "sdxl") in events  # the image cache was released
    assert events.index(("unload", "sdxl")) < events.index(("plan", 24))
    assert events[-1] == ("load", "ltx-video", 24)
    assert harness.image.pipelines == {}


def test_a_refused_load_keeps_the_resident_pipeline(harness):
    resident = harness.image.load_model("sdxl")
    harness.events.clear()
    harness.refusals["sketchy"] = "pickle weights - convert first"

    with pytest.raises(dg.ModelLoadRefusedError):
        harness.image.load_model("sketchy")

    assert harness.events == [("plan", 14)]  # refusal first: nothing evicted
    assert harness.image.pipelines == {"sdxl": resident}


def test_free_accelerator_memory_collects_before_emptying_the_cache(monkeypatch):
    order = []

    class _Cuda:
        @staticmethod
        def is_available():
            return True

        @staticmethod
        def empty_cache():
            order.append("empty_cache")

        @staticmethod
        def ipc_collect():
            order.append("ipc_collect")

    fake_torch = types.SimpleNamespace(cuda=_Cuda())
    monkeypatch.setattr(device.gc, "collect", lambda *a: order.append("gc.collect"))

    device.free_accelerator_memory(fake_torch)

    assert order == ["gc.collect", "empty_cache", "ipc_collect"]


def test_free_accelerator_memory_without_torch_still_collects(monkeypatch):
    order = []
    monkeypatch.setattr(device.gc, "collect", lambda *a: order.append("gc.collect"))
    device.free_accelerator_memory(None)
    assert order == ["gc.collect"]


def test_process_reserved_vram_bytes():
    class _Cuda:
        @staticmethod
        def is_available():
            return True

        @staticmethod
        def memory_reserved():
            return 7 * 2**30

    assert device.process_reserved_vram_bytes(types.SimpleNamespace(cuda=_Cuda())) == 7 * 2**30
    assert device.process_reserved_vram_bytes(None) == 0


def test_image_job_queued_behind_another_gpu_job_can_be_cancelled(harness):
    """generate_image waits for the gate on its worker; a cancel while queued
    raises GenerationCancelled and the pass never starts."""
    started = []
    harness.image._generate_sync = lambda *a: started.append(True) or {}
    holder_in = threading.Event()
    release = threading.Event()

    def holder():
        with gpu_gate.hold("someone else's video job"):
            holder_in.set()
            release.wait(5)

    thread = threading.Thread(target=holder)
    thread.start()
    assert holder_in.wait(5)
    try:
        with mock.patch.object(dg, "_resolve_record", lambda _id: {}):
            with pytest.raises(GenerationCancelled):
                asyncio.run(harness.image.generate_image(
                    "job-q", "a cat", should_cancel=lambda: True))
    finally:
        release.set()
        thread.join(5)
    assert started == []


def test_unload_waits_for_a_running_generation(harness):
    """An unload (model delete, another generator's load) never pulls the
    pipeline out from under a running pass."""
    harness.image.load_model("sdxl")
    events = []
    in_run = threading.Event()
    finish = threading.Event()

    def generate_sync(*_args):
        events.append("run:start")
        in_run.set()
        finish.wait(5)
        events.append("run:end")
        return {}

    harness.image._generate_sync = generate_sync

    def run():
        with mock.patch.object(dg, "_resolve_record", lambda _id: {}):
            asyncio.run(harness.image.generate_image("job-r", "a cat"))

    runner = threading.Thread(target=run)
    runner.start()
    assert in_run.wait(5)

    def unload():
        harness.image.unload_model("sdxl")
        events.append("unloaded")

    unloader = threading.Thread(target=unload)
    unloader.start()
    unloader.join(0.2)
    assert events == ["run:start"]  # still queued behind the run
    finish.set()
    runner.join(5)
    unloader.join(5)
    assert events == ["run:start", "run:end", "unloaded"]
