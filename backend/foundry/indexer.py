"""Library tree indexer (Model Foundry M3, spec 4.1/4.3/4.5).

Walks one root, types artifacts (header trumps layout hint), computes quick
identity, and keeps (mtime_ns, size) signatures so unchanged files are never
re-read on subsequent scans.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from foundry.identity import quick_identity
from foundry.library_roots import layout_type_for
from foundry.model_record import ModelRecord
from foundry.safetensors_header import (
    HeaderError,
    classify_safetensors,
    detect_diffusers_dir,
    read_safetensors_header,
)

# signature dict: normalized path -> [mtime_ns, size, artifact_type, identity]
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


def _classify_file(path: str, layout_hint: str, relative: str) -> str:
    try:
        header_type = classify_safetensors(read_safetensors_header(path))
    except HeaderError:
        header_type = "unknown"
    if header_type != "unknown":
        return header_type  # the header is the authority (seed test 11)
    return layout_type_for(layout_hint, relative) or "unknown"


def scan_tree(
    root_path: str,
    layout_hint: str,
    root_id: str,
    signatures: Signatures,
) -> Tuple[List[IndexedArtifact], Signatures]:
    """Index one root. Returns (artifacts, next_signatures)."""
    artifacts: List[IndexedArtifact] = []
    next_signatures: Signatures = {}
    if not os.path.isdir(root_path):
        return artifacts, next_signatures

    for dirpath, dirnames, filenames in os.walk(root_path):
        if detect_diffusers_dir(dirpath):
            stat = os.stat(dirpath)
            artifacts.append(
                IndexedArtifact(
                    path=dirpath,
                    artifact_type="diffusers-pipeline",
                    identity=f"dir:{os.path.basename(dirpath)}",
                    size_bytes=0,
                    mtime_ns=stat.st_mtime_ns,
                    root_id=root_id,
                )
            )
            dirnames[:] = []  # do not descend into pipeline component folders
            continue
        for filename in filenames:
            if not filename.endswith(".safetensors"):
                continue
            path = os.path.join(dirpath, filename)
            key = os.path.normcase(os.path.normpath(path))
            stat = os.stat(path)
            cached = signatures.get(key)
            if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
                artifact_type, identity = cached[2], cached[3]
            else:
                relative = os.path.relpath(path, root_path)
                artifact_type = _classify_file(path, layout_hint, relative)
                identity = quick_identity(path)
            next_signatures[key] = [stat.st_mtime_ns, stat.st_size, artifact_type, identity]
            artifacts.append(
                IndexedArtifact(
                    path=path,
                    artifact_type=artifact_type,
                    identity=identity,
                    size_bytes=stat.st_size,
                    mtime_ns=stat.st_mtime_ns,
                    root_id=root_id,
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
    return ModelRecord(
        id=record_id,
        name=os.path.splitext(filename)[0],
        artifact_type=artifact.artifact_type,
        capability="image",
        base_architecture=artifact.base_architecture,
        source="linked",
        size=_human_size(artifact.size_bytes),
        status="ready",
        tier="experimental",
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
