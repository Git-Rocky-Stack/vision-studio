"""B3: one process-wide GPU work gate serializes every local GPU path.

Torch-free: real threads, fake work. Proves that GPU jobs queue instead of
failing, that a cache release can never interleave with a running pass, that
the gate is re-entrant (load -> unload -> release on one thread), and that a
job cancelled while queued never starts.
"""

import threading
import time

import pytest

from utils import gpu_gate as gate_module
from utils import pipeline_cache
from utils.gpu_gate import GpuWaitCancelled, GpuWorkGate


def _spin_until(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.005)
    return False


def test_concurrent_work_is_serialized_and_every_caller_runs():
    gate = GpuWorkGate(poll_interval=0.01)
    active = []
    peak = []
    finished = []
    lock = threading.Lock()

    def job(name):
        with gate.hold(name):
            with lock:
                active.append(name)
                peak.append(len(active))
            time.sleep(0.02)
            with lock:
                active.remove(name)
                finished.append(name)

    threads = [threading.Thread(target=job, args=(f"job-{i}",)) for i in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(5)

    assert sorted(finished) == sorted(f"job-{i}" for i in range(6))  # queued, never refused
    assert max(peak) == 1  # never two at once


def test_gate_is_reentrant_on_one_thread():
    gate = GpuWorkGate()
    with gate.hold("generate"):
        with gate.hold("load"):
            with gate.hold("release"):
                assert gate.snapshot()["holder"] == "generate"
    assert gate.snapshot() == {"busy": False, "holder": None, "waiting": 0}


def test_a_job_cancelled_while_queued_never_starts():
    gate = GpuWorkGate(poll_interval=0.01)
    release_holder = threading.Event()
    holder_in = threading.Event()
    started = []
    outcome = {}

    def holder():
        with gate.hold("running job"):
            holder_in.set()
            release_holder.wait(5)

    cancelled = threading.Event()

    def waiter():
        try:
            with gate.hold("queued job", should_cancel=cancelled.is_set,
                           on_cancel=lambda: RuntimeError("queued job cancelled")):
                started.append(True)
        except RuntimeError as exc:
            outcome["error"] = str(exc)

    t1 = threading.Thread(target=holder)
    t1.start()
    assert holder_in.wait(5)
    t2 = threading.Thread(target=waiter)
    t2.start()
    assert _spin_until(lambda: gate.snapshot()["waiting"] == 1)
    cancelled.set()
    t2.join(5)
    release_holder.set()
    t1.join(5)

    assert started == []
    assert outcome["error"] == "queued job cancelled"
    assert gate.snapshot()["waiting"] == 0


def test_default_cancel_exception():
    gate = GpuWorkGate(poll_interval=0.01)
    holder_in = threading.Event()
    done = threading.Event()

    def holder():
        with gate.hold("busy"):
            holder_in.set()
            done.wait(5)

    thread = threading.Thread(target=holder)
    thread.start()
    assert holder_in.wait(5)
    with pytest.raises(GpuWaitCancelled):
        with gate.hold("cancelled", should_cancel=lambda: True):
            pass
    done.set()
    thread.join(5)


def test_release_waits_for_a_running_pass_instead_of_interleaving():
    """release_other_pipeline_caches holds the process-wide gate, so a release
    requested mid-run lands only after the run is done with its pipeline."""
    events = []
    run_started = threading.Event()
    finish_run = threading.Event()

    class Owner:
        def release(self):
            events.append("release")

    owner = Owner()
    pipeline_cache.register_pipeline_owner("fake-video", owner.release)
    try:
        def run():
            with gate_module.gpu_work("image job"):
                events.append("run:start")
                run_started.set()
                finish_run.wait(5)
                events.append("run:end")

        runner = threading.Thread(target=run)
        runner.start()
        assert run_started.wait(5)
        releaser = threading.Thread(
            target=pipeline_cache.release_other_pipeline_caches, args=("image",))
        releaser.start()
        # The releaser is queued behind the run, not interleaving with it.
        assert _spin_until(lambda: gate_module.gpu_gate.snapshot()["waiting"] == 1)
        assert events == ["run:start"]
        finish_run.set()
        runner.join(5)
        releaser.join(5)
        assert events == ["run:start", "run:end", "release"]
    finally:
        pipeline_cache._owners.pop("fake-video", None)


def test_function_owners_are_held_strongly_and_released():
    calls = []

    def release_module_cache():
        calls.append("released")

    pipeline_cache.register_pipeline_owner("fake-module-cache", release_module_cache)
    try:
        pipeline_cache.release_other_pipeline_caches("image")
        assert calls == ["released"]
        pipeline_cache.release_other_pipeline_caches("fake-module-cache")
        assert calls == ["released"]  # the requester is never asked
        pipeline_cache.release_all_pipeline_caches()
        assert calls == ["released", "released"]
    finally:
        pipeline_cache._owners.pop("fake-module-cache", None)


def test_run_gated_never_blocks_the_event_loop():
    import asyncio

    gate = gate_module.gpu_gate
    holder_in = threading.Event()
    done = threading.Event()

    def holder():
        with gate.hold("busy"):
            holder_in.set()
            done.wait(5)

    thread = threading.Thread(target=holder)
    thread.start()
    assert holder_in.wait(5)

    async def main():
        ticks = 0
        task = asyncio.ensure_future(gate_module.run_gated("queued", lambda: "ran"))
        while not task.done():
            ticks += 1
            if ticks == 5:
                done.set()  # the loop kept running while the call was queued
            await asyncio.sleep(0.01)
        return task.result(), ticks

    result, ticks = asyncio.run(main())
    thread.join(5)
    assert result == "ran"
    assert ticks >= 5
