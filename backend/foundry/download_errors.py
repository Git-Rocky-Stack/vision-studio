"""Typed download errors for the Model Foundry acquisition engine.

Imports the huggingface_hub exception classes defensively so this module
loads with no network, no torch, and even when hf is not installed (CI mocks
the library). The mapping in ``map_hf_exception`` is what the DownloadManager
calls in its except-handler to turn raw library failures into our typed,
surfaceable errors.
"""

from typing import Optional

# Defensive, lazy import: CI may not have huggingface_hub on the image, and we
# must never import torch transitively at module load. Anything we cannot bind
# becomes a sentinel class that isinstance() never matches.
try:  # pragma: no cover - exercised indirectly
    from huggingface_hub.errors import (  # type: ignore[import-not-found]
        EntryNotFoundError,
        GatedRepoError,
        RepositoryNotFoundError,
    )
except Exception:  # pragma: no cover - hf not importable in this environment
    class _UnbindableHfError(Exception):
        """Sentinel — never matched by isinstance against real exceptions."""

    GatedRepoError = _UnbindableHfError  # type: ignore[assignment,misc]
    EntryNotFoundError = _UnbindableHfError  # type: ignore[assignment,misc]
    RepositoryNotFoundError = _UnbindableHfError  # type: ignore[assignment,misc]


class DownloadError(Exception):
    """Base class for every typed acquisition error."""


class DiskSpaceError(DownloadError):
    """Aggregate preflight refused the download: not enough free space."""

    def __init__(self, required: int, available: int):
        self.required = required
        self.available = available
        super().__init__(
            f"Insufficient disk space: need {required} bytes, {available} available"
        )


class GatedModelError(DownloadError):
    """The repo is license-gated (HTTP 401/403). Surface the gate URL CTA."""

    def __init__(self, repo_id: str, gate_url: str):
        self.repo_id = repo_id
        self.gate_url = gate_url
        super().__init__(f"Model '{repo_id}' is gated. Accept the license at {gate_url}")


class DownloadCancelledError(DownloadError):
    """Cooperative cancellation/pause was requested mid-download."""


class DownloadFailedError(DownloadError):
    """A typed, surfaced failure (not-found, integrity, or generic)."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"Download failed: {reason}")


class IntegrityError(DownloadFailedError):
    """A downloaded file's bytes do not match the pinned hash.

    The partial/corrupt file is deleted before this is raised, so tampered or
    truncated bytes can never present as ready.
    """

    def __init__(self, path: str):
        self.path = path
        super().__init__(f"integrity: hash mismatch for {path} - corrupt or tampered download")


class RemoteCodeUnsupportedError(DownloadError):
    """The model needs repo-authored Python (``trust_remote_code``) to load.

    No loader in Vision Studio executes repo code (runtime_resolver refuses
    every such record), so acquiring the bytes could only ever produce a model
    that never runs. Refused up front, before anything is queued - consent
    cannot unlock it.
    """

    error_code = "remote-code-unsupported"

    def __init__(self, model_id: str):
        self.model_id = model_id
        super().__init__(
            f"Model '{model_id}' requires running code authored by the repo. "
            "Vision Studio never executes repo code, so this model cannot be "
            "downloaded or run."
        )


def _http_status(exc: Exception) -> Optional[int]:
    """Best-effort extraction of an HTTP status code from an hf/requests error."""
    response = getattr(exc, "response", None)
    code = getattr(response, "status_code", None)
    if isinstance(code, int):
        return code
    code = getattr(exc, "status_code", None)
    return code if isinstance(code, int) else None


def map_hf_exception(exc: Exception, *, repo_id: str) -> DownloadError:
    """Translate a raw exception into a typed DownloadError.

    Idempotent for our own errors (passes them through). Gated (401/403 or
    GatedRepoError) -> GatedModelError with the repo gate URL; not-found ->
    DownloadFailedError; a size-consistency OSError -> integrity failure;
    anything else -> a generic DownloadFailedError.
    """
    if isinstance(exc, DownloadError):
        return exc

    status = _http_status(exc)
    if isinstance(exc, GatedRepoError) or status in (401, 403):
        return GatedModelError(
            repo_id=repo_id, gate_url=f"https://huggingface.co/{repo_id}"
        )

    if isinstance(exc, (EntryNotFoundError, RepositoryNotFoundError)):
        return DownloadFailedError("not_found")

    if isinstance(exc, OSError):
        # huggingface_hub raises OSError from http_get when the downloaded size
        # does not match the expected size (the built-in integrity backstop).
        return DownloadFailedError("integrity")

    return DownloadFailedError(str(exc) or exc.__class__.__name__)
