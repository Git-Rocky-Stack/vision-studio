"""D4 / B2 / U3: pinned + hash-verified HF downloads, off-loop Hub metadata
with the caller's token, and the up-front remote-code refusal.

Stub-CI-safe: huggingface_hub is patched; every "download" writes a few bytes.
"""
import asyncio
import hashlib
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

import foundry.download_manager as dm_module  # noqa: E402
from foundry.download_errors import RemoteCodeUnsupportedError  # noqa: E402
from foundry.download_manager import (  # noqa: E402
    DownloadManager,
    file_digest,
    pinned_file_matches,
    pinned_relative_paths,
)

GOOD = b"pinned-weight-bytes"
CONFIG = b'{"a": 1}'


def _git_oid(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()  # noqa: S324


class _Registry:
    def __init__(self, records):
        self._records = records

    def get_record(self, model_id):
        return self._records.get(model_id)


def _manager(records, models_dir=None):
    return DownloadManager(
        registry=_Registry(records), model_manager=None,
        models_dir=models_dir or tempfile.mkdtemp(prefix="dm-pinned-"),
    )


def _disk(free):
    return type("Usage", (), {"total": free * 2, "used": free, "free": free})()


async def _drain(manager):
    tasks = list(manager._tasks.values())
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def _snapshots(weight_sha=None):
    return [
        {"repo_id": "o/adapter", "revision": "a" * 40, "subdir": "adapter", "files": [
            {"path": "w.safetensors", "size": len(GOOD),
             "sha256": weight_sha or hashlib.sha256(GOOD).hexdigest()},
        ]},
        {"repo_id": "o/base", "revision": "b" * 40, "subdir": "base", "files": [
            {"path": "unet/config.json", "size": len(CONFIG), "git_oid": _git_oid(CONFIG)},
        ]},
    ]


def _fake_hf_download(served):
    calls = []

    def fake(*, repo_id, filename, local_dir, token, tqdm_class, revision):
        calls.append((repo_id, filename, revision, token))
        data = served[(repo_id, filename)]
        bar = tqdm_class(total=len(data))
        bar.update(len(data))
        bar.close()
        dest = os.path.join(local_dir, *filename.split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as handle:
            handle.write(data)
        return dest

    return fake, calls


class DigestHelperTests(unittest.TestCase):
    def test_git_oid_matches_git_blob_addressing(self):
        path = os.path.join(tempfile.mkdtemp(), "f")
        with open(path, "wb") as handle:
            handle.write(CONFIG)
        self.assertEqual(file_digest(path, "git_oid"), _git_oid(CONFIG))
        self.assertEqual(file_digest(path, "sha256"), hashlib.sha256(CONFIG).hexdigest())
        self.assertIsNone(file_digest(path + ".missing", "sha256"))

    def test_pin_without_a_hash_never_matches(self):
        path = os.path.join(tempfile.mkdtemp(), "f")
        with open(path, "wb") as handle:
            handle.write(CONFIG)
        self.assertFalse(pinned_file_matches(path, {"path": "f", "size": len(CONFIG)}))
        self.assertFalse(pinned_file_matches(path, {"path": "f", "size": 999, "sha256": "0" * 64}))

    def test_relative_paths_carry_the_subdir(self):
        self.assertEqual(
            pinned_relative_paths(_snapshots()),
            ["adapter/w.safetensors", "base/unet/config.json"],
        )


class PinnedDownloadTests(unittest.IsolatedAsyncioTestCase):
    RECORD = {"id": "animatediff", "artifact_type": "motion-adapter",
              "repo_id": "o/unpinned-catalog-repo", "revision": "main"}

    async def test_pinned_files_fetch_at_the_pinned_commit_and_verify(self):
        manager = _manager({"animatediff": dict(self.RECORD)})
        manager.register_manifest_pins({"animatediff": _snapshots()})
        fake, calls = _fake_hf_download({
            ("o/adapter", "w.safetensors"): GOOD, ("o/base", "unet/config.json"): CONFIG})
        with mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info") as paths_info, \
             mock.patch.object(dm_module.huggingface_hub, "list_repo_files") as list_files, \
             mock.patch("shutil.disk_usage", return_value=_disk(10 ** 12)):
            manager.enqueue("animatediff", token="hf_T")
            await _drain(manager)

        job = manager._jobs["animatediff"]
        self.assertEqual(job.status, "ready", job.error)
        self.assertEqual(job.total_bytes, len(GOOD) + len(CONFIG))
        # Exactly the pinned files, at the pinned commits - never "main", never
        # the catalog repo - and no Hub metadata call at all.
        self.assertEqual(calls, [
            ("o/adapter", "w.safetensors", "a" * 40, "hf_T"),
            ("o/base", "unet/config.json", "b" * 40, "hf_T"),
        ])
        paths_info.assert_not_called()
        list_files.assert_not_called()
        target = manager.target_dir_for("animatediff")
        self.assertTrue(os.path.isfile(os.path.join(target, "adapter", "w.safetensors")))
        self.assertTrue(os.path.isfile(os.path.join(target, "base", "unet", "config.json")))

    async def test_hash_mismatch_fails_the_job_and_deletes_the_file(self):
        manager = _manager({"animatediff": dict(self.RECORD)})
        manager.register_manifest_pins({"animatediff": _snapshots(weight_sha="0" * 64)})
        fake, _calls = _fake_hf_download({
            ("o/adapter", "w.safetensors"): GOOD, ("o/base", "unet/config.json"): CONFIG})
        with mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake), \
             mock.patch("shutil.disk_usage", return_value=_disk(10 ** 12)):
            with self.assertLogs("foundry.download_manager", level="WARNING"):
                manager.enqueue("animatediff")
                await _drain(manager)

        job = manager._jobs["animatediff"]
        self.assertEqual(job.status, "error")
        self.assertIn("integrity", job.error)
        target = manager.target_dir_for("animatediff")
        self.assertFalse(os.path.exists(os.path.join(target, "adapter", "w.safetensors")))

    async def test_manifest_only_record_downloads_through_the_queue(self):
        manager = _manager({})
        record = {"id": "embedder-x", "artifact_type": "text-embedder",
                  "repo_id": "o/adapter", "source": "huggingface"}
        snapshots = [dict(_snapshots()[0], subdir="")]
        manager.register_manifest_pins({"embedder-x": snapshots}, {"embedder-x": record})
        fake, _calls = _fake_hf_download({("o/adapter", "w.safetensors"): GOOD})
        with mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake), \
             mock.patch("shutil.disk_usage", return_value=_disk(10 ** 12)):
            manager.enqueue("embedder-x")
            await _drain(manager)
        self.assertEqual(manager._jobs["embedder-x"].status, "ready")
        target = manager.target_dir_for("embedder-x")
        self.assertEqual(
            pathlib.Path(target).relative_to(manager._models_dir).as_posix(),
            "text-embedder/embedder-x",
        )


