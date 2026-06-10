"""Consent API + download enforcement integration tests (spec 5.3).

POST /api/models/consent grants/revokes per-model trust; enqueue_download
blocks pickle / trust_remote_code records with 409 until consent exists.
main.consent_store is patched to a tmp-path ConsentStore so no state ever
touches the repo-tree MODELS_DIR/.foundry.
"""

import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # type: ignore[import-not-found]

import main  # type: ignore[import-not-found]
from foundry.download_manager import DownloadJob  # type: ignore[import-not-found]
from foundry.security_policy import ConsentStore  # type: ignore[import-not-found]


def _record(**overrides):
    """Minimal registry record dict as enqueue_download consumes it."""
    base = {
        "id": "m-test",
        "name": "Test Model",
        "format": "safetensors",
        "trust_remote_code": False,
    }
    base.update(overrides)
    return base


class ConsentApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.tmp = tempfile.mkdtemp(prefix="foundry-consent-api-")
        self._real_store = main.consent_store
        main.consent_store = ConsentStore(os.path.join(self.tmp, "consents.json"))

    def tearDown(self):
        main.consent_store = self._real_store
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_grant_then_read_back_then_revoke(self):
        granted = self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        self.assertEqual(granted.status_code, 200)
        body = granted.json()
        self.assertEqual(body["model_id"], "m-test")
        self.assertTrue(body["pickle"])
        self.assertFalse(body["trust_remote_code"])

        revoked = self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": False},
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertFalse(revoked.json()["pickle"])

    def test_unknown_kind_is_400(self):
        response = self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "root-access", "granted": True},
        )
        self.assertEqual(response.status_code, 400)

    def test_pickle_download_without_consent_is_409(self):
        with mock.patch.object(
            main.model_registry, "get_record", return_value=_record(format="pickle")
        ):
            response = self.client.post("/api/models/m-test/download")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["error_code"], "pickle-consent-required")

    def test_remote_code_download_without_consent_is_409(self):
        with mock.patch.object(
            main.model_registry,
            "get_record",
            return_value=_record(trust_remote_code=True),
        ):
            response = self.client.post("/api/models/m-test/download")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"]["error_code"], "remote-code-consent-required"
        )

    def test_pickle_download_with_consent_proceeds(self):
        self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        job = DownloadJob(model_id="m-test", status="queued", total_bytes=0)
        with mock.patch.object(
            main.model_registry, "get_record", return_value=_record(format="pickle")
        ), mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = self.client.post("/api/models/m-test/download")
        self.assertEqual(response.status_code, 202)
        enq.assert_called_once()

    def test_trust_remote_code_download_with_consent_proceeds(self):
        self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "trust_remote_code", "granted": True},
        )
        job = DownloadJob(model_id="m-test", status="queued", total_bytes=0)
        with mock.patch.object(
            main.model_registry,
            "get_record",
            return_value=_record(trust_remote_code=True),
        ), mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = self.client.post("/api/models/m-test/download")
        self.assertNotEqual(response.status_code, 409)
        self.assertEqual(response.status_code, 202)
        enq.assert_called_once()

    def test_verified_safetensors_record_is_not_blocked(self):
        job = DownloadJob(model_id="m-test", status="queued", total_bytes=0)
        with mock.patch.object(
            main.model_registry, "get_record", return_value=_record()
        ), mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = self.client.post("/api/models/m-test/download")
        self.assertNotEqual(response.status_code, 409)
        self.assertEqual(response.status_code, 202)
        enq.assert_called_once()


if __name__ == "__main__":
    unittest.main()
