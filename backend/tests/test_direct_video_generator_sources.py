"""AnimateDiff source resolution: the record/default repos must not point at
the deleted runwayml/stable-diffusion-v1-5 repo (its downloads 404).

Gated on torch/diffusers like the other direct_video_generator tests: the
function under test is pure pathlib, but importing its module pulls the video
diffusers stack, so this runs in the real local suite and skips on stub CI
(where test_foundry_catalog.py carries the catalog coverage)."""
import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")

DELETED_RUNWAYML_REPO = "runwayml/stable-diffusion-v1-5"
SD15_COMMUNITY_MIRROR = "stable-diffusion-v1-5/stable-diffusion-v1-5"


def test_default_base_is_the_mirror_not_the_deleted_runwayml_repo(tmp_path):
    # With no pre-seeded local bundle and no record repos, the historical
    # fallback must resolve the live mirror, never the deleted runwayml repo.
    from utils.direct_video_generator import resolve_animatediff_sources

    base, adapter = resolve_animatediff_sources(str(tmp_path))
    assert base == SD15_COMMUNITY_MIRROR
    assert base != DELETED_RUNWAYML_REPO
    assert adapter == "guoyww/animatediff-motion-adapter-v1-5-2"


def test_record_repos_win_over_defaults(tmp_path):
    from utils.direct_video_generator import resolve_animatediff_sources

    base, adapter = resolve_animatediff_sources(
        str(tmp_path),
        base_repo="some/base",
        adapter_repo="some/adapter",
    )
    assert base == "some/base"
    assert adapter == "some/adapter"
