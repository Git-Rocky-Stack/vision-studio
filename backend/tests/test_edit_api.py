"""#34: the edit API as job submitters (fake job manager, patched service)."""
import pathlib
import sys
import tempfile
import time
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

import api.edit as edit_api  # type: ignore[import-not-found]
from edit_tools.weights import EditModelUnavailable  # type: ignore[import-not-found]
from utils.job_manager import JobStatus  # type: ignore[import-not-found]
from utils.media_paths import configure_media_paths  # type: ignore[import-not-found]


class FakeJobManager:
    def __init__(self):
        self.jobs = {}

    def add_job(self, job):
        self.jobs[job.id] = job

    def get_job(self, job_id):
        return self.jobs.get(job_id)

    def update_job(self, job_id, **updates):
        job = self.jobs.get(job_id)
        if job is None:
            return
        for key, value in updates.items():
            setattr(job, key, value)

    def update_unless_cancelled(self, job_id, **updates):
        job = self.jobs.get(job_id)
        if job is not None and job.status == JobStatus.CANCELLED:
            return False
        self.update_job(job_id, **updates)
        return True


def _make_client(tmp_path, resolve_record=lambda _record_id: {"status": "ready"}):
    app = FastAPI()
    app.include_router(edit_api.router)
    manager = FakeJobManager()
    edit_api.configure(manager, str(tmp_path / "outputs"), str(tmp_path / "models"),
                       resolve_record)
    # The media allow-list: the test's tmp dir plays the outputs folder.
    configure_media_paths(str(tmp_path), lambda: [])
    return TestClient(app), manager


class EditApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = pathlib.Path(self.tmp.name)
        self.source = self.tmp_path / "source.png"
        Image.new("RGB", (8, 8)).save(self.source)

    def _wait_terminal(self, manager, job_id, timeout=5.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = manager.get_job(job_id)
            if job is not None and job.status in (
                    JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                return job
            time.sleep(0.01)
        self.fail("job never reached a terminal state")

    def test_submit_returns_202_with_a_pending_job(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(edit_api, "run_edit_operation",
                               return_value={"images": ["/outputs/x/edit.png"]}):
            response = client.post("/api/v1/edit/remove-background",
                                   json={"source_path": str(self.source)})
        self.assertEqual(response.status_code, 202)
        job_id = response.json()["job_id"]
        job = self._wait_terminal(manager, job_id)
        self.assertEqual(job.type, "edit")
        self.assertEqual(job.status, JobStatus.COMPLETED)
        self.assertEqual(job.result["images"], ["/outputs/x/edit.png"])

    def test_params_thread_through_to_the_service(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(edit_api, "run_edit_operation",
                               return_value={"images": []}) as run:
            response = client.post("/api/v1/edit/upscale", json={
                "source_path": str(self.source), "scale": 4,
                "model": "anime", "face_enhance": True,
            })
        self._wait_terminal(manager, response.json()["job_id"])
        args = run.call_args.args
        self.assertEqual(args[1], "upscale")
        self.assertEqual(args[2]["scale"], 4)
        self.assertEqual(args[2]["model"], "anime")
        self.assertTrue(args[2]["face_enhance"])

    def test_missing_weights_fail_the_job_with_foundry_copy(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(
                edit_api, "run_edit_operation",
                side_effect=EditModelUnavailable(
                    "The background removal weights are not installed - "
                    "install 'edit-u2net' from the Foundry first.")):
            response = client.post("/api/v1/edit/remove-background",
                                   json={"source_path": str(self.source)})
        job = self._wait_terminal(manager, response.json()["job_id"])
        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIn("install 'edit-u2net' from the Foundry", job.error)

    def test_unexpected_errors_fail_the_job_without_leaking_detail(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(
                edit_api, "run_edit_operation",
                side_effect=RuntimeError("C:/secret/path/blew_up.py exploded")):
            response = client.post("/api/v1/edit/restore-faces",
                                   json={"source_path": str(self.source)})
        job = self._wait_terminal(manager, response.json()["job_id"])
        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertNotIn("secret", job.error)

    def test_missing_source_is_404(self):
        client, _manager = _make_client(self.tmp_path)
        response = client.post("/api/v1/edit/restore-faces",
                               json={"source_path": str(self.tmp_path / "nope.png")})
        self.assertEqual(response.status_code, 404)

    def test_invalid_params_are_422(self):
        client, _manager = _make_client(self.tmp_path)
        self.assertEqual(client.post("/api/v1/edit/upscale", json={
            "source_path": str(self.source), "scale": 8}).status_code, 422)
        self.assertEqual(client.post("/api/v1/edit/restore-faces", json={
            "source_path": str(self.source), "strength": 101}).status_code, 422)
        self.assertEqual(client.post("/api/v1/edit/remove-background", json={
            "source_path": ""}).status_code, 422)

    def test_source_outside_the_allowed_roots_is_400(self):
        client, manager = _make_client(self.tmp_path)
        with tempfile.TemporaryDirectory() as elsewhere:
            outside = pathlib.Path(elsewhere) / "private.png"
            Image.new("RGB", (8, 8)).save(outside)
            response = client.post("/api/v1/edit/upscale",
                                   json={"source_path": str(outside), "scale": 2})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("private", response.json()["detail"])
        self.assertEqual(manager.jobs, {})

    def test_traversal_out_of_outputs_is_400(self):
        client, _manager = _make_client(self.tmp_path)
        response = client.post("/api/v1/edit/remove-background",
                               json={"source_path": "/outputs/../../escape.png"})
        self.assertEqual(response.status_code, 400)

    def test_outputs_url_resolves_and_the_job_gets_the_resolved_path(self):
        client, manager = _make_client(self.tmp_path)
        with mock.patch.object(edit_api, "run_edit_operation",
                               return_value={"images": []}) as run:
            response = client.post("/api/v1/edit/restore-faces",
                                   json={"source_path": "/outputs/source.png"})
        self.assertEqual(response.status_code, 202)
        self._wait_terminal(manager, response.json()["job_id"])
        resolved = run.call_args.args[2]["source_path"]
        self.assertEqual(pathlib.Path(resolved), self.source.resolve())

    def test_edit_models_route_is_gone(self):
        client, _manager = _make_client(self.tmp_path)
        self.assertEqual(client.get("/api/v1/edit/models").status_code, 404)


if __name__ == "__main__":
    unittest.main()
