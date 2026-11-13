"""
Tests for database schema versioning and migrations.
"""

import os
import pytest
import sqlite3
from pathlib import Path

from db.schema_version import SCHEMA_VERSION, get_schema_version, set_schema_version, needs_migration
from db import migrate as migrate_module
from db.migrate import MigrationError, run_migrations


@pytest.fixture
def test_db_path(tmp_path):
    """Create a temporary database path for testing."""
    db_path = tmp_path / "test_vision_studio.db"
    return str(db_path)


@pytest.fixture
def clean_db(test_db_path):
    """Ensure database doesn't exist before test and clean up after."""
    if os.path.exists(test_db_path):
        os.remove(test_db_path)
    yield test_db_path
    if os.path.exists(test_db_path):
        os.remove(test_db_path)


class TestSchemaVersion:
    """Tests for schema_version.py functions."""

    def test_schema_version_constant(self):
        """SCHEMA_VERSION tracks the newest migration file (002_persist_jobs)."""
        assert SCHEMA_VERSION == 2

    def test_get_schema_version_no_database(self, clean_db):
        """get_schema_version should return 0 when database doesn't exist."""
        version = get_schema_version(clean_db)
        assert version == 0

    def test_get_schema_version_after_migration(self, clean_db):
        """get_schema_version should return current version after migration."""
        run_migrations(clean_db)
        version = get_schema_version(clean_db)
        assert version == SCHEMA_VERSION

    def test_set_schema_version(self, clean_db):
        """set_schema_version should update the schema_version table."""
        # First create the database by running migrations
        run_migrations(clean_db)

        # Set a new version
        set_schema_version(clean_db, 99)

        # Verify it was set
        version = get_schema_version(clean_db)
        assert version == 99

    def test_needs_migration_no_database(self, clean_db):
        """needs_migration should return True when database doesn't exist."""
        assert needs_migration(clean_db) is True

    def test_needs_migration_up_to_date(self, clean_db):
        """needs_migration should return False when database is up to date."""
        run_migrations(clean_db)
        assert needs_migration(clean_db) is False

    def test_needs_migration_outdated(self, clean_db):
        """needs_migration should return True when database version is outdated."""
        # Create database and migrate
        run_migrations(clean_db)

        # Manually set version to 0 (simulating old database)
        set_schema_version(clean_db, 0)

        assert needs_migration(clean_db) is True


