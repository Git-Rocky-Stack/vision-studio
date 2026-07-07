"""#34 installer PR1: license classification (fail-closed redistribution)."""
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.licenses import (  # noqa: E402
    STABILITY_ATTRIBUTION,
    classify_license,
)


def test_permissive_licenses_are_redistributable_without_attribution():
    for lic in ("mit", "apache-2.0", "bsd-3-clause"):
        info = classify_license(lic)
        assert info.category == "permissive"
        assert info.redistributable is True
        assert info.requires_attribution is False
        assert info.url


def test_openrail_family_is_redistributable():
    for lic in ("creativeml-openrail-m", "openrail", "openrail++"):
        info = classify_license(lic)
        assert info.category == "openrail"
        assert info.redistributable is True


def test_stability_community_requires_the_powered_by_attribution():
    info = classify_license("stabilityai-community")
    assert info.category == "stability-community"
    assert info.redistributable is True
    assert info.requires_attribution is True
    assert info.attribution == STABILITY_ATTRIBUTION


def test_explicitly_non_commercial_licenses_are_not_redistributable():
    for lic in (
        "flux-1-dev-non-commercial",
        "ltx-video-license",
        "openpose-cmu-noncommercial",
    ):
        info = classify_license(lic)
        assert info.category == "non-commercial", lic
        assert info.redistributable is False, lic


def test_case_and_whitespace_are_normalized():
    assert classify_license("  APACHE-2.0 ").redistributable is True


def test_unknown_and_absent_licenses_fail_closed():
    for lic in (None, "", "totally-made-up-license"):
        info = classify_license(lic)
        assert info.category == "unknown"
        assert info.redistributable is False
        assert info.requires_attribution is False
