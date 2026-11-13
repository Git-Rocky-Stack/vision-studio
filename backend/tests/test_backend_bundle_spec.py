"""Honesty rails over main.spec (PyInstaller bundle completeness).

The packaged backend crashed at startup because main.spec never shipped the
foundry data files, and generation was silently disabled because transformers'
import-time dependency check could not find the `requests` package metadata.
These rails pin the spec to every runtime data file the backend resolves
relative to __file__ (-> sys._MEIPASS when frozen), so a new data file or a
spec regression fails CI instead of shipping a broken bundle.

main.spec takes its data list from selfcheck.BUNDLED_DATA (the frozen
`--self-check` verifies the same list inside the built bundle), so these rails
assert against that list plus the spec text. Parsing the spec itself would
require PyInstaller, which stub CI does not install.
"""
import pathlib

import selfcheck

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC_TEXT = (BACKEND_ROOT / "main.spec").read_text(encoding="utf-8")
BUNDLED = set(selfcheck.BUNDLED_DATA)


def test_spec_bundles_the_selfcheck_data_list():
    assert "BUNDLED_DATA" in SPEC_TEXT and "from selfcheck import" in SPEC_TEXT, (
        "main.spec no longer bundles selfcheck.BUNDLED_DATA - the data files "
        "below would not ship")


def test_every_foundry_data_file_is_declared_in_the_spec():
    # Dynamic: adding a new foundry/*.json makes this fail until the bundle
    # ships it - the file set is discovered, never hand-listed here.
    data_files = sorted(p.name for p in (BACKEND_ROOT / "foundry").glob("*.json"))
    assert data_files, "foundry/*.json discovery is broken"
    for name in data_files:
        assert (f"foundry/{name}", "foundry") in BUNDLED, (
            f"main.spec does not bundle foundry/{name} - the frozen backend "
            "crashes at startup (model_manager loads the catalog at import) "
            "or ships with silently missing provisioning/licensing data")


def test_prompting_kb_is_declared_in_the_spec():
    assert (BACKEND_ROOT / "services" / "retrieval" / "prompting_kb").is_dir()
    assert ("services/retrieval/prompting_kb", "services/retrieval/prompting_kb") in BUNDLED, (
        "main.spec does not bundle the M7 cold-start prompting knowledge "
        "base - frozen-app RAG retrieval degrades to empty")


def test_ffmpeg_gpl_notice_and_license_ship_in_the_bundle():
    # imageio-ffmpeg's ffmpeg is GPL-3.0-or-later: the notice (with the
    # corresponding-source offer) and the license text must travel with it.
    for name in ("FFMPEG-NOTICE.md", "GPL-3.0.txt"):
        assert (BACKEND_ROOT / "licenses" / name).is_file(), f"licenses/{name} is missing"
        assert (f"licenses/{name}", "licenses") in BUNDLED, f"main.spec does not bundle licenses/{name}"


def test_db_migrations_ship_as_files_and_modules():
    assert ("db/migrations", "db/migrations") in BUNDLED
    assert "collect_submodules(MIGRATIONS_PACKAGE)" in SPEC_TEXT


def test_all_distribution_metadata_is_collected():
    # transformers.dependency_versions_check requires metadata for its core
    # requirement set at import, and diffusers detects peft / accelerate /
    # onnxruntime through importlib.metadata. The spec copies the metadata of
    # EVERY distribution in the (hash-locked) build venv instead of a
    # hand-kept list that silently fell behind.
    assert "importlib.metadata.distributions()" in SPEC_TEXT
    assert "copy_metadata(distribution_name)" in SPEC_TEXT
