"""Honesty rails over main.spec (PyInstaller bundle completeness).

The packaged backend crashed at startup because main.spec never shipped the
foundry data files, and generation was silently disabled because transformers'
import-time dependency check could not find the `requests` package metadata.
These rails pin the spec to every runtime data file the backend resolves
relative to __file__ (-> sys._MEIPASS when frozen), so a new data file or a
spec regression fails CI instead of shipping a broken bundle.

Text-level assertions by design: parsing the spec (Python that PyInstaller
executes) would require PyInstaller itself, which stub CI does not install.
"""
import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC_TEXT = (BACKEND_ROOT / "main.spec").read_text(encoding="utf-8")

# transformers.dependency_versions_check requires metadata for its core
# requirement set at import; a single missing distribution disables
# transformers AND diffusers (generation) in the frozen bundle.
TRANSFORMERS_CHECKED_METADATA = [
    "requests", "regex", "packaging", "filelock", "pyyaml", "tokenizers",
    "tqdm", "numpy", "huggingface-hub", "safetensors", "accelerate",
]


def test_every_foundry_data_file_is_declared_in_the_spec():
    # Dynamic: adding a new foundry/*.json makes this fail until main.spec
    # ships it - the file set is discovered, never hand-listed here.
    data_files = sorted(p.name for p in (BACKEND_ROOT / "foundry").glob("*.json"))
    assert data_files, "foundry/*.json discovery is broken"
    for name in data_files:
        assert f"('foundry/{name}', 'foundry')" in SPEC_TEXT, (
            f"main.spec does not bundle foundry/{name} - the frozen backend "
            "crashes at startup (model_manager loads the catalog at import) "
            "or ships with silently missing provisioning/licensing data")


def test_prompting_kb_is_declared_in_the_spec():
    assert (BACKEND_ROOT / "services" / "retrieval" / "prompting_kb").is_dir()
    assert "('services/retrieval/prompting_kb', 'services/retrieval/prompting_kb')" in SPEC_TEXT, (
        "main.spec does not bundle the M7 cold-start prompting knowledge "
        "base - frozen-app RAG retrieval degrades to empty")


def test_transformers_checked_metadata_is_collected():
    for pkg in TRANSFORMERS_CHECKED_METADATA:
        assert f"'{pkg}'" in SPEC_TEXT, (
            f"main.spec metadata_packages is missing '{pkg}' - transformers' "
            "import-time dependency check fails in the frozen bundle and "
            "generation is silently disabled")
