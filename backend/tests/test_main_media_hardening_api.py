"""main.py media hardening: B6 allow-listed paths at every route that reads
renderer media, P2 one decoder per timeline video source, B15 bounded and
cancellable ffmpeg mux, B14 request bounds.

Integration tier (the _api.py suffix disables the local-auth middleware).
"""
import pathlib
import sys
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from utils.job_manager import GenerationCancelled  # noqa: E402


@pytest.fixture
def outputs(tmp_path, monkeypatch):
    out = tmp_path / "outputs"
    (out / "imports").mkdir(parents=True)
    monkeypatch.setattr(main, "OUTPUT_DIR", str(out))
    monkeypatch.delenv("VISION_STUDIO_MEDIA_ROOTS", raising=False)
    return out


@pytest.fixture
def client():
    return TestClient(main.app)


def _png(path: pathlib.Path) -> pathlib.Path:
    Image.new("RGB", (8, 8), (255, 0, 0)).save(path, "PNG")
    return path


# --- B6 at the routes ---------------------------------------------------------------

def test_crop_accepts_an_output_asset(outputs, client):
    source = _png(outputs / "imports" / "a.png")
    response = client.post("/api/images/crop", json={"source_path": str(source)})
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("route", ["/api/images/crop", "/api/videos/extract-frame"])
def test_media_routes_refuse_paths_outside_the_roots(outputs, tmp_path, client, route):
    outside = _png(tmp_path / "outside.png")
    for candidate in (str(outside), "/outputs/../outside.png"):
        response = client.post(route, json={"source_path": candidate})
        assert response.status_code == 400, (route, candidate, response.text)
        assert "outside.png" not in response.text


def test_extra_media_roots_env_extends_the_allow_list(outputs, tmp_path, client, monkeypatch):
    extra = tmp_path / "old-output-root"
    extra.mkdir()
    source = _png(extra / "kept.png")
    assert client.post("/api/images/crop", json={"source_path": str(source)}).status_code == 400
    monkeypatch.setenv("VISION_STUDIO_MEDIA_ROOTS", str(extra))
    assert client.post("/api/images/crop", json={"source_path": str(source)}).status_code == 200


def test_timeline_export_refuses_layers_outside_the_roots(outputs, tmp_path, client):
    outside = _png(tmp_path / "outside.png")
    response = client.post("/api/timeline/export", json={
        "output_path": "cut.mp4",
        "frames": [{"layers": [{"source_path": str(outside), "media_type": "image"}]}],
    })
    assert response.status_code == 400


def test_timeline_export_refuses_audio_outside_the_roots(outputs, tmp_path, client):
    inside = _png(outputs / "imports" / "a.png")
    response = client.post("/api/timeline/export", json={
        "output_path": "cut.mp4",
        "frames": [{"layers": [{"source_path": str(inside), "media_type": "image"}]}],
        "audio_layers": [{"source_path": str(tmp_path / "x.wav")}],
    })
    assert response.status_code == 400


def test_resolve_timeline_media_paths_rewrites_each_layer(outputs):
    inside = _png(outputs / "imports" / "a.png")
    request = main.TimelineExportRequest(
        output_path="cut.mp4",
        frames=[{"layers": [{"source_path": "/outputs/imports/a.png", "media_type": "image"}]}] * 3,
    )
    resolved = main.resolve_timeline_media_paths(request)
    expected = str(inside.resolve()).replace("\\", "/")
    assert all(f.layers[0].source_path == expected for f in resolved.frames)


def test_generate_image_refuses_guided_sources_outside_the_roots(outputs, tmp_path, client):
    outside = _png(tmp_path / "outside.png")
    response = client.post("/api/generate/image", json={
        "prompt": "a cat",
        "inpaint": {"layer_id": "l", "image_path": str(outside),
                    "mask": {"type": "rectangle", "bounds": {"x": 0, "y": 0, "width": 4, "height": 4}}},
    })
    assert response.status_code == 400


def test_generate_video_refuses_input_image_outside_the_roots(outputs, tmp_path, client):
    outside = _png(tmp_path / "outside.png")
    response = client.post("/api/generate/video", json={"prompt": "waves", "image_path": str(outside)})
    assert response.status_code == 400


def test_video_input_data_url_passes_through():
    data_url = "data:image/png;base64,AAAA"
    assert main.resolve_video_input_image(data_url) == data_url
    assert main.resolve_video_input_image(None) is None


# --- B14 request bounds ------------------------------------------------------------

@pytest.mark.parametrize("prompt", ["", "   "])
def test_empty_image_prompt_is_422(client, prompt):
    assert client.post("/api/generate/image", json={"prompt": prompt}).status_code == 422


@pytest.mark.parametrize("payload", [
    {"source_path": "x.png", "rotation": 720},
    {"source_path": "x.png", "crop_box": {"left": -1, "top": 0, "width": 4, "height": 4}},
    {"source_path": "x.png", "crop_box": {"left": 0, "top": 0, "width": 0, "height": 4}},
    {"source_path": "x.png", "crop_box": {"left": 0, "top": 0, "width": 4, "height": 70000}},
])
def test_crop_bounds_are_422(client, payload):
    assert client.post("/api/images/crop", json=payload).status_code == 422


