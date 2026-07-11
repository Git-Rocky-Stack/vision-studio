"""#34 installer PR4: VS-mirror fallback in the DownloadManager.

The mirror (Cloudflare R2, manifest ``mirror`` stanza) is tried ONLY when the
primary HuggingFace fetch fails with an infrastructure error. It is never a
route around a trust boundary: a license gate (user must accept), a disk
refusal, and a user cancel/pause all propagate untouched. Mirror bytes are
sha256-verified per file (fail closed - no hash, no download) and land via
the same .incomplete -> atomic-replace discipline as every other path.
"""

import asyncio
import hashlib
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
from foundry.download_manager import DownloadManager  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")

MODEL_ID = "sd-1-5"
BASE_URL = "https://models.vision-studio-x.com/sd-1-5"

_INDEX_BYTES = b'{"_class_name": "StableDiffusionPipeline"}'
_UNET_BYTES = b"unet-tensor-bytes" * 4096


def _mirror(files=None, base_url=BASE_URL):
    if files is None:
        files = [
            {
                "name": "model_index.json",
                "sha256": hashlib.sha256(_INDEX_BYTES).hexdigest(),
                "bytes": len(_INDEX_BYTES),
            },
            {
                "name": "unet/diffusion_pytorch_model.safetensors",
                "sha256": hashlib.sha256(_UNET_BYTES).hexdigest(),
                "bytes": len(_UNET_BYTES),
            },
        ]
    return {"base_url": base_url, "files": files}


def make_manager(models_dir=None, mirror=None):
    models_dir = models_dir or tempfile.mkdtemp()
    model_manager = ModelManager(models_dir)
    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    return DownloadManager(
        registry=registry,
        model_manager=model_manager,
        models_dir=models_dir,
        concurrency=2,
        mode="fast",
        mirror_lookup=(lambda model_id: mirror) if mirror is not None else None,
    )


