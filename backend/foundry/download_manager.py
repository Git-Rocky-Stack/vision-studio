"""DownloadManager — the bounded-concurrency acquisition queue.

Layers on top of huggingface_hub (which already does per-file .incomplete
resume, a per-file disk check, a size-consistency check, and an atomic move).
This manager owns: the aggregate disk preflight, a semaphore-bounded queue of
asyncio.Tasks keyed by model id, pause/resume/cancel lifecycle + intent, the
fast/precise (Xet) toggle, per-call token injection (never stored/logged), and
the live status the registry composes through its status_provider.

Records carrying a download_url (CivitAI search results, the #34 github
release weights) take the direct-URL branch instead: first-hop
host-allowlisted https GET, streamed to <target>.incomplete, sha256-verified
against the record hash, then atomically moved into place (complete-or-absent,
spec 3.5). The token is only ever a Bearer header while the hop host is
civitai.com; github assets need no token.

Telemetry (progress/speed/eta) lives on DownloadJob and is streamed via
GET /models/downloads; it is deliberately NOT written onto ModelRecord.
"""

import asyncio
import hashlib
import logging
import os
import shutil
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Literal, Optional
from urllib.parse import quote, urljoin, urlparse

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

logger = logging.getLogger(__name__)

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


# First-hop host allowlist per record source (#34 generalized the civitai
# branch to any direct-URL record). Delivery CDNs behind redirects are
# deliberately NOT allowlisted (infrastructure-volatile) - integrity comes
# from the mandatory sha256 over the final bytes.
_DIRECT_URL_HOSTS = {"civitai": "civitai.com", "github": "github.com"}


def validate_direct_url(url: str, source: str) -> None:
    """Supply-chain guard for direct-URL records.

    ``urlparse(...).hostname`` strips any userinfo, so spoofs of the form
    ``https://github.com@evil.example.com/x`` resolve to the REAL host and
    are refused, as are subdomains and plain http.
    """
    allowed = _DIRECT_URL_HOSTS.get(source or "")
    if allowed is None:
        raise ValueError(f"records from source '{source}' have no direct-download path")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != allowed:
        raise ValueError(f"refusing direct download url outside https://{allowed}: {url[:80]}")


_FORMAT_EXTENSIONS = {"pickle": ".ckpt", "onnx": ".onnx"}


