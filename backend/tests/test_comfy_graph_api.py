import asyncio
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.comfy_graph as comfy_graph  # type: ignore[import-not-found]

FIRST_CLASS = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
    "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "a city", "clip": ["1", 1]}},
    "3": {"class_type": "SaveImage", "inputs": {"filename_prefix": "vision_studio", "images": ["2", 0]}},
}


class FakeJobManager:
    def __init__(self):
        self.jobs = {}

    def add_job(self, job):
        self.jobs[getattr(job, "id", None)] = job

    def update_job(self, job_id, **kwargs):
        self.jobs.setdefault(job_id, {})
        if isinstance(self.jobs[job_id], dict):
            self.jobs[job_id].update(kwargs)

    def update_unless_cancelled(self, job_id, **kwargs):
        self.update_job(job_id, **kwargs)
        return True

    def is_cancelled(self, job_id):
        return False


class FakeClient:
    def __init__(self, connected=True):
        self.connected = connected
        self.queued = None

    async def queue_prompt(self, workflow, extra_data=None):
        self.queued = workflow
        return "prompt-1"

    async def wait_for_prompt_completion(self, prompt_id, progress_callback=None, kinds=("images",),
                                         should_cancel=None):
        return [{"filename": "image_001.png", "subfolder": "", "type": "output"}]

    async def get_image(self, filename, subfolder="", folder_type="output"):
        return b"PNGDATA"


def build_app(client):
    app = FastAPI()
    comfy_graph.configure(lambda: client, FakeJobManager(), tempfile.mkdtemp())
    app.include_router(comfy_graph.router)
    return app


class ComfyGraphApiTests(unittest.TestCase):
    def test_rejects_unsupported_node(self):
        client = TestClient(build_app(FakeClient()))
        resp = client.post("/api/v1/comfy/run-graph", json={
            "graph": {"1": {"class_type": "EvilNode", "inputs": {}}}, "generation_type": "image",
        })
        self.assertEqual(resp.status_code, 422)

    def test_requires_connected_server(self):
        resp = TestClient(build_app(FakeClient(connected=False))).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "image"}
        )
        self.assertEqual(resp.status_code, 409)

    def test_accepts_first_class_graph(self):
        resp = TestClient(build_app(FakeClient())).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "image"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("job_id", resp.json())

    def test_rejects_video_graph_type_with_a_clear_message(self):
        fake = FakeClient()
        resp = TestClient(build_app(fake)).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "video"}
        )
        self.assertEqual(resp.status_code, 422)
        self.assertIn("only allows image nodes", resp.text)
        self.assertIsNone(fake.queued)

    def test_rejects_unknown_graph_type(self):
        resp = TestClient(build_app(FakeClient())).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "audio"}
        )
        self.assertEqual(resp.status_code, 422)

    def test_reconnects_on_demand_before_refusing(self):
        class Reconnecting(FakeClient):
            def __init__(self):
                super().__init__(connected=False)
                self.attempts = 0

            async def ensure_connected(self):
                self.attempts += 1
                self.connected = True
                return True

        fake = Reconnecting()
        resp = TestClient(build_app(fake)).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "image"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(fake.attempts, 1)

    def test_unreachable_after_reconnect_attempt_is_409(self):
        class Unreachable(FakeClient):
            async def ensure_connected(self):
                return False

        resp = TestClient(build_app(Unreachable(connected=False))).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "image"}
        )
        self.assertEqual(resp.status_code, 409)

    def test_execute_writes_outputs_and_uses_utc_timestamps(self):
        fake = FakeClient()
        manager = FakeJobManager()
        out = tempfile.mkdtemp()
        comfy_graph.configure(lambda: fake, manager, out)
        result = asyncio.run(comfy_graph.execute_comfy_graph("job-2", FIRST_CLASS, "image"))
        self.assertEqual(result["images"], ["/outputs/job-2/output_001.png"])
        self.assertEqual((pathlib.Path(out) / "job-2" / "output_001.png").read_bytes(), b"PNGDATA")
        completed_at = manager.jobs["job-2"]["completed_at"]
        self.assertIsNotNone(completed_at.tzinfo)
        self.assertEqual(completed_at.utcoffset().total_seconds(), 0)

    def test_execute_submits_the_user_graph(self):
        fake = FakeClient()
        comfy_graph.configure(lambda: fake, FakeJobManager(), tempfile.mkdtemp())
        asyncio.run(comfy_graph.execute_comfy_graph("job-1", FIRST_CLASS, "image"))
        self.assertEqual(fake.queued, FIRST_CLASS)  # the user's graph, not a template


if __name__ == "__main__":
    unittest.main()
