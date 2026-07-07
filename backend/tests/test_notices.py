"""#34 installer PR1: THIRD-PARTY-LICENSES generation + drift guard."""
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.notices import (  # noqa: E402
    NOTICES_PATH,
    build_notices,
    render_notices,
)
from foundry.provisioning import load_provision_manifest  # noqa: E402

RENDERED = build_notices()


def test_every_auto_set_model_is_listed():
    manifest = load_provision_manifest()
    for entry in manifest["auto_set"]:
        assert entry["id"] in RENDERED, entry["id"]
        assert entry["name"] in RENDERED, entry["name"]


def test_stability_attribution_is_surfaced():
    assert "## Required Attributions" in RENDERED
    assert "Powered by Stability AI" in RENDERED


def test_runtime_dependencies_are_listed():
    assert "## Bundled Runtime Dependencies" in RENDERED
    assert "PyTorch" in RENDERED
    assert "Electron" in RENDERED


def test_a_permissive_only_manifest_omits_the_attribution_section():
    fake = {"auto_set": [{
        "id": "demo", "name": "Demo Model", "license": "mit", "attribution": None,
    }]}
    texts = {"mit": {"name": "MIT License", "url": "https://opensource.org/license/mit"}}
    out = render_notices(fake, texts, {"python": [], "javascript": []})
    assert "Required Attributions" not in out
    assert "Demo Model" in out


def test_committed_notices_match_a_fresh_render():
    # Drift guard: regenerate with `python -m foundry.notices` after any manifest
    # / license-data change. Text-mode read normalizes CRLF so the compare is
    # line-ending agnostic.
    committed = pathlib.Path(NOTICES_PATH).read_text(encoding="utf-8")
    assert committed == RENDERED, (
        "THIRD-PARTY-LICENSES.md is stale - run `python -m foundry.notices`")
