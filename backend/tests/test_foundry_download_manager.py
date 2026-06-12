import asyncio
import os
import pathlib
import sys
import tempfile
import threading
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


class DownloadManagerDiskPreflightTests(unittest.IsolatedAsyncioTestCase):
    async def test_over_budget_raises_before_any_download_call(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 10 ** 11)]  # ~100 GB
        download = mock.MagicMock()

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=1024)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "error")
        self.assertIn("disk space", job.error.lower())
        download.assert_not_called()  # refused up front, nothing downloaded

    async def test_within_budget_proceeds(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(*, local_dir, filename, **_):
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        self.assertEqual(manager._jobs["flux-dev"].status, "ready")


class DownloadManagerPauseTests(unittest.IsolatedAsyncioTestCase):
    async def test_pause_stops_at_next_chunk_and_preserves_partials(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 1000)]
        started = threading.Event()
        paused = threading.Event()
        self.addCleanup(started.set)
        self.addCleanup(paused.set)

        def fake_download(*, local_dir, filename, tqdm_class, **_):
            os.makedirs(local_dir, exist_ok=True)
            # Leave a .incomplete partial like the library does on interruption.
            with open(os.path.join(local_dir, filename + ".incomplete"), "w") as handle:
                handle.write("partial")
            bar = tqdm_class(total=1000)
            started.set()
            bar.update(100)        # first chunk ok (cancel not yet signalled)
            paused.wait()          # block until the test has called pause()
            bar.update(100)        # now sink.add sees the cancel event and raises
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await asyncio.to_thread(started.wait)
            manager.pause("flux-dev")
            paused.set()           # release the worker to attempt the second chunk
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "paused")
        # The .incomplete partial is preserved for resume (NOT deleted).
        target = os.path.join(models_dir, "checkpoints")
        self.assertTrue(
            any(name.endswith(".incomplete") for name in os.listdir(target))
        )


class DownloadManagerResumeTests(unittest.IsolatedAsyncioTestCase):
    async def test_resume_reinvokes_download_and_continues_from_offset(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        # Seed a paused job (as if Task 7 left it).
        manager._jobs["flux-dev"] = DownloadJob(model_id="flux-dev", status="paused")
        paths = [_path_info("flux1-dev.safetensors", 1000)]
        observed_initial = {}

        def fake_download(*, local_dir, filename, tqdm_class, **_):
            os.makedirs(local_dir, exist_ok=True)
            # hf auto-resumes: the bar is created with initial = bytes already
            # in .incomplete. Emulate a 400-byte partial.
            bar = tqdm_class(total=1000, initial=400)
            observed_initial["n"] = bar.n
            bar.update(600)
            bar.close()
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            job = manager.resume("flux-dev")
            self.assertEqual(job.status, "queued")  # re-enqueued
            await _drain(manager)

        self.assertEqual(observed_initial["n"], 400)  # continued, not restarted
        self.assertEqual(manager._jobs["flux-dev"].status, "ready")


class DownloadManagerCancelTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_deletes_partials_and_sets_cancelled(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 1000)]
        started = threading.Event()
        cancelled = threading.Event()
        self.addCleanup(started.set)
        self.addCleanup(cancelled.set)

        def fake_download(*, local_dir, filename, tqdm_class, **_):
            os.makedirs(local_dir, exist_ok=True)
            with open(os.path.join(local_dir, filename + ".incomplete"), "w") as handle:
                handle.write("partial")
            bar = tqdm_class(total=1000)
            started.set()
            bar.update(100)        # first chunk ok (cancel not yet signalled)
            cancelled.wait()       # block until the test has called cancel()
            bar.update(100)        # now sink.add sees the cancel event and raises
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await asyncio.to_thread(started.wait)
            manager.cancel("flux-dev")
            cancelled.set()        # release the worker to attempt the second chunk
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "cancelled")
        target = os.path.join(models_dir, "checkpoints")
        self.assertFalse(
            any(name.endswith(".incomplete") for name in os.listdir(target))
        )

    async def test_get_record_status_is_none_after_cancel(self):
        manager = make_manager()
        manager._jobs["flux-dev"] = DownloadJob(model_id="flux-dev", status="cancelled")
        # Terminal -> registry falls back to its own detection.
        self.assertIsNone(manager.get_record_status("flux-dev"))


class DownloadManagerIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def test_size_consistency_oserror_leaves_error_and_no_ready(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir)
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(**_):
            # Mirror the library's size-consistency backstop.
            raise OSError("Consistency check failed: file should be of size 100")

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "error")
        self.assertIn("integrity", job.error)
        self.assertNotEqual(job.status, "ready")  # never a partial as ready


class DownloadManagerGatedTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_401_surfaces_gate_url(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 100)]

        def fake_download(**_):
            raise _http_error(401)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)

        job = manager._jobs["flux-dev"]
        self.assertEqual(job.status, "error")
        self.assertEqual(job.gate_url, "https://huggingface.co/black-forest-labs/FLUX.1-dev")


class DownloadManagerXetToggleTests(unittest.IsolatedAsyncioTestCase):
    async def test_precise_mode_disables_xet_during_download_and_restores_after(self):
        manager = make_manager(mode="precise")
        paths = [_path_info("flux1-dev.safetensors", 10)]
        seen = {}

        def fake_download(*, local_dir, filename, **_):
            seen["disabled_during"] = dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET
            dest = os.path.join(local_dir, filename)
            open(dest, "w").close()
            return dest

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)
            # Forced True during the call, restored to the prior False after.
            self.assertTrue(seen["disabled_during"])
            self.assertFalse(dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET)

    async def test_precise_mode_restores_xet_even_on_error(self):
        manager = make_manager(mode="precise")
        paths = [_path_info("flux1-dev.safetensors", 10)]

        def boom(**_):
            raise OSError("Consistency check failed")

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=boom):
            manager.enqueue("flux-dev")
            await _drain(manager)
            self.assertFalse(dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET)

    async def test_fast_mode_leaves_xet_untouched(self):
        manager = make_manager(mode="fast")
        paths = [_path_info("flux1-dev.safetensors", 10)]
        seen = {}

        def fake_download(*, local_dir, filename, **_):
            seen["during"] = dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET
            open(os.path.join(local_dir, filename), "w").close()
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev")
            await _drain(manager)
            self.assertFalse(seen["during"])  # Xet left enabled in fast mode

    def test_concurrent_precise_toggles_restore_true_original(self):
        # Reference-count invariant. Two overlapping precise toggles where the
        # FIRST entrant EXITS BEFORE the second. The per-call (un-counted)
        # version leaves the global disabled (True); the counted version must
        # restore the true original (False). The interleaving is forced via
        # events, so the RED/GREEN is deterministic, not timing-dependent.
        manager = make_manager(mode="precise")
        a_entered = threading.Event()
        b_entered = threading.Event()
        a_exited = threading.Event()
        errors = []

        def worker_a():
            try:
                with manager._xet_toggle():        # first: saves original, disables Xet
                    a_entered.set()
                    b_entered.wait(timeout=5)       # wait until B has also entered
                # A exits FIRST, while B is still inside its toggle
                a_exited.set()
            except Exception as exc:                # pragma: no cover
                errors.append(exc)

        def worker_b():
            try:
                a_entered.wait(timeout=5)           # enter only AFTER A disabled Xet
                with manager._xet_toggle():         # second, overlapping entrant
                    b_entered.set()
                    a_exited.wait(timeout=5)        # exit LAST, after A has exited
            except Exception as exc:                # pragma: no cover
                errors.append(exc)

        with mock.patch.object(dm_module.huggingface_hub.constants, "HF_HUB_DISABLE_XET", False):
            ta = threading.Thread(target=worker_a)
            tb = threading.Thread(target=worker_b)
            ta.start()
            tb.start()
            ta.join(timeout=10)
            tb.join(timeout=10)
            self.assertEqual(errors, [])
            # Restored to the TRUE original (False), not left disabled (True).
            self.assertFalse(dm_module.huggingface_hub.constants.HF_HUB_DISABLE_XET)


