"""#34 installer: build the comprehensive auto-provision manifest.

The auto-set is every ``verified-catalog.json`` model whose license permits
redistribution (bundling / hosting on the Vision Studio mirror + provisioning
on the user's behalf), MINUS the FLUX.1-dev non-commercial family, PLUS the
manifest-only ``extra_entries`` (runtime artifacts that are not generation
models, e.g. the AI Director retrieval embedder). Fragile or dead upstreams are
repinned through ``provision-overrides.json`` (e.g. the deleted
``runwayml/stable-diffusion-v1-5`` -> the permanent community mirror).

Pure data - imports cleanly on stub CI (no torch, no network). The manifest
names *which* models form the auto-set, how to reach + attribute each, and the
integrity anchor of every byte the DownloadManager fetches for them:

* direct-URL records carry a literal ``sha256`` (the only integrity anchor for
  a CDN redirect - the manager refuses an unverifiable direct download) and the
  exact byte size (``pins[id].bytes``);
* HuggingFace records are pinned (``pins[id].snapshots``) to an immutable
  commit sha - never a moving branch - with the exact file list and each
  file's size + sha256 (LFS oid, or the content hash of a small readable
  config). The non-LFS files of a gated repo cannot be fetched anonymously, so
  those carry the Hub-published git blob id (``git_oid``) instead. The manager
  verifies every file against its pin before a job can read ``ready``.

Pins are refreshed from Hub *metadata* only (no weight download) with::

    python -m foundry.provisioning --refresh-pins

and the committed ``provision-manifest.json`` regenerated with::

    python -m foundry.provisioning

``tiers.core`` names the small first-run set (``"tier": "core"``); every other
auto-set member is ``"extended"``.

Fail-closed throughout: a model whose license is unknown or non-redistributable
never enters the auto-set - it drops to ``manual_only`` with a recorded reason;
a malformed pin, an unknown tier id, or an extra entry that collides with a
catalog id refuses the build.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional

from foundry.licenses import classify_license

logger = logging.getLogger(__name__)

SCHEMA = 1

TIER_CORE = "core"
TIER_EXTENDED = "extended"
TIERS = (TIER_CORE, TIER_EXTENDED)

# The FLUX.1 [dev] non-commercial family - never auto-provisioned or mirrored. Stays
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
MANIFEST_PATH = os.path.join(_HERE, "provision-manifest.json")

_UNIT = {"KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3, "TB": 1024 ** 4}

_SHA256_HEX = re.compile(r"[0-9a-f]{64}")
_GIT_SHA_HEX = re.compile(r"[0-9a-f]{40}")

# Repo-authored code is never fetched (no loader executes it) and
# pickle-bearing weights only with consent - mirrors DownloadManager's
# discovered-repo filter so a pinned repo pull fetches the same set.
_PICKLE_SUFFIXES = (".ckpt", ".pt", ".pth", ".bin", ".pkl")


def approx_bytes(size: Optional[str]) -> Optional[int]:
    """Approximate byte count from a human catalog size string ('~4.3 GB')."""
    if not size:
        return None
    match = re.search(r"([\d.]+)\s*(KB|MB|GB|TB)", size, re.IGNORECASE)
    if not match:
        return None
    return int(float(match.group(1)) * _UNIT[match.group(2).upper()])


def _safe_relative_path(path: str) -> bool:
    return bool(path) and not (
        "\\" in path or ":" in path or path.startswith("/") or ".." in path.split("/")
    )


def _validate_snapshots(model_id: str, snapshots: Any) -> List[Dict[str, Any]]:
    """Normalize + validate an HF pin. Fail closed on anything unverifiable."""
    if not isinstance(snapshots, list) or not snapshots:
        raise ValueError(f"pin for {model_id}: needs at least one snapshot")
    normalized = []
    for snapshot in snapshots:
        repo_id = (snapshot.get("repo_id") or "").strip()
        revision = (snapshot.get("revision") or "").strip().lower()
        subdir = (snapshot.get("subdir") or "").strip().strip("/")
        if not repo_id or "/" not in repo_id:
            raise ValueError(f"pin for {model_id}: bad repo_id {repo_id!r}")
        if not _GIT_SHA_HEX.fullmatch(revision):
            raise ValueError(
                f"pin for {model_id}: revision must be a 40-hex commit sha, got {revision!r}"
            )
        if subdir and not _safe_relative_path(subdir):
            raise ValueError(f"pin for {model_id}: unsafe subdir {subdir!r}")
        files = snapshot.get("files") or []
        if not files:
            raise ValueError(f"pin for {model_id}: snapshot {repo_id} lists no files")
        pinned_files = []
        for file in files:
            path = (file.get("path") or "").strip()
            if not _safe_relative_path(path):
                raise ValueError(f"pin for {model_id}: unsafe file path {path!r}")
            size = file.get("size")
            if not isinstance(size, int) or size < 0:
                raise ValueError(f"pin for {model_id}: {path} needs a byte size")
            sha256 = (file.get("sha256") or "").strip().lower()
            git_oid = (file.get("git_oid") or "").strip().lower()
            pinned: Dict[str, Any] = {"path": path, "size": size}
            if sha256:
                if not _SHA256_HEX.fullmatch(sha256):
                    raise ValueError(f"pin for {model_id}: {path} has a malformed sha256")
                pinned["sha256"] = sha256
            elif git_oid:
                if not _GIT_SHA_HEX.fullmatch(git_oid):
                    raise ValueError(f"pin for {model_id}: {path} has a malformed git_oid")
                pinned["git_oid"] = git_oid
            else:
                raise ValueError(f"pin for {model_id}: {path} carries no hash")
            pinned_files.append(pinned)
        normalized.append({
            "repo_id": repo_id,
            "revision": revision,
            "subdir": subdir,
            "files": pinned_files,
        })
    return normalized


def _source(record: Dict[str, Any], repin: Dict[str, Any], pin: Dict[str, Any]) -> Dict[str, Any]:
    """Reach spec for one model: a direct URL (+sha256) or a pinned HF repo."""
    model_id = record["id"]
    download_url = record.get("download_url")
    if download_url:
        source: Dict[str, Any] = {
            "kind": "url",
            "url": download_url,
            "sha256": (record.get("sha256") or "").strip().lower() or None,
        }
        size = pin.get("bytes")
        if size is not None:
            if not isinstance(size, int) or size <= 0:
                raise ValueError(f"pin for {model_id}: bytes must be a positive int")
            source["size"] = size
        return source
    # aux_repo_id holds the actual adapter weights (e.g. AnimateDiff's motion
    # module); repo_id there is only the base-model reference. Mirrors
    # model_manager / direct_generator, which fetch adapters from aux_repo_id.
    source = {
        "kind": "hf",
        "repo_id": (
            repin.get("repo_id")
            or record.get("aux_repo_id")
            or record.get("repo_id")
        ),
        "revision": repin.get("revision") or record.get("revision") or "main",
    }
    if pin.get("snapshots") is not None:
        snapshots = _validate_snapshots(model_id, pin["snapshots"])
        source["revision"] = snapshots[0]["revision"]
        source["snapshots"] = snapshots
    return source


def _effective_license(
    model_id: str, record: Dict[str, Any], overrides: Dict[str, Any]
) -> Optional[str]:
    """Verified upstream license (known_licenses) overrides a catalog gap."""
    known = overrides.get("known_licenses") or {}
    return known.get(model_id) or record.get("license")


def _validate_mirror(model_id: str, mirror: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize + validate one VS-mirror stanza (#34 PR4). Fail closed.

    The mirror is a first-party R2 origin serving exact copies of the primary
    files, so: https only, every file named with a safe relative path, and a
    mandatory per-file sha256 - the DownloadManager's fallback refuses
    anything unverifiable, and the build refuses to emit it in the first
    place. Hosting on the mirror is redistribution; the caller only reaches
    here for redistributable auto-set members.
    """
    base_url = (mirror.get("base_url") or "").strip()
    if not base_url.startswith("https://"):
        raise ValueError(f"mirror for {model_id}: base_url must be https ({base_url!r})")
    files = mirror.get("files") or []
    if not files:
        raise ValueError(f"mirror for {model_id}: needs at least one file")
    normalized = []
    for file in files:
        name = (file.get("name") or "").strip()
        if not _safe_relative_path(name):
            raise ValueError(f"mirror for {model_id}: unsafe file name {name!r}")
        sha256 = (file.get("sha256") or "").strip().lower()
        if not _SHA256_HEX.fullmatch(sha256):
            raise ValueError(
                f"mirror for {model_id}: file {name!r} needs a sha256 hex digest"
            )
        size = file.get("bytes")
        if not isinstance(size, int) or size <= 0:
            raise ValueError(f"mirror for {model_id}: file {name!r} needs positive bytes")
        normalized.append({"name": name, "sha256": sha256, "bytes": size})
    return {"base_url": base_url.rstrip("/"), "files": normalized}


