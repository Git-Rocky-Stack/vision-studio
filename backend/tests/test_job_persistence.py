"""U5: job history persists to the jobs table off the caller's thread.

Also covers the tz-aware UTC timestamp contract (documented as UTC in the API).
"""

import sqlite3
import threading
from datetime import datetime, timedelta, timezone

import pytest

from db.migrate import run_migrations
from utils.job_manager import (
    INTERRUPTED_JOB_ERROR,
    GenerationJob,
    JobManager,
    JobStatus,
    as_utc,
)
from utils.job_store import JobStore


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "vision_studio.db")
    run_migrations(path)
    return path


def _job(job_id="job-1", status=JobStatus.PENDING, **kwargs):
    return GenerationJob(
        id=job_id, type="image", status=status,
        params={"prompt": "a lighthouse", "width": 1024},
        output_dir=f"/tmp/outputs/{job_id}", **kwargs,
    )


def _rows(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        return {row["id"]: dict(row) for row in conn.execute("SELECT * FROM jobs")}
    finally:
        conn.close()


def test_add_and_complete_are_written_to_the_jobs_table(db_path):
    manager = JobManager(store=JobStore(db_path))
    try:
        manager.add_job(_job())
        manager.update_job("job-1", status=JobStatus.PROCESSING, progress=40.0)
        manager.update_unless_cancelled(
            "job-1", status=JobStatus.COMPLETED, progress=100.0,
            result={"images": ["/outputs/job-1/a.png"]}, completed_at=datetime.now(),
        )
        assert manager.flush(timeout=5)
    finally:
        manager.close()

    row = _rows(db_path)["job-1"]
    assert row["status"] == "completed"
    assert row["progress"] == 100.0
    assert '"/outputs/job-1/a.png"' in row["result"]
    assert '"a lighthouse"' in row["params"]
    assert row["created_at"].endswith("+00:00")
    assert row["completed_at"].endswith("+00:00")


def test_history_survives_a_restart(db_path):
    first = JobManager(store=JobStore(db_path))
    first.add_job(_job("done", JobStatus.COMPLETED, progress=100.0))
    first.close()

    second = JobManager(store=JobStore(db_path))
    try:
        restored = second.get_job("done")
        assert restored is not None
        assert restored.status == JobStatus.COMPLETED
        assert restored.params["prompt"] == "a lighthouse"
        assert restored.created_at.tzinfo is not None
        assert [job.id for job in second.list_jobs()] == ["done"]
    finally:
        second.close()


def test_jobs_running_at_shutdown_restore_as_failed(db_path):
    first = JobManager(store=JobStore(db_path))
    first.add_job(_job("running", JobStatus.PROCESSING, progress=30.0))
    first.close()

    second = JobManager(store=JobStore(db_path))
    try:
        job = second.get_job("running")
        assert job.status == JobStatus.FAILED
        assert job.error == INTERRUPTED_JOB_ERROR
        assert job.completed_at is not None
        assert second.flush(timeout=5)
    finally:
        second.close()
    assert _rows(db_path)["running"]["status"] == "failed"


def test_history_older_than_retention_is_not_restored_and_is_purged(db_path):
    first = JobManager(store=JobStore(db_path))
    old = _job("old", JobStatus.COMPLETED)
    old.created_at = datetime.now(timezone.utc) - timedelta(hours=48)
    first.add_job(old)
    first.close()

    second = JobManager(store=JobStore(db_path))
    second.close()
    assert second.get_job("old") is None
    assert "old" not in _rows(db_path)


def test_writes_happen_off_the_calling_thread(db_path):
    write_threads = []

    class RecordingStore(JobStore):
        def _write_batch(self, conn, rows):
            write_threads.append(threading.current_thread())
            super()._write_batch(conn, rows)

    manager = JobManager(store=RecordingStore(db_path))
    try:
        manager.add_job(_job("bg"))
        manager.update_job("bg", progress=10.0)
        assert manager.flush(timeout=5)
    finally:
        manager.close()
    assert write_threads
    assert all(thread is not threading.current_thread() for thread in write_threads)
    assert {thread.name for thread in write_threads} == {"job-store-writer"}
    assert "bg" in _rows(db_path)


def test_progress_bursts_are_coalesced(db_path):
    store = JobStore(db_path)
    manager = JobManager(store=store)
    try:
        manager.add_job(_job("burst", JobStatus.PROCESSING))
        for step in range(200):
            manager.update_job("burst", progress=float(step) / 2)
        assert manager.flush(timeout=5)
    finally:
        manager.close()
    assert _rows(db_path)["burst"]["progress"] == 99.5


def test_store_write_failure_never_breaks_the_job(tmp_path):
    # No migrations ran: the jobs table does not exist, every upsert fails.
    store = JobStore(str(tmp_path / "empty.db"))
    manager = JobManager(store=store)
    try:
        manager.add_job(_job("x"))
        manager.update_job("x", status=JobStatus.COMPLETED)
        assert manager.flush(timeout=5)
        assert manager.get_job("x").status == JobStatus.COMPLETED
    finally:
        manager.close()


def test_naive_timestamps_are_normalized_to_utc():
    manager = JobManager()
    manager.add_job(_job("tz"))
    naive = datetime.now()
    manager.update_job("tz", completed_at=naive)
    job = manager.get_job("tz")
    assert job.created_at.tzinfo is not None
    assert job.completed_at.utcoffset() == timedelta(0)
    assert job.completed_at == as_utc(naive)
    payload = job.to_dict()
    assert payload["created_at"].endswith("+00:00")
    assert payload["completed_at"].endswith("+00:00")


def test_close_is_idempotent_and_save_after_close_is_ignored(db_path):
    store = JobStore(db_path)
    store.close()
    store.close()
    store.save({"id": "late"})  # must not raise or hang


def test_writer_survives_a_failed_wal_switch_and_a_failed_open(db_path, monkeypatch):
    # Regression: the writer's PRAGMA journal_mode=WAL raced the startup purge
    # ("database is locked") and left the store connection-less for the whole
    # run - no job was ever persisted. WAL is best-effort and a failed open is
    # retried on the next write; the row must land either way.
    import utils.job_store as job_store_module

    real_connect = sqlite3.connect
    calls = {"open": 0}

    class _NoWalConnection:
        def __init__(self, conn):
            self._conn = conn

        def execute(self, sql, *args):
            if "journal_mode" in sql:
                raise sqlite3.OperationalError("database is locked")
            return self._conn.execute(sql, *args)

        def __getattr__(self, name):
            return getattr(self._conn, name)

        def __enter__(self):
            return self._conn.__enter__()

        def __exit__(self, *exc):
            return self._conn.__exit__(*exc)

    def flaky_connect(path, *args, **kwargs):
        calls["open"] += 1
        if calls["open"] == 1:
            raise sqlite3.OperationalError("unable to open database file")
        return _NoWalConnection(real_connect(path, *args, **kwargs))

    monkeypatch.setattr(job_store_module.sqlite3, "connect", flaky_connect)
    monkeypatch.setattr(job_store_module.time, "sleep", lambda _s: None)
    store = JobStore(db_path)
    try:
        store.save(_job("late").to_row())
        assert store.flush(timeout=5)
    finally:
        store.close()
    monkeypatch.setattr(job_store_module.sqlite3, "connect", real_connect)

    assert calls["open"] >= 2
    assert "late" in _rows(db_path)
