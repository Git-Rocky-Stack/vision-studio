"""DownloadManager — the bounded-concurrency acquisition queue.

Layers on top of huggingface_hub (which already does per-file .incomplete
resume, a per-file disk check, a size-consistency check, and an atomic move).
This manager owns: the aggregate disk preflight, a semaphore-bounded queue of
asyncio.Tasks keyed by model id, pause/resume/cancel lifecycle + intent, the
fast/precise (Xet) toggle, per-call token injection (never stored/logged), and
the live status the registry composes through its status_provider.

Telemetry (progress/speed/eta) lives on DownloadJob and is streamed via
GET /models/downloads; it is deliberately NOT written onto ModelRecord.
"""

import asyncio
import os
import shutil
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

import huggingface_hub

from foundry.download_errors import (
    DiskSpaceError,
    DownloadCancelledError,
    DownloadError,
    GatedModelError,
    map_hf_exception,
)
from foundry.download_telemetry import ProgressSink, make_tqdm_class

JobStatus = Literal[
    "queued", "downloading", "paused", "verifying", "ready", "error", "cancelled"
]

# Extra free bytes required beyond the summed file sizes, so the volume is not
# driven to exactly zero (index/temp churn). 256 MiB is a safe resting margin.
_DISK_HEADROOM_BYTES = 256 * 1024 * 1024

# Active lifecycle states an enqueue is idempotent against.
_ACTIVE_STATES = {"queued", "downloading", "paused", "verifying"}


@dataclass
class DownloadJob:
    model_id: str
    status: JobStatus
    progress: float = 0.0
    speed: float = 0.0
    eta: Optional[float] = None
    total_bytes: int = 0
    error: Optional[str] = None
    gate_url: Optional[str] = None
    # NB: there is intentionally NO token field. The token is a local param
    # threaded through _run_job -> _download_file only.


class DownloadManager:
    def __init__(
        self,
        registry,
        model_manager,
        models_dir: str,
        concurrency: int = 2,
        mode: str = "fast",
    ):
        self._registry = registry
        self._model_manager = model_manager
        self._models_dir = models_dir
        self._concurrency = max(1, min(int(concurrency), 6))
        self.mode = mode if mode in {"fast", "precise"} else "fast"

        self._jobs: Dict[str, DownloadJob] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._sinks: Dict[str, ProgressSink] = {}
        self._cancel_events: Dict[str, threading.Event] = {}
        self._intent: Dict[str, str] = {}  # model_id -> none | pause | cancel
        self._semaphore = asyncio.Semaphore(self._concurrency)

    # -- public API --------------------------------------------------------
    def enqueue(self, model_id: str, token: Optional[str] = None) -> DownloadJob:
        """Queue a download. Idempotent for an already-active id.

        ``token`` is a LOCAL parameter passed straight into _run_job; it is
        never stored on the manager or the job, and never logged.
        """
        existing = self._jobs.get(model_id)
        if existing is not None and existing.status in _ACTIVE_STATES:
            return existing

        job = DownloadJob(model_id=model_id, status="queued")
        self._jobs[model_id] = job
        self._intent[model_id] = "none"
        self._cancel_events[model_id] = threading.Event()
        self._tasks[model_id] = asyncio.create_task(self._run_job(model_id, token))
        return job

    def list_jobs(self) -> List[DownloadJob]:
        return list(self._jobs.values())

    def get_record_status(self, model_id: str) -> Optional[str]:
        """Live lifecycle status for the registry status_provider, or None.

        Returns the active job's status (queued/downloading/paused/verifying)
        so GET /api/models reflects in-flight lifecycle. Terminal states
        (ready/error/cancelled) return None so the registry falls back to its
        own on-disk / model_manager detection (a cancelled job must not pin the
        record to 'cancelled' forever).
        """
        job = self._jobs.get(model_id)
        if job is None:
            return None
        if job.status in _ACTIVE_STATES:
            return job.status
        return None

    # -- worker (filled in by later tasks) ---------------------------------
    async def _run_job(self, model_id: str, token: Optional[str]) -> None:
        async with self._semaphore:
            await self._execute(model_id, token)

    async def _execute(self, model_id: str, token: Optional[str]) -> None:
        # Implemented in Task 5 (happy path) and extended in Tasks 6-11.
        raise NotImplementedError