class UnpinnedResolveTests(unittest.IsolatedAsyncioTestCase):
    async def test_hub_metadata_runs_off_the_loop_with_the_token(self):
        """B2: list_repo_files / get_paths_info are blocking HTTP - they run in
        a worker thread and carry the caller's token (gated repos 401 without)."""
        manager = _manager({"user-repo": {
            "id": "user-repo", "artifact_type": "diffusers-pipeline",
            "repo_id": "u/repo", "revision": "c" * 40}})
        loop_thread = threading.get_ident()
        seen = {}

        def fake_list(repo_id, revision=None, token=None):
            seen["list"] = (threading.get_ident() != loop_thread, token)
            return ["model_index.json"]

        def fake_info(repo_id, paths, revision=None, token=None):
            seen["info"] = (threading.get_ident() != loop_thread, token)
            return [type("F", (), {"path": p, "size": 1})() for p in paths]

        fake, _calls = _fake_hf_download({("u/repo", "model_index.json"): b"x"})
        with mock.patch.object(dm_module.huggingface_hub, "list_repo_files", side_effect=fake_list), \
             mock.patch.object(dm_module.huggingface_hub, "get_paths_info", side_effect=fake_info), \
             mock.patch.object(dm_module.huggingface_hub, "hf_hub_download", side_effect=fake), \
             mock.patch("shutil.disk_usage", return_value=_disk(10 ** 12)):
            manager.enqueue("user-repo", token="hf_GATED")
            await _drain(manager)

        self.assertEqual(manager._jobs["user-repo"].status, "ready")
        self.assertEqual(seen["list"], (True, "hf_GATED"))
        self.assertEqual(seen["info"], (True, "hf_GATED"))


class RemoteCodeRefusalTests(unittest.IsolatedAsyncioTestCase):
    async def test_trust_remote_code_record_is_refused_before_queueing(self):
        """U3: no loader runs repo code, so the download is refused up front."""
        manager = _manager({"rc": {"id": "rc", "artifact_type": "diffusers-pipeline",
                                   "repo_id": "o/rc", "trust_remote_code": True}})
        with self.assertRaises(RemoteCodeUnsupportedError) as caught:
            manager.enqueue("rc", token="hf_T")
        self.assertEqual(caught.exception.error_code, "remote-code-unsupported")
        self.assertNotIn("hf_T", str(caught.exception))
        self.assertEqual(manager.list_jobs(), [])
        self.assertEqual(manager._tasks, {})


if __name__ == "__main__":
    unittest.main()
