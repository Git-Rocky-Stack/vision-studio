"""#33: WS tick builder emits step_image once per revision; previews are
evicted on every terminal path of process_image_generation."""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from preview.step_preview import StepPreview  # noqa: E402
from utils.job_manager import GenerationJob, JobStatus  # noqa: E402


def _job(job_id="job-1", progress=40.0):
    return GenerationJob(
        id=job_id, type="image", status=JobStatus.PROCESSING,
        params={}, output_dir="out", progress=progress)


class BuildWsUpdatesTests(unittest.TestCase):
    def test_step_image_sent_once_per_revision(self):
        job = _job()
        preview = StepPreview(revision=3, step=5, total_steps=25,
                              image="data:image/jpeg;base64,AAAA")
        sent = {}
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=preview):
            first = main.build_ws_updates([job], sent)
            second = main.build_ws_updates([job], sent)

        self.assertEqual([m["type"] for m in first], ["job_update", "step_image"])
        self.assertEqual(first[1], {
            "type": "step_image", "job_id": "job-1", "step": 5,
            "total_steps": 25, "image": "data:image/jpeg;base64,AAAA",
        })
        self.assertEqual([m["type"] for m in second], ["job_update"])

    def test_job_update_shape_is_unchanged(self):
        sent = {}
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=None):
            messages = main.build_ws_updates([_job(progress=62.5)], sent)
        self.assertEqual(messages, [{
            "type": "job_update", "job_id": "job-1",
            "status": "processing", "progress": 62.5,
        }])

    def test_new_revision_sends_again(self):
        job = _job()
        sent = {}
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=StepPreview(1, 1, 25, "data:image/jpeg;base64,A")):
            main.build_ws_updates([job], sent)
        with mock.patch.object(main.step_preview_service, "latest",
                               return_value=StepPreview(2, 2, 25, "data:image/jpeg;base64,B")):
            messages = main.build_ws_updates([job], sent)
        self.assertEqual([m["type"] for m in messages], ["job_update", "step_image"])
        self.assertEqual(messages[1]["step"], 2)


class EvictionTests(unittest.IsolatedAsyncioTestCase):
    async def test_discards_preview_on_completion(self):
        discards = []
        request = main.ImageGenerationRequest(prompt="x")

        async def fake_generate_direct(job_id, req):
            return {"images": [], "seed": 1}

        with mock.patch.object(main, "comfy_client", None), \
                mock.patch.object(main, "generate_direct", fake_generate_direct), \
                mock.patch.object(main.step_preview_service, "discard",
                                  side_effect=discards.append):
            await main.process_image_generation("job-evict", request)

        self.assertEqual(discards, ["job-evict"])

    async def test_discards_preview_on_failure(self):
        discards = []
        request = main.ImageGenerationRequest(prompt="x")

        async def failing_generate_direct(job_id, req):
            raise RuntimeError("boom")

        with mock.patch.object(main, "comfy_client", None), \
                mock.patch.object(main, "generate_direct", failing_generate_direct), \
                mock.patch.object(main.step_preview_service, "discard",
                                  side_effect=discards.append):
            await main.process_image_generation("job-evict-f", request)

        self.assertEqual(discards, ["job-evict-f"])


if __name__ == "__main__":
    unittest.main()
