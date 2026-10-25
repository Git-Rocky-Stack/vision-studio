"""Batch export resolves real generation outputs and validates resize.

The service's in-memory store was never populated by anything, so every
export from the app answered 404. Image ids now resolve to files under the
outputs folder: a job id (the job's first image) or an output path
(/outputs/<job_id>/<file>), never outside that folder.

Integration tier (the _api.py suffix disables the local-auth middleware).
"""
import base64
import io
import pathlib
import sys
import zipfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import api.batch as batch_module  # noqa: E402
from schemas.batch import BatchExportRequest  # noqa: E402
from services.batch_service import BatchService  # noqa: E402


@pytest.fixture
def outputs(tmp_path):
    out = tmp_path / "outputs"
    (out / "job-1").mkdir(parents=True)
    Image.new("RGB", (40, 20), (255, 0, 0)).save(out / "job-1" / "generated.png")
    (out / "job-2").mkdir()
    Image.new("RGB", (10, 10), (0, 255, 0)).save(out / "job-2" / "image_002.png")
    Image.new("RGB", (10, 10), (0, 0, 255)).save(out / "job-2" / "image_001.png")
    (out / "job-2" / "notes.txt").write_text("not an image")
    (out / "empty-job").mkdir()
    Image.new("RGB", (5, 5)).save(tmp_path / "secret.png")  # outside outputs
    return out


@pytest.fixture
def client(outputs):
    previous_dir, previous_service = batch_module._output_dir, batch_module._service
    batch_module.configure(str(outputs))
    app = FastAPI()
    app.include_router(batch_module.router)
    yield TestClient(app)
    batch_module._output_dir, batch_module._service = previous_dir, previous_service


# --- service ----------------------------------------------------------------------

def test_job_id_resolves_to_its_first_image(outputs):
    service = BatchService(output_dir=str(outputs))
    assert service._get_image("job-1").size == (40, 20)
    # Sorted: image_001 wins over image_002; the .txt is never read.
    assert service._get_image("job-2").getpixel((0, 0)) == (0, 0, 255)


@pytest.mark.parametrize("image_id", [
    "/outputs/job-2/image_002.png", "outputs/job-2/image_002.png", "job-2/image_002.png"])
def test_output_path_resolves(outputs, image_id):
    service = BatchService(output_dir=str(outputs))
    assert service._get_image(image_id).getpixel((0, 0)) == (0, 255, 0)


@pytest.mark.parametrize("image_id", [
    "../secret.png", "job-1/../../secret.png", "empty-job", "job-2/notes.txt", "missing", ""])
def test_unresolvable_or_escaping_ids_are_missing(outputs, image_id):
    assert BatchService(output_dir=str(outputs))._get_image(image_id) is None


def test_store_still_wins_over_disk(outputs):
    buffer = io.BytesIO()
    Image.new("RGB", (3, 3)).save(buffer, format="PNG")
    service = BatchService(
        images_store={"job-1": base64.b64encode(buffer.getvalue()).decode()},
        output_dir=str(outputs))
    assert service._get_image("job-1").size == (3, 3)


# --- endpoint ---------------------------------------------------------------------

def test_export_of_generated_outputs_succeeds(client):
    response = client.post("/api/v1/batch/export-zip", json={
        "image_ids": ["job-1", "/outputs/job-2/image_002.png"], "format": "jpg"})

    assert response.status_code == 200
    data = response.json()
    assert data["file_count"] == 2
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["zip_file"]))) as archive:
        assert len(archive.namelist()) == 2
        assert all(name.endswith(".jpg") for name in archive.namelist())


def test_traversal_ids_are_404(client):
    response = client.post("/api/v1/batch/export-zip",
                           json={"image_ids": ["../secret.png"]})
    assert response.status_code == 404


# --- resize validation --------------------------------------------------------------

@pytest.mark.parametrize("resize", [
    {"width": 0, "height": 10},
    {"width": 10, "height": 8193},
    {"width": "10", "height": 10},
    {"width": True, "height": 10},
    {"width": 10},
    {"width": 10, "height": 10, "depth": 3},
])
def test_invalid_resize_is_rejected(resize):
    with pytest.raises(ValidationError):
        BatchExportRequest(image_ids=["a"], resize=resize)


def test_invalid_resize_is_422_at_the_endpoint(client):
    response = client.post("/api/v1/batch/export-zip", json={
        "image_ids": ["job-1"], "resize": {"width": -1, "height": 10}})
    assert response.status_code == 422


def test_valid_resize_is_applied(client):
    response = client.post("/api/v1/batch/export-zip", json={
        "image_ids": ["job-1"], "resize": {"width": 8, "height": 4}})
    data = response.json()
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["zip_file"]))) as archive:
        with archive.open(archive.namelist()[0]) as handle:
            assert Image.open(handle).size == (8, 4)
