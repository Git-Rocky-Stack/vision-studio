"""
Job Manager - the live registry of generation jobs.

In memory: every job the backend knows about, guarded by one lock (workers
update jobs from threads while routes read them on the event loop).

Durable: when constructed with a JobStore, every add/update is snapshotted to
the app database's ``jobs`` table by the store's background writer thread
(never on the caller's thread), and recent history is reloaded at startup so
the job list survives a restart.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from threading import Lock
from typing import Any, Dict, List, Optional

from utils.job_store import JobStore, serialize_row
from utils.timeutil import utc_now

logger = logging.getLogger(__name__)


class JobStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_STATUSES = (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)


class GenerationCancelled(Exception):
    """Raised inside a generator to stop a job whose status is CANCELLED."""


# Finished jobs (completed, failed, cancelled) are dropped this long after
# they were created - from memory and from the persisted history alike.
# Running and queued jobs are never dropped.
JOB_RETENTION_HOURS = 24

# Error recorded for a job that was still pending/processing when the backend
# stopped: its worker died with the process, so it can never finish.
INTERRUPTED_JOB_ERROR = "The backend stopped before this job finished."

_TIMESTAMP_FIELDS = ("created_at", "completed_at")


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Normalize a datetime to tz-aware UTC.

    A naive value is interpreted as local wall-clock time (what a bare
    ``datetime.now()`` produces), so legacy callers still yield the correct
    instant instead of a mislabelled one.
    """
    if value is None:
        return None
    # astimezone() on a naive datetime assumes the host's local zone.
    return value.astimezone(timezone.utc)


def _parse_timestamp(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return as_utc(datetime.fromisoformat(raw))
    except ValueError:
        return None


@dataclass
class GenerationJob:
    id: str
    type: str  # 'image', 'video', 'edit', 'graph'
    status: JobStatus
    params: Dict[str, Any]
    output_dir: str
    progress: float = 0.0
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=utc_now)
    completed_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        self.created_at = as_utc(self.created_at)
        self.completed_at = as_utc(self.completed_at)

    def to_dict(self) -> Dict:
        created_at = as_utc(self.created_at)
        completed_at = as_utc(self.completed_at)
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status.value,
            "params": self.params,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": created_at.isoformat(),
            "completed_at": completed_at.isoformat() if completed_at else None,
        }

    def to_row(self) -> Dict[str, Any]:
        """Snapshot for JobStore (taken under the manager lock)."""
        return serialize_row(
            job_id=self.id,
            job_type=self.type,
            status=self.status.value,
            progress=self.progress,
            params=self.params,
            result=self.result,
            error=self.error,
            output_dir=self.output_dir,
            created_at=as_utc(self.created_at),
            completed_at=as_utc(self.completed_at),
            updated_at=utc_now(),
        )

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> Optional["GenerationJob"]:
        try:
            status = JobStatus(row["status"])
        except ValueError:
            return None
        created_at = _parse_timestamp(row.get("created_at"))
        if created_at is None:
            return None
        return cls(
            id=row["id"],
            type=row["type"],
            status=status,
            params=row.get("params") or {},
            output_dir=row.get("output_dir") or "",
            progress=float(row.get("progress") or 0.0),
            result=row.get("result"),
            error=row.get("error"),
            created_at=created_at,
            completed_at=_parse_timestamp(row.get("completed_at")),
        )


