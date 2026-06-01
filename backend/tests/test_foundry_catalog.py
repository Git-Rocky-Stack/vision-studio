import json
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"

REQUIRED_FIELDS = {
    "id", "name", "artifact_type", "capability", "base_architecture",
    "source", "repo_id", "revision", "aux_repo_id", "size", "status",
    "tier", "quality", "runtime", "hardware_class", "vram", "description",
    "license", "gated",
}

LEGACY_IDS = {
    "flux-dev", "flux-schnell", "flux-fill", "sd3.5-large", "sd3.5-medium",
    "sdxl-base", "sdxl-refiner", "sd-1-5", "svd", "ltx-video", "animatediff",
    "sdxl-vae", "sd-vae-ft-mse",
}


def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


class FoundryCatalogTests(unittest.TestCase):
    def test_catalog_parses_and_is_keyed_by_id(self):
        catalog = load_catalog()
        assert isinstance(catalog, dict)
        assert len(catalog) >= len(LEGACY_IDS)
        for key, entry in catalog.items():
            assert entry["id"] == key

    def test_every_entry_has_all_required_fields(self):
        catalog = load_catalog()
        for entry in catalog.values():
            missing = REQUIRED_FIELDS - set(entry.keys())
            assert not missing, f"{entry.get('id')} missing {missing}"

    def test_all_legacy_ids_present(self):
        catalog = load_catalog()
        assert LEGACY_IDS.issubset(set(catalog.keys()))

    def test_field_value_domains(self):
        catalog = load_catalog()
        for entry in catalog.values():
            assert entry["capability"] in {"image", "video", "edit", "inpaint"}
            assert entry["tier"] in {"verified", "compatible", "experimental"}
            assert entry["runtime"] in {"local", "comfyui", "cloud", "byom"}
            assert entry["status"] in {"ready", "downloading", "error", "not_found"}
            assert isinstance(entry["gated"], bool)


if __name__ == "__main__":
    unittest.main()
