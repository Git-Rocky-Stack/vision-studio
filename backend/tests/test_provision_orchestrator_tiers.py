"""K3 / B1 / D4: provisioning subsets + tiers, the off-loop reverify pass, and
the manifest pins the orchestrator binds onto its DownloadManager.

Stub-CI-safe: fake registry/manager/consent, tiny on-disk files only.
"""
import asyncio
import hashlib
import os
import pathlib
import shutil
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import provision_orchestrator as po  # noqa: E402
from foundry.schemas import ProvisionStatusSchema  # noqa: E402

GOOD = b"good-weights"


def _job(model_id, status="downloading", progress=0.0):
    return SimpleNamespace(model_id=model_id, status=status, progress=progress,
                           speed=0.0, error=None, gate_url=None)


def _pinned_entry(model_id, tier, data=GOOD, sha=None, manifest_only=False):
    entry = {
        "id": model_id, "name": model_id, "tier": tier, "license": "apache-2.0",
        "attribution": None, "artifact_type": "checkpoint", "gated": False,
        "approx_bytes": 999, "size_bytes": len(data),
        "source": {"kind": "hf", "repo_id": "o/r", "revision": "a" * 40, "snapshots": [{
            "repo_id": "o/r", "revision": "a" * 40, "subdir": "",
            "files": [{"path": "w.safetensors", "size": len(data),
                       "sha256": sha or hashlib.sha256(data).hexdigest()}],
        }]},
    }
    if manifest_only:
        entry["manifest_only"] = True
        entry["artifact_type"] = "text-embedder"
    return entry


class _Registry:
    def __init__(self, records):
        self._records = records

    def get_record(self, model_id):
        return self._records.get(model_id)


class _Manager:
    def __init__(self, models_dir, jobs=()):
        self.models_dir = models_dir
        self.calls = []
        self.registered = None
        self._jobs = list(jobs)
        self.enqueue_threads = []

    def register_manifest_pins(self, pins, extra_records=None):
        self.registered = (pins, extra_records)

    def target_dir_for(self, model_id):
        return os.path.join(self.models_dir, model_id)

    def list_jobs(self):
        return list(self._jobs)

    def enqueue(self, model_id, token=None):
        self.calls.append(("enqueue", model_id, token))
        self.enqueue_threads.append(threading.get_ident())
        return _job(model_id, "queued")

    def resume(self, model_id, token=None):
        self.calls.append(("resume", model_id, token))
        return _job(model_id, "queued")

    def pause(self, model_id):
        self.calls.append(("pause", model_id, None))

    def cancel(self, model_id):
        self.calls.append(("cancel", model_id, None))


class _Consent:
    def __init__(self):
        self.grants = []

    def grant(self, model_id, kind, action="grant"):
        self.grants.append((model_id, kind, action))


class OrchestratorTierTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="provision-tiers-")
        self.addCleanup(shutil.rmtree, self.dir, True)

    def _orch(self, entries, records):
        manager = _Manager(self.dir)
        orch = po.ProvisionOrchestrator(
            manifest={"schema": 1, "auto_set": entries}, registry=_Registry(records),
            download_manager=manager, consent_store=_Consent(), models_dir=self.dir,
        )
        return orch, manager

    def _write(self, model_id, data=GOOD):
        target = os.path.join(self.dir, model_id)
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "w.safetensors"), "wb") as handle:
            handle.write(data)

    def test_orchestrator_binds_pins_and_manifest_only_records_onto_the_manager(self):
        entries = [_pinned_entry("core-a", "core"), _pinned_entry("emb", "core", manifest_only=True)]
        _orch, manager = self._orch(entries, {})
        pins, extras = manager.registered
        self.assertEqual(set(pins), {"core-a", "emb"})
        self.assertEqual(set(extras), {"emb"})
        self.assertEqual(extras["emb"]["artifact_type"], "text-embedder")

    def test_subset_start_enqueues_only_the_named_ids(self):
        entries = [_pinned_entry("core-a", "core"), _pinned_entry("ext-b", "extended")]
        records = {"core-a": {"status": "not_found"}, "ext-b": {"status": "not_found"}}
        orch, manager = self._orch(entries, records)
        asyncio.run(orch.start(hf_token="hf_T", model_ids=["core-a"]))
        self.assertEqual(manager.calls, [("enqueue", "core-a", "hf_T")])

    def test_empty_subset_means_everything(self):
        entries = [_pinned_entry("core-a", "core"), _pinned_entry("ext-b", "extended")]
        records = {"core-a": {"status": "not_found"}, "ext-b": {"status": "not_found"}}
        orch, manager = self._orch(entries, records)
        asyncio.run(orch.start(model_ids=[]))
        self.assertEqual(sorted(c[1] for c in manager.calls), ["core-a", "ext-b"])

    def test_unknown_ids_are_refused_before_anything_is_queued(self):
        entries = [_pinned_entry("core-a", "core")]
        orch, manager = self._orch(entries, {"core-a": {"status": "not_found"}})
        with self.assertRaises(po.UnknownProvisionModelsError) as caught:
            asyncio.run(orch.start(model_ids=["core-a", "nope", "zz"]))
        self.assertEqual(caught.exception.unknown, ["nope", "zz"])
        self.assertEqual(manager.calls, [])

    def test_status_rows_and_tier_aggregates(self):
        entries = [_pinned_entry("core-a", "core", data=b"x" * 10),
                   _pinned_entry("ext-b", "extended", data=b"y" * 30)]
        records = {"core-a": {"status": "ready"}, "ext-b": {"status": "not_found"}}
        orch, _manager = self._orch(entries, records)
        status = orch.status()
        ProvisionStatusSchema(**status)  # the response_model accepts it
        rows = {row["id"]: row for row in status["models"]}
        self.assertEqual((rows["core-a"]["tier"], rows["core-a"]["size_bytes"]), ("core", 10))
        self.assertEqual((rows["ext-b"]["tier"], rows["ext-b"]["size_bytes"]), ("extended", 30))
        # Exact pinned sizes weight the aggregate, not the catalog estimate.
        self.assertEqual(status["total_bytes"], 40)
        self.assertTrue(status["tiers"]["core"]["complete"])
        self.assertFalse(status["tiers"]["extended"]["complete"])
        self.assertFalse(status["complete"])

    def test_manifest_only_presence_is_every_pinned_file_on_disk(self):
        entries = [_pinned_entry("emb", "core", manifest_only=True)]
        orch, _manager = self._orch(entries, {})
        self.assertEqual(orch.present_ids(), set())
        self._write("emb")
        self.assertEqual(orch.present_ids(), {"emb"})


class ReverifyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="provision-reverify-")
        self.addCleanup(shutil.rmtree, self.dir, True)

    def _write(self, model_id, data):
        target = os.path.join(self.dir, model_id)
        os.makedirs(target, exist_ok=True)
        path = os.path.join(target, "w.safetensors")
        with open(path, "wb") as handle:
            handle.write(data)
        return path

    async def test_reverify_hashes_off_the_loop_and_refetches_corrupt_hf_files(self):
        entries = [_pinned_entry("ok", "core"), _pinned_entry("bad", "core")]
        records = {"ok": {"status": "ready"}, "bad": {"status": "ready"}}
        manager = _Manager(self.dir)
        orch = po.ProvisionOrchestrator(
            manifest={"schema": 1, "auto_set": entries}, registry=_Registry(records),
            download_manager=manager, consent_store=_Consent(), models_dir=self.dir,
        )
        self._write("ok", GOOD)
        bad_path = self._write("bad", b"tampered!!!!")  # same size, wrong bytes

        loop_thread = threading.get_ident()
        hash_threads = []
        real = po.pinned_file_matches

        def recording(path, pinned):
            hash_threads.append(threading.get_ident())
            return real(path, pinned)

        po.pinned_file_matches = recording
        self.addCleanup(setattr, po, "pinned_file_matches", real)

        status = await orch.start(reverify=True)
        # start() returns at once; the hashing is a background job.
        self.assertEqual(status["reverify"]["state"], "running")
        await orch.wait_for_reverify()

        self.assertTrue(hash_threads)
        self.assertNotIn(loop_thread, hash_threads)  # never hashed on the event loop
        final = orch.status()["reverify"]
        self.assertEqual(final["state"], "done")
        self.assertEqual(final["corrupt"], ["bad"])
        self.assertEqual(final["checked_bytes"], final["total_bytes"])
        self.assertEqual(manager.calls, [("enqueue", "bad", None)])
        # The corrupt file is gone so the Hub client's local cache cannot
        # short-circuit the re-fetch, and the id no longer reads as present.
        self.assertFalse(os.path.exists(bad_path))
        self.assertNotIn("bad", orch.present_ids())

    async def test_a_second_reverify_while_running_does_not_start_another(self):
        entries = [_pinned_entry("ok", "core")]
        manager = _Manager(self.dir)
        orch = po.ProvisionOrchestrator(
            manifest={"schema": 1, "auto_set": entries},
            registry=_Registry({"ok": {"status": "ready"}}),
            download_manager=manager, consent_store=_Consent(), models_dir=self.dir,
        )
        self._write("ok", GOOD)
        await orch.start(reverify=True)
        first = orch._reverify_task
        await orch.start(reverify=True)
        self.assertIs(orch._reverify_task, first)
        await orch.wait_for_reverify()

    async def test_reverify_failure_is_surfaced_on_status(self):
        entries = [_pinned_entry("ok", "core")]
        orch = po.ProvisionOrchestrator(
            manifest={"schema": 1, "auto_set": entries},
            registry=_Registry({"ok": {"status": "ready"}}),
            download_manager=_Manager(self.dir), consent_store=_Consent(), models_dir=self.dir,
        )

        def boom(entries, progress):
            raise OSError("disk unplugged")

        orch._find_and_purge_corrupt = boom
        with self.assertLogs("foundry.provision_orchestrator", level="ERROR"):
            await orch.start(reverify=True)
            await orch.wait_for_reverify()
        state = orch.status()["reverify"]
        self.assertEqual(state["state"], "error")
        self.assertIn("disk unplugged", state["error"])


if __name__ == "__main__":
    unittest.main()
