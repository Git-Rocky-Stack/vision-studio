"""#34 PR2: ControlNet pre-flight 422s through the real endpoint.

Integration tier (the _api.py suffix disables the local-auth middleware via
the conftest fixture). The background worker is stubbed out - these tests
assert the pre-flight boundary, not generation.
"""
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}],
        "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}


class _FakeRegistry:
    """get_record stand-in: family for the gen model, status for CN records."""

    def __init__(self, family="sd15", statuses=None):
        self.family = family
        self.statuses = statuses or {}

    def get_record(self, model_id):
        if model_id.startswith(("controlnet-", "annotator-")):
            return {"id": model_id, "name": model_id,
                    "status": self.statuses.get(model_id, "ready")}
        return {"id": model_id, "base_architecture": self.family, "status": "ready"}


def _client(monkeypatch, registry):
    from fastapi.testclient import TestClient

    import main as main_module

    monkeypatch.setattr(main_module, "model_registry", registry)

    async def _noop(job_id, request):
        return None

    monkeypatch.setattr(main_module, "process_image_generation", _noop)
    return TestClient(main_module.app)


def _cn_request(tmp_path, preprocessor="canny"):
    from PIL import Image

    source = tmp_path / "pose.png"
    Image.new("RGB", (8, 8)).save(source)
    return {
        "prompt": "a castle",
        "model": "sd-1-5",
        "controlnet": [{
            "layer_id": "c1", "layer_name": "Edges", "source_path": str(source),
            "preprocessor": preprocessor, "strength": 1.0,
            "start_step": 0.0, "end_step": 1.0, "mask": MASK,
        }],
    }


def test_controlnet_on_flux_preflights_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="flux"))
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 422
    assert "PR3" in response.json()["detail"]


def test_controlnet_uninstalled_record_preflights_422(monkeypatch, tmp_path):
    registry = _FakeRegistry(statuses={"controlnet-canny-sd15": "not_found"})
    client = _client(monkeypatch, registry)
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "controlnet-canny-sd15" in detail and "Foundry" in detail


def test_controlnet_missing_source_is_basename_only_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry())
    body = _cn_request(tmp_path)
    body["controlnet"][0]["source_path"] = str(tmp_path / "gone.png")
    response = client.post("/api/generate/image", json=body)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "gone.png" in detail
    assert str(tmp_path) not in detail  # never leak filesystem paths


def test_controlnet_installed_stack_enqueues(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry())
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
