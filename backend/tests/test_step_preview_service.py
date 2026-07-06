"""#33: StepPreviewService - throttle, revisions, fail-soft, eviction."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from preview.step_preview import MIN_DECODE_INTERVAL_S, StepPreviewService  # noqa: E402


class _Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def _service(decode=None, clock=None):
    calls = []

    def default_decode(latents, family, width, height):
        calls.append((latents, family, width, height))
        return f"data:image/jpeg;base64,frame{len(calls)}"

    service = StepPreviewService(decode=decode or default_decode, clock=clock or _Clock())
    return service, calls


class SubmitTests(unittest.TestCase):
    def test_first_submit_always_decodes(self):
        service, calls = _service()
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="LAT", family="sd15", width=512, height=512)
        self.assertEqual(calls, [("LAT", "sd15", 512, 512)])
        preview = service.latest("j")
        self.assertEqual((preview.revision, preview.step, preview.total_steps),
                         (1, 1, 25))
        self.assertEqual(preview.image, "data:image/jpeg;base64,frame1")

    def test_submits_inside_the_throttle_window_are_skipped(self):
        clock = _Clock()
        service, calls = _service(clock=clock)
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="A", family="sd15", width=64, height=64)
        clock.advance(MIN_DECODE_INTERVAL_S - 0.1)
        service.submit(job_id="j", step=2, total_steps=25,
                       latents="B", family="sd15", width=64, height=64)
        self.assertEqual(len(calls), 1)
        self.assertEqual(service.latest("j").step, 1)

    def test_submit_after_the_window_decodes_and_bumps_revision(self):
        clock = _Clock()
        service, calls = _service(clock=clock)
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="A", family="sd15", width=64, height=64)
        clock.advance(MIN_DECODE_INTERVAL_S + 0.01)
        service.submit(job_id="j", step=7, total_steps=25,
                       latents="B", family="sd15", width=64, height=64)
        self.assertEqual(len(calls), 2)
        preview = service.latest("j")
        self.assertEqual((preview.revision, preview.step), (2, 7))

    def test_none_latents_are_ignored(self):
        service, calls = _service()
        service.submit(job_id="j", step=1, total_steps=25,
                       latents=None, family="sd15", width=64, height=64)
        self.assertEqual(calls, [])
        self.assertIsNone(service.latest("j"))

    def test_decode_failure_disables_the_job_without_raising(self):
        clock = _Clock()

        def broken_decode(latents, family, width, height):
            raise RuntimeError("decoder exploded")

        service, _ = _service(decode=broken_decode, clock=clock)
        service.submit(job_id="j", step=1, total_steps=25,
                       latents="A", family="sd15", width=64, height=64)  # must not raise
        self.assertIsNone(service.latest("j"))

        # A later submit does not retry the broken decoder.
        attempts = []

        def counting_decode(latents, family, width, height):
            attempts.append(1)
            return "data:image/jpeg;base64,x"

        service._decode = counting_decode
        clock.advance(10)
        service.submit(job_id="j", step=2, total_steps=25,
                       latents="B", family="sd15", width=64, height=64)
        self.assertEqual(attempts, [])

    def test_jobs_are_throttled_independently(self):
        service, calls = _service()
        service.submit(job_id="a", step=1, total_steps=10,
                       latents="A", family="sd15", width=64, height=64)
        service.submit(job_id="b", step=1, total_steps=10,
                       latents="B", family="sdxl", width=64, height=64)
        self.assertEqual(len(calls), 2)

    def test_discard_clears_state_and_reenables(self):
        def broken_decode(latents, family, width, height):
            raise RuntimeError("boom")

        service, _ = _service(decode=broken_decode)
        service.submit(job_id="j", step=1, total_steps=10,
                       latents="A", family="sd15", width=64, height=64)
        service.discard("j")
        self.assertIsNone(service.latest("j"))

        recovered = []
        service._decode = lambda latents, family, width, height: (
            recovered.append(1) or "data:image/jpeg;base64,ok")
        service._clock = _Clock()
        service.submit(job_id="j", step=1, total_steps=10,
                       latents="A", family="sd15", width=64, height=64)
        self.assertEqual(recovered, [1])


if __name__ == "__main__":
    unittest.main()
