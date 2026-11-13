"""B12: rate limiting really limits, and the 429 is a 429 (not a 500).

The suite disables limiting via VISION_STUDIO_DISABLE_RATE_LIMIT (conftest).
These tests build their own app around a fresh, ENABLED limiter and the
production exception handler, then actually exceed a limit.
"""
import pathlib
import sys

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from middleware import rate_limit  # noqa: E402


def _limited_app(limit: str = "2/minute") -> FastAPI:
    limiter = Limiter(key_func=rate_limit.get_remote_address, enabled=True)
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit.rate_limit_exceeded_handler)

    @app.get("/limited")
    @limiter.limit(limit)
    async def limited(request: Request):
        return {"ok": True}

    return app


def test_exceeding_a_limit_returns_429_with_retry_after():
    client = TestClient(_limited_app("2/minute"))
    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 200

    response = client.get("/limited")

    assert response.status_code == 429
    body = response.json()
    assert body["error_code"] == "RATE_LIMITED"
    retry_after = int(response.headers["Retry-After"])
    assert 1 <= retry_after <= 60
    assert body["retry_after"] == retry_after
    assert response.headers["X-RateLimit-Limit"] == "2"


def test_forwarded_for_header_cannot_buy_a_fresh_bucket():
    client = TestClient(_limited_app("1/minute"))
    assert client.get("/limited", headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 200
    assert client.get("/limited", headers={"X-Forwarded-For": "10.0.0.2"}).status_code == 429


def test_handler_survives_exception_without_headers():
    # slowapi raises RateLimitExceeded with headers=None and, for a limit hit
    # outside a request that recorded view_rate_limit, no window stats either.
    class _State:
        pass

    class _App:
        state = _State()

    class _Req:
        state = _State()
        app = _App()

    class _Wrapped:
        class limit:  # noqa: N801 - mimics slowapi's Limit wrapper
            amount = 5

            @staticmethod
            def get_expiry():
                return 60

        error_message = None

    exc = RateLimitExceeded(_Wrapped())
    assert exc.headers is None
    response = rate_limit.rate_limit_exceeded_handler(_Req(), exc)
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"


@pytest.mark.parametrize("value,enabled", [
    ("1", False), ("true", False), ("YES", False), ("on", False),
    ("", True), ("0", True), ("false", True), ("anything", True),
])
def test_only_the_explicit_env_var_disables_limiting(value, enabled):
    assert rate_limit.rate_limiting_enabled({"VISION_STUDIO_DISABLE_RATE_LIMIT": value}) is enabled


def test_loaded_test_runners_do_not_disable_limiting():
    # torch/diffusers import unittest in production; that must not matter.
    assert "unittest" in sys.modules and "pytest" in sys.modules
    assert rate_limit.rate_limiting_enabled({}) is True
