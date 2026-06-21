"""Backend auth must fail closed (M10.1 security hardening).

The auth middleware only enforces when a token is configured; an unset token
would silently disable auth on every non-exempt route. main must therefore
always have a token - injected by the packaged app, or generated at startup for
a bare `python main.py`.
"""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class BackendAuthFailClosedTests(unittest.TestCase):
    def test_auth_token_is_always_configured(self):
        try:
            import main
        except Exception as exc:  # pragma: no cover - main pulls heavy optional deps
            self.skipTest(f"main not importable in this environment: {exc}")

        self.assertTrue(
            main.BACKEND_AUTH_TOKEN,
            "backend must always configure an auth token so auth never fails open",
        )
        # A generated token is secrets.token_urlsafe(32) (>= 32 chars); an
        # injected token is also long. Either way it must be non-trivial.
        self.assertGreaterEqual(len(main.BACKEND_AUTH_TOKEN), 32)


class BackendAuthEnforcementTests(unittest.TestCase):
    """The middleware actually enforces the token on non-exempt routes."""

    def test_non_exempt_route_requires_the_token(self):
        try:
            import main
            from fastapi.testclient import TestClient
        except Exception as exc:  # pragma: no cover - main pulls heavy optional deps
            self.skipTest(f"main/TestClient not importable: {exc}")

        token = "enforcement-test-token-abcdefghijklmnop"
        previous = main.BACKEND_AUTH_TOKEN
        main.BACKEND_AUTH_TOKEN = token
        try:
            client = TestClient(main.app)
            # Exempt path: reachable without a token (not 403).
            self.assertNotEqual(client.get("/api/health").status_code, 403)
            # Non-exempt path: refused without the token, allowed with it.
            self.assertEqual(client.get("/api/models").status_code, 403)
            allowed = client.get("/api/models", headers={main.BACKEND_AUTH_HEADER: token})
            self.assertNotEqual(allowed.status_code, 403)
        finally:
            main.BACKEND_AUTH_TOKEN = previous


if __name__ == "__main__":
    unittest.main()
