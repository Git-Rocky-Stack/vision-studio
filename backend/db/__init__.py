"""
Database package for Vision Studio.
Provides schema versioning and migration support.
"""

from db.schema_version import SCHEMA_VERSION, get_schema_version, set_schema_version, needs_migration
from db.migrate import run_migrations

__all__ = [
    'SCHEMA_VERSION',
    'get_schema_version',
    'set_schema_version',
    'needs_migration',
    'run_migrations',
]
