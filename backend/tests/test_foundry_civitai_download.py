"""CivitAI direct-URL download: stream -> .incomplete -> sha256 verify -> atomic move.

Never trusts the URL: https + civitai.com host required. A hash mismatch
deletes the partial and surfaces a typed error - corrupt bytes never present
as ready (spec 3.5 discipline, CivitAI hashes from Spike C). The token is
only ever a Bearer header on the one request - never on the job, the manager,
or in error text.
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

from foundry.download_manager import (  # type: ignore[import-not-found]
    DownloadManager,
    validate_civitai_url,
)
from foundry.model_record import ModelRecord  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")

MODEL_ID = "search-civitai--7-9"
DOWNLOAD_URL = "https://civitai.com/api/download/models/99"


def make_manager(models_dir=None):
    models_dir = models_dir or tempfile.mkdtemp()
    model_manager = ModelManager(models_dir)
    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    return DownloadManager(
        registry=registry,
        model_manager=model_manager,
        models_dir=models_dir,
        concurrency=2,
        mode="fast",
    )


def civitai_record(**overrides) -> ModelRecord:
    fields = dict(
        id=MODEL_ID,
        name="Pixel Lora",
        artifact_type="lora",
        capability="image",
        base_architecture="sdxl",
        source="civitai",
        repo_id=None,
        status="not_found",
        tier="compatible",
        format="safetensors",
        download_url=DOWNLOAD_URL,
        sha256=None,
    )
    fields.update(overrides)
    return ModelRecord(**fields)


def make_civitai_manager(models_dir=None, **record_overrides):
    """Manager whose registry carries one transient civitai record."""
    manager = make_manager(models_dir=models_dir)
    manager._registry.register_transient([civitai_record(**record_overrides)])
    return manager


class _FakeResponse:
    """Just enough of requests.Response for the streaming download path."""

    def __init__(self, payload: bytes, status_code: int = 200, content_length: bool = True):
        self._payload = payload
        self.status_code = status_code
        self.headers = {"Content-Length": str(len(payload))} if content_length else {}
        self.closed = False

    def iter_content(self, chunk_size: int):
        for start in range(0, len(self._payload), chunk_size):
            yield self._payload[start:start + chunk_size]

    def close(self):
        self.closed = True


async def _drain(manager: DownloadManager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def _disk(free: int):
    return type("Usage", (), {"total": free * 2, "used": free, "free": free})()


class UrlValidationTests(unittest.TestCase):
    def test_https_civitai_ok(self):
        validate_civitai_url("https://civitai.com/api/download/models/99")

    def test_http_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("http://civitai.com/api/download/models/99")

    def test_other_host_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("https://evil.example.com/file.safetensors")

    def test_userinfo_spoof_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("https://civitai.com@evil.example.com/x")

    def test_subdomain_rejected(self):
        with self.assertRaises(ValueError):
            validate_civitai_url("https://civitai.com.evil.example.com/x")


class CivitaiDownloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_happy_path_verifies_sha256_and_moves_atomically(self):
        payload = b"weights-bytes" * 1000
        digest = hashlib.sha256(payload).hexdigest()
        models_dir = tempfile.mkdtemp()
        manager = make_civitai_manager(models_dir=models_dir, sha256=digest)

        with mock.patch("requests.get", return_value=_FakeResponse(payload)) as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "ready")
        self.assertIsNone(job.error)
        self.assertAlmostEqual(job.progress, 1.0)
        self.assertEqual(job.total_bytes, len(payload))

        target_dir = os.path.join(models_dir, "loras")
        final = os.path.join(target_dir, f"{MODEL_ID}.safetensors")
        with open(final, "rb") as handle:
            self.assertEqual(handle.read(), payload)
        self.assertFalse(
            any(name.endswith(".incomplete") for name in os.listdir(target_dir))
        )
        # huggingface_hub was never involved in the civitai path.
        get.assert_called_once()
        _args, kwargs = get.call_args
        self.assertTrue(kwargs.get("stream"))

    async def test_uppercase_record_sha256_still_verifies(self):
        payload = b"case-insensitive"
        digest = hashlib.sha256(payload).hexdigest().upper()
        models_dir = tempfile.mkdtemp()
        manager = make_civitai_manager(models_dir=models_dir, sha256=digest)

        with mock.patch("requests.get", return_value=_FakeResponse(payload)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        self.assertEqual(manager._jobs[MODEL_ID].status, "ready")
        final = os.path.join(models_dir, "loras", f"{MODEL_ID}.safetensors")
        self.assertTrue(os.path.exists(final), "final file must exist after ready")

    async def test_consented_pickle_record_lands_with_pickle_extension(self):
        # Pickle records ARE downloadable once consent is granted (live path);
        # the on-disk extension must track the format or the indexer's header
        # parse and the convert flow silently break on a misnamed file.
        payload = b"pickle-bytes"
        digest = hashlib.sha256(payload).hexdigest()
        models_dir = tempfile.mkdtemp()
        manager = make_civitai_manager(
            models_dir=models_dir, sha256=digest, format="pickle"
        )

        with mock.patch("requests.get", return_value=_FakeResponse(payload)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        self.assertEqual(manager._jobs[MODEL_ID].status, "ready")
        target_dir = os.path.join(models_dir, "loras")
        self.assertTrue(os.path.exists(os.path.join(target_dir, f"{MODEL_ID}.ckpt")))
        self.assertFalse(
            os.path.exists(os.path.join(target_dir, f"{MODEL_ID}.safetensors"))
        )

    async def test_sha256_mismatch_deletes_partial_and_errors(self):
        payload = b"tampered-bytes"
        models_dir = tempfile.mkdtemp()
        manager = make_civitai_manager(models_dir=models_dir, sha256="0" * 64)

        with mock.patch("requests.get", return_value=_FakeResponse(payload)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("sha256", job.error)
        target_dir = os.path.join(models_dir, "loras")
        names = os.listdir(target_dir) if os.path.isdir(target_dir) else []
        self.assertFalse(any(name.endswith(".safetensors") for name in names))
        self.assertFalse(any(name.endswith(".incomplete") for name in names))

    async def test_missing_download_url_is_typed_error(self):
        manager = make_civitai_manager(download_url=None)
        get = mock.MagicMock()

        with mock.patch("requests.get", get):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("download_url", job.error)
        get.assert_not_called()

    async def test_non_civitai_download_url_is_refused_before_any_request(self):
        manager = make_civitai_manager(
            download_url="https://evil.example.com/file.safetensors"
        )
        get = mock.MagicMock()

        with mock.patch("requests.get", get):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("civitai", job.error)
        get.assert_not_called()

    async def test_token_sent_as_bearer_header_only(self):
        payload = b"weights"
        digest = hashlib.sha256(payload).hexdigest()
        manager = make_civitai_manager(sha256=digest)

        with mock.patch("requests.get", return_value=_FakeResponse(payload)) as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID, token="civ_TOPSECRET")
            await _drain(manager)

        _args, kwargs = get.call_args
        self.assertEqual(
            kwargs.get("headers"), {"Authorization": "Bearer civ_TOPSECRET"}
        )
        # The secret is on no job, no manager attribute, and in no error text.
        self.assertFalse(any("civ_TOPSECRET" in repr(v) for v in manager._jobs.values()))
        self.assertFalse(any("civ_TOPSECRET" in repr(v) for v in vars(manager).values()))

    async def test_no_token_sends_no_authorization_header(self):
        payload = b"weights"
        manager = make_civitai_manager(sha256=hashlib.sha256(payload).hexdigest())

        with mock.patch("requests.get", return_value=_FakeResponse(payload)) as get, \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        _args, kwargs = get.call_args
        self.assertFalse(kwargs.get("headers"))

    async def test_http_error_is_typed_without_hf_gate_url(self):
        manager = make_civitai_manager(sha256="0" * 64)

        with mock.patch("requests.get", return_value=_FakeResponse(b"", status_code=403)), \
             mock.patch("shutil.disk_usage", return_value=_disk(free=10 ** 12)):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("403", job.error)
        # A civitai 403 must never surface a huggingface.co gate URL.
        self.assertIsNone(job.gate_url)

    async def test_hashless_record_refused_before_any_request(self):
        # Delivery is a CDN redirect; the record sha256 is the only integrity
        # anchor. No hash -> fail closed, zero bytes fetched.
        manager = make_civitai_manager(sha256=None)
        get = mock.MagicMock()

        with mock.patch("requests.get", get):
            manager.enqueue(MODEL_ID)
            await _drain(manager)

        job = manager._jobs[MODEL_ID]
        self.assertEqual(job.status, "error")
        self.assertIn("sha256", job.error)
        self.assertIn("unverifiable", job.error)
        get.assert_not_called()


class CivitaiDownloadRouteTests(unittest.TestCase):
    """The download route forwards X-Civitai-Token for civitai-source records."""

    def _client_and_main(self):
        from fastapi.testclient import TestClient  # type: ignore[import-not-found]
        import main  # type: ignore[import-not-found]

        return TestClient(main.app), main

    def test_x_civitai_token_forwarded_for_civitai_records(self):
        client, main = self._client_and_main()
        main.model_registry.register_transient([civitai_record()])
        self.addCleanup(main.model_registry.register_transient, [])
        from foundry.download_manager import DownloadJob  # type: ignore[import-not-found]

        job = DownloadJob(model_id=MODEL_ID, status="queued")
        with mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post(
                f"/api/models/{MODEL_ID}/download",
                headers={"X-Civitai-Token": "civ_SECRET", "X-HF-Token": "hf_WRONG"},
            )
        self.assertEqual(response.status_code, 202)
        _args, kwargs = enq.call_args
        self.assertEqual(kwargs.get("token"), "civ_SECRET")

    def test_x_hf_token_still_forwarded_for_hf_records(self):
        client, main = self._client_and_main()
        from foundry.download_manager import DownloadJob  # type: ignore[import-not-found]

        job = DownloadJob(model_id="flux-dev", status="queued")
        with mock.patch.object(main.download_manager, "enqueue", return_value=job) as enq:
            response = client.post(
                "/api/models/flux-dev/download",
                headers={"X-HF-Token": "hf_SECRET", "X-Civitai-Token": "civ_WRONG"},
            )
        self.assertEqual(response.status_code, 202)
        _args, kwargs = enq.call_args
        self.assertEqual(kwargs.get("token"), "hf_SECRET")


if __name__ == "__main__":
    unittest.main()
