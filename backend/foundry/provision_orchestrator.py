"""#34 installer PR2: first-run auto-provisioning over the DownloadManager.

The comprehensive auto-set (``provision-manifest.json``, PR1) is provisioned on
first launch by driving each missing model *by id* through the existing
consent-gated ``DownloadManager`` - the same path the manual "Download" button
uses. This module owns only the orchestration policy:

* detection - which auto-set ids are already present on disk (registry-``ready``,
  or every pinned file present for manifest-only entries);
* the byte-weighted aggregate + per-model progress the renderer streams, for the
  whole set and per tier (``core`` / ``extended``);
* an idempotent, resumable ``start`` over the queue (present skipped, paused /
  errored resumed, missing enqueued), optionally scoped to a subset of ids;
* the ``reverify`` repair pass, which re-hashes present files against the
  manifest pins in a worker thread (never on the event loop) with progress, and
  re-fetches anything that no longer matches.

Fetch, filename resolution, and per-download integrity stay in the
``DownloadManager``; the orchestrator binds the manifest's per-file pins onto
it at construction so every auto-set download is pinned + hash-verified.

Pure data + orchestration - imports cleanly on stub CI (no torch, no network).
Hashing happens only inside the reverify background job - never on the polled
``status()`` path, never on the event loop.

Pickle-format auto-set members (the curated, first-party edit-tool + annotator
weights) are granted pickle consent here with recorded provenance
(``action="auto-provision"``) BEFORE they enqueue - the deny-by-default gate
stays intact for anything the user adds themselves (spec 5.3; decision
2026-07-07 "informed auto-consent").
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable, Dict, Iterable, List, Optional, Set

from foundry.download_manager import file_digest, pinned_file_matches
from foundry.provisioning import (
    TIER_CORE,
    TIER_EXTENDED,
    TIERS,
    manifest_only_records,
    manifest_pins,
)

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


class UnknownProvisionModelsError(ValueError):
    """``start(model_ids=...)`` named ids outside the manifest auto-set."""

    def __init__(self, unknown: Iterable[str]):
        self.unknown = sorted(set(unknown))
        super().__init__(
            "Not part of the provisioning set: " + ", ".join(self.unknown)
        )


# -- pure helpers -----------------------------------------------------------

def auto_set(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The manifest's ``auto_set`` entries: the models first-run provisioning
    downloads on the user's machine (never shipped inside the installer)."""
    return list(manifest.get("auto_set") or [])


def entry_size(entry: Dict[str, Any]) -> int:
    """Byte weight of one entry: the pinned exact size, else the estimate."""
    return int(entry.get("size_bytes") or entry.get("approx_bytes") or 0)


def entry_tier(entry: Dict[str, Any]) -> str:
    tier = entry.get("tier")
    return tier if tier in TIERS else TIER_EXTENDED


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
    """Byte-weighted aggregate progress across ``entries``.

    Weights are the manifest's static sizes (pinned exact ``size_bytes``, else
    ``approx_bytes``) so the math is deterministic and unit-testable without
    live Hub sizes. An entry contributes fully when it is present on disk (or
    its job is ready); otherwise its ``job.progress`` fraction. ``eta`` is
    remaining bytes over the summed speed of the actively-downloading jobs, or
    None when nothing is moving.
    """
    total_bytes = sum(entry_size(e) for e in entries)
    present_bytes = sum(entry_size(e) for e in entries if e["id"] in present_ids)
    done_bytes = 0.0
    speed = 0.0
    ready_count = active_count = error_count = 0
    for entry in entries:
        job = jobs_by_id.get(entry["id"])
        weight = entry_size(entry)
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
            # K3: exact pinned footprint + the first-run tier, so the renderer
            # can offer "core" vs "everything" with honest sizes.
            "size_bytes": entry_size(entry),
            "tier": entry_tier(entry),
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
    return file_digest(path, "sha256")


