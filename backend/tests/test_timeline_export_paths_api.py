"""Timeline export destination rules and failure cleanup.

The desktop app sends the absolute .mp4 path the user picked in the save
dialog (electron/ipc-handlers/generation.ts -> exportTimelineSequence, which
forces the .mp4 suffix), so absolute paths stay allowed - but only to an
.mp4 in an existing folder. Relative paths resolve under OUTPUT_DIR and may
not escape it. A failed export removes its partial MP4 and silent pre-mux
file, but never a pre-existing file it did not write. A failed or cancelled
generation job no longer leaves an empty outputs/<job_id> folder.

Integration tier (the _api.py suffix disables the local-auth middleware).
"""
import pathlib
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from utils.job_manager import GenerationJob, JobManager, JobStatus  # noqa: E402


@pytest.fixture
def outputs(tmp_path, monkeypatch):
    out = tmp_path / "outputs"
    out.mkdir()
    monkeypatch.setattr(main, "OUTPUT_DIR", str(out))
    return out


def _norm(path):
    return main.normalize_local_path(str(path))


# --- resolve_timeline_export_path -------------------------------------------------

def test_absolute_mp4_in_existing_folder_is_allowed(outputs, tmp_path):
    target = tmp_path / "Exports" / "cut.mp4"
    target.parent.mkdir()
    assert main.resolve_timeline_export_path(str(target)) == _norm(target)


def test_suffix_is_case_insensitive(outputs, tmp_path):
    target = tmp_path / "cut.MP4"
    assert main.resolve_timeline_export_path(str(target)) == _norm(target)


@pytest.mark.parametrize("name", ["cut.mov", "notes.txt", "cut", "cut.mp4.exe"])
def test_non_mp4_is_refused(outputs, tmp_path, name):
    with pytest.raises(ValueError, match=r"\.mp4"):
        main.resolve_timeline_export_path(str(tmp_path / name))


def test_absolute_path_into_a_missing_folder_is_refused(outputs, tmp_path):
    with pytest.raises(ValueError, match="does not exist"):
        main.resolve_timeline_export_path(str(tmp_path / "nope" / "cut.mp4"))


def test_existing_folder_named_like_an_mp4_is_refused(outputs, tmp_path):
    (tmp_path / "trap.mp4").mkdir()
    with pytest.raises(ValueError, match="folder"):
        main.resolve_timeline_export_path(str(tmp_path / "trap.mp4"))


def test_relative_path_resolves_under_outputs(outputs):
    resolved = main.resolve_timeline_export_path("exports/cut.mp4")
    assert resolved == _norm((outputs / "exports" / "cut.mp4").resolve())


@pytest.mark.parametrize("path", ["../cut.mp4", "a/../../cut.mp4", ""])
def test_relative_traversal_or_empty_is_refused(outputs, path):
    with pytest.raises(ValueError):
        main.resolve_timeline_export_path(path)


# --- endpoint -------------------------------------------------------------------

def _payload(output_path):
    return {"output_path": output_path, "width": 64, "height": 64, "fps": 1,
            "frames": [{"time_ms": 0, "layers": []}]}


