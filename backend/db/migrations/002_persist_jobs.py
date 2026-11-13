"""
Migration 002: durable job history; drop the never-used tables.

- jobs: 001 created it with an INTEGER autoincrement id and no params/result
  columns, but job ids are UUID strings and nothing ever wrote to it. Rebuild
  it in the shape JobManager persists (utils/job_store.py), copying any rows
  that exist (id cast to TEXT) so no data is discarded.
- images, settings: created by 001 but never read or written by the backend,
  the Electron main process, or the renderer. Dropped rather than left as
  misleading schema.
"""

import sqlite3

_JOBS_V2 = """
    CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0.0,
        params TEXT NOT NULL DEFAULT '{}',
        result TEXT,
        error TEXT,
        output_dir TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL
    )
"""


def _table_exists(cursor: sqlite3.Cursor, name: str) -> bool:
    cursor.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cursor.fetchone() is not None


def migrate_up(conn: sqlite3.Connection) -> None:
    cursor = conn.cursor()
    try:
        cursor.execute("BEGIN")
        if _table_exists(cursor, "jobs"):
            cursor.execute("ALTER TABLE jobs RENAME TO jobs_v1")
        cursor.execute(_JOBS_V2)
        if _table_exists(cursor, "jobs_v1"):
            cursor.execute("""
                INSERT INTO jobs (id, type, status, progress, error, created_at,
                                  completed_at, updated_at)
                SELECT CAST(id AS TEXT), type, status, progress, error, created_at,
                       completed_at, COALESCE(completed_at, created_at)
                FROM jobs_v1
            """)
            cursor.execute("DROP TABLE jobs_v1")
        cursor.execute("DROP INDEX IF EXISTS idx_jobs_status")
        cursor.execute("CREATE INDEX idx_jobs_status ON jobs(status)")
        cursor.execute("CREATE INDEX idx_jobs_created_at ON jobs(created_at)")

        cursor.execute("DROP INDEX IF EXISTS idx_images_created_at")
        cursor.execute("DROP TABLE IF EXISTS images")
        cursor.execute("DROP TABLE IF EXISTS settings")
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def migrate_down(conn: sqlite3.Connection) -> None:
    """Restore the 001 shape (job rows are not preserved: ids are not integers)."""
    cursor = conn.cursor()
    cursor.execute("DROP INDEX IF EXISTS idx_jobs_created_at")
    cursor.execute("DROP INDEX IF EXISTS idx_jobs_status")
    cursor.execute("DROP TABLE IF EXISTS jobs")
    cursor.execute("""
        CREATE TABLE jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL NOT NULL DEFAULT 0.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            error TEXT
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            negative_prompt TEXT DEFAULT '',
            model TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            seed INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            data TEXT
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
