"""Cancelling a job stops it and keeps it cancelled.

`POST /api/jobs/{id}/cancel` documents: "If job is `processing` or `pending`:
Sets status to `cancelled` and stops generation". Before this suite none of
that held:

  * a PENDING job could not be cancelled at all ("Job is already pending"),
    so a cancelled batch (BatchPanel cancels each queued job) kept running;
  * a PROCESSING job flipped to CANCELLED, but nothing told the generator,
    so the GPU kept working - and when it finished, process_*_generation
    wrote COMPLETED over the cancellation.

Torch-free on purpose (fake pipelines, fake clients) so it runs in the
lightweight CI environment.
"""

import asyncio
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
import utils.direct_generator as dg  # noqa: E402
import utils.direct_video_generator as dvg  # noqa: E402
from utils.comfy_client import ComfyUIClient  # noqa: E402
from utils.job_manager import (  # noqa: E402
    GenerationCancelled,
    GenerationJob,
    JobManager,
    JobStatus,
)


def _job(job_id="job-1", status=JobStatus.PENDING, job_type="image"):
    return GenerationJob(
        id=job_id, type=job_type, status=status, params={}, output_dir="out")


class JobManagerCancelTests(unittest.TestCase):
    def setUp(self):
        self.manager = JobManager()

    def test_pending_job_can_be_cancelled(self):
        self.manager.add_job(_job(status=JobStatus.PENDING))

        self.assertTrue(self.manager.cancel("job-1"))

        job = self.manager.get_job("job-1")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNotNone(job.completed_at)

    def test_processing_job_can_be_cancelled(self):
        self.manager.add_job(_job(status=JobStatus.PROCESSING))

        self.assertTrue(self.manager.cancel("job-1"))
        self.assertTrue(self.manager.is_cancelled("job-1"))

    def test_finished_job_is_not_cancelled(self):
        for status in (JobStatus.COMPLETED, JobStatus.FAILED):
            manager = JobManager()
            manager.add_job(_job(status=status))

            self.assertFalse(manager.cancel("job-1"))
            self.assertEqual(manager.get_job("job-1").status, status)

    def test_unknown_job_is_not_cancelled(self):
        self.assertFalse(self.manager.cancel("missing"))
        self.assertFalse(self.manager.is_cancelled("missing"))

    def test_a_cancelled_job_is_not_overwritten(self):
        self.manager.add_job(_job(status=JobStatus.PROCESSING))
        self.manager.cancel("job-1")

        applied = self.manager.update_unless_cancelled(
            "job-1", status=JobStatus.COMPLETED, result={"images": ["x"]})

        self.assertFalse(applied)
        job = self.manager.get_job("job-1")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.result)

    def test_a_live_job_is_updated(self):
        self.manager.add_job(_job(status=JobStatus.PENDING))

        applied = self.manager.update_unless_cancelled(
            "job-1", status=JobStatus.PROCESSING)

        self.assertTrue(applied)
        self.assertEqual(self.manager.get_job("job-1").status, JobStatus.PROCESSING)


class ProcessImageCancelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = JobManager()
        patcher = mock.patch.object(main, "job_manager", self.manager)
        patcher.start()
        self.addCleanup(patcher.stop)
        comfy = mock.patch.object(main, "comfy_client", None)
        comfy.start()
        self.addCleanup(comfy.stop)

    async def test_cancelled_while_pending_never_generates(self):
        self.manager.add_job(_job("job-p"))
        self.manager.cancel("job-p")
        calls = []

        async def fake_generate_direct(job_id, req):
            calls.append(job_id)
            return {"images": [], "seed": 1}

        with mock.patch.object(main, "generate_direct", fake_generate_direct):
            await main.process_image_generation("job-p", main.ImageGenerationRequest(prompt="x"))

        self.assertEqual(calls, [])
        self.assertEqual(self.manager.get_job("job-p").status, JobStatus.CANCELLED)

    async def test_cancelled_while_running_stays_cancelled(self):
        self.manager.add_job(_job("job-r"))

        async def fake_generate_direct(job_id, req):
            # The cancel request lands while the generator is still working,
            # and the generator returns normally anyway.
            self.manager.cancel(job_id)
            return {"images": ["/outputs/job-r/image_001.png"], "seed": 1}

        with mock.patch.object(main, "generate_direct", fake_generate_direct):
            await main.process_image_generation("job-r", main.ImageGenerationRequest(prompt="x"))

        job = self.manager.get_job("job-r")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.result)

    async def test_generator_stopped_by_cancel_is_not_a_failure(self):
        self.manager.add_job(_job("job-s"))

        async def fake_generate_direct(job_id, req):
            self.manager.cancel(job_id)
            raise GenerationCancelled(job_id)

        with mock.patch.object(main, "generate_direct", fake_generate_direct):
            await main.process_image_generation("job-s", main.ImageGenerationRequest(prompt="x"))

        job = self.manager.get_job("job-s")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.error)

    async def test_direct_generator_receives_a_live_cancel_check(self):
        self.manager.add_job(_job("job-w", status=JobStatus.PROCESSING))
        captured = {}

        class FakeDirectGenerator:
            async def generate_image(self, **kwargs):
                captured.update(kwargs)
                return {"images": [], "seed": 1}

        with mock.patch.object(main, "direct_generator", FakeDirectGenerator()):
            await main.generate_direct("job-w", main.ImageGenerationRequest(prompt="x"))

        should_cancel = captured["should_cancel"]
        self.assertFalse(should_cancel())
        self.manager.cancel("job-w")
        self.assertTrue(should_cancel())

    async def test_comfyui_wait_receives_a_live_cancel_check(self):
        self.manager.add_job(_job("job-c", status=JobStatus.PROCESSING))
        captured = {}

        class FakeComfy:
            connected = True

            async def queue_prompt(self, workflow, extra_data=None):
                return "prompt-1"

            async def wait_for_prompt_completion(self, prompt_id, **kwargs):
                captured.update(kwargs)
                return []

        with mock.patch.object(main, "comfy_client", FakeComfy()), \
                mock.patch.object(main, "OUTPUT_DIR", tempfile.mkdtemp()):
            await main.generate_with_comfyui("job-c", main.ImageGenerationRequest(prompt="x"))

        should_cancel = captured["should_cancel"]
        self.assertFalse(should_cancel())
        self.manager.cancel("job-c")
        self.assertTrue(should_cancel())


class ProcessVideoCancelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = JobManager()
        patcher = mock.patch.object(main, "job_manager", self.manager)
        patcher.start()
        self.addCleanup(patcher.stop)
        comfy = mock.patch.object(main, "comfy_client", None)
        comfy.start()
        self.addCleanup(comfy.stop)

    def _video_request(self):
        return main.VideoGenerationRequest(prompt="x")

    async def test_cancelled_while_pending_never_generates(self):
        self.manager.add_job(_job("vid-p", job_type="video"))
        self.manager.cancel("vid-p")
        calls = []

        class FakeVideoGenerator:
            async def generate_video(self, **kwargs):
                calls.append(kwargs["job_id"])
                return {"videos": []}

        with mock.patch.object(main, "direct_video_generator", FakeVideoGenerator()):
            await main.process_video_generation("vid-p", self._video_request())

        self.assertEqual(calls, [])
        self.assertEqual(self.manager.get_job("vid-p").status, JobStatus.CANCELLED)

    async def test_cancelled_while_running_stays_cancelled(self):
        self.manager.add_job(_job("vid-r", job_type="video"))
        manager = self.manager

        class FakeVideoGenerator:
            async def generate_video(self, **kwargs):
                manager.cancel(kwargs["job_id"])
                return {"videos": ["/outputs/vid-r/video.mp4"]}

        with mock.patch.object(main, "direct_video_generator", FakeVideoGenerator()):
            await main.process_video_generation("vid-r", self._video_request())

        job = self.manager.get_job("vid-r")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.result)

    async def test_video_generator_receives_a_live_cancel_check(self):
        self.manager.add_job(_job("vid-w", job_type="video"))
        manager = self.manager
        observed = []

        class FakeVideoGenerator:
            async def generate_video(self, **kwargs):
                should_cancel = kwargs["should_cancel"]
                observed.append(should_cancel())
                manager.cancel(kwargs["job_id"])
                observed.append(should_cancel())
                raise GenerationCancelled(kwargs["job_id"])

        with mock.patch.object(main, "direct_video_generator", FakeVideoGenerator()):
            await main.process_video_generation("vid-w", self._video_request())

        self.assertEqual(observed, [False, True])
        job = self.manager.get_job("vid-w")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.error)


