"""POST /api/jobs/{id}/cancel through the real endpoint.

Integration tier (the _api.py suffix disables the local-auth middleware via the
conftest fixture). The endpoint documents that a `pending` or `processing` job
is cancelled; it used to answer "Job is already pending" and leave a queued job
to run.
"""
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _client_with(monkeypatch, *jobs):
    from fastapi.testclient import TestClient

    import main as main_module
    from utils.job_manager import JobManager

    manager = JobManager()
    for job in jobs:
        manager.add_job(job)
    monkeypatch.setattr(main_module, "job_manager", manager)
    return TestClient(main_module.app), manager


def _job(job_id, status):
    from utils.job_manager import GenerationJob

    return GenerationJob(id=job_id, type="image", status=status, params={}, output_dir="out")


def test_cancel_pending_job(monkeypatch):
    from utils.job_manager import JobStatus

    client, manager = _client_with(monkeypatch, _job("queued-1", JobStatus.PENDING))

    response = client.post("/api/jobs/queued-1/cancel")

    assert response.status_code == 200
    assert response.json() == {"message": "Job cancelled"}
    assert manager.get_job("queued-1").status == JobStatus.CANCELLED


def test_cancel_processing_job(monkeypatch):
    from utils.job_manager import JobStatus

    client, manager = _client_with(monkeypatch, _job("running-1", JobStatus.PROCESSING))

    response = client.post("/api/jobs/running-1/cancel")

    assert response.json() == {"message": "Job cancelled"}
    assert manager.get_job("running-1").status == JobStatus.CANCELLED


def test_cancel_finished_job_reports_its_status(monkeypatch):
    from utils.job_manager import JobStatus

    client, manager = _client_with(monkeypatch, _job("done-1", JobStatus.COMPLETED))

    response = client.post("/api/jobs/done-1/cancel")

    assert response.json() == {"message": "Job is already completed"}
    assert manager.get_job("done-1").status == JobStatus.COMPLETED


def test_cancel_unknown_job_is_404(monkeypatch):
    client, _manager = _client_with(monkeypatch)

    response = client.post("/api/jobs/nope/cancel")

    assert response.status_code == 404
