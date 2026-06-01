import asyncio
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import foundry.download_manager as dm_module  # type: ignore[import-not-found]
from foundry.download_manager import DownloadJob, DownloadManager  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def make_manager(models_dir=None, concurrency=2, mode="fast"):
    models_dir = models_dir or tempfile.mkdtemp()
    model_manager = ModelManager(models_dir)
    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    return DownloadManager(
        registry=registry,
        model_manager=model_manager,
        models_dir=models_dir,
        concurrency=concurrency,
        mode=mode,
    )


class DownloadManagerConcurrencyTests(unittest.TestCase):
    def test_concurrency_is_clamped_to_one_six(self):
        self.assertEqual(make_manager(concurrency=0)._concurrency, 1)
        self.assertEqual(make_manager(concurrency=99)._concurrency, 6)
        self.assertEqual(make_manager(concurrency=3)._concurrency, 3)

    def test_download_job_never_has_a_token_field(self):
        job = DownloadJob(model_id="flux-dev", status="queued")
        self.assertNotIn("token", job.__dict__)
        self.assertFalse(hasattr(job, "token"))


class DownloadManagerEnqueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_enqueue_creates_a_queued_job_keyed_by_model_id(self):
        manager = make_manager()
        gate = asyncio.Event()
        self.addCleanup(gate.set)

        async def _hang(model_id, token):
            await gate.wait()

        with mock.patch.object(manager, "_run_job", new=_hang):
            job = manager.enqueue("flux-dev")
            self.assertEqual(job.model_id, "flux-dev")
            self.assertIn(manager._jobs["flux-dev"].status, {"queued", "downloading"})
            gate.set()
            await _drain(manager)

    async def test_enqueue_is_idempotent_for_an_active_id(self):
        manager = make_manager()
        gate = asyncio.Event()
        self.addCleanup(gate.set)

        async def _hang(model_id, token):
            await gate.wait()

        with mock.patch.object(manager, "_run_job", new=_hang):
            first = manager.enqueue("flux-dev")
            second = manager.enqueue("flux-dev")
            self.assertIs(first, second)            # same job object
            self.assertEqual(len(manager._tasks), 1)  # no second task
            gate.set()
            await _drain(manager)

    async def test_third_enqueue_waits_for_a_slot_with_limit_two(self):
        manager = make_manager(concurrency=2)
        running = []
        release = asyncio.Event()
        self.addCleanup(release.set)

        async def _busy(model_id, token):
            running.append(model_id)
            await release.wait()

        # Mock the INNER work (_execute). The real _run_job owns the semaphore,
        # so it still bounds concurrency. Mocking _run_job (as the original did)
        # would bypass the very semaphore this test exists to verify.
        with mock.patch.object(manager, "_execute", new=_busy):
            manager.enqueue("flux-dev")
            manager.enqueue("sdxl-base")
            third = manager.enqueue("sd-1-5")
            # Let the two slots start; the third must block on the semaphore.
            await asyncio.sleep(0.05)
            self.assertEqual(len(running), 2)
            self.assertEqual(third.status, "queued")  # still waiting on the semaphore
            release.set()
            await _drain(manager)
            self.assertIn("sd-1-5", running)


async def _drain(manager: DownloadManager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
