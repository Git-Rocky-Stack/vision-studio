import asyncio
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import api.comfy_graph as comfy_graph  # type: ignore[import-not-found]
from utils.comfy_workflows import build_video_workflow  # type: ignore[import-not-found]

FIRST_CLASS = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
    "2": {"class_type": "SaveImage", "inputs": {"filename_prefix": "vision_studio", "images": ["1", 0]}},
}


class FakeJobManager:
    def update_job(self, job_id, **kwargs):
        pass


class RecordingClient:
    connected = True

    def __init__(self):
        self.kinds = None

    async def queue_prompt(self, workflow, extra_data=None):
        return "prompt-1"

    async def wait_for_prompt_completion(self, prompt_id, progress_callback=None, kinds=("images",)):
        self.kinds = kinds
        return [{"filename": "clip.webp", "subfolder": "", "type": "output"}]

    async def get_image(self, filename, subfolder="", folder_type="output"):
        return b"WEBPDATA"


class VideoRuntimeTests(unittest.TestCase):
    def test_video_workflow_is_queueable_shape(self):
        workflow, seed = build_video_workflow(
            model="svd", prompt="surf", image_filename="f.png",
            width=1024, height=576, fps=8, steps=20, seed=7,
        )
        for node in workflow.values():
            self.assertIn("class_type", node)
            self.assertIn("inputs", node)
        self.assertEqual(seed, 7)

    def test_video_run_requests_video_kinds_and_keys_videos(self):
        client = RecordingClient()
        comfy_graph.configure(lambda: client, FakeJobManager(), tempfile.mkdtemp())
        result = asyncio.run(comfy_graph.execute_comfy_graph("job-v", FIRST_CLASS, "video"))
        self.assertIn("videos", result)
        self.assertIn("gifs", client.kinds)
        self.assertIn("videos", client.kinds)


if __name__ == "__main__":
    unittest.main()
