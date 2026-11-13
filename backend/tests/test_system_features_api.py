"""GET /api/system/info reports optional-feature availability (D5c / UI gating),
typed acceleration settings and the scheduler allow-list are request-validated.

Integration tier (the _api.py suffix disables the local-auth middleware).
"""
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402

# The renderer's contract: exactly these keys under `availability`.
FEATURES = {"quantization", "tensorrt", "semanticRetrieval"}


def test_system_info_reports_the_availability_contract():
    response = TestClient(main.app).get("/api/system/info")
    assert response.status_code == 200
    availability = response.json()["availability"]
    assert set(availability) == FEATURES
    for name in FEATURES:
        entry = availability[name]
        assert set(entry) == {"available", "reason"}
        assert isinstance(entry["available"], bool)
        # An unavailable feature always says why; an available one does not.
        if entry["available"]:
            assert entry["reason"] is None
        else:
            assert isinstance(entry["reason"], str) and entry["reason"]


def test_availability_composes_accelerator_and_retrieval(monkeypatch):
    seen = {}

    def fake_acceleration(**kwargs):
        seen.update(kwargs)
        return {
            "quantization": {"available": True, "reason": None},
            "tensorrt": {"available": False, "reason": "not in this build"},
            "compile": {"available": False, "reason": "frozen"},
        }

    monkeypatch.setattr(main, "acceleration_feature_availability", fake_acceleration)
    monkeypatch.setattr(main, "semantic_retrieval_availability",
                        lambda: {"available": False, "reason": "embedder not provisioned"})
    assert main.optional_feature_availability(True, (12, 0), True) == {
        "quantization": {"available": True, "reason": None},
        "tensorrt": {"available": False, "reason": "not in this build"},
        "semanticRetrieval": {"available": False, "reason": "embedder not provisioned"},
    }
    # The hardware facts TensorRT needs reach the accelerator.
    assert seen == {"gpu_available": True, "compute_capability": (12, 0), "cuda": True}


def test_tensorrt_unverified_reason_reaches_the_ui(monkeypatch):
    # The shipped state on a CUDA build: runtime bundled, GPU fine, but no
    # model family verified - the toggle is disabled with that exact reason.
    from foundry import accelerator, tensorrt_engine

    monkeypatch.setattr(accelerator, "_spec_present", lambda name: name in {"torch_tensorrt", "tensorrt"})
    monkeypatch.setattr(tensorrt_engine, "TRT_PROVEN_FAMILIES", set())
    state = main.optional_feature_availability(True, (8, 9), True)["tensorrt"]
    assert state == {"available": False, "reason": "No model family has been verified for TensorRT yet"}


def test_semantic_retrieval_is_unavailable_until_the_embedder_is_provisioned(tmp_path, monkeypatch):
    # A real service pointed at an empty models dir: the embedder is not
    # provisioned, so semanticRetrieval is false with a reason (and nothing
    # is downloaded).
    import api.retrieval as retrieval_api

    monkeypatch.setattr(retrieval_api, "_service", None)
    retrieval_api.init_service(models_dir=str(tmp_path / "models"), data_dir=tmp_path / "retrieval")
    try:
        entry = main.optional_feature_availability(True)["semanticRetrieval"]
    finally:
        monkeypatch.setattr(retrieval_api, "_service", None)
    assert entry["available"] is False
    assert entry["reason"]


@pytest.mark.parametrize("scheduler", ["Euler", "Euler a", "DPM++ 2M Karras", "dpm++ sde", " UniPC "])
def test_known_schedulers_are_accepted(scheduler):
    request = main.ImageGenerationRequest(prompt="a cat", scheduler=scheduler)
    assert request.scheduler == scheduler.strip()


def test_unknown_scheduler_is_422():
    response = TestClient(main.app).post(
        "/api/generate/image", json={"prompt": "a cat", "scheduler": "warp-drive"})
    assert response.status_code == 422
    assert "Unknown scheduler" in response.text


@pytest.mark.parametrize("payload", [
    {"compile": "sometimes"},
    {"turbo": "on"},
])
def test_acceleration_settings_are_typed(payload):
    response = TestClient(main.app).post(
        "/api/generate/image", json={"prompt": "a cat", "acceleration_settings": payload})
    assert response.status_code == 422


def test_acceleration_settings_convert_to_engine_settings():
    request = main.ImageGenerationRequest(
        prompt="a cat", acceleration_settings={"compile": "off", "master_enable": False})
    settings = main._acceleration_settings_for(request.acceleration_settings)
    assert settings.compile == "off" and settings.master_enable is False
    assert main._acceleration_settings_for(None) is main.DEFAULT_ACCELERATION_SETTINGS
