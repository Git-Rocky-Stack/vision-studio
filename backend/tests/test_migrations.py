"""
Tests for database schema versioning and migrations.
"""

import os
import pytest
import sqlite3
from pathlib import Path

from db.schema_version import SCHEMA_VERSION, get_schema_version, set_schema_version, needs_migration
from db.migrate import run_migrations


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
        """SCHEMA_VERSION should be 1."""
        assert SCHEMA_VERSION == 1

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


class TestInitialMigration:
    """Tests for the initial schema migration (001)."""

    def test_initial_migration_creates_tables(self, clean_db):
        """Migration should create all required tables."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()

        # Get all table names
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()

        # Verify all required tables exist
        required_tables = {'images', 'jobs', 'settings', 'schema_version'}
        assert required_tables.issubset(tables)

    def test_images_table_schema(self, clean_db):
        """Images table should have correct columns."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(images)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        conn.close()

        expected_columns = {
            'id': 'INTEGER',
            'prompt': 'TEXT',
            'negative_prompt': 'TEXT',
            'model': 'TEXT',
            'width': 'INTEGER',
            'height': 'INTEGER',
            'seed': 'INTEGER',
            'created_at': 'TEXT',
            'data': 'TEXT',
        }

        for col_name, col_type in expected_columns.items():
            assert col_name in columns, f"Missing column: {col_name}"
            assert columns[col_name].upper() == col_type.upper(), \
                f"Column {col_name} has wrong type: {columns[col_name]} != {col_type}"

    def test_jobs_table_schema(self, clean_db):
        """Jobs table should have correct columns."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(jobs)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        conn.close()

        expected_columns = {
            'id': 'INTEGER',
            'type': 'TEXT',
            'status': 'TEXT',
            'progress': 'REAL',
            'created_at': 'TEXT',
            'completed_at': 'TEXT',
            'error': 'TEXT',
        }

        for col_name, col_type in expected_columns.items():
            assert col_name in columns, f"Missing column: {col_name}"

    def test_settings_table_schema(self, clean_db):
        """Settings table should have correct columns."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(settings)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        conn.close()

        expected_columns = {
            'key': 'TEXT',
            'value': 'TEXT',
            'updated_at': 'TEXT',
        }

        for col_name, col_type in expected_columns.items():
            assert col_name in columns, f"Missing column: {col_name}"

    def test_schema_version_table_schema(self, clean_db):
        """Schema_version table should have version column."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(schema_version)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}
        conn.close()

        assert 'version' in columns, "Missing version column in schema_version table"

    def test_indexes_created(self, clean_db):
        """Migration should create required indexes."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()

        # Get all index names
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
        )
        indexes = {row[0] for row in cursor.fetchall()}
        conn.close()

        # Verify required indexes exist
        required_indexes = {'idx_images_created_at', 'idx_jobs_status'}
        assert required_indexes.issubset(indexes)

    def test_migration_idempotent(self, clean_db):
        """Running migrations twice should not cause errors."""
        # Run migrations first time
        run_migrations(clean_db)

        # Run migrations second time - should be safe
        run_migrations(clean_db)

        # Verify database is still valid
        version = get_schema_version(clean_db)
        assert version == SCHEMA_VERSION

    def test_images_table_accepts_data(self, clean_db):
        """Images table should accept and store data correctly."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()

        # Insert test data
        cursor.execute("""
            INSERT INTO images (prompt, negative_prompt, model, width, height, seed, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("test prompt", "test negative", "flux-dev", 1024, 1024, 42, '{"test": true}'))

        conn.commit()

        # Retrieve and verify
        cursor.execute("SELECT prompt, model, width FROM images WHERE seed = 42")
        row = cursor.fetchone()

        assert row is not None
        assert row[0] == "test prompt"
        assert row[1] == "flux-dev"
        assert row[2] == 1024

        conn.close()

    def test_jobs_table_accepts_data(self, clean_db):
        """Jobs table should accept and store data correctly."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()

        # Insert test data
        cursor.execute("""
            INSERT INTO jobs (type, status, progress, error)
            VALUES (?, ?, ?, ?)
        """, ("image", "processing", 50.0, None))

        conn.commit()

        # Retrieve and verify
        cursor.execute("SELECT type, status, progress FROM jobs WHERE progress = 50.0")
        row = cursor.fetchone()

        assert row is not None
        assert row[0] == "image"
        assert row[1] == "processing"
        assert row[2] == 50.0

        conn.close()

    def test_settings_table_accepts_data(self, clean_db):
        """Settings table should accept and store data correctly."""
        run_migrations(clean_db)

        conn = sqlite3.connect(clean_db)
        cursor = conn.cursor()

        # Insert test data
        cursor.execute("""
            INSERT INTO settings (key, value)
            VALUES (?, ?)
        """, ("test_key", "test_value"))

        conn.commit()

        # Retrieve and verify
        cursor.execute("SELECT value FROM settings WHERE key = 'test_key'")
        row = cursor.fetchone()

        assert row is not None
        assert row[0] == "test_value"

        conn.close()
