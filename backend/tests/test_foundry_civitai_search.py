"""CivitAI search - REST mocked. NSFW filtered by default; pickle detected."""

import pathlib
import sys
import unittest
from unittest.mock import MagicMock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.civitai_search import CIVITAI_BASE_FAMILY, search_civitai


def civitai_item(**kw):
    base = {
        "id": 42,
        "name": "Pixel Lora",
        "type": "LORA",
        "nsfw": False,
        "nsfwLevel": 1,
        "creator": {"username": "artist"},
        "stats": {"downloadCount": 5000, "thumbsUpCount": 100},
        "modelVersions": [
            {
                "id": 99,
                "baseModel": "SDXL 1.0",
                "files": [
                    {
                        "name": "pixel.safetensors",
                        "sizeKB": 100000,
                        "metadata": {"format": "SafeTensor"},
                        "hashes": {"SHA256": "AB" * 32},
                        "downloadUrl": "https://civitai.com/api/download/models/99",
                        "pickleScanResult": "Success",
                        "virusScanResult": "Success",
                    }
                ],
            }
        ],
    }
    base.update(kw)
    return base


class CivitaiSearchTests(unittest.TestCase):
    def _session(self, items):
        session = MagicMock()
        session.get.return_value = MagicMock(
            status_code=200, json=MagicMock(return_value={"items": items, "metadata": {}})
        )
        return session

    def test_safetensor_sdxl_lora_compatible(self):
        results = search_civitai("pixel", session=self._session([civitai_item()]))
        self.assertEqual(results[0].tier, "compatible")
        self.assertEqual(results[0].base_architecture, "sdxl")
        self.assertEqual(results[0].format, "safetensors")
        self.assertEqual(results[0].sha256, "ab" * 32)
        self.assertTrue(results[0].download_url.startswith("https://civitai.com/"))

    def test_safetensor_checkpoint_compatible_via_from_single_file(self):
        # The "until M5" promise is kept: known-family SafeTensor checkpoints
        # load via from_single_file with a catalog-pinned config (Task 9).
        item = civitai_item(type="Checkpoint")
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "compatible")
        self.assertIn("from_single_file", results[0].tier_reason)

    def test_checkpoint_without_safetensor_marker_stays_experimental(self):
        # fmt None/Other must never fail open into Compatible (false-Compatible=0).
        item = civitai_item(type="Checkpoint")
        item["modelVersions"][0]["files"][0]["metadata"]["format"] = "Other"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")
        self.assertIn("unverified", results[0].tier_reason)

    def test_svd_checkpoint_carved_out_of_single_file_upgrade(self):
        item = civitai_item(type="Checkpoint")
        item["modelVersions"][0]["baseModel"] = "SVD"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")
        self.assertIn("from_single_file", results[0].tier_reason)

    def test_pickle_tensor_experimental_with_consent_reason(self):
        item = civitai_item()
        item["modelVersions"][0]["files"][0]["metadata"]["format"] = "PickleTensor"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")
        self.assertEqual(results[0].format, "pickle")
        self.assertIn("consent", results[0].tier_reason)

    def test_unknown_base_vocab_experimental_never_a_guess(self):
        item = civitai_item()
        item["modelVersions"][0]["baseModel"] = "SomeFutureBase 9.0"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")

    def test_nsfw_excluded_by_default_and_param_sent(self):
        session = self._session([civitai_item(nsfw=True)])
        results = search_civitai("x", session=session)
        self.assertEqual(results, [])  # client-side guard even if API leaks one
        params = session.get.call_args.kwargs["params"]
        self.assertEqual(params["nsfw"], "false")

    def test_nsfw_opt_in_includes_and_flags(self):
        session = self._session([civitai_item(nsfw=True)])
        results = search_civitai("x", session=session, include_nsfw=True)
        self.assertTrue(results[0].nsfw)

    def test_token_header_injected_never_in_params(self):
        session = self._session([])
        search_civitai("x", session=session, token="civ_SECRET")
        headers = session.get.call_args.kwargs["headers"]
        self.assertEqual(headers["Authorization"], "Bearer civ_SECRET")
        self.assertNotIn("civ_SECRET", str(session.get.call_args.kwargs.get("params")))

    def test_pony_and_illustrious_map_to_sdxl(self):
        self.assertEqual(CIVITAI_BASE_FAMILY["Pony"], "sdxl")
        self.assertEqual(CIVITAI_BASE_FAMILY["Illustrious"], "sdxl")

    def test_unverified_format_never_fails_open_to_compatible(self):
        # CivitAI also emits "Other"/"Diffusers"/missing metadata.format;
        # a known-family lora WITHOUT a SafeTensor marker must not be
        # Compatible (false-Compatible=0 invariant, positive signal required).
        for format_value in ("Other", None):
            item = civitai_item()
            if format_value is None:
                item["modelVersions"][0]["files"][0]["metadata"] = {}
            else:
                item["modelVersions"][0]["files"][0]["metadata"]["format"] = format_value
            results = search_civitai("x", session=self._session([item]))
            with self.subTest(format=format_value):
                self.assertEqual(results[0].tier, "experimental")
                self.assertIn("unverified", results[0].tier_reason)

    def test_video_families_carry_video_capability(self):
        item = civitai_item(type="Checkpoint")
        item["modelVersions"][0]["baseModel"] = "SVD"
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].capability, "video")
        self.assertEqual(results[0].base_architecture, "svd")


if __name__ == "__main__":
    unittest.main()
