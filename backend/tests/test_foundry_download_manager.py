import asyncio
import os
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


class DownloadManagerHappyPathTests(unittest.IsolatedAsyncioTestCase):
    async def test_single_file_download_drives_progress_and_reaches_ready(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)

        # get_paths_info -> one 100-byte file.
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(*, repo_id, filename, local_dir, token, tqdm_class, revision):
            # Simulate hf: instantiate the tqdm per file, stream bytes, close.
            bar = tqdm_class(total=100)
            bar.update(100)
            bar.close()
            dest = os.path.join(local_dir, filename)
            with open(dest, "w", encoding="utf-8") as handle:
                handle.write("x")
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "ready")
        self.assertAlmostEqual(job.progress, 1.0)
        self.assertEqual(job.total_bytes, 100)
        self.assertIsNone(job.error)

    async def test_token_is_passed_per_call_and_not_stored(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 10)]
        seen = {}

        def fake_download(*, token, local_dir, filename, **_):
            seen["token"] = token
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev", token="hf_SECRET")
            await _drain(manager)

        self.assertEqual(seen["token"], "hf_SECRET")
        # The secret is on no job and on no manager attribute.
        self.assertFalse(any("hf_SECRET" in repr(v) for v in manager._jobs.values()))
        self.assertFalse(any("hf_SECRET" in repr(v) for v in vars(manager).values()))


async def _drain(manager: DownloadManager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def _path_info(path: str, size: int):
    """Mimic a huggingface_hub RepoFile from get_paths_info."""
    return type("RepoFile", (), {"path": path, "size": size})()


def _disk(free: int):
    return type("Usage", (), {"total": free * 2, "used": free, "free": free})()


if __name__ == "__main__":
    unittest.main()
