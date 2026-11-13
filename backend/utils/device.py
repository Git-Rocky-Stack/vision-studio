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

import gc
import logging
import re
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)

_UNSET = object()

# "sm_75" (cubin) / "compute_120" (PTX) entries of torch.cuda.get_arch_list().
_ARCH_ENTRY = re.compile(r"^(?:sm|compute)_(\d+)(\d)[a-z]?$")

# Warn once per process per card: device resolution runs on every job.
_warned_unsupported: set = set()


def _import_torch() -> Optional[Any]:
    try:
        import torch  # noqa: PLC0415

        return torch
    except ImportError:
        return None


def _mps_backend(torch_module: Any) -> Optional[Any]:
    """torch.backends.mps when the running torch build carries it, else None."""
    return getattr(getattr(torch_module, "backends", None), "mps", None)


def _min_build_capability(torch_module: Any) -> Optional[Tuple[int, int]]:
    """The oldest compute capability the running torch build has kernels for.

    From ``torch.cuda.get_arch_list()`` (e.g. ``["sm_75", ..., "compute_120"]``
    for the cu132 wheels). Cubins run on their own major at an equal or higher
    minor and PTX JIT-compiles forward, so the minimum entry is the floor: no
    entry reaches a card below it. None when the build does not say.
    """
    try:
        entries = torch_module.cuda.get_arch_list()
    except Exception:  # noqa: BLE001 - an unanswerable probe proves nothing
        return None
    capabilities = []
    for entry in entries or ():
        match = _ARCH_ENTRY.match(str(entry))
        if match:
            capabilities.append((int(match.group(1)), int(match.group(2))))
    return min(capabilities) if capabilities else None


def cuda_unsupported_reason(torch_module: Any = _UNSET) -> Optional[str]:
    """Why a CUDA device torch can see still cannot run this build, or None.

    ``torch.cuda.is_available()`` only says a driver and a device answered: a
    GTX 10-series (Pascal, 6.1) is "available" to the CUDA 13.2 wheels, which
    ship no kernels for it, and the first real op dies with "no kernel image
    is available". This compares the device's compute capability with the
    build's arch list instead. None when CUDA is absent, the device is
    supported, or either fact cannot be read (no evidence of a gap is never
    treated as one).
    """
    torch = _import_torch() if torch_module is _UNSET else torch_module
    if torch is None:
        return None
    try:
        if not torch.cuda.is_available():
            return None
        capability = tuple(int(part) for part in torch.cuda.get_device_capability(0))
    except Exception:  # noqa: BLE001
        return None
    floor = _min_build_capability(torch)
    if floor is None or len(capability) != 2 or capability >= floor:
        return None
    try:
        name = str(torch.cuda.get_device_name(0))
    except Exception:  # noqa: BLE001
        name = "This NVIDIA GPU"
    cuda = getattr(getattr(torch, "version", None), "cuda", None)
    cuda_label = f"CUDA {cuda}" if cuda else "CUDA"
    reason = (
        f"{name} (compute capability {capability[0]}.{capability[1]}) is older than "
        f"this build's {cuda_label} kernels support ({floor[0]}.{floor[1]} or newer: "
        "RTX 20 / GTX 16 series and later). Generation runs on the CPU."
    )
    if name not in _warned_unsupported:
        _warned_unsupported.add(name)
        logger.warning("Unsupported CUDA GPU, falling back to CPU: %s", reason)
    return reason


def cuda_usable(torch_module: Any = _UNSET) -> bool:
    """CUDA is present AND this torch build has kernels for the device.

    The check every device decision in the backend goes through instead of a
    bare ``torch.cuda.is_available()``. Never raises.
    """
    torch = _import_torch() if torch_module is _UNSET else torch_module
    if torch is None:
        return False
    try:
        if not torch.cuda.is_available():
            return False
    except Exception:  # noqa: BLE001
        return False
    return cuda_unsupported_reason(torch) is None


def resolve_device(torch_module: Any = _UNSET) -> str:
    """"cuda" | "mps" | "cpu", strictly in that preference order.

    Any probe failure on a backend reads as that backend being absent - a
    wedged driver must degrade to the next rung, never crash device
    resolution (same truthful-degrade contract as foundry.hardware).
    """
    torch = _import_torch() if torch_module is _UNSET else torch_module
    if torch is None:
        return "cpu"
    # cuda_usable never raises: a wedged driver or a card this build has no
    # kernels for reads as no CUDA and degrades to the next rung.
    if cuda_usable(torch):
        return "cuda"
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
        if cuda_usable(torch):
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


def free_accelerator_memory(torch_module: Any = _UNSET) -> None:
    """THE "free GPU memory" helper: collect garbage, THEN empty the cache.

    ``empty_cache()`` alone frees nothing still referenced, and diffusers'
    offload hooks and attention processors hold models in reference cycles
    that survive ``del`` until the cycle collector runs. So the order is
    fixed: ``gc.collect()`` first (the cycles go, their tensors' blocks return
    to the caching allocator), then ``empty_device_cache`` (the allocator
    hands the blocks back to the driver), then CUDA ``ipc_collect`` for blocks
    shared across processes. This is the pattern tools/calibrate_vram.py
    validated on real hardware. Never raises.
    """
    gc.collect()
    torch = _import_torch() if torch_module is _UNSET else torch_module
    empty_device_cache(torch)
    if torch is None:
        return
    try:
        if cuda_usable(torch):
            torch.cuda.ipc_collect()
    except Exception:  # noqa: BLE001 - best-effort, like empty_device_cache
        pass


def process_reserved_vram_bytes(torch_module: Any = _UNSET) -> int:
    """Accelerator memory THIS process holds (resident pipelines + caches).

    A fit check measured with ``mem_get_info`` sees that memory as used, yet
    every byte of it is either the model the next job needs or gets evicted
    before the next load - so callers credit it back as reclaimable. CUDA:
    ``memory_reserved`` (the caching allocator's whole pool); MPS: the Metal
    driver allocation. 0 on CPU, without torch, or on any probe failure.
    """
    torch = _import_torch() if torch_module is _UNSET else torch_module
    if torch is None:
        return 0
    try:
        if cuda_usable(torch):
            return int(torch.cuda.memory_reserved())
    except Exception:  # noqa: BLE001
        pass
    try:
        mps = _mps_backend(torch)
        if mps is not None and mps.is_available():
            return int(torch.mps.driver_allocated_memory())
    except Exception:  # noqa: BLE001
        pass
    return 0


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
