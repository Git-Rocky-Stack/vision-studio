"""HF hub search -> classified SearchResult list. Network only via the passed
api / fetch_signals callables.

Supply-chain rail (Codex M4 review H-1): listing data is PARTIAL - tags but no
file/config census - so it cannot prove "no remote code" or "safetensors
tree". A verdict that would be Compatible from partial signals is therefore
re-verified against full repo signals before it is surfaced; if the full
fetch fails, the result fails closed to Experimental. Non-Compatible partial
verdicts never trigger the extra fetch (no request amplification).

Performance (P6): the per-candidate verification fetches run concurrently on
a small bounded pool instead of one after another, and an optional
HubSearchCache (owned by the caller, e.g. main.py) keeps listings and
successful full-signal fetches for a short TTL, so paging forward or repeating
a query re-uses work instead of re-hitting the hub.
"""

import hashlib
import itertools
import re
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Hashable, List, Optional, Set, Tuple

from foundry.classifier import TierVerdict, classify_repo
from foundry.hub_signals import RepoSignals, fetch_repo_signals, signals_from_listing

_SORT_FIELDS = {"downloads", "likes", "lastModified"}

# At most this many full-signal fetches run concurrently per search: enough to
# hide hub latency for a 20-result page without hammering the API.
MAX_PARALLEL_VERIFICATIONS = 6

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


class HubSearchCache:
    """Thread-safe TTL + LRU cache for hub listings and full repo signals.

    Keys always include a token *scope* (see ``token_scope``) - never the
    token itself - because a token can widen what a listing or a gated
    repo's signals reveal.

    Only reachable (successful) full signals are cached: a failed fetch is
    retried next time, never pinned as an Experimental verdict.
    """

    def __init__(
        self,
        ttl_seconds: float = 600.0,
        max_entries: int = 256,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._entries: "OrderedDict[Hashable, Tuple[float, Any]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: Hashable) -> Optional[Any]:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            stored_at, value = entry
            if self._clock() - stored_at > self._ttl:
                del self._entries[key]
                return None
            self._entries.move_to_end(key)
            return value

    def put(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._entries[key] = (self._clock(), value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


def token_scope(token: Optional[str]) -> str:
    """Opaque cache namespace for a hub token (a hash; the token is never kept)."""
    if not token:
        return "anonymous"
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


def _listing_raw(item) -> Dict[str, Any]:
    return {
        "id": item.id,
        "library_name": getattr(item, "library_name", None),
        "pipeline_tag": getattr(item, "pipeline_tag", None),
        "tags": getattr(item, "tags", None) or [],
        "gated": getattr(item, "gated", False),
        "downloads": getattr(item, "downloads", 0) or 0,
        "likes": getattr(item, "likes", 0) or 0,
        "author": getattr(item, "author", None),
    }


def _fetch_listing(
    api,
    list_kwargs: Dict[str, Any],
    needed: int,
    cache: Optional[HubSearchCache],
    cache_key: Hashable,
) -> List[Dict[str, Any]]:
    """The first ``needed`` listing entries, re-using a cached longer prefix.

    The hub's list endpoint has no offset, so page N needs the first
    N*page_size entries. A cached prefix that is long enough (or that already
    reached the end of the results) answers without a request, and the
    response generator is consumed lazily (islice) - never past ``needed``.
    """
    if cache is not None:
        cached = cache.get(cache_key)
        if cached is not None:
            entries, exhausted = cached
            if len(entries) >= needed or exhausted:
                return entries[:needed]
    listings = api.list_models(limit=needed, full=False, **list_kwargs)
    entries = [_listing_raw(item) for item in itertools.islice(listings, needed)]
    if cache is not None:
        cache.put(cache_key, (entries, len(entries) < needed))
    return entries


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
    cache: Optional[HubSearchCache] = None,
    cache_scope: str = "anonymous",
) -> List[SearchResult]:
    """One page of classified HF results. Caller owns error handling/offline.

    ``fetch_signals`` provides full-fidelity repo signals for verifying
    Compatible candidates (defaults to the unauthenticated live fetch; the
    API route injects a token-bearing closure). ``cache`` with
    ``cache_scope=token_scope(token)`` re-uses listings and signals across
    requests for the cache's TTL."""
    fetch = fetch_signals or fetch_repo_signals
    page = max(1, page)
    page_size = max(1, page_size)
    sort_field = sort if sort in _SORT_FIELDS else "downloads"
    list_kwargs = {
        "search": query or None,
        "pipeline_tag": task,
        "library": "diffusers",
        "author": author,
        "tags": tags,
        "sort": sort_field,
        "direction": -1,
    }
    listing_key = (
        "listing", cache_scope, query or None, task, author,
        tuple(tags) if tags else None, sort_field,
    )
    entries = _fetch_listing(api, list_kwargs, page * page_size, cache, listing_key)
    raws = entries[(page - 1) * page_size : page * page_size]

    classified: List[Tuple[Dict[str, Any], TierVerdict, bool]] = []
    for raw in raws:
        signals = signals_from_listing(raw)
        verdict = classify_repo(signals, verified_repo_ids)
        needs_full = verdict.tier == "compatible" and signals.partial
        classified.append((raw, verdict, needs_full))

    verified = _verify_all(
        [raw["id"] for raw, _, needs_full in classified if needs_full],
        verified_repo_ids,
        fetch,
        cache,
        cache_scope,
    )

    results: List[SearchResult] = []
    for raw, verdict, needs_full in classified:
        if needs_full:
            verdict = verified[raw["id"]]
        family = verdict.family
        results.append(
            SearchResult(
                id=_slug(raw["id"]),
                source="huggingface",
                name=raw["id"].split("/")[-1],
                repo_id=raw["id"],
                tier=verdict.tier,
                tier_reason=verdict.reason,
                base_architecture=family or "unknown",
                capability=_FAMILY_CAPABILITY.get(family or "", "image"),
                downloads=raw["downloads"],
                likes=raw["likes"],
                author=raw["author"],
                gated=bool(raw["gated"]),
                format=verdict.format,
                trust_remote_code=verdict.trust_remote_code,
                tags=[t for t in raw["tags"] if not t.startswith("diffusers:")][:12],
            )
        )
    return results


def _verify_all(
    repo_ids: List[str],
    verified_repo_ids: Set[str],
    fetch: Callable[[str], RepoSignals],
    cache: Optional[HubSearchCache],
    cache_scope: str,
) -> Dict[str, TierVerdict]:
    """Full-signal verdicts for every candidate, fetched concurrently (bounded)."""
    unique = list(dict.fromkeys(repo_ids))
    if not unique:
        return {}

    def cached_fetch(repo_id: str) -> RepoSignals:
        key = ("signals", cache_scope, repo_id)
        if cache is not None:
            hit = cache.get(key)
            if hit is not None:
                return hit
        signals = fetch(repo_id)
        if cache is not None and signals is not None and signals.reachable:
            cache.put(key, signals)
        return signals

    def verify(repo_id: str) -> TierVerdict:
        return _verify_partial_compatible(repo_id, verified_repo_ids, cached_fetch)

    if len(unique) == 1:
        return {unique[0]: verify(unique[0])}

    workers = min(MAX_PARALLEL_VERIFICATIONS, len(unique))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="hub-verify") as pool:
        return dict(zip(unique, pool.map(verify, unique)))


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
