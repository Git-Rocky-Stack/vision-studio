"""D4 / K3 / D5b: manifest integrity pins, first-run tiers, the embedder entry.

Every HF auto-set entry is pinned to an immutable commit with a per-file hash
(no moving ``main``); direct-URL entries carry their exact size; the ``core``
tier is small and companion-closed; the retrieval embedder is a manifest-only
core entry at the exact path the loader reads. Stub-CI-safe: pure data.
"""
import json
import pathlib
import re
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.provisioning import (  # noqa: E402
    CATALOG_PATH,
    build_provision_manifest,
    load_provision_manifest,
    manifest_only_records,
    manifest_pins,
)

MANIFEST = load_provision_manifest()
_HEX40 = re.compile(r"[0-9a-f]{40}")
_HEX64 = re.compile(r"[0-9a-f]{64}")

_CATALOG = {
    "sd-1-5": {
        "id": "sd-1-5",
        "name": "Stable Diffusion 1.5",
        "artifact_type": "checkpoint",
        "license": "creativeml-openrail-m",
        "repo_id": "stable-diffusion-v1-5/stable-diffusion-v1-5",
        "size": "~4.3 GB",
    },
    "annotator-openpose": {
        "id": "annotator-openpose",
        "name": "OpenPose Annotator",
        "artifact_type": "annotator",
        "license": "openpose-cmu-noncommercial",
        "repo_id": "lllyasviel/Annotators",
        "size": "~1 GB",
    },
}


def _entry(model_id):
    return next(e for e in MANIFEST["auto_set"] if e["id"] == model_id)


def _pin(revision="b" * 40, files=None):
    return {"snapshots": [{
        "repo_id": "stable-diffusion-v1-5/stable-diffusion-v1-5",
        "revision": revision,
        "subdir": "",
        "files": files if files is not None else [
            {"path": "v1-5-pruned-emaonly.safetensors", "size": 1, "sha256": "c" * 64}],
    }]}


# -- D4: immutable per-file pins ----------------------------------------------

def test_every_hf_entry_is_pinned_to_a_commit_with_per_file_hashes():
    for entry in MANIFEST["auto_set"]:
        source = entry["source"]
        if source["kind"] != "hf":
            continue
        assert _HEX40.fullmatch(source["revision"]), f"{entry['id']} floats on {source['revision']}"
        snapshots = source.get("snapshots")
        assert snapshots, f"{entry['id']} has no pinned file list"
        for snapshot in snapshots:
            assert _HEX40.fullmatch(snapshot["revision"]), entry["id"]
            assert snapshot["files"], entry["id"]
            for pinned in snapshot["files"]:
                assert isinstance(pinned["size"], int) and pinned["size"] >= 0
                if "sha256" in pinned:
                    assert _HEX64.fullmatch(pinned["sha256"]), (entry["id"], pinned["path"])
                else:
                    # Only non-LFS files of gated repos fall back to the git blob id.
                    assert entry["gated"], (entry["id"], pinned["path"])
                    assert _HEX40.fullmatch(pinned["git_oid"]), (entry["id"], pinned["path"])
                if pinned["path"].endswith(".safetensors"):
                    # Weights are always sha256-anchored, gated or not.
                    assert "sha256" in pinned, (entry["id"], pinned["path"])


def test_manifest_pins_cover_every_hf_entry():
    hf_ids = {e["id"] for e in MANIFEST["auto_set"] if e["source"]["kind"] == "hf"}
    assert set(manifest_pins(MANIFEST)) == hf_ids


def test_direct_url_entries_carry_their_exact_size():
    for entry in MANIFEST["auto_set"]:
        if entry["source"]["kind"] == "url":
            assert entry["source"]["size"] > 0, entry["id"]
            assert entry["size_bytes"] == entry["source"]["size"]


def test_pinned_sd15_weights_agree_with_the_vs_mirror_hash():
    # Two independent anchors for the same bytes must agree: the HF LFS oid
    # pinned from Hub metadata and the hash of the file uploaded to R2.
    entry = _entry("sd-1-5")
    pinned = {f["path"]: f for s in entry["source"]["snapshots"] for f in s["files"]}
    mirror = {f["name"]: f for f in entry["mirror"]["files"]}
    name = "v1-5-pruned-emaonly.safetensors"
    assert pinned[name]["sha256"] == mirror[name]["sha256"]
    assert pinned[name]["size"] == mirror[name]["bytes"]


def test_animatediff_pins_the_base_and_adapter_layout_the_loader_reads():
    # utils/direct_video_generator.resolve_animatediff_sources reads
    # <models>/diffusers/animatediff/{base,adapter}/.
    snapshots = _entry("animatediff")["source"]["snapshots"]
    by_subdir = {s["subdir"]: s for s in snapshots}
    assert set(by_subdir) == {"adapter", "base"}
    assert by_subdir["adapter"]["repo_id"] == "guoyww/animatediff-motion-adapter-v1-5-2"
    assert by_subdir["base"]["repo_id"] == "stable-diffusion-v1-5/stable-diffusion-v1-5"
    base_files = {f["path"] for f in by_subdir["base"]["files"]}
    assert "model_index.json" in base_files
    assert "unet/diffusion_pytorch_model.safetensors" in base_files
    assert not any(p.endswith((".bin", ".ckpt")) for p in base_files)


def test_pin_refuses_a_moving_branch_revision():
    with pytest.raises(ValueError, match="40-hex"):
        build_provision_manifest(_CATALOG, {"pins": {"sd-1-5": _pin(revision="main")}})


