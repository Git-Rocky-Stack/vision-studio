"""#34 installer PR2: first-run auto-provisioning over the DownloadManager.

The comprehensive auto-set (``provision-manifest.json``, PR1) is provisioned on
first launch by driving each missing model *by id* through the existing
consent-gated ``DownloadManager`` - the same path the manual "Download" button
uses. This module owns only the orchestration policy:

* detection - which auto-set ids are already present on disk (registry-``ready``);
* the byte-weighted aggregate + per-model progress the renderer streams;
* an idempotent, resumable ``start`` over the queue (present skipped, paused /
  errored resumed, missing enqueued).

Fetch, filename resolution, and integrity stay in the ``DownloadManager`` (per
``provisioning.py``'s contract) - the manifest is used only for the id list,
the byte budget, license/attribution, and the direct-URL literal-``sha256``
corrupt-refetch check.

Pure data + orchestration - imports cleanly on stub CI (no torch, no network).
Integrity re-verification hashes files only inside ``start(reverify=True)`` and
only for direct-URL entries carrying a literal ``sha256`` - never on the polled
``status()`` path.

Pickle-format auto-set members (the curated, first-party edit-tool + annotator
weights) are granted pickle consent here with recorded provenance
(``action="auto-provision"``) BEFORE they enqueue - the deny-by-default gate
stays intact for anything the user adds themselves (spec 5.3; decision
2026-07-07 "informed auto-consent").
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

SCHEMA = 1

# DownloadManager states an id should be *resumed* into rather than freshly
# enqueued. (enqueue is idempotent for the active states; these are the ones
# where a fresh task must be started from the retained partials / cleared job.)
_RESUMABLE_STATES = {"paused", "error", "cancelled"}
_ACTIVE_STATES = {"queued", "downloading", "paused", "verifying"}
_PAUSABLE_STATES = {"queued", "downloading"}
_CANCELABLE_STATES = {"queued", "downloading", "paused"}

# Direct-URL single-file layout, mirroring download_manager._direct_filename /
# edit_tools.expected_weights_filename so re-verification can never disagree
# with acquisition on the on-disk name.
_FORMAT_EXTENSIONS = {"pickle": ".ckpt", "onnx": ".onnx"}
_HASH_CHUNK_BYTES = 1024 * 1024


# -- pure helpers -----------------------------------------------------------

def auto_set(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The manifest's ``auto_set`` entries (bundled / provisioned models)."""
    return list(manifest.get("auto_set") or [])


def set_attribution(entries: List[Dict[str, Any]]) -> Optional[str]:
    """The single attribution mark required by the set (e.g. Stability AI),
    or None. Every SAI-Community member carries the same string."""
    for entry in entries:
        attribution = entry.get("attribution")
        if attribution:
            return attribution
    return None


def _status_for(entry: Dict[str, Any], job: Any, present_ids: Set[str]) -> str:
    """Live per-model status: ``ready`` if present, else the job status, else
    ``missing``."""
    if entry["id"] in present_ids:
        return "ready"
    if job is None:
        return "missing"
    return getattr(job, "status", "missing")


def _fraction_done(entry: Dict[str, Any], job: Any, present_ids: Set[str]) -> float:
    """0..1 completion for one model, weighting the aggregate."""
    if entry["id"] in present_ids:
        return 1.0
    if job is None:
        return 0.0
    if getattr(job, "status", None) == "ready":
        return 1.0
    return float(getattr(job, "progress", 0.0) or 0.0)


