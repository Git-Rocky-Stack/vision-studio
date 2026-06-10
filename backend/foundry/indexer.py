"""Library tree indexer (Model Foundry M3, spec 4.1/4.3/4.5).

Walks one root, types artifacts (header trumps layout hint), computes quick
identity, and keeps (mtime_ns, size) signatures so unchanged files are never
re-read on subsequent scans.
"""

import hashlib
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from foundry.classifier import indexed_tier
from foundry.identity import quick_identity
from foundry.library_roots import layout_type_for
from foundry.model_record import ModelRecord
from foundry.safetensors_header import (
    HeaderError,
    classify_safetensors,
    detect_diffusers_dir,
    read_safetensors_header,
)

# signature dict: normalized path ->
#   [mtime_ns, size, artifact_type, identity, tier, tier_reason]
# Legacy pre-M4 entries carry only the first 4 fields; they are read-tolerated
# (type/identity reused, tier recomputed via one header re-read) and persisted
# back in the 6-entry form.
Signatures = Dict[str, List]


@dataclass
class IndexedArtifact:
    path: str
    artifact_type: str
    identity: str
    size_bytes: int
    mtime_ns: int
    root_id: str
    base_architecture: str = "unknown"
    # Tensor names from the already-read header (never persisted in
    # signatures; empty on signature hits, where tier is reused instead).
    header_keys: List[str] = field(default_factory=list)
    # Post-index tier verdict (spec 5.2); None means "not yet classified"
    # (hand-built artifacts), resolved lazily by artifact_to_record.
    tier: Optional[str] = None
    tier_reason: Optional[str] = None


def _dir_identity(dirpath: str) -> str:
    """Content-sensitive identity for a diffusers dir: identical pipelines in
    two roots merge (dedup); different pipelines sharing a dirname do not."""
    index_path = os.path.join(dirpath, "model_index.json")
    try:
        with open(index_path, "rb") as handle:
            digest = hashlib.sha256(handle.read()).hexdigest()[:16]
    except OSError:
        # Unreadable index: fall back to a per-path identity (no cross-root merge).
        digest = hashlib.sha256(
            os.path.normcase(os.path.normpath(dirpath)).encode("utf-8")
        ).hexdigest()[:16]
    return f"dir:{os.path.basename(dirpath)}:{digest}"


def _read_header_keys(path: str) -> List[str]:
    """Tensor names from the safetensors header; [] when unreadable."""
    try:
        header = read_safetensors_header(path)
    except HeaderError:
        return []
    return [key for key in header if key != "__metadata__"]


def _classify_file(path: str, layout_hint: str, relative: str) -> Tuple[str, List[str]]:
    """(artifact_type, header_keys) from ONE header read."""
    try:
        header = read_safetensors_header(path)
    except HeaderError:
        header = None
    if header is not None:
        header_type = classify_safetensors(header)
        header_keys = [key for key in header if key != "__metadata__"]
    else:
        header_type, header_keys = "unknown", []
    if header_type != "unknown":
        return header_type, header_keys  # the header is the authority (seed test 11)
    return layout_type_for(layout_hint, relative) or "unknown", header_keys