def exact_size_bytes(source: Dict[str, Any]) -> Optional[int]:
    """Exact on-disk footprint from the pin (sum of pinned files), or None."""
    if source.get("kind") == "url":
        size = source.get("size")
        return size if isinstance(size, int) else None
    snapshots = source.get("snapshots")
    if not snapshots:
        return None
    return sum(f["size"] for snap in snapshots for f in snap["files"])


def _entry(
    record: Dict[str, Any],
    overrides: Dict[str, Any],
    core_ids: set,
    manifest_only: bool = False,
) -> Dict[str, Any]:
    model_id = record["id"]
    license_id = _effective_license(model_id, record, overrides)
    info = classify_license(license_id)
    repin = (overrides.get("repin") or {}).get(model_id, {})
    pin = (overrides.get("pins") or {}).get(model_id, {})
    source = _source(record, repin, pin)
    approx = approx_bytes(record.get("size"))
    exact = exact_size_bytes(source)
    entry = {
        "id": model_id,
        "name": record.get("name") or model_id,
        "artifact_type": record.get("artifact_type"),
        "license": (license_id or "").strip().lower() or None,
        "license_category": info.category,
        "attribution": info.attribution,
        "gated": bool(record.get("gated")),
        "tier": TIER_CORE if model_id in core_ids else TIER_EXTENDED,
        "source": source,
        "approx_bytes": approx,
        # Exact bytes when the pin knows them; the catalog estimate otherwise.
        "size_bytes": exact if exact is not None else (approx or 0),
    }
    if manifest_only:
        entry["manifest_only"] = True
        if record.get("format"):
            entry["format"] = record["format"]
    if repin.get("reason"):
        entry["repin_reason"] = repin["reason"]
    mirror = (overrides.get("mirrors") or {}).get(model_id)
    if mirror is not None:
        # Only reached for redistributable records (build partitions first);
        # unknown/non-auto mirror keys are refused in build_provision_manifest.
        entry["mirror"] = _validate_mirror(model_id, mirror)
    return entry


