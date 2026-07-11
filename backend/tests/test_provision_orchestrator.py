"""#34 installer PR2: first-run provisioning orchestrator.

Pure aggregate-progress math + per-model rows + auto-set detection + the
idempotent/resumable start over the DownloadManager, plus informed-auto-consent
for the curated pickle-format members and corrupt-refetch for direct-URL
entries. Fully stub-CI-safe: no torch, no network, small on-disk fakes only.
"""

import hashlib
import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from types import SimpleNamespace

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry import provision_orchestrator as po  # type: ignore[import-not-found]


def _job(model_id, status="downloading", progress=0.0, speed=0.0, error=None, gate_url=None):
    return SimpleNamespace(
        model_id=model_id, status=status, progress=progress,
        speed=speed, error=error, gate_url=gate_url,
    )


def _entry(model_id, approx_bytes=100, **kw):
    return {
        "id": model_id,
        "name": kw.get("name", model_id),
        "approx_bytes": approx_bytes,
        "license": kw.get("license"),
        "attribution": kw.get("attribution"),
        "artifact_type": kw.get("artifact_type", "checkpoint"),
        "gated": kw.get("gated", False),
        "source": kw.get("source", {"kind": "hf", "repo_id": "o/r", "revision": "main"}),
    }


class FakeRegistry:
    def __init__(self, records):
        self._records = records  # id -> dict (with 'status', 'format', ...)

    def get_record(self, model_id):
        return self._records.get(model_id)


class FakeManager:
    """Records enqueue/resume/pause/cancel and returns fake jobs."""

    def __init__(self, jobs=(), events=None):
        self._jobs = list(jobs)
        self.calls = []  # list of (verb, model_id, token)
        self._events = events

    def list_jobs(self):
        return list(self._jobs)

    def enqueue(self, model_id, token=None):
        self.calls.append(("enqueue", model_id, token))
        if self._events is not None:
            self._events.append(("enqueue", model_id))
        return _job(model_id, "queued")

    def resume(self, model_id, token=None):
        self.calls.append(("resume", model_id, token))
        return _job(model_id, "queued")

    def pause(self, model_id):
        self.calls.append(("pause", model_id, None))
        return _job(model_id, "paused")

    def cancel(self, model_id):
        self.calls.append(("cancel", model_id, None))
        return _job(model_id, "cancelled")


class FakeConsent:
    def __init__(self, events=None):
        self.grants = []  # list of (model_id, kind, action)
        self._events = events

    def grant(self, model_id, kind, action="grant"):
        self.grants.append((model_id, kind, action))
        if self._events is not None:
            self._events.append(("consent", model_id))

    def get(self, model_id):
        return {"pickle": False, "trust_remote_code": False}


# -- pure functions ---------------------------------------------------------

class AggregateMathTests(unittest.TestCase):
    def test_byte_weighted_overall_progress(self):
        entries = [_entry("a", 100), _entry("b", 300), _entry("c", 100)]
        jobs = {"b": _job("b", "downloading", progress=0.5)}
        present = {"a"}
        agg = po.aggregate(entries, jobs, present)
        # done = 100*1 + 300*0.5 + 100*0 = 250; total 500 -> 0.5
        self.assertAlmostEqual(agg["overall_progress"], 0.5)
        self.assertEqual(agg["total_bytes"], 500)
        self.assertEqual(agg["present_bytes"], 100)
        self.assertEqual(agg["remaining_bytes"], 250)
        self.assertFalse(agg["complete"])
        self.assertEqual(agg["total_count"], 3)
        self.assertEqual(agg["ready_count"], 1)
        self.assertEqual(agg["active_count"], 1)

    def test_all_present_is_complete(self):
        entries = [_entry("a", 100), _entry("b", 200)]
        agg = po.aggregate(entries, {}, {"a", "b"})
        self.assertAlmostEqual(agg["overall_progress"], 1.0)
        self.assertEqual(agg["remaining_bytes"], 0)
        self.assertTrue(agg["complete"])
        self.assertEqual(agg["ready_count"], 2)

    def test_empty_set_is_vacuously_complete(self):
        agg = po.aggregate([], {}, set())
        self.assertTrue(agg["complete"])
        self.assertAlmostEqual(agg["overall_progress"], 1.0)
        self.assertEqual(agg["total_bytes"], 0)

    def test_speed_and_eta_from_downloading_jobs(self):
        entries = [_entry("a", 100), _entry("b", 300)]
        # a done, b downloading half at 10 B/s -> remaining 150, eta 15
        jobs = {"b": _job("b", "downloading", progress=0.5, speed=10.0)}
        agg = po.aggregate(entries, jobs, {"a"})
        self.assertEqual(agg["remaining_bytes"], 150)
        self.assertAlmostEqual(agg["speed"], 10.0)
        self.assertAlmostEqual(agg["eta"], 15.0)

    def test_eta_none_when_stalled(self):
        entries = [_entry("a", 100)]
        jobs = {"a": _job("a", "queued", progress=0.0, speed=0.0)}
        agg = po.aggregate(entries, jobs, set())
        self.assertIsNone(agg["eta"])

    def test_error_job_counted(self):
        entries = [_entry("a", 100)]
        jobs = {"a": _job("a", "error", error="boom")}
        agg = po.aggregate(entries, jobs, set())
        self.assertEqual(agg["error_count"], 1)


