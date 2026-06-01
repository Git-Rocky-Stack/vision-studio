import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # type: ignore[import-not-found]
import main  # type: ignore[import-not-found]

client = TestClient(main.app)


class FoundryApiTests(unittest.TestCase):
    def test_list_models_returns_records_with_record_fields(self):
        response = client.get("/api/models")
        assert response.status_code == 200
        payload = response.json()
        assert isinstance(payload, list) and len(payload) >= 13
        flux = next(item for item in payload if item["id"] == "flux-dev")
        assert flux["capability"] == "image"
        assert flux["tier"] == "verified"
        assert flux["base_architecture"] == "flux"
        assert flux["runtime"] == "byom"

    def test_get_model_by_id_returns_one_record(self):
        response = client.get("/api/models/ltx-video")
        assert response.status_code == 200
        assert response.json()["id"] == "ltx-video"

    def test_get_unknown_model_returns_404(self):
        response = client.get("/api/models/nope-not-real")
        assert response.status_code == 404


if __name__ == "__main__":
    unittest.main()