def _extra_records(catalog: Dict[str, Any], overrides: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Manifest-only records, validated not to shadow a catalog model."""
    extras = list(overrides.get("extra_entries") or [])
    seen = set()
    for record in extras:
        model_id = record.get("id")
        if not model_id or not record.get("repo_id"):
            raise ValueError(f"extra entry needs an id and a repo_id: {record!r}")
        if model_id in catalog or model_id in seen:
            raise ValueError(f"extra entry {model_id!r} collides with an existing id")
        seen.add(model_id)
    return extras


def build_provision_manifest(
    catalog: Dict[str, Any], overrides: Dict[str, Any]
) -> Dict[str, Any]:
    """Build the deterministic auto-provision manifest from catalog + overrides.

    Partitions every catalog record into exactly one of: ``auto_set``
    (auto-provisioned: downloaded at first run, never shipped in the installer),
    ``excluded_non_commercial`` (FLUX-nc, Foundry-manual), or ``manual_only``
    (license unknown / not redistributable). Nothing is silently dropped.
    Manifest-only ``extra_entries`` join the auto-set under the same license
    rule (a non-redistributable extra refuses the build - it has no Foundry
    fallback to drop to).
    """
    auto_set: List[Dict[str, Any]] = []
    excluded: List[str] = []
    manual_only: List[Dict[str, Any]] = []
    core_ids = set((overrides.get("tiers") or {}).get(TIER_CORE) or [])

    for model_id, record in catalog.items():
        if not isinstance(record, dict) or "id" not in record:
            continue  # skip any catalog metadata / non-record keys
        if model_id in EXCLUDED_NON_COMMERCIAL:
            excluded.append(model_id)
            continue
        license_id = _effective_license(model_id, record, overrides)
        info = classify_license(license_id)
        if not info.redistributable:
            manual_only.append({
                "id": model_id,
                "artifact_type": record.get("artifact_type"),
                "license": (license_id or "").strip().lower() or None,
                "reason": f"license-not-redistributable:{info.category}",
            })
            continue
        auto_set.append(_entry(record, overrides, core_ids))

    for record in _extra_records(catalog, overrides):
        info = classify_license(_effective_license(record["id"], record, overrides))
        if not info.redistributable:
            raise ValueError(
                f"extra entry {record['id']!r} is not redistributable ({info.category})"
            )
        auto_set.append(_entry(record, overrides, core_ids, manifest_only=True))

    auto_set.sort(key=lambda e: e["id"])
    manual_only.sort(key=lambda e: e["id"])
    total = sum(e["approx_bytes"] or 0 for e in auto_set)
    auto_ids = {e["id"] for e in auto_set}

    # A mirror stanza for anything outside the redistributable auto-set is a
    # licensing error, not a no-op: hosting those weights on the VS mirror
    # would be unlicensed redistribution (FLUX-nc, CMU OpenPose, typos alike).
    unknown_mirrors = set(overrides.get("mirrors") or {}) - auto_ids
    if unknown_mirrors:
        raise ValueError(
            "mirror overrides exist for models outside the redistributable "
            f"auto-set: {sorted(unknown_mirrors)}"
        )
    unknown_pins = set(overrides.get("pins") or {}) - auto_ids
    if unknown_pins:
        raise ValueError(f"pins exist for ids outside the auto-set: {sorted(unknown_pins)}")
    unknown_core = core_ids - auto_ids
    if unknown_core:
        raise ValueError(f"core tier names ids outside the auto-set: {sorted(unknown_core)}")

    return {
        "schema": SCHEMA,
        "auto_set": auto_set,
        "excluded_non_commercial": sorted(excluded),
        "manual_only": manual_only,
        "total_approx_bytes": total,
        "total_size_bytes": sum(e["size_bytes"] for e in auto_set),
    }


def manifest_pins(manifest: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """model_id -> pinned HF snapshots, for every pinned auto-set entry."""
    return {
        entry["id"]: entry["source"]["snapshots"]
        for entry in manifest.get("auto_set") or []
        if (entry.get("source") or {}).get("snapshots")
    }


def manifest_only_records(manifest: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Download-manager records for manifest-only entries (not registry models)."""
    records: Dict[str, Dict[str, Any]] = {}
    for entry in manifest.get("auto_set") or []:
        if not entry.get("manifest_only"):
            continue
        source = entry.get("source") or {}
        records[entry["id"]] = {
            "id": entry["id"],
            "name": entry.get("name") or entry["id"],
            "artifact_type": entry.get("artifact_type"),
            "source": "huggingface",
            "repo_id": source.get("repo_id"),
            "revision": source.get("revision"),
            "format": entry.get("format") or "safetensors",
            "license": entry.get("license"),
            "trust_remote_code": False,
        }
    return records


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_provision_manifest() -> Dict[str, Any]:
    """Build the manifest from the on-disk catalog + overrides."""
    catalog = _load_json(CATALOG_PATH)
    overrides = _load_json(OVERRIDES_PATH) if os.path.exists(OVERRIDES_PATH) else {}
    return build_provision_manifest(catalog, overrides)


def _write_json(path: str, payload: Dict[str, Any]) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    os.replace(tmp, path)


def write_manifest() -> str:
    """(Re)write the committed provision-manifest.json; returns its path.

    Regenerate after any catalog / overrides change:
        python -m foundry.provisioning
    """
    _write_json(MANIFEST_PATH, load_provision_manifest())
    return MANIFEST_PATH


# -- pin refresh (maintainer tool; Hub metadata only, never weights) --------

def repo_pull_paths(model_id: str, record: Dict[str, Any], repo_files: List[str]) -> List[str]:
    """The file list the DownloadManager would fetch for ``model_id``.

    Same precedence as ``DownloadManager._resolve_files``: the catalog's
    curated ``files`` allowlist, then the single-file name map, then the
    discovered repo list minus repo code and (absent pickle consent, which
    auto-provision grants only to pickle-format records) pickle weights.
    """
    from utils.model_manager import single_file_names

    explicit = record.get("files") or []
    if explicit:
        return list(explicit)
    single = single_file_names(model_id)
    if single is not None:
        return list(single)
    paths = [p for p in repo_files if not p.lower().endswith(".py")]
    if (record.get("format") or "").lower() != "pickle":
        paths = [p for p in paths if not p.lower().endswith(_PICKLE_SUFFIXES)]
    return sorted(paths)


def _pin_snapshot(api, repo_id: str, subdir: str, paths: Optional[List[str]],
                  model_id: str, record: Dict[str, Any], download_dir: str,
                  skipped: List[str]) -> Dict[str, Any]:
    """Pin one repo at its current main commit, from Hub metadata."""
    import hashlib

    import huggingface_hub
    from huggingface_hub.errors import GatedRepoError

    revision = api.model_info(repo_id, revision="main").sha
    # model_info(files_metadata=True) - not list_repo_tree - because the tree
    # endpoint masks LFS oids of gated repos ("****..."), which the pin
    # validator would (rightly) refuse as a malformed sha256.
    info = api.model_info(repo_id, revision=revision, files_metadata=True)
    tree = {sibling.rfilename: sibling for sibling in info.siblings or []}
    if paths is None:
        paths = repo_pull_paths(model_id, record, list(tree))
    files = []
    for path in paths:
        item = tree.get(path)
        if item is None or item.size is None:
            raise ValueError(f"{repo_id}@{revision} has no file {path!r}")
        pinned: Dict[str, Any] = {"path": path, "size": int(item.size)}
        if item.lfs is not None:
            pinned["sha256"] = item.lfs.sha256
        else:
            # Small non-LFS file (config/tokenizer): hash the real bytes.
            try:
                local = huggingface_hub.hf_hub_download(
                    repo_id, path, revision=revision, cache_dir=download_dir
                )
            except GatedRepoError:
                # Gated repos hide file contents from anonymous callers; the
                # Hub-published git blob id still binds the exact bytes.
                pinned["git_oid"] = item.blob_id
                skipped.append(f"{repo_id}:{path} (gated: git blob id)")
            else:
                digest = hashlib.sha256()
                with open(local, "rb") as handle:
                    digest.update(handle.read())
                pinned["sha256"] = digest.hexdigest()
        files.append(pinned)
    return {"repo_id": repo_id, "revision": revision, "subdir": subdir, "files": files}


def refresh_pins() -> List[str]:
    """Re-pin every auto-set entry from Hub/GitHub metadata into the overrides.

    HF entries: current ``main`` commit sha + per-file size/sha256 (LFS oid or
    the hash of the small non-LFS file; gated non-LFS files -> git blob id).
    Direct-URL entries: exact byte size (HEAD, redirects followed) - their
    sha256 is already the catalog's literal anchor. Returns notes on anything
    pinned with the weaker anchor. Network required; no weights downloaded.
    """
    import tempfile

    import huggingface_hub
    import requests

    catalog = _load_json(CATALOG_PATH)
    overrides = _load_json(OVERRIDES_PATH)
    layouts = overrides.get("pin_layouts") or {}
    extras = {r["id"]: r for r in overrides.get("extra_entries") or []}
    manifest = build_provision_manifest(catalog, {**overrides, "pins": {}})
    api = huggingface_hub.HfApi()
    notes: List[str] = []
    pins: Dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix="vs-pin-") as download_dir:
        for entry in manifest["auto_set"]:
            model_id = entry["id"]
            record = catalog.get(model_id) or extras.get(model_id) or {}
            source = entry["source"]
            if source["kind"] == "url":
                response = requests.head(source["url"], allow_redirects=True, timeout=30)
                response.raise_for_status()
                pins[model_id] = {"bytes": int(response.headers["Content-Length"])}
                continue
            layout = layouts.get(model_id) or [
                {"repo_id": source["repo_id"], "subdir": "", "files": None}
            ]
            pins[model_id] = {
                "snapshots": [
                    _pin_snapshot(
                        api, part["repo_id"], part.get("subdir") or "", part.get("files"),
                        model_id, record, download_dir, notes,
                    )
                    for part in layout
                ]
            }
            logger.info("pinned %s", model_id)
    overrides["pins"] = pins
    _write_json(OVERRIDES_PATH, overrides)
    return notes


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = list(sys.argv[1:] if argv is None else argv)
    if "--refresh-pins" in args:
        for note in refresh_pins():
            logger.info("weaker anchor: %s", note)
    logger.info("wrote %s", write_manifest())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
