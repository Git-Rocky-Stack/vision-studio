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


def _compatible_listing(index):
    return listing(id=f"org/model-{index}",
                   tags=["diffusers:StableDiffusionXLPipeline", "safetensors"])


class HfSearchPerformanceTests(unittest.TestCase):
    """P6: bounded parallel verification, TTL cache, correct paging."""

    def test_verification_fetches_run_concurrently_and_bounded(self):
        import threading
        import time

        from foundry import hub_search

        active = {"now": 0, "max": 0}
        guard = threading.Lock()

        def slow_fetch(repo_id):
            with guard:
                active["now"] += 1
                active["max"] = max(active["max"], active["now"])
            time.sleep(0.05)
            with guard:
                active["now"] -= 1
            return full_signals(repo_id)

        api = MagicMock()
        api.list_models.return_value = iter([_compatible_listing(i) for i in range(20)])
        started = time.monotonic()
        results = search_hf(api, query="x", verified_repo_ids=set(), fetch_signals=slow_fetch)
        elapsed = time.monotonic() - started

        self.assertEqual(len(results), 20)
        self.assertTrue(all(r.tier == "compatible" for r in results))
        self.assertGreater(active["max"], 1)
        self.assertLessEqual(active["max"], hub_search.MAX_PARALLEL_VERIFICATIONS)
        self.assertLess(elapsed, 20 * 0.05)  # strictly faster than serial
        # Result order follows the listing order, not completion order.
        self.assertEqual([r.repo_id for r in results], [f"org/model-{i}" for i in range(20)])

    def test_listing_is_consumed_lazily(self):
        consumed = []

        def endless():
            index = 0
            while True:
                consumed.append(index)
                yield listing(id=f"org/m-{index}", tags=["diffusers:WanPipeline"])
                index += 1

        api = MagicMock()
        api.list_models.return_value = endless()
        results = search_hf(api, query="x", verified_repo_ids=set(), page=2, page_size=5)
        self.assertEqual([r.repo_id for r in results], [f"org/m-{i}" for i in range(5, 10)])
        self.assertEqual(len(consumed), 10)

    def test_cache_serves_next_page_and_repeat_queries(self):
        from foundry.hub_search import HubSearchCache

        cache = HubSearchCache()
        api = MagicMock()
        api.list_models.side_effect = lambda **kw: iter(
            [_compatible_listing(i) for i in range(kw["limit"])]
        )
        fetch = MagicMock(side_effect=full_signals)

        first = search_hf(api, query="x", verified_repo_ids=set(), page=2, page_size=3,
                          fetch_signals=fetch, cache=cache)
        self.assertEqual([r.repo_id for r in first], ["org/model-3", "org/model-4", "org/model-5"])
        # Page 1 is a prefix of what page 2 already fetched: no new listing call.
        search_hf(api, query="x", verified_repo_ids=set(), page=1, page_size=3,
                  fetch_signals=fetch, cache=cache)
        self.assertEqual(api.list_models.call_count, 1)
        # Repeating page 2 re-uses both the listing and the verified signals.
        fetch.reset_mock()
        search_hf(api, query="x", verified_repo_ids=set(), page=2, page_size=3,
                  fetch_signals=fetch, cache=cache)
        fetch.assert_not_called()
        self.assertEqual(api.list_models.call_count, 1)

    def test_exhausted_listing_is_not_refetched_for_later_pages(self):
        from foundry.hub_search import HubSearchCache

        cache = HubSearchCache()
        api = MagicMock()
        api.list_models.side_effect = lambda **kw: iter([_compatible_listing(0)])
        search_hf(api, query="x", verified_repo_ids=set(), page=1, page_size=5,
                  fetch_signals=MagicMock(side_effect=full_signals), cache=cache)
        results = search_hf(api, query="x", verified_repo_ids=set(), page=2, page_size=5,
                            fetch_signals=MagicMock(side_effect=full_signals), cache=cache)
        self.assertEqual(results, [])
        self.assertEqual(api.list_models.call_count, 1)

    def test_failed_verifications_are_not_cached(self):
        from foundry.hub_search import HubSearchCache

        cache = HubSearchCache()
        api = MagicMock()
        api.list_models.side_effect = lambda **kw: iter([_compatible_listing(0)])
        failing = MagicMock(return_value=RepoSignals(repo_id="org/model-0", reachable=False))
        first = search_hf(api, query="x", verified_repo_ids=set(),
                          fetch_signals=failing, cache=cache)
        self.assertEqual(first[0].tier, "experimental")
        recovered = MagicMock(side_effect=full_signals)
        second = search_hf(api, query="x", verified_repo_ids=set(),
                           fetch_signals=recovered, cache=cache)
        recovered.assert_called_once_with("org/model-0")
        self.assertEqual(second[0].tier, "compatible")

    def test_cache_entries_expire_and_are_scoped_per_token(self):
        from foundry.hub_search import HubSearchCache, token_scope

        now = {"t": 0.0}
        cache = HubSearchCache(ttl_seconds=60, clock=lambda: now["t"])
        cache.put("k", "v")
        self.assertEqual(cache.get("k"), "v")
        now["t"] = 61
        self.assertIsNone(cache.get("k"))

        self.assertEqual(token_scope(None), "anonymous")
        self.assertNotEqual(token_scope("hf_a"), token_scope("hf_b"))
        self.assertNotIn("hf_secret", token_scope("hf_secret"))

        api = MagicMock()
        api.list_models.side_effect = lambda **kw: iter([_compatible_listing(0)])
        fetch = MagicMock(side_effect=full_signals)
        search_hf(api, query="x", verified_repo_ids=set(), fetch_signals=fetch,
                  cache=cache, cache_scope=token_scope("hf_a"))
        search_hf(api, query="x", verified_repo_ids=set(), fetch_signals=fetch,
                  cache=cache, cache_scope=token_scope("hf_b"))
        self.assertEqual(api.list_models.call_count, 2)
        self.assertEqual(fetch.call_count, 2)

    def test_cache_is_bounded(self):
        from foundry.hub_search import HubSearchCache

        cache = HubSearchCache(max_entries=2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.get("a")  # a is now most recently used
        cache.put("c", 3)
        self.assertIsNone(cache.get("b"))
        self.assertEqual(cache.get("a"), 1)
        self.assertEqual(cache.get("c"), 3)


if __name__ == "__main__":
    unittest.main()
