"""#34 installer PR1: comprehensive auto-provision manifest builder."""
import json
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.licenses import STABILITY_ATTRIBUTION, classify_license  # noqa: E402
from foundry.provisioning import (  # noqa: E402
    CATALOG_PATH,
    EXCLUDED_NON_COMMERCIAL,
    build_provision_manifest,
    load_provision_manifest,
)

MANIFEST = load_provision_manifest()
AUTO_IDS = {e["id"] for e in MANIFEST["auto_set"]}
MANUAL_IDS = {e["id"] for e in MANIFEST["manual_only"]}


def _entry(model_id):
    return next(e for e in MANIFEST["auto_set"] if e["id"] == model_id)


def test_flux_non_commercial_family_is_excluded_never_auto():
    for model_id in EXCLUDED_NON_COMMERCIAL:
        assert model_id not in AUTO_IDS
        assert model_id in MANIFEST["excluded_non_commercial"]


def test_every_auto_entry_is_redistributable_with_a_verifiable_source():
    for entry in MANIFEST["auto_set"]:
        info = classify_license(entry["license"])
        assert info.redistributable is True, entry["id"]
        source = entry["source"]
        if source["kind"] == "url":
            # A CDN redirect's only integrity anchor is the pinned sha256.
            assert source["sha256"], f"{entry['id']} direct URL needs sha256"
        else:
            assert source["kind"] == "hf"
            assert source["repo_id"], entry["id"]
            assert source["revision"], entry["id"]


def test_sd_1_5_is_repinned_off_the_deleted_runwayml_repo():
    source = _entry("sd-1-5")["source"]
    assert source["repo_id"] == "stable-diffusion-v1-5/stable-diffusion-v1-5"
    assert "runwayml" not in source["repo_id"]


def test_animatediff_resolves_to_the_adapter_weights_not_the_base_repo():
    # The catalog's repo_id is the (dead) base SD1.5 repo; the real motion
    # module lives in aux_repo_id.
    source = _entry("animatediff")["source"]
    assert source["repo_id"] == "guoyww/animatediff-motion-adapter-v1-5-2"
    assert "runwayml" not in source["repo_id"]


def test_stability_community_models_carry_the_attribution():
    for model_id in ("sd3.5-large", "svd"):
        assert _entry(model_id)["attribution"] == STABILITY_ATTRIBUTION


def test_direct_url_edit_models_carry_the_catalog_sha256():
    source = _entry("edit-u2net")["source"]
    assert source["kind"] == "url"
    assert len(source["sha256"]) == 64  # a real hex digest, not a placeholder


def test_flux_schnell_apache_is_included():
    # The bundlable FLUX - Apache-2.0, not the non-commercial dev family.
    assert "flux-schnell" in AUTO_IDS


def test_verified_permissive_records_are_promoted_into_the_auto_set():
    # MiDaS (MIT), NormalBae (OpenRAIL-M pack), CLIP ViT-L (OpenAI MIT) had a
    # blank catalog license; known_licenses resolves them into the auto-set.
    for model_id in (
        "annotator-midas",
        "annotator-normalbae",
        "ip-adapter-encoder-clip-vit-l",
    ):
        assert model_id in AUTO_IDS
        assert model_id not in MANUAL_IDS


def test_non_commercial_annotator_and_video_stay_manual_only():
    # OpenPose (CMU non-commercial) and LTX-Video (research-only free tier) are
    # redistributable-restricted -> never in the bundled set.
    assert MANUAL_IDS == {"annotator-openpose", "ltx-video"}, MANUAL_IDS
    for model_id in ("annotator-openpose", "ltx-video"):
        assert model_id not in AUTO_IDS


def test_total_size_is_in_a_sane_comprehensive_range():
    gb = MANIFEST["total_approx_bytes"] / (1024 ** 3)
    assert 30 < gb < 200, f"comprehensive auto-set is {gb:.1f} GB"


def test_every_catalog_record_is_accounted_for():
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    catalog_ids = {
        v["id"] for v in catalog.values()
        if isinstance(v, dict) and "id" in v
    }
    classified = AUTO_IDS | MANUAL_IDS | set(MANIFEST["excluded_non_commercial"])
    assert catalog_ids == classified, catalog_ids ^ classified


def test_builder_is_deterministic():
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    overrides = {"repin": {"sd-1-5": {
        "repo_id": "stable-diffusion-v1-5/stable-diffusion-v1-5",
        "revision": "main"}}}
    first = build_provision_manifest(catalog, overrides)
    second = build_provision_manifest(catalog, overrides)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
