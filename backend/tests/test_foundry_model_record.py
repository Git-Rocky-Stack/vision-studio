import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.model_record import (  # type: ignore[import-not-found]
    LEGACY_ID_ALIASES,
    ModelRecord,
    load_catalog,
)

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"


class FoundryModelRecordTests(unittest.TestCase):
    def test_load_catalog_returns_model_records_keyed_by_id(self):
        records = load_catalog(str(CATALOG_PATH))
        assert isinstance(records, dict)
        assert all(isinstance(value, ModelRecord) for value in records.values())
        assert records["flux-dev"].name == "FLUX.1 [dev]"
        assert records["flux-dev"].tier == "verified"
        assert records["animatediff"].aux_repo_id == "guoyww/animatediff-motion-adapter-v1-5-2"

    def test_to_dict_roundtrips_all_canonical_fields(self):
        record = ModelRecord(
            id="x", name="X", artifact_type="checkpoint", capability="image",
            base_architecture="sdxl", source="huggingface", repo_id="org/x",
            size="1 GB", description="desc",
        )
        data = record.to_dict()
        assert data["id"] == "x"
        assert data["revision"] == "main"          # default
        assert data["status"] == "not_found"       # default
        assert data["tier"] == "verified"          # default
        assert data["gated"] is False              # default
        assert data["hardware_class"] == "unknown" # default

    def test_legacy_aliases_map_to_canonical_ids(self):
        records = load_catalog(str(CATALOG_PATH))
        for alias, canonical in LEGACY_ID_ALIASES.items():
            assert canonical in records, f"alias {alias} -> missing {canonical}"


    def test_m4_fields_default_and_serialize(self):
        record = ModelRecord(
            id="x", name="X", artifact_type="checkpoint", capability="image",
            base_architecture="sdxl", source="huggingface",
        )
        data = record.to_dict()
        self.assertIsNone(data["tier_reason"])
        self.assertIsNone(data["format"])
        self.assertFalse(data["trust_remote_code"])
        self.assertFalse(data["nsfw"])
        self.assertIsNone(data["download_url"])
        self.assertIsNone(data["sha256"])

    def test_m4_fields_round_trip(self):
        record = ModelRecord(
            id="x", name="X", artifact_type="lora", capability="image",
            base_architecture="sdxl", source="civitai",
            tier="compatible", tier_reason="standalone sdxl lora - safetensors",
            format="safetensors", nsfw=False,
            download_url="https://civitai.com/api/download/models/1",
            sha256="ab" * 32,
        )
        data = record.to_dict()
        self.assertEqual(data["tier_reason"], "standalone sdxl lora - safetensors")
        self.assertEqual(data["format"], "safetensors")
        self.assertEqual(data["sha256"], "ab" * 32)


if __name__ == "__main__":
    unittest.main()
