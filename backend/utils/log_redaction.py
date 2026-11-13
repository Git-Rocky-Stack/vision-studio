"""Keep secrets out of server log lines (K2).

uvicorn's access log (``uvicorn.access``) and its WebSocket accept/reject
lines (``uvicorn.error``) print the request path WITH its query string. The
backend no longer accepts ``?token=``, but a stale or hostile client can still
put one (or any other secret) in a query string, and log files are shareable
support artifacts. ``QueryStringRedactionFilter`` rewrites every string
argument that looks like a request target (starts with ``/``) to its path
with the query string replaced by ``?[redacted]``.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

REDACTED_QUERY = "?[redacted]"
_UVICORN_LOGGERS = ("uvicorn.access", "uvicorn.error")


def redact_query(value: Any) -> Any:
    """'/ws?token=abc' -> '/ws?[redacted]'; anything else unchanged."""
    if isinstance(value, str) and value.startswith("/") and "?" in value:
        return value.split("?", 1)[0] + REDACTED_QUERY
    return value


class QueryStringRedactionFilter(logging.Filter):
    """Redacts query strings from request-target log arguments in place."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and args:
            record.args = tuple(redact_query(arg) for arg in args)
        elif isinstance(args, dict) and args:
            record.args = {key: redact_query(arg) for key, arg in args.items()}
        if isinstance(record.msg, str) and not record.args:
            # Pre-formatted message (no %-args): redact request targets in it.
            record.msg = " ".join(redact_query(part) for part in record.msg.split(" "))
        return True


_FILTER = QueryStringRedactionFilter()


def install_query_redaction(logger_names: Iterable[str] = _UVICORN_LOGGERS) -> QueryStringRedactionFilter:
    """Attach the (shared, idempotent) filter to uvicorn's loggers and their
    current handlers. Safe to call repeatedly - e.g. at import and again at
    startup, after uvicorn's dictConfig has (re)installed its handlers."""
    for name in logger_names:
        target = logging.getLogger(name)
        target.addFilter(_FILTER)
        for handler in target.handlers:
            handler.addFilter(_FILTER)
    return _FILTER
