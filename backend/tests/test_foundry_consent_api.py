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
from foundry.hub_signals import RepoSignals  # type: ignore[import-not-found]
from foundry.model_record import ModelRecord  # type: ignore[import-not-found]
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


TRANSIENT_ID = "search-hf--org-cool-model"
TRANSIENT_REPO = "org/cool-model"


def _transient_record(**overrides) -> ModelRecord:
    fields = dict(
        id=TRANSIENT_ID, name="cool-model", artifact_type="diffusers-pipeline",
        capability="image", base_architecture="sdxl", source="huggingface",
        repo_id=TRANSIENT_REPO, status="not_found", tier="compatible",
        tier_reason="diffusers sdxl - safetensors tag - no remote code",
        format="diffusers", trust_remote_code=False,
    )
    fields.update(overrides)
    return ModelRecord(**fields)


def _full_signals(**overrides) -> RepoSignals:
    base = dict(
        repo_id=TRANSIENT_REPO, reachable=True, library_name="diffusers",
        tags=["diffusers:StableDiffusionXLPipeline", "safetensors"],
        class_name="StableDiffusionXLPipeline",
        siblings=["model_index.json", "unet/diffusion_pytorch_model.safetensors"],
        has_safetensors=True,
    )
    base.update(overrides)
    return RepoSignals(**base)


class SupplyChainGateTests(unittest.TestCase):
    """Codex M4 review H-1: search-tier verdicts come from PARTIAL listing
    data, so the download boundary re-fetches full repo signals and
    reclassifies transient HF records BEFORE the consent checks run. Stale
    or crafted search records can never talk their way past consent."""

    def setUp(self):
        self.client = TestClient(main.app)
        self.tmp = tempfile.mkdtemp(prefix="foundry-gate-api-")
        self._real_store = main.consent_store
        main.consent_store = ConsentStore(os.path.join(self.tmp, "consents.json"))
        main.model_registry.register_transient([_transient_record()])

    def tearDown(self):
        main.model_registry.register_transient([])
        main.consent_store = self._real_store
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_remote_code_revealed_at_enqueue_is_409(self):
        # The transient record claims compatible/no-remote-code, but the full
        # census reveals repo-authored Python: consent is required and the
        # record is downgraded so the UI tells the truth.
        signals = _full_signals(
            py_file_count=2,
            siblings=["pipeline.py", "unet/diffusion_pytorch_model.safetensors"],
        )
        with mock.patch.object(main, "fetch_repo_signals", return_value=signals):
            response = self.client.post(f"/api/models/{TRANSIENT_ID}/download")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"]["error_code"], "remote-code-consent-required"
        )
        refreshed = self.client.get(f"/api/models/{TRANSIENT_ID}").json()
        self.assertEqual(refreshed["tier"], "experimental")
        self.assertTrue(refreshed["trust_remote_code"])

    def test_pickle_only_revealed_at_enqueue_is_409(self):
        signals = _full_signals(
            tags=["diffusers:StableDiffusionXLPipeline"],
            siblings=["model_index.json", "unet/diffusion_pytorch_model.bin"],
            has_safetensors=False,
        )
        with mock.patch.object(main, "fetch_repo_signals", return_value=signals):
            response = self.client.post(f"/api/models/{TRANSIENT_ID}/download")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"]["error_code"], "pickle-consent-required"
        )

    def test_unverifiable_signals_fail_closed_with_503(self):
        unreachable = RepoSignals(repo_id=TRANSIENT_REPO, reachable=False)
        with mock.patch.object(
            main, "fetch_repo_signals", return_value=unreachable
        ), mock.patch.object(main.download_manager, "enqueue") as enq:
            response = self.client.post(f"/api/models/{TRANSIENT_ID}/download")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["detail"]["error_code"], "repo-signals-unverifiable"
        )
        enq.assert_not_called()

    def test_clean_full_signals_proceed_to_enqueue(self):
        job = DownloadJob(model_id=TRANSIENT_ID, status="queued", total_bytes=0)
        with mock.patch.object(
            main, "fetch_repo_signals", return_value=_full_signals()
        ) as fetch, mock.patch.object(
            main.download_manager, "enqueue", return_value=job
        ) as enq:
            response = self.client.post(
                f"/api/models/{TRANSIENT_ID}/download",
                headers={"X-HF-Token": "hf_secret_999"},
            )
        self.assertEqual(response.status_code, 202)
        enq.assert_called_once()
        fetch.assert_called_once()
        self.assertEqual(fetch.call_args.args[0], TRANSIENT_REPO)
        # The per-request token funds the verification fetch too - and never leaks.
        self.assertEqual(fetch.call_args.kwargs.get("token"), "hf_secret_999")
        self.assertNotIn("hf_secret_999", response.text)

    def test_non_transient_records_skip_reclassification(self):
        job = DownloadJob(model_id="m-test", status="queued", total_bytes=0)
        with mock.patch.object(
            main.model_registry, "get_record", return_value=_record()
        ), mock.patch.object(
            main, "fetch_repo_signals"
        ) as fetch, mock.patch.object(
            main.download_manager, "enqueue", return_value=job
        ):
            response = self.client.post("/api/models/m-test/download")
        self.assertEqual(response.status_code, 202)
        fetch.assert_not_called()

    def test_civitai_transient_records_skip_hf_reclassification(self):
        # CivitAI verdicts come from explicit per-file metadata (positive
        # SafeTensor marker, mandatory sha256) - there is no HF census to run.
        civitai_id = "search-civitai--7-9"
        record = _transient_record(
            id=civitai_id, source="civitai", repo_id=None,
            artifact_type="lora", format="safetensors",
            download_url="https://civitai.com/api/download/models/99",
            sha256="0" * 64,
        )
        main.model_registry.register_transient([record])
        job = DownloadJob(model_id=civitai_id, status="queued", total_bytes=0)
        with mock.patch.object(main, "fetch_repo_signals") as fetch, \
                mock.patch.object(main.download_manager, "enqueue", return_value=job):
            response = self.client.post(f"/api/models/{civitai_id}/download")
        self.assertEqual(response.status_code, 202)
        fetch.assert_not_called()


