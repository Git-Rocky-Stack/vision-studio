"""One process-wide gate for local GPU work.

Every piece of work that touches accelerator memory - image and video
generation (load + denoise + decode), guided passes, the GPU edit tools
(Real-ESRGAN upscale, GFPGAN face restoration), and every unload/release of a
cached model - runs while holding this gate. That is what makes the shared
release path safe: ``utils.pipeline_cache.release_other_pipeline_caches`` can
never drop a pipeline another thread is in the middle of running, because the
release waits for the run to finish.

Semantics:

* Queue, don't fail. A caller that finds the gate busy WAITS; it is never
  refused. Waiters are served one at a time.
* Re-entrant. The gate is a ``threading.RLock``: a generation that holds it
  and then loads a model (which unloads the previous one and releases the
  other generators' caches, each of which takes the gate too) re-acquires it
  on the same thread without deadlocking.
* Cancellation-aware while waiting. ``hold(..., should_cancel=...)`` polls the
  job's cancel flag between bounded acquire attempts, so a job cancelled while
  it is still queued behind another one never starts.
* Thread-based. Generation runs on executor threads and edit tools on
  ``asyncio.to_thread`` workers, so the primitive is a thread lock - never an
  ``asyncio.Lock``. Async callers must hop to a thread first (``run_gated``);
  blocking the event loop on the gate would stall every other request for the
  length of a generation.

Imports no torch.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from contextlib import contextmanager
from typing import Any, Callable, Dict, Iterator, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# How long one bounded acquire attempt waits before the cancel flag is polled
# again. Short enough that a cancelled queued job leaves the queue promptly,
# long enough that an idle waiter costs nothing measurable.
DEFAULT_POLL_INTERVAL_SECONDS = 0.25


class GpuWaitCancelled(Exception):
    """A caller was cancelled while queued for the GPU (raised when no
    ``on_cancel`` factory supplies a caller-specific exception)."""


class GpuWorkGate:
    """A re-entrant, cancellation-aware, queue-don't-fail GPU work lock."""

    def __init__(self, poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS) -> None:
        self._lock = threading.RLock()
        self._state_lock = threading.Lock()
        self._poll_interval = poll_interval
        self._local = threading.local()
        self._holder: Optional[str] = None
        self._waiting = 0

    # -- introspection -----------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        """{"busy", "holder", "waiting"} - a point-in-time view for status/logs."""
        with self._state_lock:
            return {
                "busy": self._holder is not None,
                "holder": self._holder,
                "waiting": self._waiting,
            }

    def held_by_current_thread(self) -> bool:
        return getattr(self._local, "depth", 0) > 0

    # -- acquire / release -------------------------------------------------

    def _acquire(
        self,
        label: str,
        should_cancel: Optional[Callable[[], bool]],
        on_cancel: Optional[Callable[[], BaseException]],
    ) -> None:
        if self.held_by_current_thread():
            # Re-entrant fast path: this thread already owns the GPU.
            self._lock.acquire()
            self._local.depth += 1
            return

        if self._lock.acquire(blocking=False):
            self._mark_held(label)
            return

        with self._state_lock:
            self._waiting += 1
            holder = self._holder
        logger.info("GPU busy (%s); %s is queued until it finishes", holder or "unknown", label)
        started = time.monotonic()
        try:
            while True:
                if should_cancel is not None and should_cancel():
                    logger.info("%s was cancelled while queued for the GPU", label)
                    raise (on_cancel() if on_cancel is not None else GpuWaitCancelled(label))
                if self._lock.acquire(timeout=self._poll_interval):
                    break
        finally:
            with self._state_lock:
                self._waiting -= 1
        self._mark_held(label)
        logger.info("%s acquired the GPU after %.1fs in the queue", label, time.monotonic() - started)

    def _mark_held(self, label: str) -> None:
        self._local.depth = 1
        with self._state_lock:
            self._holder = label

    def _release(self) -> None:
        self._local.depth -= 1
        if self._local.depth == 0:
            with self._state_lock:
                self._holder = None
        self._lock.release()

    @contextmanager
    def hold(
        self,
        label: str,
        *,
        should_cancel: Optional[Callable[[], bool]] = None,
        on_cancel: Optional[Callable[[], BaseException]] = None,
    ) -> Iterator[None]:
        """Hold the GPU for the body of the ``with`` block.

        ``should_cancel`` is polled only while WAITING; once the gate is held
        the work's own cancellation (step callbacks, tile loops) takes over.
        ``on_cancel`` builds the exception raised for a cancelled waiter so a
        job surfaces its usual cancellation type (GenerationCancelled,
        EditCancelled); it defaults to ``GpuWaitCancelled``.
        """
        self._acquire(label, should_cancel, on_cancel)
        try:
            yield
        finally:
            self._release()

    def run(self, label: str, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """Call ``fn(*args, **kwargs)`` while holding the gate (sync callers)."""
        with self.hold(label):
            return fn(*args, **kwargs)


#: The single process-wide gate every local GPU path shares.
gpu_gate = GpuWorkGate()


def gpu_work(
    label: str,
    *,
    should_cancel: Optional[Callable[[], bool]] = None,
    on_cancel: Optional[Callable[[], BaseException]] = None,
):
    """``with gpu_work("image:<job>"):`` - hold the process-wide gate."""
    return gpu_gate.hold(label, should_cancel=should_cancel, on_cancel=on_cancel)


async def run_gated(label: str, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Async helper: run ``fn`` on a worker thread while holding the gate.

    Never blocks the event loop - waiting for the GPU happens on the worker.
    """
    return await asyncio.to_thread(gpu_gate.run, label, fn, *args, **kwargs)
