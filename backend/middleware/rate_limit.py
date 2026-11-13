"""
Rate limiting middleware for Vision Studio API.

Uses slowapi (Starlette adaptation of limits) to implement rate limiting
with configurable limits per endpoint category.
"""

import logging
import math
import os
import time
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger(__name__)

# Rate limit configurations
# Format: "{count}/{period}" where period is second, minute, hour, day, month, year
RATE_LIMIT_GENERATE = "10/minute"  # Generation endpoints (expensive operations)
RATE_LIMIT_EDIT = "30/minute"      # Edit tool endpoints
RATE_LIMIT_DEFAULT = "60/minute"   # All other endpoints
RATE_LIMIT_HANDSHAKE = "30/minute"  # Unauthenticated token-possession proof

# Convenience dict for decorator usage
LIMITS = {
    "generate": RATE_LIMIT_GENERATE,
    "edit": RATE_LIMIT_EDIT,
    "default": RATE_LIMIT_DEFAULT,
    "handshake": RATE_LIMIT_HANDSHAKE,
}

DISABLE_ENV_VAR = "VISION_STUDIO_DISABLE_RATE_LIMIT"
_TRUTHY = {"1", "true", "yes", "on"}

# Fallback Retry-After when the limiter cannot report its window (seconds).
_DEFAULT_RETRY_AFTER_SECONDS = 60


def get_remote_address(request: Request) -> str:
    """The client address that keys the rate-limit bucket.

    Deliberately the socket peer only. The backend binds to loopback with no
    reverse proxy in front of it, so an ``X-Forwarded-For`` header is
    attacker-controlled: honoring it would let any caller pick a fresh bucket
    per request and bypass every limit.
    """
    return request.client.host if request.client else "127.0.0.1"


def rate_limiting_enabled(environ: Optional[dict] = None) -> bool:
    """Whether request rate limiting is active for this process.

    Limiting is ON unless ``VISION_STUDIO_DISABLE_RATE_LIMIT`` is explicitly
    truthy (1/true/yes/on). The test suite sets it in ``tests/conftest.py``
    (its single TestClient shares one bucket, so unrelated tests would trip
    each other's limits); tests that exercise limiting turn the limiter back
    on themselves.

    There is intentionally no "a test runner is loaded" heuristic: torch,
    diffusers and friends import ``unittest`` in production, which used to
    silently disable limiting in the shipped app.
    """
    env = environ if environ is not None else os.environ
    return env.get(DISABLE_ENV_VAR, "").strip().lower() not in _TRUTHY


# Create limiter instance with the peer-address key function.
limiter = Limiter(key_func=get_remote_address, enabled=rate_limiting_enabled())


def _retry_after_seconds(request: Request, exc: RateLimitExceeded) -> int:
    """Seconds until the exceeded window resets (>= 1).

    slowapi raises ``RateLimitExceeded`` with ``headers=None`` and records the
    limit that tripped in ``request.state.view_rate_limit``; the limiter's
    window stats give the reset time. Falls back to the limit's full window,
    then to 60s.
    """
    view = getattr(request.state, "view_rate_limit", None)
    active = getattr(request.app.state, "limiter", None) or limiter
    if view:
        try:
            reset_at, _remaining = active.limiter.get_window_stats(view[0], *view[1])
            return max(1, int(math.ceil(reset_at - time.time())))
        except Exception:  # noqa: BLE001 - storage hiccup: fall back below
            logger.debug("Rate-limit window stats unavailable", exc_info=True)
    try:
        return max(1, int(exc.limit.limit.get_expiry()))
    except Exception:  # noqa: BLE001
        return _DEFAULT_RETRY_AFTER_SECONDS


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """JSON 429 with an accurate ``Retry-After`` (never a 500)."""
    retry_after = _retry_after_seconds(request, exc)
    headers = {"Retry-After": str(retry_after)}
    # Upstream may attach headers in future versions; keep any it sets.
    for name, value in (getattr(exc, "headers", None) or {}).items():
        headers.setdefault(name, value)
    limit_amount = None
    try:
        limit_amount = exc.limit.limit.amount
    except Exception:  # noqa: BLE001
        pass
    if limit_amount is not None:
        headers.setdefault("X-RateLimit-Limit", str(limit_amount))
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": "Rate limit exceeded",
            "error_code": "RATE_LIMITED",
            "retry_after": retry_after,
        },
        headers=headers,
    )
