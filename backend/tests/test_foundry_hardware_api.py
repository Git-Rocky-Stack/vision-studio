"""Integration: GET /api/hardware + POST /api/models/{id}/resolve-runtime."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main  # type: ignore[import-not-found]
from foundry.hardware import HardwareProfile  # type: ignore[import-not-found]


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX 4090", vram_total_bytes=24 * 2**30,
        vram_free_bytes=20 * 2**30, compute_major=8, compute_minor=9,
        cuda_version="12.1", torch_available=True,
        system_ram_total_bytes=64 * 2**30, system_ram_available_bytes=48 * 2**30,
        disk_free_bytes=900 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


class HardwareApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_hardware_route_returns_profile(self):
        with mock.patch.object(main, "probe_hardware", return_value=_profile()):
            response = self.client.get("/api/hardware")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["gpu_available"])
        self.assertEqual(body["vram_total_bytes"], 24 * 2**30)
        self.assertEqual(body["compute_major"], 8)

    def test_resolve_runtime_known_model(self):
        with mock.patch.object(main, "probe_hardware", return_value=_profile()):
            response = self.client.post("/api/models/sdxl-base/resolve-runtime")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNone(body["refusal"])
        self.assertEqual(body["pipeline_class"], "StableDiffusionXLPipeline")
        self.assertIn(body["fit"], ("fits", "fits-with-offload", "over-budget"))
        self.assertIn(body["vram_plan"]["basis"], ("measured", "estimated"))
        self.assertTrue(body["readiness"])

    def test_resolve_runtime_unknown_model_404(self):
        response = self.client.post("/api/models/ghost/resolve-runtime")
        self.assertEqual(response.status_code, 404)

    def test_refusals_are_200_payloads_not_4xx(self):
        # Preflight is informational - a refusal is an ANSWER, not an error.
        record = {
            "id": "m", "artifact_type": "diffusers-pipeline", "capability": "image",
            "base_architecture": "sdxl", "source": "huggingface", "format": "safetensors",
            "trust_remote_code": True, "size": "1 GB", "locations": [],
            "companions": [], "measured_vram_bytes": None,
        }
        with mock.patch.object(main.model_registry, "get_record", return_value=record), \
                mock.patch.object(main, "probe_hardware", return_value=_profile()):
            response = self.client.post("/api/models/m/resolve-runtime")
        self.assertEqual(response.status_code, 200)
        self.assertIn("remote code", response.json()["refusal"])


if __name__ == "__main__":
    unittest.main()