def test_timeline_bounds():
    layer = {"source_path": "a.png", "media_type": "image"}
    with pytest.raises(ValidationError):
        main.TimelineExportRequest(output_path="a.mp4", frames=[
            {"layers": [layer] * (main.MAX_TIMELINE_LAYERS_PER_FRAME + 1)}])
    with pytest.raises(ValidationError):
        main.TimelineExportRequest(output_path="a.mp4", frames=[{"layers": []}],
                                   audio_layers=[{"source_path": "a.wav"}] * (main.MAX_TIMELINE_AUDIO_LAYERS + 1))
    with pytest.raises(ValidationError):
        main.TimelineExportRequest(output_path="a.mp4", frames=[{"layers": []}],
                                   sequence_name="x" * (main.MAX_SEQUENCE_NAME_LENGTH + 1))


def test_mask_points_are_bounded():
    with pytest.raises(ValidationError):
        main.GuidedMaskPayload(type="polygon", points=[{"x": 0.0, "y": 0.0}] * (main.MAX_MASK_POINTS + 1))


# --- P2: one decoder per timeline video source ---------------------------------------

class _FakeReader:
    instances = []

    def __init__(self, path):
        self.path = path
        self.reads = []
        self.closed = False
        _FakeReader.instances.append(self)

    def get_meta_data(self):
        return {"fps": 10.0, "nframes": 5}

    def get_data(self, index):
        self.reads.append(index)
        return np.full((4, 4, 3), index * 10, dtype=np.uint8)

    def close(self):
        self.closed = True


def test_timeline_sources_open_one_reader_per_source_and_close_it():
    _FakeReader.instances = []
    sources = main.TimelineVideoSources(reader_factory=_FakeReader)
    for time_ms in (0, 100, 100, 200, 900):  # 900ms is past the end (index 4 clamps)
        sources.frame_at("a.mp4", time_ms)
    sources.frame_at("b.mp4", 0)

    assert [r.path for r in _FakeReader.instances] == ["a.mp4", "b.mp4"]
    a = _FakeReader.instances[0]
    # Sequential forward reads; the repeated 100ms frame is served from memory.
    assert a.reads == [0, 1, 2, 4]
    sources.close()
    assert all(r.closed for r in _FakeReader.instances)
    assert sources.open_count == 0


def test_export_closes_video_readers_even_when_encoding_fails(outputs, monkeypatch):
    _FakeReader.instances = []
    video = outputs / "imports" / "clip.mp4"
    video.write_bytes(b"not really a video")

    class _FailingWriter:
        def append_data(self, _frame):
            raise RuntimeError("encoder died")

        def close(self):
            pass

    sources = main.TimelineVideoSources(reader_factory=_FakeReader)
    monkeypatch.setattr(main, "TimelineVideoSources", lambda: sources)
    monkeypatch.setattr(main.imageio, "get_writer", lambda *a, **k: _FailingWriter())
    request = main.TimelineExportRequest(output_path=str(outputs / "cut.mp4"), frames=[
        {"layers": [{"source_path": str(video), "media_type": "video"}]}])

    with pytest.raises(RuntimeError):
        main.export_timeline_video_file(request)
    assert _FakeReader.instances and all(r.closed for r in _FakeReader.instances)


# --- B15: ffmpeg mux has a timeout and honors cancel ------------------------------------

def _sleeper(seconds: float):
    return [sys.executable, "-c", f"import time; time.sleep({seconds})"]


def test_ffmpeg_runner_kills_a_hung_process_on_timeout():
    started = time.monotonic()
    with pytest.raises(RuntimeError, match="did not finish"):
        main.run_ffmpeg_command(_sleeper(30), timeout_seconds=0.5)
    assert time.monotonic() - started < 10


def test_ffmpeg_runner_stops_on_cancel():
    calls = {"n": 0}

    def should_cancel():
        calls["n"] += 1
        return calls["n"] >= 2

    started = time.monotonic()
    with pytest.raises(GenerationCancelled):
        main.run_ffmpeg_command(_sleeper(30), timeout_seconds=60, should_cancel=should_cancel, job_id="j")
    assert time.monotonic() - started < 10


def test_ffmpeg_runner_reports_stderr_on_failure():
    command = [sys.executable, "-c", "import sys; sys.stderr.write('boom-detail'); sys.exit(3)"]
    with pytest.raises(RuntimeError, match="boom-detail"):
        main.run_ffmpeg_command(command, timeout_seconds=30)


def test_ffmpeg_runner_succeeds_quietly():
    main.run_ffmpeg_command([sys.executable, "-c", "pass"], timeout_seconds=30)


def test_mux_timeout_scales_with_export_length():
    assert main.mux_timeout_seconds(1000) == pytest.approx(main.MUX_TIMEOUT_FLOOR_SECONDS + 4.0)
    assert main.mux_timeout_seconds(600_000) > main.mux_timeout_seconds(1000)
