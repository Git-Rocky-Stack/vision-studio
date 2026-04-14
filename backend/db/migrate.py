"""
Database migration runner for Vision Studio.

This module discovers and executes pending migrations in order,
updating the schema version after each successful migration.
"""

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


def run_migrations(db_path: str) -> None:
    """
    Run all pending migrations on the database.

    Migrations are executed in order (by version number). After each successful
    migration, the schema_version table is updated. If a migration fails,
    the process stops and the database remains at the last successful version.

    Args:
        db_path: Path to the SQLite database file.

    Raises:
        FileNotFoundError: If migrations directory doesn't exist.
        ImportError: If a migration module cannot be imported.
        AttributeError: If a migration doesn't implement migrate_up.
        sqlite3.Error: If a database operation fails.
    """
    if not MIGRATIONS_DIR.exists():
        raise FileNotFoundError(f"Migrations directory not found: {MIGRATIONS_DIR}")

    pending = get_pending_migrations(db_path)

    if not pending:
        return  # No migrations to run

    # Connect to database
    conn = sqlite3.connect(db_path)
    try:
        for version, filename in pending:
            # Import migration module
            module_name = f"db.migrations.{filename[:-3]}"  # Remove .py extension
            migration_module = import_module(module_name)

            # Verify migration has required functions
            if not hasattr(migration_module, 'migrate_up'):
                raise AttributeError(f"Migration {filename} missing migrate_up function")

            # Execute migration
            migration_module.migrate_up(conn)

            # Update schema version after successful migration
            set_schema_version(db_path, version)

    finally:
        conn.close()
