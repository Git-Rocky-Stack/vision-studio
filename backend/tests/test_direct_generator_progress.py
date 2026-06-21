"""Regression: progress callbacks must schedule from the executor worker
thread without RuntimeError (M10.1 release-blocker fix).

``asyncio.get_event_loop()`` called inside the ``ThreadPoolExecutor`` worker
raised ``RuntimeError: There is no current event loop in thread ...`` on
Python 3.12, killing every direct (non-ComfyUI) image generation on its first
denoising step. ``generate_image`` must capture the running loop in the async
context and hop back via ``call_soon_threadsafe`` from the worker.

This test is deliberately torch-free (it patches the torch/diffusers seams) so
it runs in the lightweight CI env where the bug would otherwise go uncaught.
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

import utils.direct_generator as dg  # noqa: E402  (path setup must precede import)


class _FakeCuda:
    @staticmethod
    def is_available():
        return False


class _FakeTorch:
    """Just enough torch surface for DirectGenerator.__init__ on CPU."""

    cuda = _FakeCuda()


class ProgressLoopRegressionTests(unittest.IsolatedAsyncioTestCase):
    """generate_image schedules progress from the worker thread, no RuntimeError."""

    def _tmp(self):
        path = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(path, ignore_errors=True))
        return path

    def _generator(self):
        with mock.patch.object(dg, "torch", _FakeTorch()), \
                mock.patch.object(dg, "DIFFUSERS_AVAILABLE", True), \
                mock.patch("foundry.accelerator.configure_inductor_cache",
                           lambda *a, **k: None):
            return dg.DirectGenerator(self._tmp(), self._tmp())

    async def test_progress_callback_scheduled_from_worker_thread(self):
        gen = self._generator()

        received = []
        worker_errors = []

        # _generate_sync runs inside the ThreadPoolExecutor worker - the exact
        # thread context that used to raise. Invoking the progress closure here
        # reproduces the real call path (diffusers -> _on_step_end -> closure).
        def fake_sync(*args):
            progress_callback_fn = args[9]
            try:
                progress_callback_fn(0, 0, None)
                progress_callback_fn(4, 0, None)
            except Exception as exc:  # noqa: BLE001 - capture for assertion
                worker_errors.append(exc)
                raise
            return {
                "images": [], "seed": 1, "width": 8, "height": 8,
                "prompt": "x", "model": "m", "acceleration": None,
            }

        gen._generate_sync = fake_sync

        result = await gen.generate_image(
            job_id="reg",
            prompt="x",
            steps=5,
            model_name="m",
            progress_callback=lambda p: received.append(p),
        )
        # Let the call_soon_threadsafe callbacks drain on this loop.
        await asyncio.sleep(0)

        self.assertEqual(worker_errors, [], "progress closure raised in the worker thread")
        self.assertEqual(result["seed"], 1)
        # (step + 1) / steps * 100 for steps 0 and 4 of 5.
        self.assertEqual(received, [20.0, 100.0])


if __name__ == "__main__":
    unittest.main()