def aggregate(
    entries: List[Dict[str, Any]],
    jobs_by_id: Dict[str, Any],
    present_ids: Set[str],
) -> Dict[str, Any]:
    """Byte-weighted aggregate progress across the auto-set.

    Weights are the manifest's static ``approx_bytes`` so the math is
    deterministic and unit-testable without live HF sizes. An entry contributes
    fully when it is present on disk (or its job is ready); otherwise its
    ``job.progress`` fraction. ``eta`` is remaining bytes over the summed speed
    of the actively-downloading jobs, or None when nothing is moving.
    """
    total_bytes = sum(int(e.get("approx_bytes") or 0) for e in entries)
    present_bytes = sum(
        int(e.get("approx_bytes") or 0) for e in entries if e["id"] in present_ids
    )
    done_bytes = 0.0
    speed = 0.0
    ready_count = active_count = error_count = 0
    for entry in entries:
        job = jobs_by_id.get(entry["id"])
        weight = int(entry.get("approx_bytes") or 0)
        done_bytes += weight * _fraction_done(entry, job, present_ids)
        status = _status_for(entry, job, present_ids)
        if status == "ready":
            ready_count += 1
        elif status in _ACTIVE_STATES:
            active_count += 1
            if status == "downloading":
                speed += float(getattr(job, "speed", 0.0) or 0.0)
        elif status == "error":
            error_count += 1

    remaining_bytes = max(0, total_bytes - int(done_bytes))
    complete = all(
        _fraction_done(e, jobs_by_id.get(e["id"]), present_ids) >= 1.0 for e in entries
    )
    if total_bytes:
        overall = done_bytes / total_bytes
    else:
        overall = 1.0 if complete else 0.0
    return {
        "overall_progress": round(overall, 6),
        "total_bytes": total_bytes,
        "present_bytes": present_bytes,
        "remaining_bytes": remaining_bytes,
        "speed": speed,
        "eta": (remaining_bytes / speed) if speed > 0 else None,
        "total_count": len(entries),
        "ready_count": ready_count,
        "active_count": active_count,
        "error_count": error_count,
        "complete": complete,
    }


def model_rows(
    entries: List[Dict[str, Any]],
    jobs_by_id: Dict[str, Any],
    present_ids: Set[str],
    formats_by_id: Optional[Dict[str, Optional[str]]] = None,
) -> List[Dict[str, Any]]:
    """Per-model status rows for the first-run screen."""
    formats = formats_by_id or {}
    rows: List[Dict[str, Any]] = []
    for entry in entries:
        job = jobs_by_id.get(entry["id"])
        rows.append({
            "id": entry["id"],
            "name": entry.get("name") or entry["id"],
            "license": entry.get("license"),
            "attribution": entry.get("attribution"),
            "approx_bytes": int(entry.get("approx_bytes") or 0),
            # Registry-known weight format (pickle/safetensors/onnx) so the
            # first-run disclosure derives the informed-auto-consent list from
            # data, and manifest 'gated' so HF-account needs surface pre-start.
            "format": formats.get(entry["id"]),
            "gated": bool(entry.get("gated", False)),
            "status": _status_for(entry, job, present_ids),
            "progress": round(_fraction_done(entry, job, present_ids), 6),
            "error": getattr(job, "error", None) if job is not None else None,
            "gate_url": getattr(job, "gate_url", None) if job is not None else None,
        })
    return rows


def _sha256_file(path: str) -> Optional[str]:
    """Streamed sha256 of a file, or None if it is absent."""
    if not os.path.isfile(path):
        return None
    hasher = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(_HASH_CHUNK_BYTES), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


# -- orchestrator -----------------------------------------------------------

