"""Torch compute-device seam - CUDA first, Apple MPS second, CPU last.

Every module that places tensors resolves its device HERE so the platform
story lives in one file: Windows/Linux bundles ship CUDA torch
(build-backend.cjs install ladder), the macOS arm64 bundle ships the default
wheel whose GPU backend is Metal/MPS. CUDA always wins when present, so
existing Windows/Linux behavior is byte-identical.

Import-safe: torch is imported lazily and its absence (the lightweight
CI/test env) degrades to "cpu"/no-ops - never an ImportError at module load.
Callers that hold their own module-level ``torch`` (patched by tests) pass
it in explicitly; the parameter defaults to a lazy import.
"""

from typing import Any, Optional

_UNSET = object()


def _import_torch() -> Optional[Any]:
    try:
        import torch  # noqa: PLC0415

        return torch
    except ImportError:
        return None


def _mps_backend(torch_module: Any) -> Optional[Any]:
    """torch.backends.mps when the running torch build carries it, else None."""
    return getattr(getattr(torch_module, "backends", None), "mps", None)


def resolve_device(torch_module: Any = _UNSET) -> str:
    """"cuda" | "mps" | "cpu", strictly in that preference order.

    Any probe failure on a backend reads as that backend being absent - a
    wedged driver must degrade to the next rung, never crash device
    resolution (same truthful-degrade contract as foundry.hardware).
    """
    torch = _import_torch() if torch_module is _UNSET else torch_module
    if torch is None:
        return "cpu"
    try:
        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # noqa: BLE001 - degrade, never raise
        pass
    try:
        mps = _mps_backend(torch)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception:  # noqa: BLE001
        pass
    return "cpu"


def empty_device_cache(torch_module: Any = _UNSET) -> None:
    """Release cached allocator blocks on whichever accelerator is active.

    Safe no-op on CPU-only machines and when torch is absent; never raises
    (cache release is an optimization, not a correctness requirement).
    """
    torch = _import_torch() if torch_module is _UNSET else torch_module
    if torch is None:
        return
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            return
    except Exception:  # noqa: BLE001
        pass
    try:
        mps = _mps_backend(torch)
        if mps is not None and mps.is_available():
            torch.mps.empty_cache()
    except Exception:  # noqa: BLE001
        pass


def is_out_of_memory(exc: BaseException) -> bool:
    """True when exc is an accelerator out-of-memory condition on ANY backend.

    CUDA raises the dedicated torch.cuda.OutOfMemoryError; MPS and the CPU
    allocator raise plain RuntimeError whose message carries "out of memory"
    ("MPS backend out of memory ...", "[enforce fail ...] alloc failed").
    Matched by class NAME (not identity) so stubbed torch modules in tests
    and real torch agree; a ModelLoadRefusedError or any other RuntimeError
    without the marker is never treated as OOM.
    """
    if type(exc).__name__ == "OutOfMemoryError":
        return True
    return isinstance(exc, RuntimeError) and "out of memory" in str(exc).lower()
