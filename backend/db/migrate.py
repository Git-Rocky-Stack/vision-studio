"""
Database migration runner for Vision Studio.

This module discovers and executes pending migrations in order,
updating the schema version after each successful migration.
"""

import logging
import os
import sqlite3
from importlib import import_module
from pathlib import Path
from typing import List, Tuple

from db.schema_version import get_schema_version, set_schema_version


# Path to migrations directory
# In normal dev: __file__ = backend/db/migrate.py → parent.parent = backend/
# In PyInstaller frozen: __file__ = extracted temp dir/db/migrate.py → parent = temp dir/db/
# so parent/migrations = temp dir/db/migrations (same pattern works for both)
MIGRATIONS_DIR = Path(__file__).parent / "migrations"

logger = logging.getLogger(__name__)


def get_pending_migrations(db_path: str) -> List[Tuple[int, str]]:
    """
    Get list of pending migrations that need to be run.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        List of tuples (version_number, migration_filename) for pending migrations.
    """
    current_version = get_schema_version(db_path)

    # Find all migration files
    migration_files = []
    for filename in sorted(os.listdir(MIGRATIONS_DIR)):
        if filename.endswith('.py') and not filename.startswith('__'):
            # Extract version number from filename (e.g., "001_initial_schema.py" -> 1)
            version = int(filename.split('_')[0])
            migration_files.append((version, filename))

    # Filter to only pending migrations
    pending = [(v, f) for v, f in migration_files if v > current_version]

    return pending


class MigrationError(RuntimeError):
    """A migration failed; the database stays at the last successful version."""

    def __init__(self, version: int, filename: str, cause: BaseException):
        super().__init__(f"Migration {filename} (version {version}) failed: {cause}")
        self.version = version
        self.filename = filename
        self.__cause__ = cause


def run_migrations(db_path: str) -> int:
    """
    Run all pending migrations on the database, in version order.

    After each successful migration the schema_version table is updated. The
    first failure stops the run: later migrations may depend on the failed
    one, so nothing after it is attempted and the database remains at the
    last successful version.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        The schema version the database is at when the run completes.

    Raises:
        MigrationError: A migration could not be imported, has no migrate_up,
            or raised while applying. Logged before raising.
    """
    if not MIGRATIONS_DIR.exists():
        logger.warning("Migrations directory not found: %s - skipping migrations", MIGRATIONS_DIR)
        return get_schema_version(db_path)

    pending = get_pending_migrations(db_path)
    if not pending:
        return get_schema_version(db_path)

    conn = sqlite3.connect(db_path)
    try:
        for version, filename in pending:
            try:
                module_name = f"db.migrations.{filename[:-3]}"  # strip .py
                migration_module = import_module(module_name)
                migrate_up = getattr(migration_module, "migrate_up", None)
                if not callable(migrate_up):
                    raise AttributeError(f"{filename} does not define migrate_up(conn)")
                migrate_up(conn)
                set_schema_version(db_path, version)
                logger.info("Applied database migration %s", filename)
            except Exception as exc:
                logger.error(
                    "Database migration %s failed; stopping at schema version %d",
                    filename,
                    get_schema_version(db_path),
                    exc_info=True,
                )
                raise MigrationError(version, filename, exc) from exc
    finally:
        conn.close()
    return get_schema_version(db_path)
