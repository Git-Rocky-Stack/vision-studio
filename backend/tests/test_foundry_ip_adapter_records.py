"""#34 PR4: IP-Adapter catalog records + the ip-adapter artifact type."""
import json
import os
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG = json.loads(
    (BACKEND_ROOT / "foundry" / "verified-catalog.json").read_text(encoding="utf-8"))

ADAPTER_IDS = {
    "ip-adapter-sd15": "sd15",
    "ip-adapter-sdxl": "sdxl",
    "ip-adapter-flux": "flux",
}
ENCODER_IDS = ["ip-adapter-encoder-vit-h", "ip-adapter-encoder-clip-vit-l"]


def test_adapter_records_exist_with_families():
    for record_id, family in ADAPTER_IDS.items():
        record = CATALOG[record_id]
        assert record["artifact_type"] == "ip-adapter"
        assert record["base_architecture"] == family
        assert record["format"] == "safetensors"
        assert record["gated"] is False


def test_encoder_records_exist():
    for record_id in ENCODER_IDS:
        record = CATALOG[record_id]
        assert record["artifact_type"] == "ip-adapter"
        assert record["format"] == "safetensors"


def test_files_allowlists_scope_the_downloads():
    assert CATALOG["ip-adapter-sd15"]["files"] == [
        "models/ip-adapter_sd15.safetensors"]
    assert CATALOG["ip-adapter-sdxl"]["files"] == [
        "sdxl_models/ip-adapter_sdxl_vit-h.safetensors"]
    assert CATALOG["ip-adapter-encoder-vit-h"]["files"] == [
        "models/image_encoder/config.json",
        "models/image_encoder/model.safetensors"]
    assert CATALOG["ip-adapter-flux"]["files"] == ["ip_adapter.safetensors"]
    assert CATALOG["ip-adapter-encoder-clip-vit-l"]["files"] == [
        "config.json", "preprocessor_config.json", "model.safetensors"]


def test_encoder_companions_link_adapters_to_their_encoder():
    assert CATALOG["ip-adapter-sd15"]["companions"] == ["ip-adapter-encoder-vit-h"]
    assert CATALOG["ip-adapter-sdxl"]["companions"] == ["ip-adapter-encoder-vit-h"]
    assert CATALOG["ip-adapter-flux"]["companions"] == ["ip-adapter-encoder-clip-vit-l"]


def test_download_target_is_a_per_id_dir():
    from foundry.download_manager import DownloadManager

    manager = DownloadManager.__new__(DownloadManager)
    manager._models_dir = os.path.join("models-root")
    target = manager._target_dir({"artifact_type": "ip-adapter", "id": "ip-adapter-sd15"})
    assert target == os.path.join("models-root", "ip-adapter", "ip-adapter-sd15")


def test_registry_maps_the_ip_adapter_subdir():
    from foundry.registry import _ARTIFACT_SUBDIR

    assert _ARTIFACT_SUBDIR["ip-adapter"] == "ip-adapter"
