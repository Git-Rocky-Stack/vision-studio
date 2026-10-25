"""Request validation and event-loop hygiene on the main FastAPI routes.

Integration tier (the _api.py suffix disables the local-auth middleware).

- /api/system/info, /api/images/crop and /api/videos/extract-frame run their
  blocking work in a worker thread, not on the event loop;
- /api/prompts/enhance answers an empty prompt or unknown mode with 422;
- generation requests bound seed / prompt length and snap dimensions to /8;
- GET /api/jobs bounds `limit`.
"""
import asyncio
import pathlib
import sys
from types import SimpleNamespace

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def main_module():
    import main

    return main


@pytest.fixture
def client(main_module):
    from fastapi.testclient import TestClient

    return TestClient(main_module.app)


def _off_loop_recorder(record, result):
    """Records whether it was called ON the event loop thread (True) or in a
    worker thread (False). TestClient runs the loop in its own portal thread,
    so the loop - not the main thread - is the thing to detect."""
    def fn(*args, **kwargs):
        try:
            asyncio.get_running_loop()
            record.append(True)
        except RuntimeError:
            record.append(False)
        return result

    return fn


# --- off the event loop ------------------------------------------------------

def test_system_info_probes_hardware_in_a_worker_thread(main_module, client, monkeypatch):
    on_main = []
    profile = SimpleNamespace(gpu_available=False, gpu_name=None, vram_total_bytes=0,
                              cuda_version=None)
    monkeypatch.setattr(main_module, "probe_hardware", _off_loop_recorder(on_main, profile))
    monkeypatch.setattr(main_module, "comfy_client", None)

    response = client.get("/api/system/info")

    assert response.status_code == 200
    assert response.json()["gpu_available"] is False
    assert on_main == [False]


def test_crop_runs_pil_in_a_worker_thread(main_module, client, monkeypatch, tmp_path):
    source = tmp_path / "in.png"
    source.write_bytes(b"x")
    on_main = []
    monkeypatch.setattr(main_module, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(main_module, "apply_crop_and_transform",
                        _off_loop_recorder(on_main, {"width": 1, "height": 1}))

    response = client.post("/api/images/crop", json={"source_path": str(source)})

    assert response.status_code == 200
    assert on_main == [False]


def test_extract_frame_runs_imageio_in_a_worker_thread(main_module, client, monkeypatch, tmp_path):
    source = tmp_path / "in.mp4"
    source.write_bytes(b"x")
    on_main = []
    monkeypatch.setattr(main_module, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(main_module, "extract_video_frame_file",
                        _off_loop_recorder(on_main, {"width": 1, "height": 1}))

    response = client.post("/api/videos/extract-frame", json={"source_path": str(source)})

    assert response.status_code == 200
    assert on_main == [False]


# --- prompt enhancement --------------------------------------------------------

def test_enhance_empty_prompt_is_422(client):
    response = client.post("/api/prompts/enhance", json={"prompt": "   ", "mode": "clarify"})
    assert response.status_code == 422
    assert "empty" in response.json()["detail"].lower()


def test_enhance_unknown_mode_is_422(client):
    response = client.post("/api/prompts/enhance", json={"prompt": "a cat", "mode": "poetic"})
    assert response.status_code == 422


def test_enhance_mode_is_case_and_space_tolerant(client):
    response = client.post("/api/prompts/enhance", json={"prompt": "a cat", "mode": " Expand "})
    assert response.status_code == 200
    assert response.json()["mode"] == "expand"


def test_enhance_ignores_the_renderer_augment_field(client):
    response = client.post("/api/prompts/enhance", json={
        "prompt": "a cat", "mode": "clarify", "augment": {"sources": []}})
    assert response.status_code == 200


# --- generation request bounds ---------------------------------------------------

@pytest.mark.parametrize("seed", [-2, 2**32])
def test_out_of_range_seed_is_rejected(main_module, seed):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        main_module.ImageGenerationRequest(prompt="x", seed=seed)
    with pytest.raises(ValidationError):
        main_module.VideoGenerationRequest(prompt="x", seed=seed)


def test_seed_bounds_accept_random_and_uint32_max(main_module):
    assert main_module.ImageGenerationRequest(prompt="x", seed=-1).seed == -1
    assert main_module.VideoGenerationRequest(prompt="x", seed=2**32 - 1).seed == 2**32 - 1


def test_dimensions_snap_down_to_a_multiple_of_8(main_module):
    image = main_module.ImageGenerationRequest(prompt="x", width=1001, height=1023)
    assert (image.width, image.height) == (1000, 1016)
    video = main_module.VideoGenerationRequest(prompt="x", width=1919, height=1079)
    assert (video.width, video.height) == (1912, 1072)


def test_overlong_prompt_is_rejected(main_module):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        main_module.ImageGenerationRequest(prompt="x" * 4001)
    with pytest.raises(ValidationError):
        main_module.VideoGenerationRequest(prompt="x" * 4001)
    with pytest.raises(ValidationError):
        main_module.PromptEnhancementRequest(prompt="x" * 4001)


@pytest.mark.parametrize("limit", [0, 101])
def test_list_jobs_limit_is_bounded(client, limit):
    assert client.get(f"/api/jobs?limit={limit}").status_code == 422


def test_list_jobs_limit_in_range(client):
    assert client.get("/api/jobs?limit=100").status_code == 200
