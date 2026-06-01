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


if __name__ == "__main__":
    unittest.main()
