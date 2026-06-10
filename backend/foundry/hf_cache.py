"""huggingface_hub scan_cache_dir adapter (Model Foundry M3, spec 4.1 feed 2).

Defensive: the library is mocked/absent on CI, and real caches contain broken
entries (Spike B found two) — warnings are surfaced as degraded state, never
raised. Dedup is by repo_id + revision against the verified catalog.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from foundry.model_record import ModelRecord


def _scan():
    """Isolated for testability; raises ImportError when the hub is absent."""
    from huggingface_hub import scan_cache_dir

    return scan_cache_dir()


@dataclass
class HfCacheScan:
    records: List[ModelRecord] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def scan_hf_cache(catalog_by_repo: Dict[Tuple[str, str], str]) -> HfCacheScan:
    """Scan the local HF cache into ModelRecords.

    ``catalog_by_repo`` maps (repo_id, revision) -> catalog id; a cache repo
    matching a verified entry reconciles to that id (curated metadata wins at
    the registry merge); unknown repos become `hf-<org>--<name>` records.
    """
    result = HfCacheScan()
    try:
        info = _scan()
    except Exception as exc:  # ImportError, CacheNotFound, permission issues
        result.warnings.append(f"huggingface_hub unavailable: {exc}")
        return result

    for warning in getattr(info, "warnings", []) or []:
        result.warnings.append(str(warning))

    for repo in getattr(info, "repos", []) or []:
        if getattr(repo, "repo_type", "model") != "model":
            continue
        catalog_claimed = False
        for revision in getattr(repo, "revisions", []) or []:
            catalog_id = (
                catalog_by_repo.get((repo.repo_id, revision.commit_hash))
                or catalog_by_repo.get((repo.repo_id, "main"))
            )
            if catalog_id is not None and not catalog_claimed:
                record_id = catalog_id
                catalog_claimed = True
            elif catalog_id is not None:
                # A sibling revision already claimed the catalog id; this one
                # is a distinct snapshot and must keep a distinct identity.
                record_id = f"hf-{repo.repo_id.replace('/', '--')}--{revision.commit_hash[:8]}"
                catalog_id = None  # tier/quality fall to experimental/local
            else:
                record_id = f"hf-{repo.repo_id.replace('/', '--')}"
            result.records.append(
                ModelRecord(
                    id=record_id,
                    name=repo.repo_id,
                    artifact_type="diffusers-pipeline",
                    capability="image",
                    base_architecture="unknown",
                    source="huggingface",
                    repo_id=repo.repo_id,
                    revision=revision.commit_hash,
                    size=f"{(getattr(revision, 'size_on_disk', None) or repo.size_on_disk) / 1e9:.2f} GB",
                    status="ready",
                    tier="verified" if catalog_id else "experimental",
                    quality="balanced" if catalog_id else "local",
                    description="Indexed from the local Hugging Face cache.",
                    locations=[str(revision.snapshot_path)],
                    identity=f"hf:{repo.repo_id}@{revision.commit_hash}",
                )
            )
    return result