class ProvisionOrchestrator:
    """Drives the comprehensive auto-set through the existing DownloadManager."""

    def __init__(self, manifest, registry, download_manager, consent_store, models_dir):
        self._entries = auto_set(manifest)
        self._by_id = {e["id"]: e for e in self._entries}
        self._registry = registry
        self._manager = download_manager
        self._consent = consent_store
        self._models_dir = models_dir

    @property
    def entries(self) -> List[Dict[str, Any]]:
        return list(self._entries)

    def present_ids(self) -> Set[str]:
        """Auto-set ids whose reconciled registry status is ``ready`` (on disk).

        Registry status is recomputed live, so a just-finished download reads as
        ready here and is skipped by ``start``."""
        present: Set[str] = set()
        for entry in self._entries:
            record = self._registry.get_record(entry["id"])
            if record is not None and record.get("status") == "ready":
                present.add(entry["id"])
        return present

    def _jobs_by_id(self) -> Dict[str, Any]:
        auto_ids = set(self._by_id)
        return {
            job.model_id: job
            for job in self._manager.list_jobs()
            if job.model_id in auto_ids
        }

    def _formats_by_id(self) -> Dict[str, Optional[str]]:
        formats: Dict[str, Optional[str]] = {}
        for entry in self._entries:
            record = self._registry.get_record(entry["id"]) or {}
            formats[entry["id"]] = record.get("format")
        return formats

    def status(self) -> Dict[str, Any]:
        present = self.present_ids()
        jobs = self._jobs_by_id()
        payload = aggregate(self._entries, jobs, present)
        payload["schema_version"] = SCHEMA
        payload["attribution"] = set_attribution(self._entries)
        payload["models"] = model_rows(
            self._entries, jobs, present, formats_by_id=self._formats_by_id())
        return payload

    def start(self, hf_token: Optional[str] = None, reverify: bool = False) -> Dict[str, Any]:
        """Enqueue / resume every not-present auto-set model. Idempotent.

        ``reverify`` additionally re-hashes present direct-URL entries against
        their manifest ``sha256`` and re-fetches any that no longer match
        (corrupt / partial on-disk copies are never silently trusted)."""
        present = self.present_ids()
        jobs = self._jobs_by_id()
        corrupt = self._corrupt_ids(present) if reverify else set()
        for entry in self._entries:
            model_id = entry["id"]
            if model_id in present and model_id not in corrupt:
                continue
            self._grant_curated_consent(model_id)
            job = jobs.get(model_id)
            if job is not None and getattr(job, "status", None) in _RESUMABLE_STATES:
                self._manager.resume(model_id, token=hf_token)
            else:
                self._manager.enqueue(model_id, token=hf_token)
        return self.status()

    def pause(self) -> Dict[str, Any]:
        for model_id, job in self._jobs_by_id().items():
            if getattr(job, "status", None) in _PAUSABLE_STATES:
                self._manager.pause(model_id)
        return self.status()

    def cancel(self) -> Dict[str, Any]:
        for model_id, job in self._jobs_by_id().items():
            if getattr(job, "status", None) in _CANCELABLE_STATES:
                self._manager.cancel(model_id)
        return self.status()

    # -- internals ----------------------------------------------------------
    def _grant_curated_consent(self, model_id: str) -> None:
        """Informed auto-consent for curated first-party members.

        The auto-set is redistribution-audited and sha256/LFS-pinned; the
        deny-by-default consent gate exists for *arbitrary* user-added repos.
        Grants are recorded in the audit trail with ``action="auto-provision"``
        so the provenance is durable, never a silent bypass. (No auto-set
        member is ``trust_remote_code``; the branch is kept for completeness.)"""
        record = self._registry.get_record(model_id) or {}
        if record.get("format") == "pickle":
            self._consent.grant(model_id, "pickle", action="auto-provision")
            logger.info(
                "auto-provision: granted pickle consent for curated first-party "
                "model %s (sha256/LFS-pinned)", model_id,
            )
        if record.get("trust_remote_code"):
            self._consent.grant(model_id, "trust_remote_code", action="auto-provision")
            logger.info(
                "auto-provision: granted trust_remote_code consent for curated "
                "model %s", model_id,
            )

    def _corrupt_ids(self, present: Set[str]) -> Set[str]:
        """Present direct-URL entries whose on-disk sha256 no longer matches the
        manifest hash. HF entries verify at fetch time via the manager's LFS
        check, so only literal-``sha256`` direct-URL records are re-hashed."""
        corrupt: Set[str] = set()
        for entry in self._entries:
            if entry["id"] not in present:
                continue
            source = entry.get("source") or {}
            if source.get("kind") != "url":
                continue
            expected = (source.get("sha256") or "").strip().lower()
            if not expected:
                continue
            actual = _sha256_file(self._direct_path(entry))
            if actual is not None and actual != expected:
                corrupt.add(entry["id"])
        return corrupt

    def _direct_path(self, entry: Dict[str, Any]) -> str:
        """On-disk path for a direct-URL single-file artifact, matching the
        DownloadManager's per-id typed-subdir layout."""
        record = self._registry.get_record(entry["id"]) or {}
        artifact_type = (
            record.get("artifact_type") or entry.get("artifact_type") or "edit-model"
        )
        fmt = (record.get("format") or "safetensors").lower()
        filename = f"{entry['id']}{_FORMAT_EXTENSIONS.get(fmt, '.safetensors')}"
        return os.path.join(self._models_dir, artifact_type, entry["id"], filename)