def _direct_filename(model_id: str, record: dict) -> str:
    """Deterministic on-disk name for a direct-URL single-file artifact.

    The registry/indexer key direct-URL records by record id, so the id is
    the filename (HF single-file artifacts follow the same convention via
    _SINGLE_FILE_FILENAMES). The extension MUST track the record format: a
    pickle record downloaded after explicit consent is a real, live path
    (a .safetensors-named pickle would silently break the indexer's header
    parse and the convert flow), and an .onnx must never masquerade as
    safetensors.
    """
    fmt = (record.get("format") or "safetensors").lower()
    return f"{model_id}{_FORMAT_EXTENSIONS.get(fmt, '.safetensors')}"


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
        mirror_lookup: Optional[Callable[[str], Optional[Dict]]] = None,
    ):
        self._registry = registry
        self._model_manager = model_manager
        self._models_dir = models_dir
        # Per-model consent oracle (ConsentStore.get). None or any failure
        # reads as "no consent" - the filter in _resolve_files fails closed.
        self._consent_lookup = consent_lookup
        # #34 PR4: model_id -> manifest mirror stanza ({base_url, files}) for
        # the VS R2 fallback, or None. Absent lookup/stanza = today's behavior.
        self._mirror_lookup = mirror_lookup
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
        cancel_event = self._cancel_events[model_id]

        try:
            if record.get("download_url") or record.get("source") in _DIRECT_URL_HOSTS:
                # Direct-URL branch (civitai + github records): stream + sha256
                # verify + atomic move all happen in the worker thread; then
                # the same verifying -> ready transition the HF path uses.
                # Source-routed even without a download_url so a malformed
                # record refuses HERE instead of leaking into the HF path.
                await asyncio.to_thread(self._download_direct, model_id, record, token)
                job.status = "verifying"
                self._verify([_direct_filename(model_id, record)], self._target_dir(record))
                job.progress = 1.0
                job.speed = 0.0
                job.eta = 0.0
                job.status = "ready"
                return

            filenames = await self._download_hf_with_mirror_fallback(
                model_id, record, token, cancel_event
            )

            job.status = "verifying"
            # The library already did per-file size-consistency + atomic move
            # (the mirror path its own sha256 + atomic replace); the repo-level
            # verify is the presence of every target file.
            self._verify(filenames, self._target_dir(record))

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

    async def _download_hf(self, model_id: str, record: dict, token: Optional[str],
                           cancel_event: threading.Event) -> List[str]:
        """The primary HuggingFace fetch: resolve -> preflight -> per-file
        download. Returns the filenames for the repo-level verify."""
        job = self._jobs[model_id]
        repo_id = record.get("repo_id")
        revision = record.get("revision", "main")

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
        return filenames

    async def _download_hf_with_mirror_fallback(
        self, model_id: str, record: dict, token: Optional[str],
        cancel_event: threading.Event,
    ) -> List[str]:
        """Primary HF fetch with the VS-mirror fallback (#34 PR4).

        The mirror is tried ONLY on infrastructure failure. It never routes
        around a trust boundary: cancellation/pause and the disk refusal
        propagate untouched, and a license gate needs the USER's acceptance -
        serving gated weights from the mirror would defeat the gate. If both
        legs fail, the surfaced error carries the mapped PRIMARY cause (the
        actionable one) with the mirror failure noted for debugging.
        """
        try:
            return await self._download_hf(model_id, record, token, cancel_event)
        except (DownloadCancelledError, DiskSpaceError):
            raise
        except Exception as primary_exc:
            mapped = (
                primary_exc
                if isinstance(primary_exc, DownloadError)
                else map_hf_exception(
                    primary_exc, repo_id=record.get("repo_id") or model_id
                )
            )
            if isinstance(mapped, GatedModelError):
                raise mapped
            mirror = self._mirror_lookup(model_id) if self._mirror_lookup else None
            if not mirror:
                raise mapped
            logger.warning(
                "primary fetch failed for %s (%s); falling back to VS mirror",
                model_id, mapped,
            )
            try:
                return await asyncio.to_thread(
                    self._download_from_mirror, model_id, record, mirror
                )
            except (DownloadCancelledError, DiskSpaceError):
                raise
            except Exception as mirror_exc:
                raise DownloadFailedError(
                    f"{mapped}; VS mirror fallback also failed: {mirror_exc}"
                ) from primary_exc

    def _download_from_mirror(self, model_id: str, record: dict, mirror: Dict) -> List[str]:
        """Blocking VS-mirror download (runs in a worker thread).

        Every file streams to ``<target>.incomplete``, is sha256-verified
        against the manifest stanza (mandatory - no hash, no download), and
        lands via atomic ``os.replace``: complete-or-absent, the same
        discipline as the direct-URL path. The mirror is first-party R2 behind
        a fixed https host, so redirects are unexpected and refused, and no
        auth header is ever attached.
        """
        base_url = (mirror.get("base_url") or "").rstrip("/")
        parsed = urlparse(base_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise DownloadFailedError(
                f"refusing non-https VS mirror for {model_id}: {base_url[:80]!r}"
            )
        files = mirror.get("files") or []
        if not files:
            raise DownloadFailedError(f"VS mirror for {model_id} lists no files")
        # Validate the WHOLE stanza before the first byte moves (fail closed;
        # defense in depth over the manifest build's own validation).
        for file in files:
            name = (file.get("name") or "").strip()
            if (
                not name
                or "\\" in name
                or ":" in name
                or name.startswith("/")
                or ".." in name.split("/")
            ):
                raise DownloadFailedError(f"unsafe VS mirror file name {name!r}")
            if not (file.get("sha256") or "").strip():
                raise DownloadFailedError(
                    f"VS mirror file {name!r} has no sha256 - refusing "
                    "unverifiable download"
                )

        import requests  # lazy: keep module import light (mirrors _download_direct)

        job = self._jobs[model_id]
        cancel_event = self._cancel_events[model_id]
        target_dir = self._target_dir(record)
        total = sum(int(f.get("bytes") or 0) for f in files)
        self._preflight_disk(total, target_dir)
        job.total_bytes = total
        job.status = "downloading"
        sink = ProgressSink(total, cancel_event=cancel_event)
        self._sinks[model_id] = sink

        names: List[str] = []
        for file in files:
            name = file["name"].strip()
            expected = file["sha256"].strip().lower()
            url = f"{base_url}/{quote(name)}"
            target = os.path.join(target_dir, *name.split("/"))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            incomplete = target + ".incomplete"

            response = requests.get(
                url, stream=True, timeout=_CIVITAI_TIMEOUT, allow_redirects=False
            )
            hasher = hashlib.sha256()
            try:
                status = getattr(response, "status_code", 200)
                if isinstance(status, int) and status >= 300:
                    raise DownloadFailedError(
                        f"VS mirror responded HTTP {status} for {name}"
                    )
                sink.start_file(expected_size=int(file.get("bytes") or 0))
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

            if hasher.hexdigest() != expected:
                try:
                    os.remove(incomplete)
                except OSError:
                    pass
                raise DownloadFailedError(
                    f"VS mirror sha256 mismatch for {name} - corrupt or "
                    "tampered download"
                )
            os.replace(incomplete, target)  # atomic: complete-or-absent
            names.append(name)
        return names

    # -- resolution / preflight / per-file download ------------------------
    def _resolve_files(self, model_id: str, record: dict):
        """Return (filenames, total_bytes, target_dir) for the model.

        Single-file artifacts resolve to the one filename from the manager's
        _SINGLE_FILE_FILENAMES map; diffusers repos resolve to the repo file
        list. Records may carry an explicit ``files`` allowlist (curated in
        the catalog) which wins over both maps. Sizes come from
        huggingface_hub.get_paths_info (no download).

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
        explicit = record.get("files") or []
        if explicit:
            # Catalog-curated allowlist (#34 PR3): fetch exactly these paths.
            # Same trust anchor as _SINGLE_FILE_FILENAMES - the .py/pickle
            # filters below guard DISCOVERED repo lists, not curated ones.
            paths = list(explicit)
        elif single is not None:
            paths = list(single)
        else:
            # get_paths_info REQUIRES concrete paths (an empty list is an
            # HTTP 400) - enumeration goes through the repo file list.
            paths = list(huggingface_hub.list_repo_files(repo_id, revision=revision))
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
        if artifact_type in {"controlnet", "ip-adapter", "edit-model"}:
            # Multi-file diffusers-format repos get a per-id dir so two
            # records can never collide on config.json. Matches
            # registry._is_present, which already expects <type>/<id>/.
            # edit-model single files ride the same per-id layout (#34).
            return os.path.join(self._models_dir, artifact_type, record["id"])
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

    def _download_direct(self, model_id: str, record: dict, token: Optional[str]) -> None:
        """Blocking direct-URL download (runs in a worker thread).

        Stream -> ``<target>.incomplete`` -> sha256 verify -> atomic
        ``os.replace``: the final file is complete-or-absent (spec 3.5). The
        URL is never trusted (https + per-source first-hop host allowlist;
        redirects walked manually per _direct_get) and the token is used
        ONLY as a Bearer header while the hop host is civitai.com - never
        stored, never logged, never on the job or in error text; github
        release assets need no token. A hash mismatch deletes the partial so
        corrupt or tampered bytes can never present as ready.
        """
        url = record.get("download_url")
        if not url:
            raise DownloadFailedError("record has no download_url")
        # Supply-chain guard first: a hostile URL is refused before the
        # record earns any further consideration.
        try:
            validate_direct_url(url, record.get("source") or "")
        except ValueError as exc:
            raise DownloadFailedError(str(exc)) from exc
        # Fail closed: delivery is a CDN redirect, so the record's sha256 is
        # the ONLY integrity anchor. No hash -> no unverifiable download
        # (positive-signal discipline, same posture as the classifier).
        if not (record.get("sha256") or "").strip():
            raise DownloadFailedError(
                "no sha256 on direct-URL record - refusing unverifiable download"
            )

        import requests  # lazy: keep module import light (mirrors civitai_search)

        job = self._jobs[model_id]
        cancel_event = self._cancel_events[model_id]
        target_dir = self._target_dir(record)
        target = os.path.join(target_dir, _direct_filename(model_id, record))
        incomplete = target + ".incomplete"

        response = self._direct_get(requests, url, token)
        hasher = hashlib.sha256()
        try:
            status = getattr(response, "status_code", 200)
            if isinstance(status, int) and status >= 400:
                # Typed HERE (not via map_hf_exception) so a direct-host
                # 401/403 never surfaces a huggingface.co gate URL.
                raise DownloadFailedError(
                    f"{record.get('source') or 'direct'} responded HTTP {status}"
                )

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

    def _direct_get(self, requests_module, url: str, token: Optional[str]):
        """Manual redirect walk for direct-URL delivery chains (review M-1).

        requests' automatic redirect following is disabled so the policy is
        explicit and testable: every hop must be https; the Bearer token is
        attached ONLY while the hop host is civitai.com (delivery CDNs must
        never see it; github assets need no token); the chain is capped. CDN
        hostnames are deliberately NOT allowlisted by name - they are
        infrastructure-volatile - because integrity comes from the mandatory
        sha256 over the final bytes and confidentiality from confining the
        secret to the first-party host.
        """
        current = url
        for _ in range(_CIVITAI_MAX_REDIRECTS):
            parsed = urlparse(current)
            if parsed.scheme != "https":
                raise DownloadFailedError(
                    "refusing non-https hop in direct-download redirect chain"
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
                    raise DownloadFailedError("direct download redirect without a Location header")
                current = urljoin(current, location)
                continue
            return response
        raise DownloadFailedError(
            f"direct download redirect chain exceeded {_CIVITAI_MAX_REDIRECTS} hops"
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
    "ip-adapter": "ip-adapter",
    "embedding": "embeddings",
    "annotator": "annotators",
}