class DownloadManagerTokenDisciplineTests(unittest.IsolatedAsyncioTestCase):
    async def test_token_never_lands_on_job_or_in_list_jobs(self):
        manager = make_manager()
        paths = [_path_info("flux1-dev.safetensors", 10)]

        def fake_download(*, local_dir, filename, **_):
            open(os.path.join(local_dir, filename), "w").close()
            return os.path.join(local_dir, filename)

        with mock.patch.object(dm_module.huggingface_hub, "get_paths_info", return_value=paths), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake_download):
            manager.enqueue("flux-dev", token="hf_TOPSECRET")
            await _drain(manager)

        for job in manager.list_jobs():
            self.assertFalse(hasattr(job, "token"))
            self.assertNotIn("hf_TOPSECRET", repr(job))


class DownloadFileFilterTests(unittest.TestCase):
    """Codex M4 review H-2: a diffusers repo download must not acquire pickle
    sidecars or repo-authored Python. The safe load path needs neither;
    pickle suffixes are fetched only with explicit per-model consent."""

    REPO_FILES = [
        ("model_index.json", 10),
        ("unet/diffusion_pytorch_model.safetensors", 1000),
        ("vae/config.json", 5),
        ("bonus.ckpt", 700),            # root pickle sidecar
        ("unet/extra_state.bin", 300),  # component-level pickle
        ("pipeline.py", 20),            # repo-authored code: NEVER fetched
        ("rng_state.pth", 40),
    ]

    def _resolve(self, consent_lookup=None):
        manager = make_manager()
        if consent_lookup is not None:
            manager._consent_lookup = consent_lookup
        record = {"id": "m-repo", "repo_id": "org/m-repo",
                  "artifact_type": "diffusers-pipeline"}
        infos = [_path_info(path, size) for path, size in self.REPO_FILES]

        def fake_paths_info(repo_id, paths, revision):
            if not paths:
                return infos
            return [i for i in infos if i.path in paths]

        with mock.patch.object(
            dm_module.huggingface_hub, "get_paths_info", side_effect=fake_paths_info
        ):
            return manager._resolve_files("m-repo", record)

    def test_pickle_and_py_files_excluded_without_consent(self):
        filenames, total, _dir = self._resolve()
        self.assertEqual(
            sorted(filenames),
            ["model_index.json", "unet/diffusion_pytorch_model.safetensors",
             "vae/config.json"],
        )
        # The byte preflight must budget only what will be fetched.
        self.assertEqual(total, 1015)

    def test_pickle_files_included_with_consent_but_py_never(self):
        filenames, total, _dir = self._resolve(
            consent_lookup=lambda mid: {"pickle": True, "trust_remote_code": False}
        )
        self.assertIn("bonus.ckpt", filenames)
        self.assertIn("unet/extra_state.bin", filenames)
        self.assertIn("rng_state.pth", filenames)
        # No loader executes repo code in M4 - fetching it serves nothing.
        self.assertNotIn("pipeline.py", filenames)
        self.assertEqual(total, 1015 + 700 + 300 + 40)

    def test_consent_lookup_failure_fails_closed(self):
        def broken(mid):
            raise RuntimeError("store corrupt")

        filenames, _total, _dir = self._resolve(consent_lookup=broken)
        self.assertNotIn("bonus.ckpt", filenames)
        self.assertNotIn("unet/extra_state.bin", filenames)


async def _drain(manager: DownloadManager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def _path_info(path: str, size: int):
    """Mimic a huggingface_hub RepoFile from get_paths_info."""
    return type("RepoFile", (), {"path": path, "size": size})()


def _disk(free: int):
    return type("Usage", (), {"total": free * 2, "used": free, "free": free})()


def _http_error(status_code: int) -> Exception:
    class _Resp:
        def __init__(self, code):
            self.status_code = code

    exc = Exception(f"HTTP {status_code}")
    exc.response = _Resp(status_code)  # type: ignore[attr-defined]
    return exc


if __name__ == "__main__":
    unittest.main()