class TimelineExportCancelTests(unittest.TestCase):
    """The export worker is synchronous; FastAPI runs it on a thread."""

    def setUp(self):
        self.manager = JobManager()
        patcher = mock.patch.object(main, "job_manager", self.manager)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        self.output = self.tmp / "export.mp4"
        # model_construct: the fake export below never reads the frames.
        self.request = main.TimelineExportRequest.model_construct(
            sequence_name="t", width=64, height=64, fps=24,
            output_path=str(self.output), frames=[object()], audio_layers=[])

    def test_cancelled_while_pending_never_runs(self):
        self.manager.add_job(_job("exp-p", job_type="video"))
        self.manager.cancel("exp-p")
        calls = []

        def fake_export(*args, **kwargs):
            calls.append(args)
            return {"video": str(self.output)}

        with mock.patch.object(main, "export_timeline_video_file", fake_export):
            main.process_timeline_export("exp-p", self.request)

        self.assertEqual(calls, [])
        self.assertEqual(self.manager.get_job("exp-p").status, JobStatus.CANCELLED)

    def test_cancel_stops_the_export_and_removes_the_partial_file(self):
        self.manager.add_job(_job("exp-r", job_type="video"))
        frames_written = []

        def fake_export(export_request, output_path_override=None, progress_callback=None):
            path = pathlib.Path(output_path_override)
            for frame in range(10):
                path.write_bytes(b"partial" * (frame + 1))
                frames_written.append(frame)
                if frame == 2:
                    self.manager.cancel("exp-r")
                progress_callback(5.0 + (frame + 1) * 9.0)
            return {"video": str(path)}

        with mock.patch.object(main, "export_timeline_video_file", fake_export):
            main.process_timeline_export("exp-r", self.request)

        job = self.manager.get_job("exp-r")
        self.assertEqual(frames_written, [0, 1, 2])
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.error)
        self.assertFalse(self.output.exists(), "the partial export was left on disk")

    def test_cancel_that_lands_after_encoding_keeps_no_result(self):
        self.manager.add_job(_job("exp-l", job_type="video"))

        def fake_export(export_request, output_path_override=None, progress_callback=None):
            pathlib.Path(output_path_override).write_bytes(b"complete")
            self.manager.cancel("exp-l")
            return {"video": output_path_override}

        with mock.patch.object(main, "export_timeline_video_file", fake_export):
            main.process_timeline_export("exp-l", self.request)

        job = self.manager.get_job("exp-l")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.result)
        self.assertFalse(self.output.exists())


class EditJobCancelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import api.edit as edit_api

        self.edit_api = edit_api
        self.manager = JobManager()
        patcher = mock.patch.object(edit_api, "_job_manager", self.manager)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_cancelled_while_pending_never_runs(self):
        self.manager.add_job(_job("edit-p", job_type="edit"))
        self.manager.cancel("edit-p")
        calls = []

        def fake_run(*args):
            calls.append(args)
            return {"images": []}

        with mock.patch.object(self.edit_api, "run_edit_operation", fake_run):
            await self.edit_api._process("edit-p", "upscale", {"source_path": "x.png"})

        self.assertEqual(calls, [])
        self.assertEqual(self.manager.get_job("edit-p").status, JobStatus.CANCELLED)

    async def test_cancel_that_lands_after_the_last_tile_keeps_no_result(self):
        self.manager.add_job(_job("edit-l", job_type="edit"))
        manager = self.manager

        def fake_run(job_id, *args):
            manager.cancel(job_id)
            return {"images": ["/outputs/edit-l/out.png"]}

        with mock.patch.object(self.edit_api, "run_edit_operation", fake_run):
            await self.edit_api._process("edit-l", "upscale", {"source_path": "x.png"})

        job = self.manager.get_job("edit-l")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.result)


