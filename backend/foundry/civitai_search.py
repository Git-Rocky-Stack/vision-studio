"""CivitAI search. Spike C bonus findings applied: format=PickleTensor is the
pickle channel, baseModel is CivitAI vocabulary (mapped, never guessed), NSFW
is filtered by default with explicit opt-in, latency variance is real ->
hard timeouts; the caller layers offline-degrade.
"""

from typing import List, Optional

from foundry.hub_search import SearchResult

CIVITAI_API = "https://civitai.com/api/v1/models"
_TIMEOUT = (5, 30)  # connect, read - uncached CivitAI queries measured >20s

# CivitAI baseModel vocabulary -> our families. Unknown -> None -> experimental.
CIVITAI_BASE_FAMILY = {
    "SD 1.4": "sd15",
    "SD 1.5": "sd15",
    "SD 1.5 LCM": "sd15",
    "SDXL 0.9": "sdxl",
    "SDXL 1.0": "sdxl",
    "SDXL 1.0 LCM": "sdxl",
    "SDXL Turbo": "sdxl",
    "SDXL Lightning": "sdxl",
    "Pony": "sdxl",
    "Illustrious": "sdxl",
    "NoobAI": "sdxl",
    "Flux.1 D": "flux",
    "Flux.1 S": "flux",
    "SD 3.5": "sd35",
    "SD 3.5 Medium": "sd35",
    "SD 3.5 Large": "sd35",
    "SD 3.5 Large Turbo": "sd35",
    "SVD": "svd",
    "SVD XT": "svd",
    "LTXV": "ltx",
}

_TYPE_TO_ARTIFACT = {
    "Checkpoint": "checkpoint",
    "LORA": "lora",
    "LoCon": "lora",
    "DoRA": "lora",
    "TextualInversion": "embedding",
    "VAE": "vae",
    "Controlnet": "controlnet",
}


def _classify_civitai(item_type: str, family: Optional[str], fmt: Optional[str]):
    """(tier, reason). Compatible is loras-of-known-family + SafeTensor only -
    the only one-click load path that exists today (Spike C adjustment 4)."""
    if fmt == "pickle":
        return "experimental", "pickle weights - requires explicit consent (convert to safetensors offered)"
    if family is None:
        return "experimental", "base model vocabulary unrecognized - never guessed"
    artifact = _TYPE_TO_ARTIFACT.get(item_type, "unknown")
    if artifact == "lora" and family in ("sd15", "sdxl", "flux", "sd35"):
        return "compatible", f"standalone {family} lora - safetensors - loads via load_lora_weights"
    if artifact == "checkpoint":
        return "experimental", f"{family} single-file checkpoint - load path lands with M5 from_single_file"
    return "experimental", f"{item_type} for {family} - wiring lands with M5 runtime resolution"


def search_civitai(
    query: str,
    session=None,
    types: Optional[List[str]] = None,
    base_models: Optional[List[str]] = None,
    include_nsfw: bool = False,
    sort: str = "Most Downloaded",
    page_size: int = 20,
    token: Optional[str] = None,
) -> List[SearchResult]:
    """One page of classified CivitAI results. Caller owns offline handling."""
    if session is None:
        import requests

        session = requests
    params = {
        "query": query,
        "limit": page_size,
        "sort": sort,
        "nsfw": "true" if include_nsfw else "false",
    }
    if types:
        params["types"] = types
    if base_models:
        params["baseModels"] = base_models
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = session.get(CIVITAI_API, params=params, headers=headers, timeout=_TIMEOUT)
    if hasattr(resp, "raise_for_status"):
        resp.raise_for_status()
    items = resp.json().get("items", [])

    results: List[SearchResult] = []
    for item in items:
        nsfw = bool(item.get("nsfw"))
        if nsfw and not include_nsfw:
            continue  # client-side guard on top of the API param
        versions = item.get("modelVersions") or []
        if not versions:
            continue
        version = versions[0]
        files = version.get("files") or []
        primary = files[0] if files else {}
        meta = primary.get("metadata") or {}
        fmt = {"SafeTensor": "safetensors", "PickleTensor": "pickle"}.get(meta.get("format"))
        family = CIVITAI_BASE_FAMILY.get(version.get("baseModel") or "")
        tier, reason = _classify_civitai(item.get("type") or "", family, fmt)
        sha256 = ((primary.get("hashes") or {}).get("SHA256") or "").lower() or None
        download_url = primary.get("downloadUrl")
        size_kb = primary.get("sizeKB") or 0
        results.append(
            SearchResult(
                id=f"search-civitai--{item['id']}-{version.get('id', 0)}",
                source="civitai",
                name=item.get("name") or f"civitai-{item['id']}",
                repo_id=None,
                tier=tier,
                tier_reason=reason,
                artifact_type=_TYPE_TO_ARTIFACT.get(item.get("type") or "", "unknown"),
                base_architecture=family or "unknown",
                downloads=(item.get("stats") or {}).get("downloadCount", 0),
                likes=(item.get("stats") or {}).get("thumbsUpCount", 0),
                author=(item.get("creator") or {}).get("username"),
                nsfw=nsfw,
                format=fmt,
                size=f"{size_kb / 1024 / 1024:.1f} GB" if size_kb else "Unknown",
                download_url=download_url,
                sha256=sha256,
            )
        )
    return results
