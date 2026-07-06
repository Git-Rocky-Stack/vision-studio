"""#33: the step callback threads latents into the step-preview service.

Torch-free (patches the torch/diffusers seams) so it runs on stub CI -
mirrors test_direct_generator_progress.py.
"""

import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import utils.direct_generator as dg  # noqa: E402


class _FakeCuda:
    @staticmethod
    def is_available():
        return False


class _FakeTorch:
    cuda = _FakeCuda()


class StepPreviewWiringTests(unittest.IsolatedAsyncioTestCase):
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

    async def test_step_callback_submits_latents_to_preview_service(self):
        gen = self._generator()
        submits = []

        def fake_sync(*args):
            progress_callback_fn = args[9]
            progress_callback_fn(0, 0, "LATENTS")
            return {
                "images": [], "seed": 1, "width": 8, "height": 8,
                "prompt": "x", "model": "m", "acceleration": None,
            }

        gen._generate_sync = fake_sync

        with mock.patch.object(
                dg, "_resolve_record", lambda name: {"base_architecture": "sd15"}), \
                mock.patch.object(dg.step_preview_service, "submit",
                                  side_effect=lambda **kw: submits.append(kw)):
            await gen.generate_image(
                job_id="prev", prompt="x", steps=4, width=64, height=96,
                model_name="sd-1-5",
            )

        self.assertEqual(len(submits), 1)
        self.assertEqual(submits[0], {
            "job_id": "prev", "step": 1, "total_steps": 4,
            "latents": "LATENTS", "family": "sd15",
            "width": 64, "height": 96,
        })

    async def test_missing_record_submits_none_family(self):
        gen = self._generator()
        submits = []

        def fake_sync(*args):
            args[9](2, 0, "L")
            return {
                "images": [], "seed": 1, "width": 8, "height": 8,
                "prompt": "x", "model": "m", "acceleration": None,
            }

        gen._generate_sync = fake_sync

        with mock.patch.object(dg, "_resolve_record", lambda name: None), \
                mock.patch.object(dg.step_preview_service, "submit",
                                  side_effect=lambda **kw: submits.append(kw)):
            await gen.generate_image(
                job_id="prev2", prompt="x", steps=4, model_name="mystery",
            )

        self.assertEqual(submits[0]["family"], None)
        self.assertEqual(submits[0]["step"], 3)


if __name__ == "__main__":
    unittest.main()
