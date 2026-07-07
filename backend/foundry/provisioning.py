"""#34 installer: build the comprehensive auto-provision manifest.

The auto-set is every ``verified-catalog.json`` model whose license permits
redistribution (bundling / hosting on the Vision Studio mirror + provisioning
on the user's behalf), MINUS the FLUX.1-dev non-commercial family. Fragile or
dead upstreams are repinned through ``provision-overrides.json`` (e.g. the
deleted ``runwayml/stable-diffusion-v1-5`` -> the permanent community mirror).

Pure data - imports cleanly on stub CI (no torch). The manifest names *which*
models form the auto-set and how to reach + attribute each; the existing
``DownloadManager.enqueue`` owns filename resolution, the download, and the
integrity check. Integrity anchors match that manager's discipline:

* direct-URL records carry a literal ``sha256`` (the only integrity anchor for
  a CDN redirect - the manager refuses an unverifiable direct download);
* HuggingFace records verify each file's LFS hash against the pinned revision.

Fail-closed throughout: a model whose license is unknown or non-redistributable
never enters the auto-set - it drops to ``manual_only`` with a recorded reason.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from foundry.licenses import classify_license

SCHEMA = 1

# The FLUX.1 [dev] non-commercial family - never bundled or mirrored. Stays
# Foundry-manual so the user personally accepts the gate + non-commercial terms.
EXCLUDED_NON_COMMERCIAL = (
    "flux-dev",
    "flux-fill",
    "controlnet-union-flux",
    "ip-adapter-flux",
)

_HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG_PATH = os.path.join(_HERE, "verified-catalog.json")
OVERRIDES_PATH = os.path.join(_HERE, "provision-overrides.json")

_UNIT = {"KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3, "TB": 1024 ** 4}


def approx_bytes(size: Optional[str]) -> Optional[int]:
    """Approximate byte count from a human catalog size string ('~4.3 GB')."""
    if not size:
        return None
    match = re.search(r"([\d.]+)\s*(KB|MB|GB|TB)", size, re.IGNORECASE)
    if not match:
        return None
    return int(float(match.group(1)) * _UNIT[match.group(2).upper()])


def _source(record: Dict[str, Any], repin: Dict[str, Any]) -> Dict[str, Any]:
    """Reach spec for one model: a direct URL (+sha256) or a pinned HF repo."""
    download_url = record.get("download_url")
    if download_url:
        return {
            "kind": "url",
            "url": download_url,
            "sha256": (record.get("sha256") or "").strip().lower() or None,
        }
    return {
        "kind": "hf",
        "repo_id": repin.get("repo_id") or record.get("repo_id"),
        "revision": repin.get("revision") or record.get("revision") or "main",
    }


def _entry(record: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    model_id = record["id"]
    info = classify_license(record.get("license"))
    repin = (overrides.get("repin") or {}).get(model_id, {})
    entry = {
        "id": model_id,
        "artifact_type": record.get("artifact_type"),
        "license": (record.get("license") or "").strip().lower() or None,
        "license_category": info.category,
        "attribution": info.attribution,
        "gated": bool(record.get("gated")),
        "source": _source(record, repin),
        "approx_bytes": approx_bytes(record.get("size")),
    }
    if repin.get("reason"):
        entry["repin_reason"] = repin["reason"]
    return entry


def build_provision_manifest(
    catalog: Dict[str, Any], overrides: Dict[str, Any]
) -> Dict[str, Any]:
    """Build the deterministic auto-provision manifest from catalog + overrides.

    Partitions every catalog record into exactly one of: ``auto_set`` (bundled),
    ``excluded_non_commercial`` (FLUX-nc, Foundry-manual), or ``manual_only``
    (license unknown / not redistributable). Nothing is silently dropped.
    """
    auto_set: List[Dict[str, Any]] = []
    excluded: List[str] = []
    manual_only: List[Dict[str, Any]] = []

    for model_id, record in catalog.items():
        if not isinstance(record, dict) or "id" not in record:
            continue  # skip any catalog metadata / non-record keys
        if model_id in EXCLUDED_NON_COMMERCIAL:
            excluded.append(model_id)
            continue
        info = classify_license(record.get("license"))
        if not info.redistributable:
            manual_only.append({
                "id": model_id,
                "artifact_type": record.get("artifact_type"),
                "license": (record.get("license") or "").strip().lower() or None,
                "reason": f"license-not-redistributable:{info.category}",
            })
            continue
        auto_set.append(_entry(record, overrides))

    auto_set.sort(key=lambda e: e["id"])
    manual_only.sort(key=lambda e: e["id"])
    total = sum(e["approx_bytes"] or 0 for e in auto_set)

    return {
        "schema": SCHEMA,
        "auto_set": auto_set,
        "excluded_non_commercial": sorted(excluded),
        "manual_only": manual_only,
        "total_approx_bytes": total,
    }


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_provision_manifest() -> Dict[str, Any]:
    """Build the manifest from the on-disk catalog + overrides."""
    catalog = _load_json(CATALOG_PATH)
    overrides = _load_json(OVERRIDES_PATH) if os.path.exists(OVERRIDES_PATH) else {}
    return build_provision_manifest(catalog, overrides)
