import asyncio
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import api.comfy_graph as comfy_graph  # type: ignore[import-not-found]
from utils.comfy_workflows import build_video_workflow  # type: ignore[import-not-found]
from utils.job_manager import JobManager  # type: ignore[import-not-found]

FIRST_CLASS = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
    "2": {"class_type": "SaveImage", "inputs": {"filename_prefix": "vision_studio", "images": ["1", 0]}},
}


class FakeJobManager:
    def update_job(self, job_id, **kwargs):
        pass

    def update_unless_cancelled(self, job_id, **kwargs):
        return True

    def is_cancelled(self, job_id):
        return False


class RecordingClient:
    connected = True

    def __init__(self):
        self.kinds = None

    async def queue_prompt(self, workflow, extra_data=None):
        return "prompt-1"

    async def wait_for_prompt_completion(self, prompt_id, progress_callback=None, kinds=("images",),
                                         should_cancel=None):
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


class ComfyTextToVideoRoutingTests(unittest.IsolatedAsyncioTestCase):
    """ComfyUI only has the fixed SVD image-to-video workflow
    (build_video_workflow). A text-to-video job sent there got an empty
    LoadImage and failed, so with ComfyUI connected every text-to-video job
    failed. Text-to-video now runs on the built-in engine."""

    async def asyncSetUp(self):
        import main

        self.main = main
        self.manager = JobManager()
        self.comfy_calls = []
        self.direct_calls = []
        test = self

        class FakeComfy:
            connected = True

        async def fake_comfy_video(job_id, request):
            test.comfy_calls.append(job_id)
            return {"videos": ["/outputs/comfy.webp"]}

        class FakeDirectVideo:
            async def generate_video(self, **kwargs):
                test.direct_calls.append(kwargs["job_id"])
                return {"videos": ["/outputs/direct.mp4"]}

        for name, value in (("job_manager", self.manager),
                            ("comfy_client", FakeComfy()),
                            ("generate_video_with_comfyui", fake_comfy_video),
                            ("direct_video_generator", FakeDirectVideo())):
            patcher = mock.patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _add(self, job_id):
        from utils.job_manager import GenerationJob, JobStatus

        self.manager.add_job(GenerationJob(
            id=job_id, type="video", status=JobStatus.PENDING, params={}, output_dir="out"))

    async def test_text_to_video_runs_on_the_built_in_engine(self):
        self._add("t2v")
        await self.main.process_video_generation(
            "t2v", self.main.VideoGenerationRequest(prompt="a wave", model="ltx-video"))

        self.assertEqual(self.comfy_calls, [])
        self.assertEqual(self.direct_calls, ["t2v"])
        self.assertEqual(self.manager.get_job("t2v").status.value, "completed")

    async def test_image_to_video_still_goes_to_comfyui(self):
        self._add("i2v")
        await self.main.process_video_generation(
            "i2v", self.main.VideoGenerationRequest(prompt="", model="svd", image_path="frame.png"))

        self.assertEqual(self.comfy_calls, ["i2v"])
        self.assertEqual(self.direct_calls, [])

    async def test_text_to_video_without_the_built_in_engine_says_why(self):
        self._add("t2v-none")
        with mock.patch.object(self.main, "direct_video_generator", None):
            await self.main.process_video_generation(
                "t2v-none", self.main.VideoGenerationRequest(prompt="a wave"))

        job = self.manager.get_job("t2v-none")
        self.assertEqual(self.comfy_calls, [])
        self.assertEqual(job.status.value, "failed")
        self.assertIn("image-to-video", job.error)
        self.assertIn("input image", job.error)


if __name__ == "__main__":
    unittest.main()