def test_endpoint_refuses_a_non_mp4_with_422(outputs, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setattr(main, "job_manager", JobManager())
    client = TestClient(main.app)
    response = client.post("/api/timeline/export", json=_payload(str(tmp_path / "cut.txt")))
    assert response.status_code == 422
    assert ".mp4" in response.json()["detail"]


def test_endpoint_queues_the_resolved_path(outputs, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    manager = JobManager()
    queued = []
    monkeypatch.setattr(main, "job_manager", manager)
    monkeypatch.setattr(main, "process_timeline_export",
                        lambda job_id, request: queued.append(request.output_path))
    client = TestClient(main.app)

    response = client.post("/api/timeline/export", json=_payload("exports/cut.mp4"))

    assert response.status_code == 200
    expected = _norm((outputs / "exports" / "cut.mp4").resolve())
    assert queued == [expected]
    assert manager.get_job(response.json()["job_id"]).params["output_path"] == expected


# --- failure cleanup ------------------------------------------------------------------

def _export_job(manager, job_id="exp"):
    manager.add_job(GenerationJob(id=job_id, type="video", status=JobStatus.PENDING,
                                  params={}, output_dir="out"))


def _request(output_path, audio=False):
    layers = ([{"source_path": "a.wav", "duration_ms": 1000, "clip_duration_ms": 1000}]
              if audio else [])
    return main.TimelineExportRequest(**_payload(output_path), audio_layers=layers)


def test_failed_mux_removes_partial_and_silent_files(tmp_path, monkeypatch):
    manager = JobManager()
    _export_job(manager)
    monkeypatch.setattr(main, "job_manager", manager)
    output = tmp_path / "cut.mp4"

    def fake_export(request, output_path_override=None, progress_callback=None):
        pathlib.Path(output_path_override).write_bytes(b"silent")
        return {}

    def fake_mux(video_path, output_path, audio_layers, export_duration_ms):
        pathlib.Path(output_path).write_bytes(b"partial")
        raise RuntimeError("ffmpeg died")

    monkeypatch.setattr(main, "export_timeline_video_file", fake_export)
    monkeypatch.setattr(main, "mux_timeline_audio_file", fake_mux)

    main.process_timeline_export("exp", _request(str(output), audio=True))

    assert manager.get_job("exp").status == JobStatus.FAILED
    assert list(tmp_path.iterdir()) == []


def test_failure_before_writing_keeps_a_pre_existing_file(tmp_path, monkeypatch):
    manager = JobManager()
    _export_job(manager)
    monkeypatch.setattr(main, "job_manager", manager)
    output = tmp_path / "cut.mp4"
    output.write_bytes(b"the user's earlier export")

    def fake_export(request, output_path_override=None, progress_callback=None):
        raise FileNotFoundError("Missing media source")

    monkeypatch.setattr(main, "export_timeline_video_file", fake_export)

    main.process_timeline_export("exp", _request(str(output)))

    assert manager.get_job("exp").status == JobStatus.FAILED
    assert output.read_bytes() == b"the user's earlier export"


def test_failed_partial_overwrite_is_removed(tmp_path, monkeypatch):
    manager = JobManager()
    _export_job(manager)
    monkeypatch.setattr(main, "job_manager", manager)
    output = tmp_path / "cut.mp4"
    output.write_bytes(b"old")

    def fake_export(request, output_path_override=None, progress_callback=None):
        pathlib.Path(output_path_override).write_bytes(b"half of a new export")
        raise RuntimeError("encoder died")

    monkeypatch.setattr(main, "export_timeline_video_file", fake_export)

    main.process_timeline_export("exp", _request(str(output)))

    assert not output.exists()


# --- empty job dirs -------------------------------------------------------------------

@pytest.mark.parametrize("kind", ["image", "video"])
def test_failed_job_removes_its_empty_output_dir(outputs, monkeypatch, kind):
    manager = JobManager()
    manager.add_job(GenerationJob(id="j1", type=kind, status=JobStatus.PENDING,
                                  params={}, output_dir=str(outputs / "j1")))
    (outputs / "j1").mkdir()
    monkeypatch.setattr(main, "job_manager", manager)
    monkeypatch.setattr(main, "comfy_client", None)
    monkeypatch.setattr(main, "direct_generator", None)
    monkeypatch.setattr(main, "direct_video_generator", None)

    import asyncio
    if kind == "image":
        asyncio.run(main.process_image_generation(
            "j1", main.ImageGenerationRequest(prompt="x")))
    else:
        asyncio.run(main.process_video_generation(
            "j1", main.VideoGenerationRequest(prompt="x")))

    assert manager.get_job("j1").status == JobStatus.FAILED
    assert not (outputs / "j1").exists()


def test_job_dir_with_output_is_kept(outputs):
    (outputs / "j2").mkdir()
    (outputs / "j2" / "generated.png").write_bytes(b"x")
    main._remove_empty_job_dir("j2")
    assert (outputs / "j2" / "generated.png").exists()
