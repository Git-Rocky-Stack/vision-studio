"""The backend's own OpenAPI text (served at /api/docs) must describe what it does.

Integration tier (the _api.py suffix disables the local-auth middleware via the
conftest fixture). Two things it said were false:

  * "Currently no authentication required" - require_local_auth_token rejects
    every request without the x-vision-studio-token header except a few paths;
  * GET /api/models/{model_id}/status promised a 404 and fields
    (downloaded_bytes, total_bytes, error) that do not exist, and answered an
    unknown id with 200 {"error": "Model not found"}.
"""
import pathlib
import re
import sys
from dataclasses import fields

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

STATUS_PATH = "/api/models/{model_id}/status"


def _openapi():
    import main

    main.app.openapi_schema = None  # rebuild from the live app, not a cache
    return main.app.openapi()


def _documented_fields(markdown: str) -> set:
    section = markdown.split("### Response Fields", 1)[1].split("###", 1)[0]
    return set(re.findall(r"^- `([a-z_]+)`", section, flags=re.MULTILINE))


def test_api_description_documents_the_auth_it_enforces():
    import main

    description = _openapi()["info"]["description"]

    assert "no authentication" not in description.lower()
    assert f"`{main.BACKEND_AUTH_HEADER}`" in description
    for path in sorted(main.AUTH_EXEMPT_PATHS):
        assert f"`{path}`" in description, f"exempt path {path} is not documented"
    assert "`/outputs/`" in description


def test_unknown_model_status_is_404(monkeypatch):
    from fastapi.testclient import TestClient

    import main

    monkeypatch.setattr(main.model_manager, "available_models", {})
    response = TestClient(main.app).get("/api/models/no-such-model/status")

    assert response.status_code == 404
    assert response.json() == {"detail": "Model not found"}


def test_model_status_documents_exactly_the_fields_it_returns(monkeypatch):
    from fastapi.testclient import TestClient

    import main
    from utils.model_manager import ModelInfo

    record = ModelInfo(id="sd-1-5", name="SD 1.5", type="checkpoint", source="huggingface")
    monkeypatch.setattr(main.model_manager, "available_models", {"sd-1-5": record})

    response = TestClient(main.app).get("/api/models/sd-1-5/status")
    documented = _documented_fields(_openapi()["paths"][STATUS_PATH]["get"]["description"])

    assert response.status_code == 200
    assert set(response.json()) == {f.name for f in fields(ModelInfo)}
    assert documented == set(response.json())
