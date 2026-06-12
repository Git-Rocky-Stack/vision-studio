"""HF search - list_models mocked; every result classified with a reason.

Supply-chain gate (Codex M4 review H-1): listing data is PARTIAL - it carries
tags but no file/config census, so it cannot prove "no remote code". Any
verdict that would be Compatible from partial signals must be re-verified
against full repo signals (fetch_signals) before it is surfaced; verification
failure fails closed to Experimental.
"""

import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hub_search import search_hf  # type: ignore[import-not-found]
from foundry.hub_signals import RepoSignals  # type: ignore[import-not-found]

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


def full_signals(repo_id, **kw):
    """Full-fidelity signals for a clean safetensors sdxl repo."""
    base = dict(
        repo_id=repo_id,
        reachable=True,
        library_name="diffusers",
        pipeline_tag="text-to-image",
        tags=["diffusers:StableDiffusionXLPipeline", "safetensors"],
        class_name="StableDiffusionXLPipeline",
        has_auto_map=False,
        py_file_count=0,
        siblings=["model_index.json", "unet/diffusion_pytorch_model.safetensors"],
        has_safetensors=True,
    )
    base.update(kw)
    return RepoSignals(**base)


class HfSearchTests(unittest.TestCase):
    def test_results_classified_with_reasons(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="stabilityai/sdxl-turbo",
                    tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
            listing(id="Wan-AI/Wan2.2-TI2V-5B-Diffusers",
                    tags=["diffusers:WanPipeline", "safetensors"]),
        ])
        fetch = MagicMock(side_effect=full_signals)
        results = search_hf(api, query="turbo", verified_repo_ids=VERIFIED,
                            fetch_signals=fetch)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].tier, "compatible")
        self.assertIn("sdxl", results[0].tier_reason)
        self.assertEqual(results[0].base_architecture, "sdxl")
        self.assertEqual(results[1].tier, "experimental")
        self.assertIn("WanPipeline", results[1].tier_reason)
        # Only the Compatible candidate needed full verification; the
        # Experimental trap must not amplify into extra hub calls.
        fetch.assert_called_once_with("stabilityai/sdxl-turbo")

    def test_verified_catalog_id_marked_verified(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="stabilityai/stable-diffusion-xl-base-1.0",
                    tags=["diffusers:StableDiffusionXLPipeline"]),
        ])
        fetch = MagicMock(side_effect=full_signals)
        results = search_hf(api, query="sdxl", verified_repo_ids=VERIFIED,
                            fetch_signals=fetch)
        self.assertEqual(results[0].tier, "verified")
        # Catalog authority needs no hub round-trip.
        fetch.assert_not_called()

    def test_remote_code_revealed_by_full_signals_downgrades(self):
        # The H-1 exploit shape: tags advertise a shipped class + safetensors,
        # but the repo ships custom Python. Partial data alone would have said
        # Compatible; full signals must veto it.
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="org/evil",
                    tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
        ])
        fetch = MagicMock(return_value=full_signals(
            "org/evil", py_file_count=2,
            siblings=["pipeline.py", "unet/diffusion_pytorch_model.safetensors"],
        ))
        results = search_hf(api, query="evil", verified_repo_ids=set(),
                            fetch_signals=fetch)
        self.assertEqual(results[0].tier, "experimental")
        self.assertTrue(results[0].trust_remote_code)
        self.assertIn("custom code", results[0].tier_reason)

    def test_pickle_only_tree_revealed_by_full_signals_downgrades(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="org/old-dump",
                    tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
        ])
        fetch = MagicMock(return_value=full_signals(
            "org/old-dump",
            tags=["diffusers:StableDiffusionXLPipeline"],
            siblings=["model_index.json", "unet/diffusion_pytorch_model.bin"],
            has_safetensors=False,
        ))
        results = search_hf(api, query="dump", verified_repo_ids=set(),
                            fetch_signals=fetch)
        self.assertEqual(results[0].tier, "experimental")
        self.assertEqual(results[0].format, "pickle")

    def test_fetch_failure_fails_closed_to_experimental(self):
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="org/flaky",
                    tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
        ])
        for failure in (
            MagicMock(return_value=RepoSignals(repo_id="org/flaky", reachable=False)),
            MagicMock(side_effect=ConnectionError("dns down")),
        ):
            results = search_hf(api, query="flaky", verified_repo_ids=set(),
                                fetch_signals=failure)
            self.assertEqual(results[0].tier, "experimental")
            self.assertIn("unverif", results[0].tier_reason)
            # The failure detail must never leak into the reason.
            self.assertNotIn("dns down", results[0].tier_reason)
            api.list_models.return_value = iter([
                listing(id="org/flaky",
                        tags=["diffusers:StableDiffusionXLPipeline", "safetensors"]),
            ])

    def test_gated_partial_compatible_is_also_verified(self):
        # Gated repos still expose their sibling list publicly; the census
        # protects this path too.
        api = MagicMock()
        api.list_models.return_value = iter([
            listing(id="org/gated-with-code",
                    gated="manual",
                    tags=["diffusers:FluxPipeline"]),
        ])
        fetch = MagicMock(return_value=full_signals(
            "org/gated-with-code", gated="manual", py_file_count=1,
            tags=["diffusers:FluxPipeline"], class_name="FluxPipeline",
            siblings=["custom.py"], has_safetensors=False,
        ))
        results = search_hf(api, query="gated", verified_repo_ids=set(),
                            fetch_signals=fetch)
        self.assertEqual(results[0].tier, "experimental")
        self.assertTrue(results[0].trust_remote_code)
        fetch.assert_called_once()

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
        results = search_hf(api, query="x", verified_repo_ids=set(),
                            fetch_signals=MagicMock(side_effect=full_signals))
        self.assertTrue(results[0].id.startswith("search-hf--"))
        self.assertNotIn("/", results[0].id)
        self.assertNotIn(" ", results[0].id)


if __name__ == "__main__":
    unittest.main()
