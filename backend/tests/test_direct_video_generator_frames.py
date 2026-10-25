"""Video generation contract: per-family frame caps, honest duration, random
seed reported back, per-step progress, family resolved from the record.

Torch/diffusers-free: the pipeline is a fake that records its call kwargs.
"""

import asyncio
import pathlib
import shutil
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from unittest import mock

from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils import direct_video_generator as dvg  # noqa: E402


class PlanVideoFrameCountTests(unittest.TestCase):
    def test_animatediff_caps_at_32(self):
        self.assertEqual(dvg.plan_video_frame_count("animatediff", 24, 5), 32)
        self.assertEqual(dvg.plan_video_frame_count("animatediff", 12, 2), 24)

    def test_svd_caps_at_25(self):
        self.assertEqual(dvg.plan_video_frame_count("svd", 24, 10), 25)
        self.assertEqual(dvg.plan_video_frame_count("svd", 12, 1), 12)

    def test_ltx_rounds_to_8k_plus_1_and_caps_at_257(self):
        self.assertEqual(dvg.plan_video_frame_count("ltx", 24, 5), 121)   # 120 -> 121
        self.assertEqual(dvg.plan_video_frame_count("ltx", 60, 10), 257)  # 600 -> cap
        self.assertEqual(dvg.plan_video_frame_count("ltx", 12, 1), 9)     # 12 -> 9 (8*1+1)
        for fps in (12, 24, 30, 60):
            for duration in range(1, 11):
                frames = dvg.plan_video_frame_count("ltx", fps, duration)
                self.assertEqual((frames - 1) % 8, 0, (fps, duration))
                self.assertLessEqual(frames, 257)

    def test_minimum_is_8_frames(self):
        self.assertEqual(dvg.plan_video_frame_count("animatediff", 1, 1), 8)

    def test_unknown_family_is_uncapped(self):
        self.assertEqual(dvg.plan_video_frame_count(None, 24, 5), 120)


class ResolveStrategyFromRecordTests(unittest.TestCase):
    def test_catalog_ids_resolve_without_a_record(self):
        self.assertEqual(dvg.resolve_video_family("ltx-video"), "ltx")
        self.assertEqual(dvg.resolve_video_family("SVD"), "svd")
        self.assertEqual(dvg.resolve_video_family("animatediff"), "animatediff")

    def test_unknown_id_resolves_through_base_architecture(self):
        record = {"base_architecture": "ltx"}
        self.assertEqual(
            dvg.resolve_video_model_strategy("my-ltx-finetune", False, record),
            "text-to-video")
        with self.assertRaises(ValueError):
            dvg.resolve_video_model_strategy(
                "my-svd-xt", False, {"base_architecture": "svd"})
        self.assertEqual(
            dvg.resolve_video_model_strategy(
                "my-svd-xt", True, {"base_architecture": "svd"}),
            "image-to-video")

    def test_unknown_id_without_a_video_record_is_refused(self):
        with self.assertRaises(ValueError):
            dvg.resolve_video_model_strategy("sdxl", False, {"base_architecture": "sdxl"})


class _RecordingVideoPipeline:
    """Runs callback_on_step_end once per step; emits num_frames frames."""

    def __init__(self):
        self.calls = []

    def __call__(self, *args, num_inference_steps=1, num_frames=8,
                 callback_on_step_end=None, **kwargs):
        self.calls.append(dict(kwargs, num_frames=num_frames,
                               num_inference_steps=num_inference_steps, args=args))
        for step in range(num_inference_steps):
            if callback_on_step_end is not None:
                callback_on_step_end(self, step, 0, {})

        class _Out:
            frames = [[object()] * num_frames]

        return _Out()


class _FakeTorch:
    """Just enough torch for _generate_sync: Generator + inference_mode."""

    def __init__(self):
        self.inference_mode_entries = 0
        test_torch = self

        class _Gen:
            def __init__(self, device=None):
                pass

            def manual_seed(self, seed):
                test_torch.seed = seed
                return self

        self.Generator = _Gen

    @contextmanager
    def _inference(self):
        self.inference_mode_entries += 1
        yield

    def inference_mode(self):
        return self._inference()


class GenerateVideoTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))
        self.pipeline = _RecordingVideoPipeline()
        gen = dvg.DirectVideoGenerator.__new__(dvg.DirectVideoGenerator)
        gen.device = "cpu"
        gen.output_dir = self.tmp
        gen.applied_acceleration = {}
        gen.executor = ThreadPoolExecutor(max_workers=1)
        self.addCleanup(gen.executor.shutdown)
        gen.load_model = lambda *a, **k: self.pipeline
        gen._export_frames_to_video = lambda *a, **k: None
        self.gen = gen
        self.torch = _FakeTorch()
        patcher = mock.patch.object(dvg, "torch", self.torch)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _run(self, **overrides):
        kwargs = dict(job_id="job-1", prompt="a wave", image_path=None, width=64,
                      height=64, fps=24, duration=5, steps=4, model_name="ltx-video")
        kwargs.update(overrides)
        return await self.gen.generate_video(**kwargs)

    async def test_no_seed_draws_a_random_one_and_reports_it(self):
        with mock.patch.object(dvg.random, "randint", return_value=123456789):
            result = await self._run(seed=None)
        self.assertEqual(result["seed"], 123456789)
        self.assertEqual(self.torch.seed, 123456789)

    async def test_explicit_seed_is_reported(self):
        result = await self._run(seed=42)
        self.assertEqual(result["seed"], 42)

    async def test_result_reports_the_produced_length(self):
        result = await self._run(model_name="animatediff", fps=24, duration=5, seed=1)
        self.assertEqual(self.pipeline.calls[0]["num_frames"], 32)
        self.assertEqual(result["frames"], 32)
        self.assertAlmostEqual(result["duration"], 32 / 24, places=3)
        self.assertEqual(result["requested_duration"], 5)

    async def test_progress_is_reported_per_step(self):
        # The MP4 encode takes real time after the last step (as it does on a
        # GPU), which is when the loop drains the per-step updates.
        self.gen._export_frames_to_video = lambda *a, **k: time.sleep(0.05)
        updates = []
        await self._run(seed=1, steps=4, progress_callback=updates.append)
        # 5% before load, one update per denoising step, 100% at the end.
        self.assertEqual(updates, [5.0, 27.5, 50.0, 72.5, 95.0, 100.0])

    async def test_a_late_step_update_never_overwrites_the_final_100(self):
        updates = []
        await self._run(seed=1, steps=4, progress_callback=updates.append)
        for _ in range(5):
            await asyncio.sleep(0)
        self.assertEqual(updates[-1], 100.0)

    async def test_pipeline_runs_under_inference_mode(self):
        await self._run(seed=1)
        self.assertEqual(self.torch.inference_mode_entries, 1)

    async def test_svd_decodes_in_chunks_of_8(self):
        image_path = str(pathlib.Path(self.tmp) / "frame.png")
        Image.new("RGB", (8, 8)).save(image_path)
        await self._run(model_name="svd", image_path=image_path, seed=1)
        self.assertEqual(self.pipeline.calls[0]["decode_chunk_size"], 8)
        self.assertEqual(self.pipeline.calls[0]["num_frames"], 25)

    async def test_text_to_video_gets_no_decode_chunk_size(self):
        await self._run(seed=1)
        self.assertNotIn("decode_chunk_size", self.pipeline.calls[0])

    async def test_unknown_model_id_resolves_family_from_its_record(self):
        with mock.patch.object(dvg, "_resolve_record",
                               return_value={"base_architecture": "ltx"}):
            result = await self._run(model_name="my-ltx-finetune", seed=1)
        self.assertEqual(self.pipeline.calls[0]["num_frames"], 121)
        self.assertEqual(result["frames"], 121)


class MainVideoSeedTests(unittest.IsolatedAsyncioTestCase):
    async def test_minus_one_seed_reaches_the_generator_as_random(self):
        import main
        from utils.job_manager import GenerationJob, JobManager, JobStatus

        manager = JobManager()
        manager.add_job(GenerationJob(
            id="v1", type="video", status=JobStatus.PENDING, params={}, output_dir="out"))
        seen = {}

        class FakeDirectVideo:
            async def generate_video(self, **kwargs):
                seen.update(kwargs)
                return {"video": "/outputs/v1/video.mp4", "seed": 7}

        with mock.patch.object(main, "job_manager", manager), \
                mock.patch.object(main, "comfy_client", None), \
                mock.patch.object(main, "direct_video_generator", FakeDirectVideo()):
            await main.process_video_generation(
                "v1", main.VideoGenerationRequest(prompt="a wave", seed=-1))

        self.assertIsNone(seen["seed"])
        self.assertEqual(manager.get_job("v1").result["seed"], 7)


if __name__ == "__main__":
    unittest.main()
