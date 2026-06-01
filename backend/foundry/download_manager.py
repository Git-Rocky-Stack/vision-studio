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

    def pause(self, model_id: str) -> Optional[DownloadJob]:
        """Cooperatively pause: signal cancel, keep partials for resume."""
        job = self._jobs.get(model_id)
        if job is None or job.status not in {"queued", "downloading"}:
            return job
        self._intent[model_id] = "pause"
        event = self._cancel_events.get(model_id)
        if event is not None:
            event.set()  # sink.add raises DownloadCancelledError at next chunk
        return job

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
        job = self._jobs[model_id]
        record = self._registry.get_record(model_id)
        if record is None:
            job.status = "error"
            job.error = "unknown model id"
            self._cleanup_task(model_id)
            return

        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")
        cancel_event = self._cancel_events[model_id]

        try:
            filenames, total_bytes, target_dir = self._resolve_files(model_id, record)
            job.total_bytes = total_bytes

            self._preflight_disk(total_bytes, target_dir)

            job.status = "downloading"
            sink = ProgressSink(total_bytes, cancel_event=cancel_event)
            self._sinks[model_id] = sink

            for filename in filenames:
                await asyncio.to_thread(
                    self._download_file, repo_id, filename, target_dir, token, sink, revision
                )
                job.progress = sink.progress
                job.speed = sink.speed
                job.eta = sink.eta

            job.status = "verifying"
            # The library already did per-file size-consistency + atomic move;
            # the repo-level verify is the presence of every target file.
            self._verify(filenames, target_dir)

            job.progress = 1.0
            job.speed = 0.0
            job.eta = 0.0
            job.status = "ready"
        except DownloadCancelledError:
            self._handle_cancellation(model_id, target_dir=self._target_dir(record))
        except DiskSpaceError as exc:
            job.status = "error"
            job.error = str(exc)
        except GatedModelError as exc:
            job.status = "error"
            job.error = str(exc)
            job.gate_url = exc.gate_url
        except DownloadError as exc:
            job.status = "error"
            job.error = str(exc)
        except Exception as exc:  # any raw hf error -> typed -> surfaced
            mapped = map_hf_exception(exc, repo_id=repo_id or model_id)
            job.status = "error"
            job.error = str(mapped)
            if isinstance(mapped, GatedModelError):
                job.gate_url = mapped.gate_url
        finally:
            self._cleanup_task(model_id)

    # -- resolution / preflight / per-file download ------------------------
    def _resolve_files(self, model_id: str, record: dict):
        """Return (filenames, total_bytes, target_dir) for the model.

        Single-file artifacts resolve to the one filename from the manager's
        _SINGLE_FILE_FILENAMES map; diffusers repos resolve to the repo file
        list. Sizes come from huggingface_hub.get_paths_info (no download).
        """
        from utils.model_manager import _SINGLE_FILE_FILENAMES

        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")
        target_dir = self._target_dir(record)

        single = _SINGLE_FILE_FILENAMES.get(model_id)
        if single is not None:
            paths = [single]
        else:
            infos = huggingface_hub.get_paths_info(repo_id, [], revision=revision)
            paths = [getattr(info, "path", None) or info["path"] for info in infos]

        infos = huggingface_hub.get_paths_info(repo_id, paths, revision=revision)
        total = 0
        for info in infos:
            size = getattr(info, "size", None)
            if size is None and isinstance(info, dict):
                size = info.get("size", 0)
            total += int(size or 0)

        return paths, total, target_dir

    def _target_dir(self, record: dict) -> str:
        """Destination directory matching the model_manager storage layout."""
        artifact_type = record.get("artifact_type", "checkpoint")
        if artifact_type in {"diffusers-pipeline", "motion-adapter"}:
            return os.path.join(self._models_dir, "diffusers", record["id"])
        subdir = _ARTIFACT_SUBDIR.get(artifact_type, "checkpoints")
        return os.path.join(self._models_dir, subdir)

    def _preflight_disk(self, total_bytes: int, target_dir: str) -> None:
        """Refuse the whole pull up front if free space < total + headroom."""
        probe = target_dir
        while probe and not os.path.isdir(probe):
            probe = os.path.dirname(probe)
        if not probe:
            probe = self._models_dir
        os.makedirs(target_dir, exist_ok=True)
        free = shutil.disk_usage(probe).free
        required = total_bytes + _DISK_HEADROOM_BYTES
        if free < required:
            raise DiskSpaceError(required=required, available=free)

    def _download_file(self, repo_id, filename, target_dir, token, sink, revision):
        """Blocking per-file download. Token passed PER CALL only."""
        os.makedirs(target_dir, exist_ok=True)
        with self._xet_toggle():
            huggingface_hub.hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=target_dir,
                token=token,
                tqdm_class=make_tqdm_class(sink),
                revision=revision,
            )

    def _verify(self, filenames, target_dir) -> None:
        for filename in filenames:
            dest = os.path.join(target_dir, filename)
            if not os.path.exists(dest):
                raise DownloadError(f"verify failed: missing {filename}")

    @contextmanager
    def _xet_toggle(self):
        """Force the plain-HTTP byte-exact path in precise mode; restore after.

        file_download.py reads constants.HF_HUB_DISABLE_XET at call time, so
        mutating the module attribute around the call switches Xet off for that
        download. The prior value is always restored, even on exception.

        Caveat: HF_HUB_DISABLE_XET is a *process-global*, and _download_file runs
        in a worker thread. This is safe here only because ``mode`` is uniform
        per manager, so every concurrent download targets the same value and
        restores the same original. True per-download isolation (a lock or a
        thread-local override) is deferred to Task 11 (token discipline + toggle).
        Default ``fast`` mode makes this a no-op.
        """
        if self.mode != "precise":
            yield
            return
        previous = huggingface_hub.constants.HF_HUB_DISABLE_XET
        huggingface_hub.constants.HF_HUB_DISABLE_XET = True
        try:
            yield
        finally:
            huggingface_hub.constants.HF_HUB_DISABLE_XET = previous

    # -- lifecycle handlers (cancel/pause fleshed out in Tasks 6-8) --------
    def _handle_cancellation(self, model_id: str, target_dir: str) -> None:
        job = self._jobs[model_id]
        if self._intent.get(model_id) == "pause":
            job.status = "paused"  # KEEP .incomplete partials for resume
        else:
            self._delete_partials(target_dir)
            job.status = "cancelled"

    def _delete_partials(self, target_dir: str) -> None:
        if not os.path.isdir(target_dir):
            return
        for name in os.listdir(target_dir):
            if name.endswith(".incomplete"):
                try:
                    os.remove(os.path.join(target_dir, name))
                except OSError:
                    pass

    def _cleanup_task(self, model_id: str) -> None:
        self._tasks.pop(model_id, None)
        self._cancel_events.pop(model_id, None)
        self._sinks.pop(model_id, None)
        self._intent.pop(model_id, None)


_ARTIFACT_SUBDIR = {
    "checkpoint": "checkpoints",
    "diffusers-pipeline": "diffusers",
    "motion-adapter": "diffusers",
    "lora": "loras",
    "vae": "vaes",
    "controlnet": "controlnet",
    "embedding": "embeddings",
}