def _pinned_paths(snapshots: List[Dict[str, Any]], target_dir: str):
    """(absolute path, pin) for every pinned file under ``target_dir``."""
    for snapshot in snapshots:
        subdir = (snapshot.get("subdir") or "").strip("/")
        base = os.path.join(target_dir, *subdir.split("/")) if subdir else target_dir
        for pinned in snapshot.get("files") or []:
            yield os.path.join(base, *pinned["path"].split("/")), pinned


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
        self._pins = manifest_pins(manifest)
        self._manifest_only = manifest_only_records(manifest)
        # Bind the manifest's integrity pins (and the manifest-only records)
        # onto the manager this orchestrator drives, so every auto-set
        # download - first-run, resume, manual "Download" alike - fetches the
        # pinned commit and hash-verifies every file.
        register = getattr(download_manager, "register_manifest_pins", None)
        if callable(register):
            register(self._pins, self._manifest_only)
        # Ids whose on-disk copy failed reverify and are being re-fetched: not
        # "present" until their new job reaches ready.
        self._refetching: Set[str] = set()
        self._reverify_task: Optional[asyncio.Task] = None
        self._reverify: Dict[str, Any] = _reverify_state("idle")

    @property
    def entries(self) -> List[Dict[str, Any]]:
        return list(self._entries)

    @property
    def model_ids(self) -> List[str]:
        return [e["id"] for e in self._entries]

    def validate_model_ids(self, model_ids: Optional[Iterable[str]]) -> List[Dict[str, Any]]:
        """Entries selected by ``model_ids`` (all when omitted/empty).

        Raises UnknownProvisionModelsError naming every id outside the set.
        """
        if not model_ids:
            return list(self._entries)
        wanted = list(dict.fromkeys(model_ids))
        unknown = [model_id for model_id in wanted if model_id not in self._by_id]
        if unknown:
            raise UnknownProvisionModelsError(unknown)
        return [self._by_id[model_id] for model_id in wanted]

    def present_ids(self) -> Set[str]:
        """Auto-set ids whose copy is on disk.

        Registry models: reconciled registry status ``ready`` (recomputed live,
        so a just-finished download reads as ready). Manifest-only entries
        (not registry models): every pinned file present at its pinned size.
        An id being re-fetched after a failed reverify is not present until
        its new job is ready."""
        jobs = self._jobs_by_id()
        for model_id in list(self._refetching):
            job = jobs.get(model_id)
            if job is not None and getattr(job, "status", None) == "ready":
                self._refetching.discard(model_id)
        present: Set[str] = set()
        for entry in self._entries:
            model_id = entry["id"]
            if model_id in self._refetching:
                continue
            if model_id in self._manifest_only:
                if self._pinned_files_present(model_id):
                    present.add(model_id)
                continue
            record = self._registry.get_record(model_id)
            if record is not None and record.get("status") == "ready":
                present.add(model_id)
        return present

    def _pinned_files_present(self, model_id: str) -> bool:
        snapshots = self._pins.get(model_id)
        target_dir = self._target_dir(model_id)
        if not snapshots or target_dir is None:
            return False
        for path, pinned in _pinned_paths(snapshots, target_dir):
            if not os.path.isfile(path) or os.path.getsize(path) != pinned.get("size"):
                return False
        return True

    def _target_dir(self, model_id: str) -> Optional[str]:
        target_for = getattr(self._manager, "target_dir_for", None)
        if callable(target_for):
            return target_for(model_id)
        return None

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
            if entry["id"] in self._manifest_only:
                formats[entry["id"]] = self._manifest_only[entry["id"]].get("format")
                continue
            record = self._registry.get_record(entry["id"]) or {}
            formats[entry["id"]] = record.get("format")
        return formats

    def status(self) -> Dict[str, Any]:
        present = self.present_ids()
        jobs = self._jobs_by_id()
        payload = aggregate(self._entries, jobs, present)
        payload["schema_version"] = SCHEMA
        payload["attribution"] = set_attribution(self._entries)
        payload["tiers"] = {
            tier: aggregate(
                [e for e in self._entries if entry_tier(e) == tier], jobs, present
            )
            for tier in (TIER_CORE, TIER_EXTENDED)
        }
        payload["reverify"] = dict(self._reverify)
        payload["models"] = model_rows(
            self._entries, jobs, present, formats_by_id=self._formats_by_id())
        return payload

    async def start(
        self,
        hf_token: Optional[str] = None,
        reverify: bool = False,
        model_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Enqueue / resume every not-present model of the selection. Idempotent.

        ``model_ids`` scopes the run to a subset of the auto-set (omitted or
        empty = every model); an id outside the set raises
        UnknownProvisionModelsError before anything is queued.

        ``reverify`` additionally re-hashes the selection's present copies
        against the manifest pins (HF per-file sha256 / git blob id, direct-URL
        sha256) in a background worker thread and re-fetches any that no
        longer match - corrupt or partial on-disk copies are never silently
        trusted. It returns at once; progress is ``status()["reverify"]``.
        """
        selection = self.validate_model_ids(model_ids)
        present = self.present_ids()
        jobs = self._jobs_by_id()
        for entry in selection:
            if entry["id"] in present:
                continue
            self._acquire(entry["id"], jobs.get(entry["id"]), hf_token)
        if reverify:
            self._launch_reverify([e for e in selection if e["id"] in present], hf_token)
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

    async def wait_for_reverify(self) -> None:
        """Await the in-flight reverify pass (tests / graceful shutdown)."""
        task = self._reverify_task
        if task is not None:
            await task

    # -- internals ----------------------------------------------------------
    def _acquire(self, model_id: str, job: Any, hf_token: Optional[str]) -> None:
        self._grant_curated_consent(model_id)
        if job is not None and getattr(job, "status", None) in _RESUMABLE_STATES:
            self._manager.resume(model_id, token=hf_token)
        else:
            self._manager.enqueue(model_id, token=hf_token)

    def _grant_curated_consent(self, model_id: str) -> None:
        """Informed auto-consent for curated first-party pickle members.

        The auto-set is redistribution-audited and sha256-pinned; the
        deny-by-default consent gate exists for *arbitrary* user-added repos.
        Grants are recorded in the audit trail with ``action="auto-provision"``
        so the provenance is durable, never a silent bypass. (No grant is ever
        made for trust_remote_code: no loader runs repo code, so the manager
        refuses those downloads outright.)"""
        if model_id in self._manifest_only:
            return
        record = self._registry.get_record(model_id) or {}
        if record.get("format") == "pickle":
            self._consent.grant(model_id, "pickle", action="auto-provision")
            logger.info(
                "auto-provision: granted pickle consent for curated first-party "
                "model %s (sha256-pinned)", model_id,
            )

    def _launch_reverify(self, entries: List[Dict[str, Any]], hf_token: Optional[str]) -> None:
        """Start the background reverify pass unless one is already running."""
        if self._reverify_task is not None and not self._reverify_task.done():
            return
        self._reverify = _reverify_state(
            "running", total_bytes=sum(self._hash_budget(e) for e in entries))
        self._reverify_task = asyncio.get_running_loop().create_task(
            self._run_reverify(entries, hf_token))

    async def _run_reverify(self, entries: List[Dict[str, Any]], hf_token: Optional[str]) -> None:
        """Hash in a worker thread; re-acquire the corrupt ids on the loop."""
        state = self._reverify

        def progress(nbytes: int) -> None:
            state["checked_bytes"] += nbytes

        try:
            corrupt = await asyncio.to_thread(self._find_and_purge_corrupt, entries, progress)
        except Exception as exc:  # surfaced on status, never raised into the loop
            logger.exception("provision reverify failed")
            state.update(state="error", error=str(exc) or exc.__class__.__name__)
            return
        jobs = self._jobs_by_id()
        for model_id in sorted(corrupt):
            self._refetching.add(model_id)
            try:
                self._acquire(model_id, jobs.get(model_id), hf_token)
            except Exception as exc:
                logger.warning("reverify could not re-queue %s: %s", model_id, exc)
        state.update(state="done", corrupt=sorted(corrupt))

    def _hash_budget(self, entry: Dict[str, Any]) -> int:
        snapshots = self._pins.get(entry["id"])
        if snapshots:
            return sum(int(f.get("size") or 0) for s in snapshots for f in s.get("files") or [])
        source = entry.get("source") or {}
        if source.get("kind") == "url" and source.get("sha256"):
            path = self._direct_path(entry)
            return os.path.getsize(path) if os.path.isfile(path) else 0
        return 0

    def _find_and_purge_corrupt(
        self, entries: List[Dict[str, Any]], progress: Callable[[int], None]
    ) -> Set[str]:
        """Blocking (worker thread): ids whose on-disk copy fails its pin.

        A failing HF-pinned file is deleted so the re-fetch cannot be
        short-circuited by the Hub client's local-dir cache; a corrupt
        direct-URL file is replaced atomically by its re-download."""
        corrupt: Set[str] = set()
        for entry in entries:
            model_id = entry["id"]
            snapshots = self._pins.get(model_id)
            target_dir = self._target_dir(model_id)
            if snapshots and target_dir is not None:
                for path, pinned in _pinned_paths(snapshots, target_dir):
                    if not pinned_file_matches(path, pinned):
                        corrupt.add(model_id)
                        if os.path.isfile(path):
                            try:
                                os.remove(path)
                            except OSError as exc:
                                logger.warning("could not remove corrupt %s: %s", path, exc)
                    progress(int(pinned.get("size") or 0))
                continue
            source = entry.get("source") or {}
            expected = (source.get("sha256") or "").strip().lower()
            if source.get("kind") != "url" or not expected:
                continue
            path = self._direct_path(entry)
            actual = _sha256_file(path)
            if actual is not None:
                progress(os.path.getsize(path))
                if actual != expected:
                    corrupt.add(model_id)
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


def _reverify_state(state: str, total_bytes: int = 0) -> Dict[str, Any]:
    return {
        "state": state,  # idle | running | done | error
        "checked_bytes": 0,
        "total_bytes": total_bytes,
        "corrupt": [],
        "error": None,
    }
