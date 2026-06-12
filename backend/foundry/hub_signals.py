"""RepoSignals - everything the tier classifier consumes, parsed pre-download.

Pure parsing only; network fetch lives in fetch_repo_signals (lazy hub import,
always mocked in tests). Fixture parsing mirrors the Spike C corpus schema so
the corpus is the regression gate for this module too.
"""

import json
import os
import tempfile
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union


@dataclass
class RepoSignals:
    repo_id: str
    reachable: bool = True
    gated: Union[bool, str] = False          # False | "auto" | "manual"
    library_name: Optional[str] = None
    pipeline_tag: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    class_name: Optional[str] = None         # model_index > diffusers:<Class> tag > config
    has_auto_map: bool = False
    py_file_count: int = 0
    siblings: List[str] = field(default_factory=list)
    has_safetensors: bool = False
    per_file_keys: Dict[str, List[str]] = field(default_factory=dict)
    downloads: int = 0
    author: Optional[str] = None
    license: Optional[str] = None
    partial: bool = False                    # listing-level: no file census available


def _class_name(
    model_index: Optional[dict],
    tags: List[str],
    config: Optional[dict],
) -> Optional[str]:
    if model_index and model_index.get("_class_name"):
        return model_index["_class_name"]
    for tag in tags:
        if tag.startswith("diffusers:"):
            return tag.split(":", 1)[1]
    if config and config.get("_class_name"):
        return config["_class_name"]
    return None


def signals_from_fixture(fixture: Dict[str, Any]) -> RepoSignals:
    """Parse a Spike C corpus fixture (see classifier_corpus/README.md schema)."""
    repo_id = fixture["repo_id"]
    if not fixture.get("reachable"):
        return RepoSignals(repo_id=repo_id, reachable=False)
    tags = fixture.get("tags") or []
    config = fixture.get("config") or {}
    siblings = [s["name"] for s in fixture.get("siblings") or []]
    per_file = {
        name: (meta.get("detection_keys") or meta.get("sample_keys") or [])
        for name, meta in (fixture.get("safetensors_per_file") or {}).items()
    }
    return RepoSignals(
        repo_id=repo_id,
        reachable=True,
        gated=fixture.get("gated") or False,
        library_name=fixture.get("library_name"),
        pipeline_tag=fixture.get("pipeline_tag"),
        tags=tags,
        class_name=_class_name(fixture.get("model_index"), tags, config),
        has_auto_map="auto_map" in config,
        py_file_count=len(fixture.get("py_files") or []),
        siblings=siblings,
        has_safetensors=bool(fixture.get("has_safetensors")),
        per_file_keys=per_file,
        downloads=fixture.get("downloads") or 0,
        author=fixture.get("author"),
        license=fixture.get("license"),
    )


def signals_from_listing(listing: Dict[str, Any]) -> RepoSignals:
    """Parse one HfApi.list_models item (dict-ified). No file census at this level."""
    tags = listing.get("tags") or []
    return RepoSignals(
        repo_id=listing["id"],
        reachable=True,
        gated=listing.get("gated") or False,
        library_name=listing.get("library_name"),
        pipeline_tag=listing.get("pipeline_tag"),
        tags=tags,
        class_name=_class_name(None, tags, None),
        has_safetensors="safetensors" in tags,
        downloads=listing.get("downloads") or 0,
        author=listing.get("author"),
        partial=True,
    )


def fetch_repo_signals(repo_id: str, token: Optional[str] = None) -> RepoSignals:
    """Full-fidelity signals for one repo (detail view / pre-acquisition).

    Lazy hub import; any failure -> RepoSignals(reachable=False). Token is a
    LOCAL parameter, never stored or logged.

    Census (Codex M4 gate re-review): sibling NAMES alone cannot prove "no
    remote code" - ``auto_map`` lives inside config.json and may point at
    code in another repo (zero local .py files). For public repos the tiny
    config.json / model_index.json files are therefore fetched and parsed
    (the Spike C capture pattern); a census that cannot complete fails
    CLOSED (reachable=False -> callers default to Experimental / refuse the
    download). Gated repos cannot be file-fetched pre-license: they classify
    from tags + sibling names with the ladder's explicit "format verified
    after license accept" disclosure, and post-acquisition header inspection
    downgrades them if the bytes disagree.
    """
    try:
        from huggingface_hub import HfApi  # noqa: PLC0415

        api = HfApi(token=token)
        # files_metadata=False still returns sibling FILENAMES (the default
        # /api/models response); True only adds per-file size/LFS blobs we
        # don't consume here. license/per_file_keys stay unpopulated on the
        # live path - the classifier doesn't branch on either today.
        info = api.model_info(repo_id, files_metadata=False)
    except Exception:
        return RepoSignals(repo_id=repo_id, reachable=False)
    tags = info.tags or []
    siblings = [s.rfilename for s in (info.siblings or [])]
    gated = info.gated or False
    config = None
    model_index = None
    if not gated:
        try:
            config = _fetch_tiny_json(repo_id, "config.json", siblings, token)
            model_index = _fetch_tiny_json(repo_id, "model_index.json", siblings, token)
        except Exception:
            return RepoSignals(repo_id=repo_id, reachable=False)
    return RepoSignals(
        repo_id=repo_id,
        reachable=True,
        gated=gated,
        library_name=info.library_name,
        pipeline_tag=info.pipeline_tag,
        tags=tags,
        class_name=_class_name(model_index, tags, config),
        has_auto_map=bool(config) and "auto_map" in config,
        py_file_count=sum(1 for s in siblings if s.lower().endswith(".py")),
        siblings=siblings,
        has_safetensors=any(s.endswith(".safetensors") for s in siblings),
        downloads=info.downloads or 0,
        author=info.author,
    )


def _fetch_tiny_json(
    repo_id: str, filename: str, siblings: List[str], token: Optional[str]
) -> Optional[dict]:
    """Fetch one tiny root-level JSON if the repo ships it, else None.

    Downloads into a dedicated probe cache (never the user's HF cache - these
    are pre-consent probes of arbitrary repos). Raises on any failure so the
    caller can fail closed.
    """
    if filename not in siblings:
        return None
    import huggingface_hub  # noqa: PLC0415

    path = huggingface_hub.hf_hub_download(
        repo_id,
        filename,
        token=token,
        cache_dir=os.path.join(tempfile.gettempdir(), "vision-studio-signal-probe"),
    )
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{filename} is not a JSON object")
    return data
