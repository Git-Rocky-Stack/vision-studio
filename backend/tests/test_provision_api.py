"""#34 installer PR2: provisioning API endpoints.

Mirrors test_foundry_download_api.py - TestClient(main.app) + mock.patch on the
orchestrator. Stub-CI-safe: no torch, no network (the orchestrator methods are
patched, so no registry/download/manifest traversal runs here).
"""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # type: ignore[import-not-found]
import main  # type: ignore[import-not-found]

client = TestClient(main.app)

_SNAPSHOT = {
    "schema_version": 1,
    "overall_progress": 0.5,
    "total_bytes": 100,
    "present_bytes": 50,
    "remaining_bytes": 50,
    "speed": 0.0,
    "eta": None,
    "total_count": 2,
    "ready_count": 1,
    "active_count": 1,
    "error_count": 0,
    "complete": False,
    "attribution": "Powered by Stability AI",
    "models": [{
        "id": "sd-1-5", "name": "Stable Diffusion 1.5", "license": "creativeml-openrail-m",
        "attribution": None, "approx_bytes": 50, "format": None, "gated": False,
        "status": "ready", "progress": 1.0, "error": None, "gate_url": None,
    }],
}


class ProvisionApiTests(unittest.TestCase):
    def test_status_returns_schema(self):
        with mock.patch.object(main.provision_orchestrator, "status", return_value=_SNAPSHOT):
            response = client.get("/api/models/provision/status")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["schema_version"], 1)
        self.assertEqual(body["total_count"], 2)
        self.assertEqual(body["attribution"], "Powered by Stability AI")
        self.assertEqual(body["models"][0]["id"], "sd-1-5")

    def test_status_route_not_captured_as_model_id(self):
        # Route-ordering guard: /provision/status must resolve to the provision
        # route, never /{model_id}/status with model_id='provision'.
        with mock.patch.object(main.provision_orchestrator, "status", return_value=_SNAPSHOT):
            response = client.get("/api/models/provision/status")
        self.assertEqual(response.status_code, 200)
        self.assertIn("overall_progress", response.json())

    def test_start_returns_202_and_forwards_hf_token(self):
        with mock.patch.object(main.provision_orchestrator, "start", return_value=_SNAPSHOT) as start:
            response = client.post(
                "/api/models/provision/start", headers={"X-HF-Token": "hf_SECRET"})
        self.assertEqual(response.status_code, 202)
        _args, kwargs = start.call_args
        self.assertEqual(kwargs.get("hf_token"), "hf_SECRET")
        self.assertNotIn("hf_SECRET", response.text)  # token never echoed

    def test_pause_dispatches_to_orchestrator(self):
        with mock.patch.object(main.provision_orchestrator, "pause", return_value=_SNAPSHOT) as pause:
            response = client.post("/api/models/provision/pause")
        self.assertEqual(response.status_code, 200)
        pause.assert_called_once()

    def test_cancel_dispatches_to_orchestrator(self):
        with mock.patch.object(main.provision_orchestrator, "cancel", return_value=_SNAPSHOT) as cancel:
            response = client.post("/api/models/provision/cancel")
        self.assertEqual(response.status_code, 200)
        cancel.assert_called_once()

    def test_resume_calls_start_with_hf_token(self):
        with mock.patch.object(main.provision_orchestrator, "start", return_value=_SNAPSHOT) as start:
            response = client.post(
                "/api/models/provision/resume", headers={"X-HF-Token": "hf_TT"})
        self.assertEqual(response.status_code, 200)
        _args, kwargs = start.call_args
        self.assertEqual(kwargs.get("hf_token"), "hf_TT")

    def test_reverify_calls_start_with_reverify_true(self):
        with mock.patch.object(main.provision_orchestrator, "start", return_value=_SNAPSHOT) as start:
            response = client.post(
                "/api/models/provision/reverify", headers={"X-HF-Token": "hf_TT"})
        self.assertEqual(response.status_code, 200)
        _args, kwargs = start.call_args
        self.assertTrue(kwargs.get("reverify"))
        self.assertEqual(kwargs.get("hf_token"), "hf_TT")

    def test_resume_does_not_reverify(self):
        with mock.patch.object(main.provision_orchestrator, "start", return_value=_SNAPSHOT) as start:
            client.post("/api/models/provision/resume")
        _args, kwargs = start.call_args
        self.assertFalse(kwargs.get("reverify", False))

    def test_unknown_action_returns_404(self):
        response = client.post("/api/models/provision/frobnicate")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
