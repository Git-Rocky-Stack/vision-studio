"""HF hub search -> classified SearchResult list. Network only via the passed api."""

import re
from dataclasses import dataclass, field
from typing import List, Optional, Set

from foundry.classifier import classify_repo
from foundry.hub_signals import signals_from_listing

_SORT_FIELDS = {"downloads", "likes", "lastModified"}


@dataclass
class SearchResult:
    id: str                      # registry slug: search-hf--<sanitized repo>
    source: str                  # "huggingface" | "civitai"
    name: str
    repo_id: Optional[str]
    tier: str
    tier_reason: str
    artifact_type: str = "diffusers-pipeline"
    base_architecture: str = "unknown"
    downloads: int = 0
    likes: int = 0
    author: Optional[str] = None
    license: Optional[str] = None
    gated: bool = False
    nsfw: bool = False
    format: Optional[str] = None
    trust_remote_code: bool = False
    size: str = "Unknown"
    download_url: Optional[str] = None
    sha256: Optional[str] = None
    capability: str = "image"
    tags: List[str] = field(default_factory=list)


def _slug(repo_id: str) -> str:
    return "search-hf--" + re.sub(r"[^A-Za-z0-9._-]", "-", repo_id)


_FAMILY_CAPABILITY = {"ltx": "video", "svd": "video", "animatediff": "video"}


def search_hf(
    api,
    query: str,
    verified_repo_ids: Set[str],
    task: Optional[str] = None,
    sort: str = "downloads",
    page: int = 1,
    page_size: int = 20,
    author: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[SearchResult]:
    """One page of classified HF results. Caller owns error handling/offline."""
    page = max(1, page)
    sort_field = sort if sort in _SORT_FIELDS else "downloads"
    listings = api.list_models(
        search=query or None,
        pipeline_tag=task,
        library="diffusers",
        author=author,
        tags=tags,
        sort=sort_field,
        direction=-1,
        limit=page * page_size,
        full=False,
    )
    items = list(listings)[(page - 1) * page_size : page * page_size]
    results: List[SearchResult] = []
    for item in items:
        raw = {
            "id": item.id,
            "library_name": getattr(item, "library_name", None),
            "pipeline_tag": getattr(item, "pipeline_tag", None),
            "tags": getattr(item, "tags", None) or [],
            "gated": getattr(item, "gated", False),
            "downloads": getattr(item, "downloads", 0) or 0,
            "author": getattr(item, "author", None),
        }
        signals = signals_from_listing(raw)
        verdict = classify_repo(signals, verified_repo_ids)
        family = _family_from_reason(verdict.reason)
        results.append(
            SearchResult(
                id=_slug(item.id),
                source="huggingface",
                name=item.id.split("/")[-1],
                repo_id=item.id,
                tier=verdict.tier,
                tier_reason=verdict.reason,
                base_architecture=family or "unknown",
                capability=_FAMILY_CAPABILITY.get(family or "", "image"),
                downloads=raw["downloads"],
                likes=getattr(item, "likes", 0) or 0,
                author=raw["author"],
                gated=bool(raw["gated"]),
                format=verdict.format,
                trust_remote_code=verdict.trust_remote_code,
                tags=[t for t in raw["tags"] if not t.startswith("diffusers:")][:12],
            )
        )
    return results


def _family_from_reason(reason: str) -> Optional[str]:
    for family in ("sdxl", "sd15", "sd35", "flux", "ltx", "svd", "animatediff"):
        if f" {family} " in f" {reason} " or f"{family} " in reason:
            return family
    return None