class ModelRowsTests(unittest.TestCase):
    def test_status_mapping(self):
        entries = [_entry("a"), _entry("b"), _entry("c"), _entry("d")]
        jobs = {
            "b": _job("b", "downloading", progress=0.25),
            "d": _job("d", "error", error="gated", gate_url="https://hf.co/gate"),
        }
        rows = {r["id"]: r for r in po.model_rows(entries, jobs, {"a"})}
        self.assertEqual(rows["a"]["status"], "ready")
        self.assertAlmostEqual(rows["a"]["progress"], 1.0)
        self.assertEqual(rows["b"]["status"], "downloading")
        self.assertAlmostEqual(rows["b"]["progress"], 0.25)
        self.assertEqual(rows["c"]["status"], "missing")
        self.assertEqual(rows["d"]["status"], "error")
        self.assertEqual(rows["d"]["error"], "gated")
        self.assertEqual(rows["d"]["gate_url"], "https://hf.co/gate")

    def test_attribution_surfaced(self):
        entries = [_entry("a"), _entry("b", attribution="Powered by Stability AI")]
        self.assertEqual(po.set_attribution(entries), "Powered by Stability AI")
        self.assertIsNone(po.set_attribution([_entry("x")]))

    def test_rows_carry_format_and_gated(self):
        entries = [
            _entry("edit-gfpgan-v14", gated=False),
            _entry("sd3.5-large", gated=True),
            _entry("plain"),
        ]
        formats = {"edit-gfpgan-v14": "pickle", "sd3.5-large": "safetensors"}
        rows = {r["id"]: r for r in po.model_rows(entries, {}, set(), formats_by_id=formats)}
        self.assertEqual(rows["edit-gfpgan-v14"]["format"], "pickle")
        self.assertFalse(rows["edit-gfpgan-v14"]["gated"])
        self.assertTrue(rows["sd3.5-large"]["gated"])
        self.assertIsNone(rows["plain"]["format"])  # unknown format -> None

    def test_rows_default_format_none_without_map(self):
        rows = po.model_rows([_entry("a")], {}, set())
        self.assertIsNone(rows[0]["format"])
        self.assertFalse(rows[0]["gated"])


# -- orchestration ----------------------------------------------------------