class ConvertApiTests(unittest.TestCase):
    """API surface tests for POST /api/models/{model_id}/convert-safetensors."""

    def setUp(self):
        self.client = TestClient(main.app)
        self.tmp = tempfile.mkdtemp(prefix="foundry-convert-api-")
        self._real_store = main.consent_store
        main.consent_store = ConsentStore(os.path.join(self.tmp, "consents.json"))

    def tearDown(self):
        main.consent_store = self._real_store
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _url(self, model_id: str) -> str:
        return f"/api/models/{model_id}/convert-safetensors"

    def test_convert_404_unknown_model(self):
        with mock.patch.object(main.model_registry, "get_record", return_value=None):
            response = self.client.post(self._url("ghost-model"))
        self.assertEqual(response.status_code, 404)

    def test_convert_409_without_pickle_consent(self):
        with mock.patch.object(
            main.model_registry, "get_record", return_value=_record(format="pickle")
        ):
            response = self.client.post(self._url("m-test"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["error_code"], "pickle-consent-required")

    def test_convert_409_no_pickle_source(self):
        # Consent granted but record has no .ckpt/.pt/.pth/.bin in locations.
        self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        with mock.patch.object(
            main.model_registry,
            "get_record",
            return_value=_record(format="pickle", locations=[]),
        ):
            response = self.client.post(self._url("m-test"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["error_code"], "no-pickle-source")

    def test_convert_503_unavailable(self):
        # Consent granted; record has a real tmp .ckpt file in locations.
        ckpt_path = os.path.join(self.tmp, "model.ckpt")
        open(ckpt_path, "wb").close()  # create an empty file so os.path.isfile passes
        self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        with mock.patch.object(
            main.model_registry,
            "get_record",
            return_value=_record(format="pickle", locations=[ckpt_path]),
        ), mock.patch(
            "main.convert_pickle_to_safetensors",
            side_effect=main.ConvertUnavailableError("torch not available"),
        ):
            response = self.client.post(self._url("m-test"))
        self.assertEqual(response.status_code, 503)

    def test_convert_409_when_safetensors_already_exists(self):
        # Never silently clobber an existing safetensors copy.
        ckpt_path = os.path.join(self.tmp, "model.ckpt")
        open(ckpt_path, "wb").close()
        open(os.path.join(self.tmp, "model.safetensors"), "wb").close()
        self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        with mock.patch.object(
            main.model_registry,
            "get_record",
            return_value=_record(format="pickle", locations=[ckpt_path]),
        ):
            response = self.client.post(self._url("m-test"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["error_code"], "already-converted")

    def test_convert_stale_first_location_falls_through_to_real_file(self):
        # The isfile check lives in the selection predicate: a stale first
        # pickle location must not 409 when a later location exists on disk.
        stale = os.path.join(self.tmp, "gone.ckpt")
        real = os.path.join(self.tmp, "real.ckpt")
        open(real, "wb").close()
        self.client.post(
            "/api/models/consent",
            json={"model_id": "m-test", "kind": "pickle", "granted": True},
        )
        with mock.patch.object(
            main.model_registry,
            "get_record",
            return_value=_record(format="pickle", locations=[stale, real]),
        ), mock.patch(
            "main.convert_pickle_to_safetensors", return_value=7
        ) as convert:
            response = self.client.post(self._url("m-test"))
        self.assertEqual(response.status_code, 200)
        convert.assert_called_once()
        self.assertEqual(convert.call_args.args[0], real)


if __name__ == "__main__":
    unittest.main()
