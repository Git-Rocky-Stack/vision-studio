import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main  # type: ignore[import-not-found]
from foundry.hf_cache import HfCacheScan
from tests.foundry_fixtures import LORA_TENSORS, make_safetensors


def _empty_cache():
    return mock.patch("foundry.index_service.scan_hf_cache", return_value=HfCacheScan())


class LibraryApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.tmp = tempfile.mkdtemp(prefix="foundry-libapi-")

    def tearDown(self):
        # Keep scan_hf_cache mocked here too: remove triggers a rescan, and an
        # unmocked scan would index the dev machine's REAL HF cache into the
        # module-level registry, polluting sibling API tests.
        with _empty_cache():
            for root in self.client.get("/api/models/libraries").json():
                if root["path"].startswith(self.tmp):
                    self.client.delete(f"/api/models/libraries/{root['id']}")
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _lib(self):
        lib = os.path.join(self.tmp, "lib")
        make_safetensors(os.path.join(lib, "loras", "style.safetensors"), LORA_TENSORS)
        return lib

    def test_import_root_then_list_then_remove(self):
        with _empty_cache():
            created = self.client.post(
                "/api/models/import", json={"path": self._lib(), "layout_hint": "comfyui"}
            )
            self.assertEqual(created.status_code, 201)
            root = created.json()
            self.assertEqual(root["layout_hint"], "comfyui")

            listed = self.client.get("/api/models/libraries").json()
            self.assertIn(root["id"], [entry["id"] for entry in listed])

            removed = self.client.delete(f"/api/models/libraries/{root['id']}")
            self.assertEqual(removed.status_code, 200)
            self.assertEqual(removed.json()["removed"], True)

    def test_import_missing_path_is_400(self):
        response = self.client.post(
            "/api/models/import", json={"path": os.path.join(self.tmp, "nope"), "layout_hint": "generic"}
        )
        self.assertEqual(response.status_code, 400)

    def test_remove_unknown_root_is_404(self):
        self.assertEqual(self.client.delete("/api/models/libraries/doesnotexist").status_code, 404)

    def test_scan_returns_counts_and_warnings(self):
        with mock.patch(
            "foundry.index_service.scan_hf_cache",
            return_value=HfCacheScan(warnings=["broken entry"]),
        ):
            response = self.client.post("/api/models/scan")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("records_indexed", body)
        self.assertIn("broken entry", body["warnings"])

    def test_detect_returns_offers_shape(self):
        comfy = os.path.join(self.tmp, "ComfyUI", "models")
        os.makedirs(comfy)
        with mock.patch("foundry.index_service._WELL_KNOWN_CANDIDATES", [(comfy, "comfyui")]):
            response = self.client.get("/api/models/libraries/detect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{"path": comfy, "layout_hint": "comfyui"}])

    def test_delete_linked_record_is_409(self):
        with _empty_cache():
            self.client.post(
                "/api/models/import", json={"path": self._lib(), "layout_hint": "comfyui"}
            )
        linked = [
            record
            for record in self.client.get("/api/models").json()
            if record["id"].startswith("local-")
        ]
        self.assertTrue(linked)
        response = self.client.delete(f"/api/models/{linked[0]['id']}")
        self.assertEqual(response.status_code, 409)


if __name__ == "__main__":
    unittest.main()
