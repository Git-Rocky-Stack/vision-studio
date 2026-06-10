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

    def test_checkpoint_stays_experimental_until_m5(self):
        item = civitai_item(type="Checkpoint")
        results = search_civitai("x", session=self._session([item]))
        self.assertEqual(results[0].tier, "experimental")
        self.assertIn("single-file", results[0].tier_reason)

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


if __name__ == "__main__":
    unittest.main()
