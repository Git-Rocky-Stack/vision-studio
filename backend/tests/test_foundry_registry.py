import os
import pathlib
import sys
import tempfile

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.registry import ModelRegistry  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def make_registry():
    return ModelRegistry(models_dir=tempfile.mkdtemp(), catalog_path=CATALOG_PATH)


def test_list_records_returns_all_catalog_entries_as_dicts():
    registry = make_registry()
    records = registry.list_records()
    assert isinstance(records, list)
    assert len(records) >= 13
    ids = {r["id"] for r in records}
    assert "flux-dev" in ids and "ltx-video" in ids


def test_get_record_by_id():
    registry = make_registry()
    record = registry.get_record("flux-dev")
    assert record is not None
    assert record["name"] == "FLUX.1 [dev]"


def test_get_record_unknown_returns_none():
    registry = make_registry()
    assert registry.get_record("does-not-exist") is None


def test_get_record_resolves_legacy_alias():
    registry = make_registry()
    # Inject a temporary alias to prove resolution wiring works.
    registry.legacy_aliases["sd15"] = "sd-1-5"
    record = registry.get_record("sd15")
    assert record is not None
    assert record["id"] == "sd-1-5"


def test_status_reconciles_to_ready_when_present_on_disk():
    models_dir = tempfile.mkdtemp()
    # Simulate a downloaded diffusers bundle for ltx-video.
    bundle = os.path.join(models_dir, "diffusers", "ltx-video")
    os.makedirs(bundle, exist_ok=True)
    with open(os.path.join(bundle, "model_index.json"), "w", encoding="utf-8") as handle:
        handle.write("{}")

    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    record = registry.get_record("ltx-video")
    assert record["status"] == "ready"

    # A model with no files on disk stays not_found.
    assert registry.get_record("flux-dev")["status"] == "not_found"


def test_unrelated_file_in_typed_subdir_does_not_mark_model_ready():
    models_dir = tempfile.mkdtemp()
    checkpoints = os.path.join(models_dir, "checkpoints")
    os.makedirs(checkpoints, exist_ok=True)
    with open(os.path.join(checkpoints, "some-other-model.safetensors"), "w", encoding="utf-8") as handle:
        handle.write("stub")

    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    # A stray unrelated checkpoint file must NOT mark different models ready.
    assert registry.get_record("flux-dev")["status"] == "not_found"
    assert registry.get_record("sdxl-base")["status"] == "not_found"


def test_unrelated_file_in_diffusers_dir_does_not_mark_pipelines_ready():
    models_dir = tempfile.mkdtemp()
    diffusers = os.path.join(models_dir, "diffusers")
    os.makedirs(diffusers, exist_ok=True)
    with open(os.path.join(diffusers, "stray.txt"), "w", encoding="utf-8") as handle:
        handle.write("stub")

    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    assert registry.get_record("sd3.5-large")["status"] == "not_found"
    assert registry.get_record("animatediff")["status"] == "not_found"


def test_checkpoint_present_when_id_named_dir_is_populated():
    models_dir = tempfile.mkdtemp()
    target = os.path.join(models_dir, "checkpoints", "sdxl-base")
    os.makedirs(target, exist_ok=True)
    with open(os.path.join(target, "sdxl-base.safetensors"), "w", encoding="utf-8") as handle:
        handle.write("stub")

    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    assert registry.get_record("sdxl-base")["status"] == "ready"