class _FakeResponse:
    """Just enough of requests.Response for the streaming mirror path."""

    def __init__(self, payload: bytes, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.headers = {"Content-Length": str(len(payload))}
        self.closed = False

    def iter_content(self, chunk_size: int):
        for start in range(0, len(self._payload), chunk_size):
            yield self._payload[start:start + chunk_size]

    def close(self):
        self.closed = True


def _mirror_get(payloads):
    """A requests.get double serving payloads keyed by URL."""

    def get(url, **kwargs):
        assert kwargs.get("stream") is True
        assert kwargs.get("allow_redirects") is False
        if url not in payloads:
            raise AssertionError(f"unexpected mirror URL {url}")
        return _FakeResponse(payloads[url])

    return get


class _hub_failure:
    """Patch BOTH resolution entry points (records with a curated ``files``
    allowlist skip list_repo_files and go straight to get_paths_info - an
    unmocked call there would hit the real hub)."""

    def __init__(self, exc: Exception):
        self._exc = exc

    def __enter__(self):
        def _raise(*args, **kwargs):
            raise self._exc

        self._patches = [
            mock.patch.object(dm_module.huggingface_hub, "list_repo_files", side_effect=_raise),
            mock.patch.object(dm_module.huggingface_hub, "get_paths_info", side_effect=_raise),
        ]
        for patch in self._patches:
            patch.start()
        return self

    def __exit__(self, *exc_info):
        for patch in self._patches:
            patch.stop()
        return False


def _http_error(status_code: int) -> Exception:
    class _Resp:
        def __init__(self, code):
            self.status_code = code

    exc = Exception(f"HTTP {status_code}")
    exc.response = _Resp(status_code)  # type: ignore[attr-defined]
    return exc


async def _drain(manager: DownloadManager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def _disk(free: int):
    return type("Usage", (), {"total": free * 2, "used": free, "free": free})()


def _path_info(path: str, size: int):
    return type("RepoFile", (), {"path": path, "size": size})()


class MirrorFallbackHappyPathTests(unittest.IsolatedAsyncioTestCase):
    async def test_hf_infrastructure_failure_falls_back_and_verifies(self):
        models_dir = tempfile.mkdtemp()
        manager = make_manager(models_dir=models_dir, mirror=_mirror())
        payloads = {
            f"{BASE_URL}/model_index.json": _INDEX_BYTES,
            f"{BASE_URL}/unet/diffusion_pytorch_model.safetensors": _UNET_BYTES,
        }

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get", side_effect=_mirror_get(payloads)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "ready")
        self.assertIsNone(job.error)
        self.assertAlmostEqual(job.progress, 1.0)
        self.assertEqual(job.total_bytes, len(_INDEX_BYTES) + len(_UNET_BYTES))

        # sd-1-5 is artifact_type "checkpoint" -> the shared checkpoints dir.
        target_dir = os.path.join(models_dir, "checkpoints")
        with open(os.path.join(target_dir, "model_index.json"), "rb") as handle:
            self.assertEqual(handle.read(), _INDEX_BYTES)
        nested = os.path.join(target_dir, "unet", "diffusion_pytorch_model.safetensors")
        with open(nested, "rb") as handle:
            self.assertEqual(handle.read(), _UNET_BYTES)
        for root, _dirs, names in os.walk(target_dir):
            for name in names:
                self.assertFalse(name.endswith(".incomplete"), os.path.join(root, name))


class MirrorTrustBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_gated_error_never_falls_back(self):
        manager = make_manager(mirror=_mirror())

        with _hub_failure(_http_error(401)), mock.patch("requests.get") as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertTrue(job.gate_url, "gate URL must survive - no mirror routing")
        get.assert_not_called()

    async def test_disk_space_error_never_falls_back(self):
        manager = make_manager(mirror=_mirror())
        paths = [_path_info("model_index.json", 10 ** 13)]

        with mock.patch.object(
            dm_module.huggingface_hub, "list_repo_files",
            return_value=["model_index.json"],
        ), mock.patch.object(
            dm_module.huggingface_hub, "get_paths_info", return_value=paths
        ), mock.patch("requests.get") as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=1024)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        get.assert_not_called()

    async def test_without_a_mirror_the_primary_error_surfaces_unchanged(self):
        manager = make_manager(mirror=None)

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get") as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertNotIn("mirror", (job.error or "").lower())
        get.assert_not_called()


class MirrorIntegrityTests(unittest.IsolatedAsyncioTestCase):
    async def test_sha256_mismatch_deletes_partial_and_errors(self):
        models_dir = tempfile.mkdtemp()
        mirror = _mirror(files=[
            {"name": "model_index.json", "sha256": "0" * 64, "bytes": len(_INDEX_BYTES)},
        ])
        manager = make_manager(models_dir=models_dir, mirror=mirror)
        payloads = {f"{BASE_URL}/model_index.json": _INDEX_BYTES}

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get", side_effect=_mirror_get(payloads)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("mirror", (job.error or "").lower())
        target_dir = os.path.join(models_dir, "checkpoints")
        if os.path.isdir(target_dir):
            for root, _dirs, names in os.walk(target_dir):
                for name in names:
                    self.assertFalse(name.endswith(".incomplete"))
                    self.assertNotEqual(name, "model_index.json")

    async def test_mirror_file_without_sha256_is_refused_before_any_request(self):
        mirror = _mirror(files=[
            {"name": "model_index.json", "sha256": "", "bytes": len(_INDEX_BYTES)},
        ])
        manager = make_manager(mirror=mirror)

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get") as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        self.assertEqual(manager._jobs[MODEL_ID].status, "error")
        get.assert_not_called()

    async def test_unsafe_mirror_names_are_refused_before_any_request(self):
        for name in ("../evil.bin", "/etc/passwd", "C:/evil.bin", "a\\b.bin"):
            mirror = _mirror(files=[{"name": name, "sha256": "a" * 64, "bytes": 10}])
            manager = make_manager(mirror=mirror)

            with _hub_failure(ConnectionError("hub unreachable")), \
                 mock.patch("requests.get") as get, \
                 mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
                manager.enqueue(MODEL_ID)
                await _drain(manager)

            self.assertEqual(manager._jobs[MODEL_ID].status, "error", name)
            get.assert_not_called()

    async def test_non_https_mirror_is_refused_before_any_request(self):
        manager = make_manager(mirror=_mirror(base_url="http://models.vision-studio-x.com/sd-1-5"))

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get") as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        self.assertEqual(manager._jobs[MODEL_ID].status, "error")
        get.assert_not_called()

    async def test_mirror_http_error_reports_both_failures(self):
        manager = make_manager(mirror=_mirror(files=[
            {
                "name": "model_index.json",
                "sha256": hashlib.sha256(_INDEX_BYTES).hexdigest(),
                "bytes": len(_INDEX_BYTES),
            },
        ]))

        def failing_get(url, **kwargs):
            return _FakeResponse(b"", status_code=500)

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get", side_effect=failing_get), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("mirror", (job.error or "").lower())
        self.assertIn("500", job.error or "")


class MirrorLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_pause_during_mirror_stream_keeps_partials(self):
        models_dir = tempfile.mkdtemp()
        chunk = dm_module._CIVITAI_CHUNK_BYTES
        payload = b"x" * (chunk * 2 + 16)
        mirror = _mirror(files=[
            {
                "name": "model_index.json",
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
            },
        ])
        manager = make_manager(models_dir=models_dir, mirror=mirror)

        class _PausingResponse(_FakeResponse):
            def iter_content(self, chunk_size: int):
                for index, start in enumerate(range(0, len(self._payload), chunk_size)):
                    if index == 1:
                        manager.pause(MODEL_ID)  # cancel event trips at next sink.add
                    yield self._payload[start:start + chunk_size]

        with _hub_failure(ConnectionError("hub unreachable")), mock.patch("requests.get", return_value=_PausingResponse(payload)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "paused")
        target_dir = os.path.join(models_dir, "checkpoints")
        self.assertTrue(
            any(
                name.endswith(".incomplete")
                for _root, _dirs, names in os.walk(target_dir)
                for name in names
            ),
            "pause must retain the .incomplete partial for resume",
        )
        self.assertFalse(os.path.exists(os.path.join(target_dir, "model_index.json")))


if __name__ == "__main__":
    unittest.main()