def test_pin_refuses_a_masked_or_missing_hash():
    # The Hub tree endpoint masks gated LFS oids as "****": never accept one.
    masked = [{"path": "x.safetensors", "size": 1, "sha256": "*" * 64}]
    with pytest.raises(ValueError, match="malformed sha256"):
        build_provision_manifest(_CATALOG, {"pins": {"sd-1-5": _pin(files=masked)}})
    unhashed = [{"path": "x.safetensors", "size": 1}]
    with pytest.raises(ValueError, match="no hash"):
        build_provision_manifest(_CATALOG, {"pins": {"sd-1-5": _pin(files=unhashed)}})


def test_pin_refuses_path_traversal():
    evil = [{"path": "../evil.safetensors", "size": 1, "sha256": "c" * 64}]
    with pytest.raises(ValueError, match="unsafe"):
        build_provision_manifest(_CATALOG, {"pins": {"sd-1-5": _pin(files=evil)}})


def test_pin_for_an_id_outside_the_auto_set_is_refused():
    with pytest.raises(ValueError, match="outside the auto-set"):
        build_provision_manifest(_CATALOG, {"pins": {"annotator-openpose": _pin()}})


def test_pinned_entry_size_is_the_exact_sum_of_its_files():
    built = build_provision_manifest(_CATALOG, {"pins": {"sd-1-5": _pin(files=[
        {"path": "a.safetensors", "size": 10, "sha256": "c" * 64},
        {"path": "b.json", "size": 5, "git_oid": "d" * 40},
    ])}})
    entry = next(e for e in built["auto_set"] if e["id"] == "sd-1-5")
    assert entry["size_bytes"] == 15
    assert entry["source"]["revision"] == "b" * 40


def test_repo_pull_paths_mirror_the_download_manager_filter():
    from foundry.provisioning import repo_pull_paths

    files = ["model_index.json", "unet/x.safetensors", "unet/x.bin", "pipeline.py"]
    assert repo_pull_paths("some-pipeline", {}, files) == ["model_index.json", "unet/x.safetensors"]
    # Pickle-format records are auto-consented at provision time.
    assert "unet/x.bin" in repo_pull_paths("some-pipeline", {"format": "pickle"}, files)
    # The catalog's curated allowlist wins.
    assert repo_pull_paths("x", {"files": ["config.json"]}, files) == ["config.json"]


# -- K3: tiers ------------------------------------------------------------------

def test_every_entry_has_a_tier_and_core_is_small_and_complete():
    tiers = {e["id"]: e["tier"] for e in MANIFEST["auto_set"]}
    assert set(tiers.values()) <= {"core", "extended"}
    core = {model_id for model_id, tier in tiers.items() if tier == "core"}
    # One fast image model, one quality image model, one video model, the
    # edit/upscale/background helpers, and the retrieval embedder.
    assert {"sd-1-5", "sdxl-base", "animatediff", "edit-u2net",
            "edit-realesrgan-x4plus", "edit-gfpgan-v14",
            "embedder-all-minilm-l6-v2"} <= core
    core_bytes = sum(e["size_bytes"] for e in MANIFEST["auto_set"] if e["tier"] == "core")
    assert core_bytes < 25 * 1024 ** 3, core_bytes


def test_core_tier_is_companion_closed():
    # A core model whose companion is extended would install half-working.
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    core = {e["id"] for e in MANIFEST["auto_set"] if e["tier"] == "core"}
    for model_id in core:
        for companion in (catalog.get(model_id) or {}).get("companions") or []:
            assert companion in core, f"core {model_id} needs extended companion {companion}"


def test_core_tier_naming_an_unknown_id_is_refused():
    with pytest.raises(ValueError, match="core tier"):
        build_provision_manifest(_CATALOG, {"tiers": {"core": ["no-such-model"]}})


# -- D5b: the retrieval embedder is a manifest-only core entry ----------------

def test_embedder_is_a_pinned_core_manifest_only_entry_at_the_loader_path():
    from services.retrieval.embedder import (
        EMBEDDER_ARTIFACT_TYPE,
        EMBEDDER_MODEL_ID,
        REQUIRED_MODEL_FILES,
    )

    entry = _entry(EMBEDDER_MODEL_ID)
    assert entry["manifest_only"] is True
    assert entry["tier"] == "core"
    assert entry["artifact_type"] == EMBEDDER_ARTIFACT_TYPE
    pinned = {f["path"] for s in entry["source"]["snapshots"] for f in s["files"]}
    assert set(REQUIRED_MODEL_FILES) <= pinned
    record = manifest_only_records(MANIFEST)[EMBEDDER_MODEL_ID]
    assert record["artifact_type"] == EMBEDDER_ARTIFACT_TYPE
    assert record["trust_remote_code"] is False


def test_extra_entry_colliding_with_a_catalog_id_is_refused():
    extra = {"id": "sd-1-5", "repo_id": "o/r", "license": "apache-2.0"}
    with pytest.raises(ValueError, match="collides"):
        build_provision_manifest(_CATALOG, {"extra_entries": [extra]})


def test_non_redistributable_extra_entry_is_refused():
    extra = {"id": "x-embedder", "repo_id": "o/r", "license": "cc-by-nc-4.0"}
    with pytest.raises(ValueError, match="not redistributable"):
        build_provision_manifest(_CATALOG, {"extra_entries": [extra]})
