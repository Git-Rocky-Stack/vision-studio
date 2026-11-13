"""SQLite persistence for generation jobs (the ``jobs`` table, migration 002).

JobManager stays the in-memory source of truth for live jobs; this store makes
the job history durable so it survives a backend restart.

Writes never block the caller: ``save()`` only enqueues a snapshot and a
single daemon writer thread drains the queue, coalescing repeated snapshots of
the same job (per-step progress updates) into one upsert per batch, all in
one transaction. JobManager is called from the asyncio event loop, so nothing
here may touch SQLite on the calling thread except the one-shot startup load.
"""

from __future__ import annotations

import json
import logging
import queue
import sqlite3
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Sentinel that tells the writer thread to exit after draining.
_STOP = object()

# How long a connection waits on another connection's lock before failing,
# and how many times the writer retries enabling WAL (see
# _open_writer_connection).
_BUSY_TIMEOUT_SECONDS = 30.0
_WAL_ATTEMPTS = 5

_UPSERT_SQL = """
    INSERT INTO jobs (id, type, status, progress, params, result, error,
                      output_dir, created_at, completed_at, updated_at)
    VALUES (:id, :type, :status, :progress, :params, :result, :error,
            :output_dir, :created_at, :completed_at, :updated_at)
    ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        status = excluded.status,
        progress = excluded.progress,
        params = excluded.params,
        result = excluded.result,
        error = excluded.error,
        output_dir = excluded.output_dir,
        created_at = excluded.created_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
"""


def _to_json(value: Any) -> Optional[str]:
    if value is None:
        return None
    # default=str: params may carry paths or enums; history must never fail
    # to persist because one value is not natively JSON-serializable.
    return json.dumps(value, default=str)


def _from_json(raw: Optional[str]) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


