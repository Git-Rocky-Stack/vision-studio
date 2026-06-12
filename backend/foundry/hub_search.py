"""HF hub search -> classified SearchResult list. Network only via the passed
api / fetch_signals callables.

Supply-chain rail (Codex M4 review H-1): listing data is PARTIAL - tags but no
file/config census - so it cannot prove "no remote code" or "safetensors
tree". A verdict that would be Compatible from partial signals is therefore
re-verified against full repo signals before it is surfaced; if the full
fetch fails, the result fails closed to Experimental. Non-Compatible partial
verdicts never trigger the extra fetch (no request amplification).
"""

import re
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Set

from foundry.classifier import TierVerdict, classify_repo
from foundry.hub_signals import RepoSignals, fetch_repo_signals, signals_from_listing

_SORT_FIELDS = {"downloads", "likes", "lastModified"}

_UNVERIFIED_REASON = (
    "compatible by tags only - full repo signals unverifiable, defaulting to experimental"
)


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
    fetch_signals: Optional[Callable[[str], RepoSignals]] = None,
) -> List[SearchResult]:
    """One page of classified HF results. Caller owns error handling/offline.

    ``fetch_signals`` provides full-fidelity repo signals for verifying
    Compatible candidates (defaults to the unauthenticated live fetch; the
    API route injects a token-bearing closure)."""
    fetch = fetch_signals or fetch_repo_signals
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
        if verdict.tier == "compatible" and signals.partial:
            verdict = _verify_partial_compatible(item.id, verified_repo_ids, fetch)
        family = verdict.family
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


def _verify_partial_compatible(
    repo_id: str,
    verified_repo_ids: Set[str],
    fetch: Callable[[str], RepoSignals],
) -> TierVerdict:
    """Re-run the ladder on full signals before surfacing Compatible.

    Fail closed: an unreachable repo or a fetch failure of any kind yields an
    honest Experimental - never the optimistic tag-derived verdict. The
    failure detail is deliberately not echoed (it can carry URLs)."""
    try:
        full = fetch(repo_id)
    except Exception:
        full = None
    if full is None or not full.reachable:
        return TierVerdict("experimental", _UNVERIFIED_REASON)
    return classify_repo(full, verified_repo_ids)