class ComfyGraphJobCancelTests(unittest.IsolatedAsyncioTestCase):
    GRAPH = {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
        "2": {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "vision_studio", "images": ["1", 0]}},
    }

    async def asyncSetUp(self):
        import api.comfy_graph as comfy_graph

        self.comfy_graph = comfy_graph
        self.manager = JobManager()
        tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
        for name, value in (("_job_manager", self.manager), ("_output_dir", tmp)):
            patcher = mock.patch.object(comfy_graph, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _client(self, wait):
        class Client:
            connected = True
            queued = []

            async def queue_prompt(self, workflow, extra_data=None):
                self.queued.append(workflow)
                return "prompt-g"

            async def get_image(self, filename, subfolder="", folder_type="output"):
                return b"PNG"

        client = Client()
        client.wait_for_prompt_completion = wait
        getter = mock.patch.object(self.comfy_graph, "_comfy_client_getter", lambda: client)
        getter.start()
        self.addCleanup(getter.stop)
        return client

    async def test_cancelled_while_pending_is_never_queued(self):
        async def wait(prompt_id, **kwargs):
            return []

        client = self._client(wait)
        self.manager.add_job(_job("graph-p"))
        self.manager.cancel("graph-p")

        result = await self.comfy_graph.execute_comfy_graph("graph-p", self.GRAPH, "image")

        self.assertIsNone(result)
        self.assertEqual(client.queued, [])
        self.assertEqual(self.manager.get_job("graph-p").status, JobStatus.CANCELLED)

    async def test_wait_is_stopped_by_a_cancel(self):
        observed = []
        manager = self.manager

        async def wait(prompt_id, **kwargs):
            should_cancel = kwargs["should_cancel"]
            observed.append(should_cancel())
            manager.cancel("graph-r")
            observed.append(should_cancel())
            raise GenerationCancelled(prompt_id)

        self._client(wait)
        self.manager.add_job(_job("graph-r"))

        result = await self.comfy_graph.execute_comfy_graph("graph-r", self.GRAPH, "image")

        self.assertIsNone(result)
        self.assertEqual(observed, [False, True])
        job = self.manager.get_job("graph-r")
        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertIsNone(job.error)


class _FakeCuda:
    @staticmethod
    def is_available():
        return False


class _FakeTorch:
    cuda = _FakeCuda()


class DirectImageGeneratorCancelTests(unittest.IsolatedAsyncioTestCase):
    def _generator(self):
        path = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        with mock.patch.object(dg, "torch", _FakeTorch()), \
                mock.patch.object(dg, "DIFFUSERS_AVAILABLE", True), \
                mock.patch("foundry.accelerator.configure_inductor_cache",
                           lambda *a, **k: None):
            return dg.DirectGenerator(path, path)

    async def test_step_hook_stops_a_cancelled_generation(self):
        gen = self._generator()
        steps_run = []

        # _generate_sync runs in the executor worker; diffusers calls the step
        # closure at the end of every denoising step (callback_on_step_end ->
        # closure). The cancel check turns true once two steps are done.
        def fake_sync(*args):
            step_fn = args[9]
            for step in range(5):
                step_fn(step, 0, None)
                steps_run.append(step)
            return {"images": [], "seed": 1}

        gen._generate_sync = fake_sync

        with self.assertRaises(GenerationCancelled):
            await gen.generate_image(
                job_id="img-c", prompt="x", steps=5, model_name="m",
                should_cancel=lambda: len(steps_run) >= 2)

        # Steps 0 and 1 finished; the hook raised on step 2 instead of letting
        # all five run.
        self.assertEqual(steps_run, [0, 1])


class _StepwiseVideoPipeline:
    """Calls callback_on_step_end once per step, like the diffusers pipelines."""

    def __init__(self):
        self.steps_run = 0

    def __call__(self, *args, num_inference_steps=1, callback_on_step_end=None, **kwargs):
        for step in range(num_inference_steps):
            self.steps_run += 1
            if callback_on_step_end is not None:
                callback_on_step_end(self, step, 0, {"latents": None})

        class _Out:
            frames = [[object()]]

        return _Out()


class DirectVideoGeneratorCancelTests(unittest.TestCase):
    def _generator(self, pipeline, tmp):
        gen = dvg.DirectVideoGenerator.__new__(dvg.DirectVideoGenerator)
        gen.device = "cpu"
        gen.output_dir = tmp
        gen.applied_acceleration = {}
        gen.load_model = lambda *a, **k: pipeline
        gen._export_frames_to_video = lambda *a, **k: None
        return gen

    def test_step_hook_stops_a_cancelled_generation(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
        pipeline = _StepwiseVideoPipeline()
        gen = self._generator(pipeline, tmp)

        with mock.patch.object(dvg, "torch", None), \
                mock.patch.object(dvg, "resolve_video_model_strategy",
                                  lambda *a, **k: "text-to-video"):
            with self.assertRaises(GenerationCancelled):
                gen._generate_sync(
                    prompt="x", image_path=None, width=64, height=64, fps=8,
                    duration=1, steps=6, model_name="ltx-video", seed=0,
                    output_dir=tmp, should_cancel=lambda: pipeline.steps_run >= 2)

        self.assertEqual(pipeline.steps_run, 2)


class ComfyWaitCancelTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_prompt_is_removed_and_interrupted(self):
        client = ComfyUIClient("http://127.0.0.1:1")
        cancelled_prompts = []

        async def fake_history(prompt_id=None):
            return {}  # still running: no outputs yet

        async def fake_cancel_prompt(prompt_id):
            cancelled_prompts.append(prompt_id)

        client.get_history = fake_history
        client.cancel_prompt = fake_cancel_prompt

        with self.assertRaises(GenerationCancelled):
            await asyncio.wait_for(
                client.wait_for_prompt_completion(
                    "prompt-9", poll_interval=0.01, should_cancel=lambda: True),
                timeout=5)

        self.assertEqual(cancelled_prompts, ["prompt-9"])

    async def test_a_cancel_comfyui_rejects_still_stops_the_wait(self):
        client = ComfyUIClient("http://127.0.0.1:1")

        async def fake_history(prompt_id=None):
            return {}

        async def unreachable(prompt_id):
            raise ConnectionError("ComfyUI went away")

        client.get_history = fake_history
        client.cancel_prompt = unreachable

        with self.assertRaises(GenerationCancelled):
            await asyncio.wait_for(
                client.wait_for_prompt_completion(
                    "prompt-9", poll_interval=0.01, should_cancel=lambda: True),
                timeout=5)

    def _client_with_queue(self, running_ids):
        """A client whose ComfyUI reports these prompt ids as running."""
        client = ComfyUIClient("http://127.0.0.1:1")
        calls = []

        class _Resp:
            status = 200

            def __init__(self, body=None):
                self._body = body

            async def json(self):
                return self._body

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

        class _Session:
            def post(self, url, json=None):
                calls.append(("POST", url, json))
                return _Resp()

            def get(self, url):
                calls.append(("GET", url, None))
                # ComfyUI server.py GET /queue: items are
                # (number, prompt_id, prompt, extra_data, outputs_to_execute).
                running = [[1, pid, {}, {}, []] for pid in running_ids]
                return _Resp({"queue_running": running, "queue_pending": []})

        client._session = _Session()
        return client, calls

    async def test_a_running_prompt_is_dropped_and_interrupted_by_id(self):
        client, calls = self._client_with_queue(["prompt-9"])

        await client.cancel_prompt("prompt-9")

        self.assertEqual(calls, [
            ("POST", "http://127.0.0.1:1/queue", {"delete": ["prompt-9"]}),
            ("GET", "http://127.0.0.1:1/queue", None),
            ("POST", "http://127.0.0.1:1/interrupt", {"prompt_id": "prompt-9"}),
        ])

    async def test_someone_elses_running_prompt_is_not_interrupted(self):
        # ComfyUI before targeted interrupts (v0.3.0 server.py) ignores the
        # body of POST /interrupt and stops whatever is running - so an
        # interrupt is sent only when this job's prompt is the one running.
        client, calls = self._client_with_queue(["someone-else"])

        await client.cancel_prompt("prompt-9")

        self.assertNotIn("http://127.0.0.1:1/interrupt", [url for _m, url, _b in calls])
        self.assertEqual(calls[0], ("POST", "http://127.0.0.1:1/queue", {"delete": ["prompt-9"]}))


if __name__ == "__main__":
    unittest.main()
