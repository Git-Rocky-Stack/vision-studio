"""Cheap artifact identity (spec section 4.3): size + head/tail-64KB sha256.

Full sha256 is computed lazily (background, post-scan) for verification and
provenance — never during a scan.
"""

import hashlib
import os

_WINDOW = 65536


def quick_identity(path: str) -> str:
    """'<size>:<first 16 hex of sha256(head||tail)>' — stable, collision-cheap."""
    size = os.path.getsize(path)
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        digest.update(handle.read(_WINDOW))
        if size > 2 * _WINDOW:
            handle.seek(-_WINDOW, os.SEEK_END)
            digest.update(handle.read(_WINDOW))
    return f"{size}:{digest.hexdigest()[:16]}"


def full_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
