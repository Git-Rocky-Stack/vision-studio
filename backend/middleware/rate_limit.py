"""
Rate limiting middleware for Vision Studio API.

Uses slowapi (Starlette adaptation of limits) to implement rate limiting
with configurable limits per endpoint category.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Rate limit configurations
# Format: "{count}/{period}" where period is second, minute, hour, day, month, year
RATE_LIMIT_GENERATE = "10/minute"  # Generation endpoints (expensive operations)
RATE_LIMIT_EDIT = "30/minute"      # Edit tool endpoints
RATE_LIMIT_BATCH = "5/minute"      # Batch export (resource intensive)
RATE_LIMIT_DEFAULT = "60/minute"   # All other endpoints

# Convenience dict for decorator usage
LIMITS = {
    "generate": RATE_LIMIT_GENERATE,
    "edit": RATE_LIMIT_EDIT,
    "batch": RATE_LIMIT_BATCH,
    "default": RATE_LIMIT_DEFAULT,
}


def get_remote_address(request: Request) -> str:
    """
    Extract client IP address from request.

    Handles X-Forwarded-For header for proxied requests.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2, ...
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# Create limiter instance with custom key function
limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Handle rate limit exceeded exceptions.

    Returns a JSON 429 response with standard rate limit headers.
    """
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": "Rate limit exceeded",
            "error_code": "RATE_LIMITED",
            "retry_after": str(exc.headers.get("Retry-After", "60")),
        },
        headers={
            "Retry-After": exc.headers.get("Retry-After", "60"),
            "X-RateLimit-Limit": exc.headers.get("X-RateLimit-Limit", "unknown"),
            "X-RateLimit-Reset": exc.headers.get("X-RateLimit-Reset", "unknown"),
        },
    )
