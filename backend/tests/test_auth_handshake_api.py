"""K1 handshake, K2 WebSocket header auth, B7 constant-time compares and
token-free logs.

Integration tier (the _api.py suffix): the conftest fixture clears the auth
token, so each test installs its own and the fixture restores it.
"""
import hashlib
import hmac
import logging
import pathlib
import secrets
import sys
from unittest import mock

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from utils.log_redaction import QueryStringRedactionFilter, redact_query  # noqa: E402

TOKEN = "handshake-test-token-0123456789abcdefghij"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "BACKEND_AUTH_TOKEN", TOKEN)
    return TestClient(main.app)


def _expected_proof(nonce: str) -> str:
    return hmac.new(TOKEN.encode("utf-8"), nonce.encode("utf-8"), hashlib.sha256).hexdigest()


# --- K1: /api/handshake ------------------------------------------------------------

def test_handshake_returns_hmac_proof_without_auth(client):
    nonce = secrets.token_hex(32)
    response = client.get("/api/handshake", params={"nonce": nonce})
    assert response.status_code == 200
    assert response.json() == {"proof": _expected_proof(nonce)}


@pytest.mark.parametrize("length", [32, 128])
def test_handshake_accepts_nonce_length_bounds(client, length):
    nonce = "a" * length
    response = client.get("/api/handshake", params={"nonce": nonce})
    assert response.status_code == 200
    assert response.json()["proof"] == _expected_proof(nonce)


def test_handshake_proof_uses_the_nonce_exactly_as_sent(client):
    nonce = "ABCDEF" + "0" * 26  # uppercase hex is valid; no case folding
    assert client.get("/api/handshake", params={"nonce": nonce}).json()["proof"] == _expected_proof(nonce)


@pytest.mark.parametrize("nonce", ["", "a" * 31, "a" * 129, "z" * 32, "0x" + "a" * 30, "a" * 31 + " "])
def test_handshake_rejects_malformed_nonce(client, nonce):
    response = client.get("/api/handshake", params={"nonce": nonce})
    assert response.status_code == 400
    assert TOKEN not in response.text


def test_handshake_missing_nonce_is_400(client):
    assert client.get("/api/handshake").status_code == 400


def test_handshake_never_reveals_the_token(client):
    nonce = secrets.token_hex(16)
    body = client.get("/api/handshake", params={"nonce": nonce}).text
    assert TOKEN not in body
    assert TOKEN.encode().hex() not in body


def test_handshake_is_rate_limited():
    # The route carries a real slowapi limit; exercised end to end in
    # test_rate_limit_api.py. Here: the decorator is registered on the route.
    route_limits = main.limiter._route_limits.get(f"{main.handshake.__module__}.{main.handshake.__name__}")
    assert route_limits, "handshake has no rate limit"
    assert str(route_limits[0].limit) == "30 per 1 minute"


# --- B7: constant-time compare ----------------------------------------------------

def test_http_auth_uses_compare_digest(client):
    with mock.patch.object(main.secrets, "compare_digest", wraps=secrets.compare_digest) as spy:
        assert client.get("/api/models", headers={main.BACKEND_AUTH_HEADER: TOKEN}).status_code != 403
    assert spy.called


def test_http_auth_rejects_wrong_and_missing_token(client):
    assert client.get("/api/models").status_code == 403
    assert client.get("/api/models", headers={main.BACKEND_AUTH_HEADER: TOKEN + "x"}).status_code == 403
    assert client.get("/api/models", headers={main.BACKEND_AUTH_HEADER: ""}).status_code == 403


def test_token_matches_handles_empty_and_non_ascii():
    assert main.token_matches(TOKEN, TOKEN)
    assert not main.token_matches(None, TOKEN)
    assert not main.token_matches("", TOKEN)
    assert not main.token_matches("tést", TOKEN)
    assert not main.token_matches(TOKEN, "")


def test_root_route_is_gone(client):
    # GET / had no caller; it is no longer an exempt, unauthenticated route.
    assert "/" not in main.AUTH_EXEMPT_PATHS
    assert client.get("/", headers={main.BACKEND_AUTH_HEADER: TOKEN}).status_code == 404


# --- K2: /ws takes the token from the header only -----------------------------------

def test_ws_accepts_the_header_token(client):
    with client.websocket_connect("/ws", headers={main.BACKEND_AUTH_HEADER: TOKEN}) as ws:
        ws.send_json({"action": "subscribe", "job_id": "none"})
    assert main.manager.active_connections == []


@pytest.mark.parametrize("url,headers", [
    ("/ws", {}),
    (f"/ws?token={TOKEN}", {}),  # the query parameter is no longer accepted
    ("/ws", {main.BACKEND_AUTH_HEADER: "wrong"}),
])
def test_ws_refuses_without_a_matching_header(client, url, headers):
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(url, headers=headers) as ws:
            ws.receive_json()
    assert excinfo.value.code == 1008


# --- K2/B7: no token in any log line ---------------------------------------------

@pytest.mark.parametrize("value,expected", [
    ("/ws?token=secret", "/ws?[redacted]"),
    ("/api/jobs?limit=5", "/api/jobs?[redacted]"),
    ("/api/jobs", "/api/jobs"),
    ("GET", "GET"),
    (200, 200),
])
def test_redact_query(value, expected):
    assert redact_query(value) == expected


def test_access_log_record_never_carries_the_query_string():
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 1,
        '%s - "%s %s HTTP/%s" %d', ("127.0.0.1:5000", "GET", f"/ws?token={TOKEN}", "1.1", 101), None)
    QueryStringRedactionFilter().filter(record)
    assert TOKEN not in record.getMessage()
    assert "/ws?[redacted]" in record.getMessage()


def test_websocket_accept_log_never_carries_the_query_string():
    record = logging.LogRecord(
        "uvicorn.error", logging.INFO, __file__, 1,
        '%s - "WebSocket %s" [accepted]', ("127.0.0.1:5000", f"/ws?token={TOKEN}"), None)
    QueryStringRedactionFilter().filter(record)
    assert TOKEN not in record.getMessage()


def test_redaction_filter_is_installed_on_uvicorn_loggers():
    for name in ("uvicorn.access", "uvicorn.error"):
        assert any(isinstance(f, QueryStringRedactionFilter) for f in logging.getLogger(name).filters)


def test_generated_dev_token_is_never_logged(caplog):
    with caplog.at_level(logging.DEBUG):
        generated = main.resolve_backend_auth_token(None)
    assert generated and len(generated) >= 32
    assert caplog.records, "a generated token should be announced (without its value)"
    assert all(generated not in record.getMessage() for record in caplog.records)


def test_configured_token_is_used_silently(caplog):
    with caplog.at_level(logging.DEBUG):
        assert main.resolve_backend_auth_token(TOKEN) == TOKEN
    assert all(TOKEN not in record.getMessage() for record in caplog.records)