def scan_tree(
    root_path: str,
    layout_hint: str,
    root_id: str,
    signatures: Signatures,
) -> Tuple[List[IndexedArtifact], Signatures]:
    """Index one root. Returns (artifacts, next_signatures).

    Signature format (M4): [mtime_ns, size, artifact_type, identity, tier,
    tier_reason]. Legacy pre-M4 4-entry state is tolerated read-only: type and
    identity are reused, tier is recomputed via one header re-read, and the
    entry is persisted 6-wide. 6-entry hits never re-read headers.
    """
    artifacts: List[IndexedArtifact] = []
    next_signatures: Signatures = {}
    if not os.path.isdir(root_path):
        return artifacts, next_signatures

    for dirpath, dirnames, filenames in os.walk(root_path):
        if detect_diffusers_dir(dirpath):
            try:
                stat = os.stat(dirpath)
            except OSError:
                dirnames[:] = []  # pruning a vanished dir is still safe
                continue
            identity = _dir_identity(dirpath)
            # diffusers-pipeline tier is deliberately NOT persisted in the
            # signature cache: directories have no stable file-level cache key,
            # so the (constant until M5) verdict is re-derived per scan.
            dir_tier, dir_tier_reason = indexed_tier("diffusers-pipeline", [])
            artifacts.append(
                IndexedArtifact(
                    path=dirpath,
                    artifact_type="diffusers-pipeline",
                    identity=identity,
                    size_bytes=0,
                    mtime_ns=stat.st_mtime_ns,
                    root_id=root_id,
                    tier=dir_tier,
                    tier_reason=dir_tier_reason,
                )
            )
            dirnames[:] = []  # do not descend into pipeline component folders
            continue
        for filename in filenames:
            if not filename.endswith(".safetensors"):
                continue
            path = os.path.join(dirpath, filename)
            key = os.path.normcase(os.path.normpath(path))
            try:
                stat = os.stat(path)
            except OSError:
                continue
            cached = signatures.get(key)
            header_keys: List[str] = []
            if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
                artifact_type, identity = cached[2], cached[3]
                if len(cached) >= 6:
                    tier, tier_reason = cached[4], cached[5]
                else:
                    # Legacy pre-M4 4-entry state: type/identity stay trusted,
                    # tier needs ONE header re-read; persisted 6-wide below.
                    header_keys = _read_header_keys(path)
                    tier, tier_reason = indexed_tier(artifact_type, header_keys)
            else:
                relative = os.path.relpath(path, root_path)
                artifact_type, header_keys = _classify_file(path, layout_hint, relative)
                identity = quick_identity(path)
                tier, tier_reason = indexed_tier(artifact_type, header_keys)
            next_signatures[key] = [
                stat.st_mtime_ns,
                stat.st_size,
                artifact_type,
                identity,
                tier,
                tier_reason,
            ]
            artifacts.append(
                IndexedArtifact(
                    path=path,
                    artifact_type=artifact_type,
                    identity=identity,
                    size_bytes=stat.st_size,
                    mtime_ns=stat.st_mtime_ns,
                    root_id=root_id,
                    header_keys=header_keys,
                    tier=tier,
                    tier_reason=tier_reason,
                )
            )
    return artifacts, next_signatures


def artifact_to_record(
    artifact: IndexedArtifact,
    filename_reconciliation: Dict[str, str],
) -> ModelRecord:
    """IndexedArtifact -> ModelRecord (spec 4.6 reconciliation rules).

    A filename matching a verified single-file artifact reconciles to that
    catalog id (closing the M1 flat-file presence TODO); anything else becomes
    a stable `local-<hash16>` experimental record.
    """
    filename = os.path.basename(artifact.path)
    catalog_id = filename_reconciliation.get(filename)
    if catalog_id is not None:
        record_id = catalog_id
    else:
        digest = artifact.identity.split(":")[-1]
        record_id = f"local-{digest}"
    if artifact.tier is not None and artifact.tier_reason is not None:
        tier, tier_reason = artifact.tier, artifact.tier_reason
    else:
        tier, tier_reason = indexed_tier(artifact.artifact_type, artifact.header_keys or [])
    return ModelRecord(
        id=record_id,
        name=os.path.splitext(filename)[0],
        artifact_type=artifact.artifact_type,
        capability="image",
        base_architecture=artifact.base_architecture,
        source="linked",
        size=_human_size(artifact.size_bytes),
        status="ready",
        tier=tier,
        tier_reason=tier_reason,
        quality="local",
        description="Indexed from a linked library root.",
        locations=[artifact.path],
        identity=artifact.identity,
        library_root_id=artifact.root_id,
    )


def _human_size(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "Unknown"
    value = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
        value /= 1024
    return "Unknown"
