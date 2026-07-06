"""#34 second half: the six edit-model records (u2net / Real-ESRGAN / GFPGAN stack)."""
import json
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"

EDIT_RECORD_IDS = [
    "edit-u2net",
    "edit-realesrgan-x4plus",
    "edit-realesrgan-x4plus-anime",
    "edit-gfpgan-v14",
    "edit-face-detection",
    "edit-face-parsing",
]


def _reject_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate key: {key}")
        seen[key] = value
    return seen


class EditRecordTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
            cls.raw = handle.read()
        cls.catalog = json.loads(cls.raw)

    def test_no_duplicate_keys_anywhere_in_the_catalog(self):
        # Regression: controlnet-depth-sdxl / controlnet-openpose-sdxl carried
        # a duplicate "companions" key (leftover from the files addition).
        json.loads(self.raw, object_pairs_hook=_reject_duplicates)

    def test_all_six_records_exist_with_edit_shape(self):
        for record_id in EDIT_RECORD_IDS:
            record = self.catalog.get(record_id)
            self.assertIsNotNone(record, record_id)
            self.assertEqual(record["artifact_type"], "edit-model", record_id)
            self.assertEqual(record["capability"], "edit", record_id)
            self.assertEqual(record["source"], "github", record_id)
            self.assertEqual(record["tier"], "verified", record_id)
            self.assertFalse(record["gated"], record_id)
            self.assertFalse(record.get("trust_remote_code", False), record_id)

    def test_direct_urls_are_pinned_official_https_github_releases(self):
        for record_id in EDIT_RECORD_IDS:
            record = self.catalog[record_id]
            url = record.get("download_url") or ""
            self.assertTrue(url.startswith("https://github.com/"), record_id)
            self.assertIn("/releases/download/", url, record_id)
            sha = (record.get("sha256") or "").strip().lower()
            self.assertRegex(sha, r"^[0-9a-f]{64}$", record_id)

    def test_formats_route_the_consent_gate_correctly(self):
        self.assertEqual(self.catalog["edit-u2net"]["format"], "onnx")
        for record_id in EDIT_RECORD_IDS:
            if record_id == "edit-u2net":
                continue
            self.assertEqual(self.catalog[record_id]["format"], "pickle", record_id)

    def test_gfpgan_companions_close_over_the_facexlib_weights(self):
        record = self.catalog["edit-gfpgan-v14"]
        self.assertEqual(
            sorted(record["companions"]),
            ["edit-face-detection", "edit-face-parsing"],
        )
        for companion_id in record["companions"]:
            self.assertIn(companion_id, self.catalog)

    def test_licenses_are_declared(self):
        self.assertEqual(self.catalog["edit-u2net"]["license"], "apache-2.0")
        self.assertEqual(self.catalog["edit-realesrgan-x4plus"]["license"], "bsd-3-clause")
        self.assertEqual(self.catalog["edit-realesrgan-x4plus-anime"]["license"], "bsd-3-clause")
        self.assertEqual(self.catalog["edit-gfpgan-v14"]["license"], "apache-2.0")


if __name__ == "__main__":
    unittest.main()