def _tables(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()


def _columns(db_path, table):
    conn = sqlite3.connect(db_path)
    try:
        return {row[1]: row[2] for row in conn.execute(f"PRAGMA table_info({table})")}
    finally:
        conn.close()


class TestFinalSchema:
    """The schema after every migration has run."""

    def test_creates_jobs_and_schema_version_only(self, clean_db):
        run_migrations(clean_db)
        tables = _tables(clean_db)
        assert {"jobs", "schema_version"}.issubset(tables)
        # images/settings were never used by any code path (U5) - 002 drops them.
        assert "images" not in tables
        assert "settings" not in tables

    def test_jobs_table_schema(self, clean_db):
        run_migrations(clean_db)
        columns = _columns(clean_db, "jobs")
        expected = {
            "id": "TEXT", "type": "TEXT", "status": "TEXT", "progress": "REAL",
            "params": "TEXT", "result": "TEXT", "error": "TEXT", "output_dir": "TEXT",
            "created_at": "TEXT", "completed_at": "TEXT", "updated_at": "TEXT",
        }
        for name, col_type in expected.items():
            assert name in columns, f"Missing column: {name}"
            assert columns[name].upper() == col_type

    def test_schema_version_table_schema(self, clean_db):
        run_migrations(clean_db)
        assert "version" in _columns(clean_db, "schema_version")

    def test_indexes_created(self, clean_db):
        run_migrations(clean_db)
        conn = sqlite3.connect(clean_db)
        indexes = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        conn.close()
        assert {"idx_jobs_status", "idx_jobs_created_at"}.issubset(indexes)
        assert "idx_images_created_at" not in indexes

    def test_migration_idempotent(self, clean_db):
        run_migrations(clean_db)
        assert run_migrations(clean_db) == SCHEMA_VERSION
        assert get_schema_version(clean_db) == SCHEMA_VERSION

    def test_jobs_table_accepts_string_ids(self, clean_db):
        run_migrations(clean_db)
        conn = sqlite3.connect(clean_db)
        conn.execute(
            "INSERT INTO jobs (id, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            ("4b1c-uuid", "image", "processing", "2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
        )
        conn.commit()
        row = conn.execute("SELECT id, params, progress FROM jobs").fetchone()
        conn.close()
        assert row == ("4b1c-uuid", "{}", 0.0)


class TestUpgradeFromVersion1:
    """A database created by an older build (schema version 1) upgrades in place."""

    def _make_v1(self, db_path):
        import importlib

        initial = importlib.import_module("db.migrations.001_initial_schema")
        conn = sqlite3.connect(db_path)
        initial.migrate_up(conn)
        conn.execute(
            "INSERT INTO jobs (type, status, progress, created_at) VALUES ('image', 'completed', 100.0, '2026-01-01 10:00:00')"
        )
        conn.commit()
        conn.close()
        set_schema_version(db_path, 1)

    def test_v1_rows_survive_the_jobs_rebuild(self, clean_db):
        self._make_v1(clean_db)
        assert run_migrations(clean_db) == 2
        conn = sqlite3.connect(clean_db)
        row = conn.execute("SELECT id, type, status, progress, updated_at FROM jobs").fetchone()
        conn.close()
        assert row == ("1", "image", "completed", 100.0, "2026-01-01 10:00:00")
        assert "jobs_v1" not in _tables(clean_db)


_OK_MIGRATION = """
def migrate_up(conn):
    conn.execute('CREATE TABLE {table} (x)')
    conn.commit()
"""

_FAILING_MIGRATION = """
def migrate_up(conn):
    raise RuntimeError('boom')
"""


class TestMigrationFailures:
    """U6: the runner stops at the first failed migration."""

    def _install_migrations(self, tmp_path, monkeypatch, files):
        directory = tmp_path / "fakemigs"
        directory.mkdir()
        for name, source in files.items():
            (directory / name).write_text(source, encoding="utf-8")
        monkeypatch.setattr(migrate_module, "MIGRATIONS_DIR", directory)

        def fake_import(module_name):
            stem = module_name.rsplit(".", 1)[-1]
            namespace = {}
            source = (directory / f"{stem}.py").read_text(encoding="utf-8")
            exec(compile(source, stem, "exec"), namespace)
            return type("Migration", (), namespace)

        monkeypatch.setattr(migrate_module, "import_module", fake_import)

    def test_stops_at_first_failure_and_keeps_last_good_version(
        self, clean_db, tmp_path, monkeypatch, caplog
    ):
        self._install_migrations(tmp_path, monkeypatch, {
            "001_ok.py": _OK_MIGRATION.format(table="a"),
            "002_bad.py": _FAILING_MIGRATION,
            "003_after.py": _OK_MIGRATION.format(table="c"),
        })
        with pytest.raises(MigrationError) as excinfo:
            run_migrations(clean_db)
        assert excinfo.value.version == 2
        assert get_schema_version(clean_db) == 1
        tables = _tables(clean_db)
        assert "a" in tables
        assert "c" not in tables  # nothing after the failure ran
        assert any("002_bad.py" in record.getMessage() for record in caplog.records)

    def test_missing_migrate_up_is_a_failure_not_a_skip(self, clean_db, tmp_path, monkeypatch):
        self._install_migrations(tmp_path, monkeypatch, {
            "001_empty.py": "X = 1\n",
            "002_next.py": _OK_MIGRATION.format(table="n"),
        })
        with pytest.raises(MigrationError):
            run_migrations(clean_db)
        assert get_schema_version(clean_db) == 0
        assert "n" not in _tables(clean_db)
