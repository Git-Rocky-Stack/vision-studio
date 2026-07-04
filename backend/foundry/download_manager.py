"""DownloadManager — the bounded-concurrency acquisition queue.

Layers on top of huggingface_hub (which already does per-file .incomplete
resume, a per-file disk check, a size-consistency check, and an atomic move).
This manager owns: the aggregate disk preflight, a semaphore-bounded queue of
asyncio.Tasks keyed by model id, pause/resume/cancel lifecycle + intent, the
fast/precise (Xet) toggle, per-call token injection (never stored/logged), and
the live status the registry composes through its status_provider.

CivitAI-source records (source="civitai") take the direct-URL branch instead:
host-allowlisted https GET, streamed to <target>.incomplete, sha256-verified
against the record hash, then atomically moved into place (complete-or-absent,
spec 3.5). The token is only ever a Bearer header on that one request.

Telemetry (progress/speed/eta) lives on DownloadJob and is streamed via
GET /models/downloads; it is deliberately NOT written onto ModelRecord.
"""

import asyncio
import hashlib
import os
import shutil
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Literal, Optional
from urllib.parse import urljoin, urlparse

import huggingface_hub

from foundry.download_errors import (
    DiskSpaceError,
    DownloadCancelledError,
    DownloadError,
    DownloadFailedError,
    GatedModelError,
    map_hf_exception,
)
from foundry.download_telemetry import ProgressSink, make_tqdm_class

JobStatus = Literal[
    "queued", "downloading", "paused", "verifying", "ready", "error", "cancelled"
]

# Extra free bytes required beyond the summed file sizes, so the volume is not
# driven to exactly zero (index/temp churn). 256 MiB is a safe resting margin.
_DISK_HEADROOM_BYTES = 256 * 1024 * 1024

# Active lifecycle states an enqueue is idempotent against.
_ACTIVE_STATES = {"queued", "downloading", "paused", "verifying"}

# CivitAI direct-URL streaming: 1 MiB chunks; (connect, read) timeout matching
# the latency variance measured in Spike C.
_CIVITAI_CHUNK_BYTES = 1024 * 1024
_CIVITAI_TIMEOUT = (5, 60)
_CIVITAI_MAX_REDIRECTS = 5

# Pickle-bearing suffixes: acquired only with explicit per-model consent
# (spec 5.3 / Codex M4 review H-2). The safe diffusers load path
# (safetensors-first) needs none of them.
_PICKLE_SUFFIXES = (".ckpt", ".pt", ".pth", ".bin", ".pkl")


