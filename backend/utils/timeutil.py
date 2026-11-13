"""Timezone-aware timestamps for every persisted or API-visible time.

The API documents timestamps as UTC (ISO 8601 with an offset). Naive
``datetime.now()`` values serialize without an offset and in the host's local
zone, so every job/record timestamp goes through ``utc_now()`` instead.
"""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return the current time as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)