class JobManager:
    """Thread-safe job registry with optional durable history."""

    def __init__(self, store: Optional[JobStore] = None):
        self._jobs: Dict[str, GenerationJob] = {}
        self._lock = Lock()
        self._store = store
        if store is not None:
            self._restore_history(store)

    # -- lifecycle -------------------------------------------------------------
    def _restore_history(self, store: JobStore) -> None:
        """Reload the retention window's jobs from the database (startup only)."""
        since = utc_now() - timedelta(hours=JOB_RETENTION_HOURS)
        restored = 0
        for row in store.load_recent(since):
            job = GenerationJob.from_row(row)
            if job is None:
                continue
            if job.status not in TERMINAL_STATUSES:
                # Its worker died with the previous process.
                job.status = JobStatus.FAILED
                job.error = INTERRUPTED_JOB_ERROR
                job.completed_at = utc_now()
                store.save(job.to_row())
            self._jobs[job.id] = job
            restored += 1
        if restored:
            logger.info("Restored %d job(s) from the job history", restored)

    def close(self, timeout: float = 10.0) -> None:
        """Flush pending history writes and stop the store's writer thread."""
        if self._store is not None:
            self._store.close(timeout)

    def flush(self, timeout: Optional[float] = None) -> bool:
        """Wait for every job update so far to reach the database."""
        if self._store is None:
            return True
        return self._store.flush(timeout)

    # -- mutations -------------------------------------------------------------
    def add_job(self, job: GenerationJob):
        """Add a new job, first dropping finished jobs older than JOB_RETENTION_HOURS.

        Pruning on every add keeps memory bounded by recent activity rather
        than by how long the backend has been up.
        """
        with self._lock:
            self._prune_locked(JOB_RETENTION_HOURS)
            self._jobs[job.id] = job
            self._persist_locked(job)

    def get_job(self, job_id: str) -> Optional[GenerationJob]:
        """Get job by ID"""
        with self._lock:
            return self._jobs.get(job_id)

    def update_job(self, job_id: str, **kwargs):
        """Update job fields"""
        with self._lock:
            self._update_locked(job_id, kwargs)

    def cancel(self, job_id: str) -> bool:
        """Cancel a pending or processing job. False when it is unknown or already finished."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status not in (JobStatus.PENDING, JobStatus.PROCESSING):
                return False
            self._update_locked(
                job_id, {"status": JobStatus.CANCELLED, "completed_at": utc_now()})
            return True

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            return job is not None and job.status == JobStatus.CANCELLED

    def update_unless_cancelled(self, job_id: str, **kwargs) -> bool:
        """update_job, except a cancelled job keeps its cancellation.

        The worker's status writes (processing, completed, failed) go through
        here so a cancel that lands mid-run is never overwritten. The check and
        the write share one lock hold, so a cancel cannot slip between them.
        Returns False only when the job is cancelled.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and job.status == JobStatus.CANCELLED:
                return False
            self._update_locked(job_id, kwargs)
            return True

    def _update_locked(self, job_id: str, fields: Dict[str, Any]):
        """Apply fields and persist the snapshot. Caller holds self._lock."""
        job = self._jobs.get(job_id)
        if job is None:
            return
        for key, value in fields.items():
            if not hasattr(job, key):
                continue
            if key in _TIMESTAMP_FIELDS and isinstance(value, datetime):
                value = as_utc(value)
            setattr(job, key, value)
        self._persist_locked(job)

    def _persist_locked(self, job: GenerationJob) -> None:
        if self._store is None:
            return
        try:
            self._store.save(job.to_row())
        except Exception:
            # History is best-effort; it must never break a running job.
            logger.exception("Could not queue job %s for persistence", job.id)

    # -- queries ---------------------------------------------------------------
    def list_jobs(self, status: Optional[str] = None, limit: int = 50) -> List[GenerationJob]:
        """List jobs, newest first, optionally filtered by status value."""
        with self._lock:
            jobs = list(self._jobs.values())

        jobs.sort(key=lambda j: as_utc(j.created_at), reverse=True)
        if status:
            jobs = [j for j in jobs if j.status.value == status]
        return jobs[:limit]

    def _prune_locked(self, max_age_hours: int) -> int:
        """Drop finished jobs created more than max_age_hours ago. Caller holds self._lock."""
        cutoff = utc_now() - timedelta(hours=max_age_hours)
        to_delete = [
            job_id for job_id, job in self._jobs.items()
            if as_utc(job.created_at) < cutoff and job.status in TERMINAL_STATUSES
        ]
        for job_id in to_delete:
            del self._jobs[job_id]
        return len(to_delete)
