"""
Schema version management for Vision Studio database.

This module provides functions to track and manage the database schema version,
enabling safe migrations and backward compatibility.
"""

import os
import sqlite3
from typing import Optional


# Current schema version - increment when adding new migrations
SCHEMA_VERSION = 1


def get_schema_version(db_path: str) -> int:
    """
    Get the current schema version from the database.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        The current schema version number, or 0 if database doesn't exist
        or schema_version table doesn't exist.
    """
    if not os.path.exists(db_path):
        return 0

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check if schema_version table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='schema_version'
        """)

        if cursor.fetchone() is None:
            conn.close()
            return 0

        # Get the current version
        cursor.execute("SELECT version FROM schema_version LIMIT 1")
        result = cursor.fetchone()

        conn.close()

        return result[0] if result else 0

    except sqlite3.Error:
        return 0


def set_schema_version(db_path: str, version: int) -> None:
    """
    Set the schema version in the database.

    Args:
        db_path: Path to the SQLite database file.
        version: The schema version number to set.

    Raises:
        sqlite3.Error: If database operation fails.
    """
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()

        # Ensure schema_version table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER NOT NULL
            )
        """)

        # Clear existing version and insert new one
        cursor.execute("DELETE FROM schema_version")
        cursor.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))

        conn.commit()
    finally:
        conn.close()


def needs_migration(db_path: str) -> bool:
    """
    Check if the database needs migration.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        True if the database needs migration (doesn't exist or version is outdated),
        False if the database is up to date.
    """
    if not os.path.exists(db_path):
        return True

    current_version = get_schema_version(db_path)
    return current_version < SCHEMA_VERSION
