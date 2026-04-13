"""
Migration 001: Initial schema

Creates the initial database schema for Vision Studio including:
- images: Stores generated image metadata
- jobs: Tracks generation job status and progress
- settings: Application settings and preferences
- schema_version: Tracks current schema version

Also creates indexes for common query patterns.
"""

import sqlite3


def migrate_up(conn: sqlite3.Connection) -> None:
    """
    Apply the initial schema migration.

    Creates all base tables and indexes for Vision Studio.

    Args:
        conn: SQLite database connection.
    """
    cursor = conn.cursor()

    # Create images table for storing generated image metadata
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

    # Create jobs table for tracking generation jobs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL NOT NULL DEFAULT 0.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            error TEXT
        )
    """)

    # Create settings table for application configuration
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Create schema_version table to track migrations
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        )
    """)

    # Create indexes for common query patterns
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_images_created_at
        ON images(created_at)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_jobs_status
        ON jobs(status)
    """)

    conn.commit()


def migrate_down(conn: sqlite3.Connection) -> None:
    """
    Rollback the initial schema migration.

    Drops all tables created by migrate_up.
    Note: SQLite doesn't support IF EXISTS for DROP TABLE,
    so this will raise an error if tables don't exist.

    Args:
        conn: SQLite database connection.
    """
    cursor = conn.cursor()

    # Drop indexes first (they're automatically dropped with tables,
    # but explicit is better for rollback clarity)
    cursor.execute("DROP INDEX IF EXISTS idx_images_created_at")
    cursor.execute("DROP INDEX IF EXISTS idx_jobs_status")

    # Drop tables in reverse order of creation
    # (respecting foreign key dependencies if any existed)
    cursor.execute("DROP TABLE IF EXISTS schema_version")
    cursor.execute("DROP TABLE IF EXISTS settings")
    cursor.execute("DROP TABLE IF EXISTS jobs")
    cursor.execute("DROP TABLE IF EXISTS images")

    conn.commit()