class OrchestratorTests(unittest.TestCase):
    def _orch(self, entries, records, jobs=(), events=None):
        manifest = {"schema": 1, "auto_set": entries}
        manager = FakeManager(jobs=jobs, events=events)
        consent = FakeConsent(events=events)
        registry = FakeRegistry(records)
        orch = po.ProvisionOrchestrator(
            manifest=manifest, registry=registry, download_manager=manager,
            consent_store=consent, models_dir="/nonexistent",
        )
        return orch, manager, consent, registry

    def test_present_ids_from_registry_ready(self):
        entries = [_entry("a"), _entry("b"), _entry("c")]
        records = {
            "a": {"id": "a", "status": "ready"},
            "b": {"id": "b", "status": "not_found"},
            "c": {"id": "c", "status": "ready"},
        }
        orch, *_ = self._orch(entries, records)
        self.assertEqual(orch.present_ids(), {"a", "c"})

    def test_start_enqueues_missing_skips_present(self):
        entries = [_entry("a"), _entry("b"), _entry("c")]
        records = {
            "a": {"id": "a", "status": "ready"},
            "b": {"id": "b", "status": "not_found"},
            "c": {"id": "c", "status": "not_found"},
        }
        orch, manager, *_ = self._orch(entries, records)
        orch.start()
        enqueued = [mid for (verb, mid, _t) in manager.calls if verb == "enqueue"]
        self.assertEqual(sorted(enqueued), ["b", "c"])
        self.assertNotIn("a", enqueued)

    def test_start_grants_pickle_consent_before_enqueue(self):
        events = []
        entries = [_entry("edit-gfpgan-v14", artifact_type="edit-model")]
        records = {"edit-gfpgan-v14": {
            "id": "edit-gfpgan-v14", "status": "not_found",
            "format": "pickle", "artifact_type": "edit-model",
        }}
        orch, manager, consent, _ = self._orch(entries, records, events=events)
        orch.start()
        self.assertIn(("edit-gfpgan-v14", "pickle", "auto-provision"), consent.grants)
        # consent must be recorded BEFORE the enqueue for that id
        self.assertEqual(events, [("consent", "edit-gfpgan-v14"), ("enqueue", "edit-gfpgan-v14")])

    def test_start_no_consent_for_non_pickle(self):
        entries = [_entry("sd-1-5")]
        records = {"sd-1-5": {"id": "sd-1-5", "status": "not_found", "format": "safetensors"}}
        orch, manager, consent, _ = self._orch(entries, records)
        orch.start()
        self.assertEqual(consent.grants, [])

    def test_start_resumes_paused_or_errored_job(self):
        entries = [_entry("a"), _entry("b")]
        records = {
            "a": {"id": "a", "status": "not_found"},
            "b": {"id": "b", "status": "not_found"},
        }
        jobs = [_job("a", "paused"), _job("b", "error", error="x")]
        orch, manager, *_ = self._orch(entries, records, jobs=jobs)
        orch.start()
        verbs = {mid: verb for (verb, mid, _t) in manager.calls}
        self.assertEqual(verbs["a"], "resume")
        self.assertEqual(verbs["b"], "resume")

    def test_start_forwards_hf_token(self):
        entries = [_entry("a")]
        records = {"a": {"id": "a", "status": "not_found"}}
        orch, manager, *_ = self._orch(entries, records)
        orch.start(hf_token="hf_SECRET")
        self.assertEqual(manager.calls, [("enqueue", "a", "hf_SECRET")])

    def test_pause_and_cancel_fan_out(self):
        entries = [_entry("a"), _entry("b"), _entry("c")]
        records = {mid: {"id": mid, "status": "not_found"} for mid in ("a", "b", "c")}
        jobs = [_job("a", "downloading"), _job("b", "queued"), _job("c", "ready")]
        orch, manager, *_ = self._orch(entries, records, jobs=jobs)
        orch.pause()
        paused = sorted(mid for (verb, mid, _t) in manager.calls if verb == "pause")
        self.assertEqual(paused, ["a", "b"])  # not the ready one

    def test_status_rows_carry_registry_format(self):
        entries = [_entry("edit-gfpgan-v14")]
        records = {"edit-gfpgan-v14": {
            "id": "edit-gfpgan-v14", "status": "not_found", "format": "pickle"}}
        orch, *_ = self._orch(entries, records)
        row = orch.status()["models"][0]
        self.assertEqual(row["format"], "pickle")

    def test_status_payload_shape(self):
        entries = [_entry("a", 100, attribution="Powered by Stability AI"), _entry("b", 300)]
        records = {"a": {"id": "a", "status": "ready"}, "b": {"id": "b", "status": "not_found"}}
        jobs = [_job("b", "downloading", progress=0.5, speed=5.0)]
        orch, *_ = self._orch(entries, records, jobs=jobs)
        status = orch.status()
        self.assertEqual(status["schema_version"], 1)
        self.assertEqual(status["attribution"], "Powered by Stability AI")
        self.assertEqual(len(status["models"]), 2)
        self.assertEqual(status["total_count"], 2)
        self.assertEqual(status["ready_count"], 1)


class CorruptRefetchTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="provision-verify-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _seed(self, model_id, data: bytes):
        target = os.path.join(self.dir, "edit-model", model_id)
        os.makedirs(target, exist_ok=True)
        # pickle-format direct-URL edit weights land as <id>.ckpt (mirrors
        # download_manager._direct_filename / edit_tools.expected_weights_filename).
        with open(os.path.join(target, f"{model_id}.ckpt"), "wb") as fh:
            fh.write(data)

    def _orch(self, entry, record):
        manifest = {"schema": 1, "auto_set": [entry]}
        manager = FakeManager()
        orch = po.ProvisionOrchestrator(
            manifest=manifest, registry=FakeRegistry({entry["id"]: record}),
            download_manager=manager, consent_store=FakeConsent(), models_dir=self.dir,
        )
        return orch, manager

    def test_reverify_refetches_corrupt_direct_url(self):
        good = hashlib.sha256(b"correct-bytes").hexdigest()
        entry = _entry("edit-gfpgan-v14", artifact_type="edit-model",
                       source={"kind": "url", "url": "https://github.com/x/y", "sha256": good})
        record = {"id": "edit-gfpgan-v14", "status": "ready",
                  "format": "pickle", "artifact_type": "edit-model"}
        self._seed("edit-gfpgan-v14", b"WRONG-bytes")  # present but corrupt
        orch, manager = self._orch(entry, record)
        orch.start(reverify=True)
        enqueued = [mid for (verb, mid, _t) in manager.calls if verb == "enqueue"]
        self.assertEqual(enqueued, ["edit-gfpgan-v14"])

    def test_reverify_skips_valid_direct_url(self):
        good = hashlib.sha256(b"correct-bytes").hexdigest()
        entry = _entry("edit-gfpgan-v14", artifact_type="edit-model",
                       source={"kind": "url", "url": "https://github.com/x/y", "sha256": good})
        record = {"id": "edit-gfpgan-v14", "status": "ready",
                  "format": "pickle", "artifact_type": "edit-model"}
        self._seed("edit-gfpgan-v14", b"correct-bytes")  # present and valid
        orch, manager = self._orch(entry, record)
        orch.start(reverify=True)
        self.assertEqual(manager.calls, [])  # nothing re-enqueued


if __name__ == "__main__":
    unittest.main()