class JobStore:
    """Durable job history backed by the app database's ``jobs`` table."""

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._queue: "queue.Queue[Any]" = queue.Queue()
        self._closed = False
        self._writer = threading.Thread(
            target=self._run_writer, name="job-store-writer", daemon=True
        )
        self._writer.start()

    # -- write path (non-blocking) -------------------------------------------
    def save(self, row: Dict[str, Any]) -> None:
        """Enqueue a job snapshot (see GenerationJob.to_row) for persistence."""
        if self._closed:
            return
        self._queue.put(dict(row))

    def flush(self, timeout: Optional[float] = None) -> bool:
        """Block until every snapshot enqueued so far is written (tests, shutdown)."""
        done = threading.Event()
        self._queue.put(done)
        return done.wait(timeout)

    def close(self, timeout: float = 10.0) -> None:
        """Drain pending writes and stop the writer thread."""
        if self._closed:
            return
        self._closed = True
        self._queue.put(_STOP)
        self._writer.join(timeout)
        if self._writer.is_alive():
            logger.warning("Job store writer did not finish within %.0fs; some job updates may be lost", timeout)

    def _open_writer_connection(self) -> Optional[sqlite3.Connection]:
        """Open the writer's connection; WAL is best-effort.

        The writer starts while the constructing thread may still be running
        load_recent()'s purge, and switching the journal mode needs a lock
        the busy handler does not always wait for - a single failed PRAGMA
        used to leave the store without a connection for the whole run, so
        no job was ever persisted. WAL is only a concurrency optimization:
        retry it briefly, then carry on in the default journal mode.
        """
        try:
            conn = sqlite3.connect(self._db_path, timeout=_BUSY_TIMEOUT_SECONDS, check_same_thread=False)
        except sqlite3.Error:
            logger.exception("Job store could not open %s; will retry on the next write", self._db_path)
            return None
        for attempt in range(_WAL_ATTEMPTS):
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                break
            except sqlite3.OperationalError:
                time.sleep(0.05 * (attempt + 1))
        else:
            logger.warning("Job store could not enable WAL on %s; using the default journal mode", self._db_path)
        return conn

    def _run_writer(self) -> None:
        conn: Optional[sqlite3.Connection] = self._open_writer_connection()

        stop = False
        while not stop:
            item = self._queue.get()
            batch: Dict[str, Dict[str, Any]] = {}
            waiters: List[threading.Event] = []

            def absorb(entry: Any) -> bool:
                if entry is _STOP:
                    return True
                if isinstance(entry, threading.Event):
                    waiters.append(entry)
                else:
                    batch[entry["id"]] = entry  # latest snapshot wins
                return False

            stop = absorb(item)
            while not stop:
                try:
                    stop = absorb(self._queue.get_nowait())
                except queue.Empty:
                    break

            if batch and conn is None:
                # The open failed earlier (e.g. a transient lock): retry
                # instead of silently dropping history for the whole run.
                conn = self._open_writer_connection()
            if batch and conn is not None:
                self._write_batch(conn, list(batch.values()))
            for waiter in waiters:
                waiter.set()

        # Release anyone still waiting on a flush queued behind the stop.
        while True:
            try:
                leftover = self._queue.get_nowait()
            except queue.Empty:
                break
            if isinstance(leftover, threading.Event):
                leftover.set()
        if conn is not None:
            conn.close()

    def _write_batch(self, conn: sqlite3.Connection, rows: List[Dict[str, Any]]) -> None:
        """Upsert one coalesced batch in a single transaction (writer thread only)."""
        try:
            with conn:
                conn.executemany(_UPSERT_SQL, rows)
        except sqlite3.Error:
            logger.exception("Failed to persist %d job update(s)", len(rows))

    # -- read path (startup only) ---------------------------------------------
    def load_recent(self, since: datetime) -> List[Dict[str, Any]]:
        """Rows created at or after ``since`` (tz-aware), newest first.

        Called once while the backend starts (never from the event loop).
        Also deletes rows older than ``since`` so the table stays bounded by
        the same retention window as the in-memory job list.
        """
        since_iso = since.isoformat()
        try:
            conn = sqlite3.connect(self._db_path, timeout=_BUSY_TIMEOUT_SECONDS)
        except sqlite3.Error:
            logger.exception("Job store could not open %s; starting with no job history", self._db_path)
            return []
        try:
            conn.row_factory = sqlite3.Row
            with conn:
                conn.execute(
                    "DELETE FROM jobs WHERE created_at < ? AND status IN ('completed', 'failed', 'cancelled')",
                    (since_iso,),
                )
            rows = conn.execute(
                "SELECT id, type, status, progress, params, result, error, output_dir,"
                " created_at, completed_at FROM jobs WHERE created_at >= ?"
                " ORDER BY created_at DESC",
                (since_iso,),
            ).fetchall()
        except sqlite3.Error:
            logger.exception("Failed to load job history from %s", self._db_path)
            return []
        finally:
            conn.close()

        loaded: List[Dict[str, Any]] = []
        for row in rows:
            entry = dict(row)
            entry["params"] = _from_json(entry["params"]) or {}
            entry["result"] = _from_json(entry["result"])
            loaded.append(entry)
        return loaded


def serialize_row(
    *,
    job_id: str,
    job_type: str,
    status: str,
    progress: float,
    params: Dict[str, Any],
    result: Optional[Dict[str, Any]],
    error: Optional[str],
    output_dir: str,
    created_at: datetime,
    completed_at: Optional[datetime],
    updated_at: datetime,
) -> Dict[str, Any]:
    """Build the parameter mapping _UPSERT_SQL expects."""
    return {
        "id": job_id,
        "type": job_type,
        "status": status,
        "progress": float(progress),
        "params": _to_json(params) or "{}",
        "result": _to_json(result),
        "error": error,
        "output_dir": output_dir,
        "created_at": created_at.isoformat(),
        "completed_at": completed_at.isoformat() if completed_at else None,
        "updated_at": updated_at.isoformat(),
    }


__all__ = ["JobStore", "serialize_row"]
