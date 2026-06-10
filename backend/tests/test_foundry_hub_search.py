"""HF search - list_models mocked; every result classified with a reason."""

import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hub_search import search_hf  # type: ignore[import-not-found]

VERIFIED = {"stabilityai/stable-diffusion-xl-base-1.0"}


def listing(**kw):
    base = {
        "id": "org/model",
        "library_name": "diffusers",
        "pipeline_tag": "text-to-image",
        "tags": [],
        "gated": False,
        "downloads": 1000,
        "likes": 10,
        "author": "org",
    }
    base.update(kw)
    return SimpleNamespace(**base)


class HfSearchTests(unittest.TestCase):
    def test_results_classified_with_reasons(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="stabilityai/sdxl-turbo",
                    tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
            listing(id="Wan-AI/Wan2.2-TI2V-5B-Diffusers",
                    tags=["diffusers:WanPipeline", "safetensors"]),
        ])
        results = search_hf(api, query="turbo", verified_repo_ids=VERIFIED)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].tier, "compatible")
        self.assertIn("sdxl", results[0].tier_reason)
        self.assertEqual(results[1].tier, "experimental")
        self.assertIn("WanPipeline", results[1].tier_reason)

    def test_verified_catalog_id_marked_verified(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="stabilityai/stable-diffusion-xl-base-1.0",
                    tags=["diffusers:StableDiffusionXLPipeline"]),
        ])
        results = search_hf(api, query="sdxl", verified_repo_ids=VERIFIED)
        self.assertEqual(results[0].tier, "verified")

    def test_pagination_and_filters_forwarded(self):
        api = MagicMock()
        api.list_models.return_value = iter([])
        search_hf(api, query="x", verified_repo_ids=set(), task="text-to-video",
                  sort="likes", page=3, page_size=20)
        kwargs = api.list_models.call_args.kwargs
        self.assertEqual(kwargs["search"], "x")
        self.assertEqual(kwargs["pipeline_tag"], "text-to-video")
        self.assertEqual(kwargs["sort"], "likes")
        self.assertEqual(kwargs["limit"], 60)  # page 3 * 20, sliced client-side

    def test_result_ids_are_stable_registry_slugs(self):
        api = MagicMock()
        api.list_models.return_value = iter([listing(id="org/Some Model")])
        results = search_hf(api, query="x", verified_repo_ids=set())
        self.assertTrue(results[0].id.startswith("search-hf--"))
        self.assertNotIn("/", results[0].id)
        self.assertNotIn(" ", results[0].id)


if __name__ == "__main__":
    unittest.main()