def validate_civitai_url(url: str) -> None:
    """Supply-chain guard: only ``https://civitai.com/...`` download URLs.

    ``urlparse(...).hostname`` strips any userinfo, so spoofs of the form
    ``https://civitai.com@evil.example.com/x`` resolve to the REAL host and
    are refused, as are subdomains and plain http.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "civitai.com":
        raise ValueError(f"refusing non-civitai download url: {url[:80]}")


def _civitai_filename(model_id: str, record: dict) -> str:
    """Deterministic on-disk name for a civitai single-file artifact.

    The registry/indexer key civitai records by record id, so the id is the
    filename (HF single-file artifacts follow the same convention via
    _SINGLE_FILE_FILENAMES). The extension MUST track the record format: a
    pickle record downloaded after explicit consent is a real, live path,
    and a .safetensors-named pickle would silently break the indexer's
    header parse and the convert flow.
    """
    fmt = (record.get("format") or "safetensors").lower()
    extension = ".ckpt" if fmt == "pickle" else ".safetensors"
    return f"{model_id}{extension}"


@dataclass
class DownloadJob:
    model_id: str
    status: JobStatus
    progress: float = 0.0
    speed: float = 0.0
    eta: Optional[float] = None
    total_bytes: int = 0
    error: Optional[str] = None
    gate_url: Optional[str] = None
    # NB: there is intentionally NO token field. The token is a local param
    # threaded through _run_job -> _download_file only.


class DownloadManager:
    def __init__(
        self,
        registry,
        model_manager,
        models_dir: str,
        concurrency: int = 2,
        mode: str = "fast",
        consent_lookup: Optional[Callable[[str], Dict[str, bool]]] = None,
    ):
        self._registry = registry
        self._model_manager = model_manager
        self._models_dir = models_dir
        # Per-model consent oracle (ConsentStore.get). None or any failure
        # reads as "no consent" - the filter in _resolve_files fails closed.
        self._consent_lookup = consent_lookup
        self._concurrency = max(1, min(int(concurrency), 6))
        self.mode = mode if mode in {"fast", "precise"} else "fast"

        self._jobs: Dict[str, DownloadJob] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._sinks: Dict[str, ProgressSink] = {}
        self._cancel_events: Dict[str, threading.Event] = {}
        self._intent: Dict[str, str] = {}  # model_id -> none | pause | cancel
        self._semaphore = asyncio.Semaphore(self._concurrency)
        # Reference-counted guard for the precise-mode Xet global so concurrent
        # downloads can't clobber each other's restore (see _xet_toggle).
        self._xet_lock = threading.Lock()
        self._xet_depth = 0
        self._xet_saved = False

    # -- public API --------------------------------------------------------
    def enqueue(self, model_id: str, token: Optional[str] = None) -> DownloadJob:
        """Queue a download. Idempotent for an already-active id.

        ``token`` is a LOCAL parameter passed straight into _run_job; it is
        never stored on the manager or the job, and never logged.
        """
        existing = self._jobs.get(model_id)
        if existing is not None and existing.status in _ACTIVE_STATES:
            return existing

        job = DownloadJob(model_id=model_id, status="queued")
        self._jobs[model_id] = job
        self._intent[model_id] = "none"
        self._cancel_events[model_id] = threading.Event()
        self._tasks[model_id] = asyncio.create_task(self._run_job(model_id, token))
        return job

    def list_jobs(self) -> List[DownloadJob]:
        return list(self._jobs.values())

    def pause(self, model_id: str) -> Optional[DownloadJob]:
        """Cooperatively pause: signal cancel, keep partials for resume."""
        job = self._jobs.get(model_id)
        if job is None or job.status not in {"queued", "downloading"}:
            return job
        self._intent[model_id] = "pause"
        event = self._cancel_events.get(model_id)
        if event is not None:
            event.set()  # sink.add raises DownloadCancelledError at next chunk
        return job

    def resume(self, model_id: str, token: Optional[str] = None) -> DownloadJob:
        """Re-enqueue a paused/errored job.

        hf auto-resumes from .incomplete (hub_download); civitai restarts
        from byte 0 (the stream truncates with "wb" - no Range support yet).
        """
        existing = self._jobs.get(model_id)
        if existing is not None and existing.status in {"paused", "error", "cancelled"}:
            # Clear the terminal/paused job so enqueue starts a fresh task.
            self._jobs.pop(model_id, None)
        return self.enqueue(model_id, token=token)

    def cancel(self, model_id: str) -> Optional[DownloadJob]:
        """Stop the job; partials are cleaned in _handle_cancellation."""
        job = self._jobs.get(model_id)
        if job is None:
            return None
        if job.status not in {"queued", "downloading", "paused"}:
            return job
        self._intent[model_id] = "cancel"
        event = self._cancel_events.get(model_id)
        if event is not None:
            event.set()
        if job.status == "paused":
            # No running task to trip the cancel event — clean up directly.
            record = self._registry.get_record(model_id)
            if record is not None:
                self._delete_partials(self._target_dir(record))
            job.status = "cancelled"
        return job

    def get_record_status(self, model_id: str) -> Optional[str]:
        """Live lifecycle status for the registry status_provider, or None.

        Returns the active job's status (queued/downloading/paused/verifying)
        so GET /api/models reflects in-flight lifecycle. Terminal states
        (ready/error/cancelled) return None so the registry falls back to its
        own on-disk / model_manager detection (a cancelled job must not pin the
        record to 'cancelled' forever).
        """
        job = self._jobs.get(model_id)
        if job is None:
            return None
        if job.status in _ACTIVE_STATES:
            return job.status
        return None

    # -- worker (filled in by later tasks) ---------------------------------
    async def _run_job(self, model_id: str, token: Optional[str]) -> None:
        async with self._semaphore:
            await self._execute(model_id, token)

    async def _execute(self, model_id: str, token: Optional[str]) -> None:
        job = self._jobs[model_id]
        record = self._registry.get_record(model_id)
        if record is None:
            job.status = "error"
            job.error = "unknown model id"
            self._cleanup_task(model_id)
            return

        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")
        cancel_event = self._cancel_events[model_id]

        try:
            if record.get("source") == "civitai":
                # Direct-URL branch: stream + sha256 verify + atomic move all
                # happen in the worker thread; then the same verifying -> ready
                # transition the HF path uses.
                await asyncio.to_thread(self._download_civitai, model_id, record, token)
                job.status = "verifying"
                self._verify([_civitai_filename(model_id, record)], self._target_dir(record))
                job.progress = 1.0
                job.speed = 0.0
                job.eta = 0.0
                job.status = "ready"
                return

            filenames, total_bytes, target_dir = self._resolve_files(model_id, record)
            job.total_bytes = total_bytes

            self._preflight_disk(total_bytes, target_dir)

            job.status = "downloading"
            sink = ProgressSink(total_bytes, cancel_event=cancel_event)
            self._sinks[model_id] = sink

            for filename in filenames:
                await asyncio.to_thread(
                    self._download_file, repo_id, filename, target_dir, token, sink, revision
                )
                job.progress = sink.progress
                job.speed = sink.speed
                job.eta = sink.eta

            job.status = "verifying"
            # The library already did per-file size-consistency + atomic move;
            # the repo-level verify is the presence of every target file.
            self._verify(filenames, target_dir)

            job.progress = 1.0
            job.speed = 0.0
            job.eta = 0.0
            job.status = "ready"
        except DownloadCancelledError:
            self._handle_cancellation(model_id, target_dir=self._target_dir(record))
        except DiskSpaceError as exc:
            job.status = "error"
            job.error = str(exc)
        except GatedModelError as exc:
            job.status = "error"
            job.error = str(exc)
            job.gate_url = exc.gate_url
        except DownloadError as exc:
            job.status = "error"
            job.error = str(exc)
        except Exception as exc:  # any raw hf error -> typed -> surfaced
            mapped = map_hf_exception(exc, repo_id=repo_id or model_id)
            job.status = "error"
            job.error = str(mapped)
            if isinstance(mapped, GatedModelError):
                job.gate_url = mapped.gate_url
        finally:
            self._cleanup_task(model_id)

    # -- resolution / preflight / per-file download ------------------------
    def _resolve_files(self, model_id: str, record: dict):
        """Return (filenames, total_bytes, target_dir) for the model.

        Single-file artifacts resolve to the one filename from the manager's
        _SINGLE_FILE_FILENAMES map; diffusers repos resolve to the repo file
        list. Sizes come from huggingface_hub.get_paths_info (no download).

        Repo file lists are FILTERED (Codex M4 review H-2): repo-authored
        ``.py`` is never fetched (no loader executes repo code - M5 revisits
        with loader-side consent), and pickle-bearing suffixes are fetched
        only with explicit per-model pickle consent. The classifier judges
        the safetensors component tree; this filter keeps acquisition aligned
        with that judgment instead of pulling every sidecar in the repo.
        """
        from utils.model_manager import single_file_names

        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")
        target_dir = self._target_dir(record)

        single = single_file_names(model_id)
        if single is not None:
            paths = list(single)
        else:
            infos = huggingface_hub.get_paths_info(repo_id, [], revision=revision)
            paths = [getattr(info, "path", None) or info["path"] for info in infos]
            paths = [p for p in paths if not p.lower().endswith(".py")]
            if not self._pickle_allowed(model_id):
                paths = [p for p in paths if not p.lower().endswith(_PICKLE_SUFFIXES)]

        infos = huggingface_hub.get_paths_info(repo_id, paths, revision=revision)
        total = 0
        for info in infos:
            size = getattr(info, "size", None)
            if size is None and isinstance(info, dict):
                size = info.get("size", 0)
            total += int(size or 0)

        return paths, total, target_dir

    def _pickle_allowed(self, model_id: str) -> bool:
        """Explicit per-model pickle consent, failing closed on any error."""
        if self._consent_lookup is None:
            return False
        try:
            return bool(self._consent_lookup(model_id).get("pickle"))
        except Exception:
            return False

    def _target_dir(self, record: dict) -> str:
        """Destination directory matching the model_manager storage layout."""
        artifact_type = record.get("artifact_type", "checkpoint")
        if artifact_type in {"diffusers-pipeline", "motion-adapter"}:
            return os.path.join(self._models_dir, "diffusers", record["id"])
        if artifact_type == "controlnet":
            # Multi-file diffusers-format repos get a per-id dir so two
            # ControlNet records can never collide on config.json. Matches
            # registry._is_present, which already expects controlnet/<id>/.
            return os.path.join(self._models_dir, "controlnet", record["id"])
        subdir = _ARTIFACT_SUBDIR.get(artifact_type, "checkpoints")
        return os.path.join(self._models_dir, subdir)

    def _preflight_disk(self, total_bytes: int, target_dir: str) -> None:
        """Refuse the whole pull up front if free space < total + headroom."""
        probe = target_dir
        while probe and not os.path.isdir(probe):
            probe = os.path.dirname(probe)
        if not probe:
            probe = self._models_dir
        os.makedirs(target_dir, exist_ok=True)
        free = shutil.disk_usage(probe).free
        required = total_bytes + _DISK_HEADROOM_BYTES
        if free < required:
            raise DiskSpaceError(required=required, available=free)

    def _download_file(self, repo_id, filename, target_dir, token, sink, revision):
        """Blocking per-file download. Token passed PER CALL only."""
        os.makedirs(target_dir, exist_ok=True)
        with self._xet_toggle():
            huggingface_hub.hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=target_dir,
                token=token,
                tqdm_class=make_tqdm_class(sink),
                revision=revision,
            )

    def _download_civitai(self, model_id: str, record: dict, token: Optional[str]) -> None:
        """Blocking CivitAI direct-URL download (runs in a worker thread).

        Stream -> ``<target>.incomplete`` -> sha256 verify -> atomic
        ``os.replace``: the final file is complete-or-absent (spec 3.5). The
        URL is never trusted (https + civitai.com host allowlist on the first
        hop; redirects walked manually per _civitai_get) and the token is
        used ONLY as a Bearer header while the hop host is civitai.com -
        never stored, never logged, never on the job or in error text. A
        hash mismatch deletes the partial so corrupt or tampered bytes can
        never present as ready.
        """
        url = record.get("download_url")
        if not url:
            raise DownloadFailedError("no download_url on civitai record")
        # Fail closed: delivery is a CDN redirect, so the record's sha256 is
        # the ONLY integrity anchor. No hash -> no unverifiable download
        # (positive-signal discipline, same posture as the classifier).
        if not (record.get("sha256") or "").strip():
            raise DownloadFailedError(
                "no sha256 on civitai record - refusing unverifiable download"
            )
        try:
            validate_civitai_url(url)
        except ValueError as exc:
            raise DownloadFailedError(str(exc)) from exc

        import requests  # lazy: keep module import light (mirrors civitai_search)

        job = self._jobs[model_id]
        cancel_event = self._cancel_events[model_id]
        target_dir = self._target_dir(record)
        target = os.path.join(target_dir, _civitai_filename(model_id, record))
        incomplete = target + ".incomplete"

        response = self._civitai_get(requests, url, token)
        hasher = hashlib.sha256()
        try:
            status = getattr(response, "status_code", 200)
            if isinstance(status, int) and status >= 400:
                # Typed HERE (not via map_hf_exception) so a civitai 401/403
                # never surfaces a huggingface.co gate URL.
                raise DownloadFailedError(f"civitai responded HTTP {status}")

            total = int(response.headers.get("Content-Length") or 0)
            self._preflight_disk(total, target_dir)
            job.total_bytes = total
            job.status = "downloading"  # post-preflight, mirroring the HF path

            sink = ProgressSink(total, cancel_event=cancel_event)
            self._sinks[model_id] = sink
            sink.start_file(expected_size=total)
            with open(incomplete, "wb") as handle:
                for chunk in response.iter_content(chunk_size=_CIVITAI_CHUNK_BYTES):
                    if not chunk:
                        continue
                    sink.add(len(chunk))  # raises DownloadCancelledError on signal
                    handle.write(chunk)
                    hasher.update(chunk)
                    job.progress = sink.progress
                    job.speed = sink.speed
                    job.eta = sink.eta
            sink.finish_file()
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()

        expected = (record.get("sha256") or "").strip().lower()
        if hasher.hexdigest() != expected:
            try:
                os.remove(incomplete)
            except OSError:
                pass
            raise DownloadFailedError("sha256 mismatch - corrupt or tampered download")

        os.replace(incomplete, target)  # atomic: complete-or-absent

    def _civitai_get(self, requests_module, url: str, token: Optional[str]):
        """Manual redirect walk for the CivitAI delivery chain (review M-1).

        requests' automatic redirect following is disabled so the policy is
        explicit and testable: every hop must be https; the Bearer token is
        attached ONLY while the hop host is civitai.com (delivery CDNs must
        never see it); the chain is capped. CDN hostnames are deliberately
        NOT allowlisted by name - they are infrastructure-volatile - because
        integrity comes from the mandatory sha256 over the final bytes and
        confidentiality from confining the secret to the first-party host.
        """
        current = url
        for _ in range(_CIVITAI_MAX_REDIRECTS):
            parsed = urlparse(current)
            if parsed.scheme != "https":
                raise DownloadFailedError(
                    "refusing non-https hop in civitai redirect chain"
                )
            headers = (
                {"Authorization": f"Bearer {token}"}
                if token and parsed.hostname == "civitai.com"
                else {}
            )
            response = requests_module.get(
                current,
                stream=True,
                timeout=_CIVITAI_TIMEOUT,
                headers=headers,
                allow_redirects=False,
            )
            status = getattr(response, "status_code", 200)
            if isinstance(status, int) and status in (301, 302, 303, 307, 308):
                location = (getattr(response, "headers", {}) or {}).get("Location")
                close = getattr(response, "close", None)
                if callable(close):
                    close()
                if not location:
                    raise DownloadFailedError("civitai redirect without a Location header")
                current = urljoin(current, location)
                continue
            return response
        raise DownloadFailedError(
            f"civitai redirect chain exceeded {_CIVITAI_MAX_REDIRECTS} hops"
        )

    def _verify(self, filenames, target_dir) -> None:
        for filename in filenames:
            dest = os.path.join(target_dir, filename)
            if not os.path.exists(dest):
                raise DownloadError(f"verify failed: missing {filename}")

    @contextmanager
    def _xet_toggle(self):
        """Force the plain-HTTP byte-exact path in precise mode; restore after.

        file_download.py reads constants.HF_HUB_DISABLE_XET at call time, so
        mutating the module attribute around the call switches Xet off for that
        download. HF_HUB_DISABLE_XET is a process-global and _download_file runs
        in a worker thread, so concurrent precise downloads are reference-counted
        under a lock: the FIRST entrant saves the true original and disables Xet,
        and only the LAST to leave restores it. The prior value is always
        restored, even on exception. Default ``fast`` mode is a no-op.
        """
        if self.mode != "precise":
            yield
            return
        with self._xet_lock:
            if self._xet_depth == 0:
                self._xet_saved = huggingface_hub.constants.HF_HUB_DISABLE_XET
                huggingface_hub.constants.HF_HUB_DISABLE_XET = True
            self._xet_depth += 1
        try:
            yield
        finally:
            with self._xet_lock:
                self._xet_depth -= 1
                if self._xet_depth == 0:
                    huggingface_hub.constants.HF_HUB_DISABLE_XET = self._xet_saved

    # -- lifecycle handlers (cancel/pause fleshed out in Tasks 6-8) --------
    def _handle_cancellation(self, model_id: str, target_dir: str) -> None:
        job = self._jobs[model_id]
        if self._intent.get(model_id) == "pause":
            job.status = "paused"  # KEEP .incomplete partials for resume
        else:
            self._delete_partials(target_dir)
            job.status = "cancelled"

    def _delete_partials(self, target_dir: str) -> None:
        if not os.path.isdir(target_dir):
            return
        for name in os.listdir(target_dir):
            if name.endswith(".incomplete"):
                try:
                    os.remove(os.path.join(target_dir, name))
                except OSError:
                    pass

    def _cleanup_task(self, model_id: str) -> None:
        self._tasks.pop(model_id, None)
        self._cancel_events.pop(model_id, None)
        self._sinks.pop(model_id, None)
        self._intent.pop(model_id, None)


_ARTIFACT_SUBDIR = {
    "checkpoint": "checkpoints",
    "diffusers-pipeline": "diffusers",
    "motion-adapter": "diffusers",
    "lora": "loras",
    "vae": "vaes",
    "controlnet": "controlnet",
    "embedding": "embeddings",
    "annotator": "annotators",
}
