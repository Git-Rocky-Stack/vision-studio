"""Integration tests for GET /api/models/search (spec 2.3 / 5.1).

Everything network-shaped is patched at the main import site - no test here
ever touches HF or CivitAI. The offline-degrade contract (search failures
return offline=True, never a 5xx) and the transient registry layer (results
become get-able but never listed) are the behaviors under test.
"""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient

import main  # type: ignore[import-not-found]
from foundry.hub_search import SearchResult


def _hf_results():
    return [
        SearchResult(
            id="search-hf--org-sdxl-finetune",
            source="huggingface",
            name="sdxl-finetune",
            repo_id="org/sdxl-finetune",
            tier="compatible",
            tier_reason="diffusers sdxl pipeline - safetensors",
            base_architecture="sdxl",
            downloads=1200,
        ),
        SearchResult(
            id="search-hf--org-mystery-model",
            source="huggingface",
            name="mystery-model",
            repo_id="org/mystery-model",
            tier="experimental",
            tier_reason="no recognized base architecture signals",
        ),
    ]


class SearchApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def tearDown(self):
        # Searches replace the module-level registry's transient layer
        # wholesale; clear it so sibling API tests never see our fixtures.
        main.model_registry.register_transient([])

    def test_hf_happy_path_and_transient_resolution(self):
        with mock.patch.object(
            main.hub_search, "search_hf", return_value=_hf_results()
        ) as search_fn:
            response = self.client.get("/api/models/search", params={"q": "sdxl"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["source"], "hf")
        self.assertEqual(body["query"], "sdxl")
        self.assertFalse(body["offline"])
        self.assertEqual(len(body["results"]), 2)
        by_id = {r["id"]: r for r in body["results"]}
        compatible = by_id["search-hf--org-sdxl-finetune"]
        self.assertEqual(compatible["tier"], "compatible")
        self.assertEqual(compatible["tier_reason"], "diffusers sdxl pipeline - safetensors")
        self.assertEqual(by_id["search-hf--org-mystery-model"]["tier"], "experimental")
        self.assertEqual(search_fn.call_count, 1)

        # The transient layer is wired: results resolve via the detail route...
        detail = self.client.get("/api/models/search-hf--org-sdxl-finetune")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["status"], "not_found")
        # ...but are never listed - the search response is their listing surface.
        listed_ids = {r["id"] for r in self.client.get("/api/models").json()}
        self.assertNotIn("search-hf--org-sdxl-finetune", listed_ids)

    def test_search_failure_degrades_offline_never_5xx(self):
        with mock.patch.object(
            main.hub_search, "search_hf", side_effect=ConnectionError("dns down")
        ):
            response = self.client.get("/api/models/search", params={"q": "sdxl"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["offline"])
        self.assertEqual(body["results"], [])
        self.assertIn("ConnectionError", body["warning"])
        # The exception MESSAGE must not leak into the response (it may carry
        # URLs or token fragments); only the type name is surfaced.
        self.assertNotIn("dns down", body["warning"])

    def test_unknown_source_is_400(self):
        response = self.client.get("/api/models/search", params={"q": "x", "source": "ebay"})
        self.assertEqual(response.status_code, 400)

    def test_civitai_nsfw_off_by_default_and_opt_in_forwarded(self):
        with mock.patch.object(
            main.civitai_search, "search_civitai", return_value=[]
        ) as search_fn:
            default = self.client.get(
                "/api/models/search", params={"q": "anime", "source": "civitai"}
            )
            opted_in = self.client.get(
                "/api/models/search",
                params={"q": "anime", "source": "civitai", "nsfw": "true"},
                headers={"X-Civitai-Token": "civ_secret_456"},
            )
        self.assertEqual(default.status_code, 200)
        self.assertEqual(opted_in.status_code, 200)
        first_kwargs = search_fn.call_args_list[0].kwargs
        second_kwargs = search_fn.call_args_list[1].kwargs
        self.assertFalse(first_kwargs["include_nsfw"])
        self.assertIsNone(first_kwargs["token"])
        self.assertTrue(second_kwargs["include_nsfw"])
        self.assertEqual(second_kwargs["token"], "civ_secret_456")
        # Tokens are per-request locals - never echoed back.
        self.assertNotIn("civ_secret_456", opted_in.text)

    def test_hf_token_header_reaches_hfapi_and_never_leaks(self):
        # HfApi is imported inside the route, so patch the import source.
        with mock.patch("huggingface_hub.HfApi") as hf_api, mock.patch.object(
            main.hub_search, "search_hf", return_value=[]
        ) as search_fn:
            response = self.client.get(
                "/api/models/search",
                params={"q": "flux"},
                headers={"X-HF-Token": "hf_secret_123"},
            )
        self.assertEqual(response.status_code, 200)
        hf_api.assert_called_once_with(token="hf_secret_123")
        # The constructed (mock) client is what the search receives.
        self.assertIs(search_fn.call_args.args[0], hf_api.return_value)
        self.assertNotIn("hf_secret_123", response.text)


if __name__ == "__main__":
    unittest.main()
