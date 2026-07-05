import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # type: ignore[import-not-found]
import main  # type: ignore[import-not-found]
from foundry.download_manager import DownloadJob  # type: ignore[import-not-found]

client = TestClient(main.app)


class DownloadApiTests(unittest.TestCase):
    def test_post_download_enqueues_and_returns_job_202(self):
        job = DownloadJob(model_id="flux-dev", status="queued", total_bytes=0)
        with mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post("/api/models/flux-dev/download")
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual(body["model_id"], "flux-dev")
        self.assertEqual(body["status"], "queued")
        self.assertNotIn("token", body)  # never echoed
        enq.assert_called_once()

    def test_post_download_unknown_id_returns_404(self):
        response = client.post("/api/models/not-a-real-model/download")
        self.assertEqual(response.status_code, 404)

    def test_x_hf_token_header_is_forwarded_to_enqueue_and_not_logged(self):
        job = DownloadJob(model_id="flux-dev", status="queued")
        with mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            client.post("/api/models/flux-dev/download", headers={"X-HF-Token": "hf_SECRET"})
        _args, kwargs = enq.call_args
        self.assertEqual(kwargs.get("token"), "hf_SECRET")

    def test_pause_resume_cancel_return_job_schema(self):
        job = DownloadJob(model_id="flux-dev", status="paused")
        for action, method_name, status_value in (
            ("pause", "pause", "paused"),
            ("resume", "resume", "queued"),
            ("cancel", "cancel", "cancelled"),
        ):
            job.status = status_value
            with mock.patch.object(main.download_manager, method_name, return_value=job):
                response = client.post(f"/api/models/flux-dev/download/{action}")
            self.assertEqual(response.status_code, 200, action)
            self.assertEqual(response.json()["status"], status_value, action)

    def test_invalid_action_returns_404(self):
        response = client.post("/api/models/flux-dev/download/frobnicate")
        self.assertEqual(response.status_code, 404)

    def test_get_downloads_returns_list_of_jobs(self):
        jobs = [DownloadJob(model_id="flux-dev", status="downloading", progress=0.5, total_bytes=100)]
        with mock.patch.object(main.download_manager, "list_jobs", return_value=jobs):
            response = client.get("/api/models/downloads")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload[0]["model_id"], "flux-dev")
        self.assertAlmostEqual(payload[0]["progress"], 0.5)


class CompanionInstallTests(unittest.TestCase):
    """Complete-or-explain installs: a record's companions download WITH it.

    Half-installs (adapter without its encoder, depth ControlNet without its
    annotator) fail at generation time - the install flow must package every
    component item, or refuse up front naming what blocks it.
    """

    def _record(self, record_id, companions=(), status="not_found", fmt="safetensors"):
        return {
            "id": record_id, "name": record_id, "artifact_type": "ip-adapter",
            "source": "huggingface", "repo_id": "org/repo", "format": fmt,
            "status": status, "companions": list(companions),
            "trust_remote_code": False,
        }

    def _registry(self, records):
        by_id = {record["id"]: record for record in records}
        registry = mock.MagicMock()
        registry.get_record.side_effect = by_id.get
        registry.is_transient.return_value = False
        return registry

    def test_companions_are_enqueued_with_the_primary(self):
        records = [
            self._record("ip-adapter-sd15", companions=["ip-adapter-encoder-vit-h"]),
            self._record("ip-adapter-encoder-vit-h"),
        ]
        job = DownloadJob(model_id="ip-adapter-sd15", status="queued")
        with mock.patch.object(main, "model_registry", self._registry(records)), \
                mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post("/api/models/ip-adapter-sd15/download")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["model_id"], "ip-adapter-sd15")
        enqueued = [call.args[0] for call in enq.call_args_list]
        self.assertEqual(enqueued, ["ip-adapter-sd15", "ip-adapter-encoder-vit-h"])

    def test_ready_companions_are_not_re_enqueued(self):
        records = [
            self._record("ip-adapter-sdxl", companions=["ip-adapter-encoder-vit-h"]),
            self._record("ip-adapter-encoder-vit-h", status="ready"),
        ]
        job = DownloadJob(model_id="ip-adapter-sdxl", status="queued")
        with mock.patch.object(main, "model_registry", self._registry(records)), \
                mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post("/api/models/ip-adapter-sdxl/download")
        self.assertEqual(response.status_code, 202)
        enqueued = [call.args[0] for call in enq.call_args_list]
        self.assertEqual(enqueued, ["ip-adapter-sdxl"])

    def test_companion_consent_gate_blocks_the_whole_install(self):
        # controlnet-depth-sd35 companions annotator-midas (pickle) - without
        # pickle consent NOTHING is enqueued and the 409 names the companion.
        records = [
            self._record("controlnet-depth-sd35", companions=["annotator-midas"]),
            self._record("annotator-midas", fmt="pickle"),
        ]
        with mock.patch.object(main, "model_registry", self._registry(records)), \
                mock.patch.object(main.download_manager, "enqueue") as enq:
            response = client.post("/api/models/controlnet-depth-sd35/download")
        self.assertEqual(response.status_code, 409)
        detail = response.json()["detail"]
        self.assertEqual(detail["error_code"], "pickle-consent-required")
        self.assertIn("annotator-midas", detail["message"])
        enq.assert_not_called()

    def test_transitive_companions_resolve_once(self):
        records = [
            self._record("a", companions=["b"]),
            self._record("b", companions=["c", "a"]),  # cycle back to a
            self._record("c"),
        ]
        job = DownloadJob(model_id="a", status="queued")
        with mock.patch.object(main, "model_registry", self._registry(records)), \
                mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post("/api/models/a/download")
        self.assertEqual(response.status_code, 202)
        enqueued = [call.args[0] for call in enq.call_args_list]
        self.assertEqual(enqueued, ["a", "b", "c"])

    def test_catalog_companions_all_resolve(self):
        """Every companions id in the shipped catalog is a catalog record."""
        import json

        catalog = json.loads(
            (BACKEND_ROOT / "foundry" / "verified-catalog.json").read_text(encoding="utf-8"))
        for record_id, record in catalog.items():
            for companion_id in record.get("companions") or []:
                self.assertIn(
                    companion_id, catalog,
                    f"{record_id} names unknown companion '{companion_id}'")


if __name__ == "__main__":
    unittest.main()
