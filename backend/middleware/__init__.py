"""
Middleware package for Vision Studio backend.

Provides request rate limiting (slowapi). Authentication and CORS are
installed directly on the app in ``main.py``.
"""

from .rate_limit import (
    limiter,
    rate_limit_exceeded_handler,
    RATE_LIMIT_GENERATE,
    RATE_LIMIT_EDIT,
    RATE_LIMIT_DEFAULT,
    RATE_LIMIT_HANDSHAKE,
)

__all__ = [
    "limiter",
    "rate_limit_exceeded_handler",
    "RATE_LIMIT_GENERATE",
    "RATE_LIMIT_EDIT",
    "RATE_LIMIT_DEFAULT",
    "RATE_LIMIT_HANDSHAKE",
]
