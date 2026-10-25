"""DELETE /api/models/{id}: evict cached pipelines, delete off the event loop,
then re-index the Foundry so the registry stops reporting the files.

Integration tier (the _api.py suffix disables the local-auth middleware).
"""
import pathlib
import sys
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class _Generator:
    def __init__(self, calls, name, fail=False):
        self.calls, self.name, self.fail = calls, name, fail

    def unload_model(self, model_id):
        self.calls.append((self.name, model_id))
        if self.fail:
            raise RuntimeError("wedged")


def _client(monkeypatch, deleted=True, scan=None, image_fail=False):
    from fastapi.testclient import TestClient

    import main as main_module

    calls = []

    async def fake_delete(model_id):
        calls.append(("delete", model_id))
        return deleted

    monkeypatch.setattr(main_module, "direct_generator", _Generator(calls, "image", image_fail))
    monkeypatch.setattr(main_module, "direct_video_generator", _Generator(calls, "video"))
    monkeypatch.setattr(main_module.model_manager, "delete_model", fake_delete)
    monkeypatch.setattr(main_module.model_registry, "get_record", lambda _id: None)
    monkeypatch.setattr(main_module.index_service, "scan",
                        scan or (lambda: calls.append(("scan",))))
    return TestClient(main_module.app), calls


def test_delete_evicts_both_generators_then_deletes_then_rescans(monkeypatch):
    client, calls = _client(monkeypatch)

    response = client.delete("/api/models/sdxl")

    assert response.status_code == 200
    assert calls == [("image", "sdxl"), ("video", "sdxl"), ("delete", "sdxl"), ("scan",)]


def test_failed_eviction_still_deletes(monkeypatch):
    client, calls = _client(monkeypatch, image_fail=True)

    assert client.delete("/api/models/sdxl").status_code == 200
    assert ("delete", "sdxl") in calls


def test_failed_rescan_is_not_a_failed_delete(monkeypatch):
    def boom():
        raise OSError("index locked")

    client, calls = _client(monkeypatch, scan=boom)

    assert client.delete("/api/models/sdxl").status_code == 200


def test_missing_model_is_404_and_skips_rescan(monkeypatch):
    client, calls = _client(monkeypatch, deleted=False)

    assert client.delete("/api/models/ghost").status_code == 404
    assert ("scan",) not in calls


def test_model_manager_removes_files_in_a_worker_thread(tmp_path):
    import asyncio

    from utils.model_manager import ModelManager

    target = tmp_path / "weights"
    target.mkdir()
    (target / "model.safetensors").write_bytes(b"x")
    manager = ModelManager(str(tmp_path / "models"))
    info = mock.MagicMock(local_path=str(target))
    manager.available_models = {"m": info}

    with mock.patch("utils.model_manager.asyncio.to_thread",
                    wraps=asyncio.to_thread) as to_thread:
        assert asyncio.run(manager.delete_model("m")) is True

    to_thread.assert_called_once()
    assert not target.exists()
    assert info.local_path is None
