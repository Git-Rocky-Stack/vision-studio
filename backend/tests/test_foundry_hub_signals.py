"""RepoSignals parsing - pure, no network. Fixture-driven where possible.

FetchRepoSignalsTests covers the LIVE path (huggingface_hub fully mocked):
the Codex M4 gate re-review found that the live census must read
config.json / model_index.json - ``auto_map`` can demand remote code with
ZERO local .py files (it may point at another repo), so sibling listing
alone cannot prove "no remote code".
"""

import json
import os
import pathlib
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hub_signals import (  # type: ignore[import-not-found]
    RepoSignals,
    fetch_repo_signals,
    signals_from_fixture,
    signals_from_listing,
)

CORPUS = pathlib.Path(__file__).parent / "fixtures" / "classifier_corpus"


class FixtureParsingTests(unittest.TestCase):
    def _load(self, name):
        return json.loads((CORPUS / name).read_text(encoding="utf-8"))

    def test_gated_repo_class_from_diffusers_tag(self):
        raw = self._load("black-forest-labs--FLUX.1-dev.json")
        # Gated repos hide model_index from unauthenticated capture - the
        # diffusers:<Class> TAG path must carry the class (Spike C finding).
        self.assertIsNone(
            raw.get("model_index"),
            "fixture must have null model_index for this test to exercise the tag path",
        )
        sig = signals_from_fixture(raw)
        self.assertEqual(sig.class_name, "FluxPipeline")
        self.assertTrue(sig.gated)
        self.assertTrue(sig.reachable)

    def test_model_index_class_beats_tag(self):
        fixture = self._load("Qwen--Qwen-Image.json")
        sig = signals_from_fixture(fixture)
        self.assertEqual(sig.class_name, "QwenImagePipeline")
        # Precedence proof: in the real fixture both channels agree, so force
        # a disagreement to verify model_index actually wins over the tag.
        forced = dict(fixture)
        forced["model_index"] = {"_class_name": "OverrideClass"}
        self.assertEqual(
            signals_from_fixture(forced).class_name,
            "OverrideClass",
            "model_index._class_name must beat the diffusers:<Class> tag",
        )

    def test_unreachable_fixture(self):
        sig = signals_from_fixture(self._load("stabilityai--stable-diffusion-2-1.json"))
        self.assertFalse(sig.reachable)
        self.assertEqual(sig.repo_id, "stabilityai/stable-diffusion-2-1")

    def test_remote_code_signals(self):
        sig = signals_from_fixture(self._load("THUDM--chatglm3-6b.json"))
        self.assertTrue(sig.has_auto_map)
        self.assertGreater(sig.py_file_count, 0)

    def test_none_library_tolerated(self):
        sig = signals_from_fixture(self._load("tencent--HunyuanVideo.json"))
        self.assertIsNone(sig.library_name)

    def test_per_file_keys_present_for_lora_repo(self):
        sig = signals_from_fixture(self._load("latent-consistency--lcm-lora-sdxl.json"))
        keys = sig.per_file_keys["pytorch_lora_weights.safetensors"]
        self.assertTrue(any(k.startswith("lora_unet_") for k in keys))


class ListingParsingTests(unittest.TestCase):
    def test_listing_minimal(self):
        sig = signals_from_listing(
            {
                "id": "stabilityai/sdxl-turbo",
                "library_name": "diffusers",
                "pipeline_tag": "text-to-image",
                "tags": ["diffusers:StableDiffusionXLPipeline", "safetensors"],
                "gated": False,
                "downloads": 100,
                "author": "stabilityai",
            }
        )
        self.assertEqual(sig.class_name, "StableDiffusionXLPipeline")
        self.assertTrue(sig.partial)  # listing carries no file census

    def test_listing_missing_everything(self):
        sig = signals_from_listing({"id": "x/y"})
        self.assertIsNone(sig.class_name)
        self.assertEqual(sig.tags, [])


class FetchRepoSignalsTests(unittest.TestCase):
    """Live-path census with huggingface_hub mocked end to end."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-signals-")
        self.addCleanup(__import__("shutil").rmtree, self.tmp, True)

    def _info(self, siblings, gated=False, tags=None):
        return SimpleNamespace(
            tags=tags or ["diffusers:StableDiffusionXLPipeline", "safetensors"],
            siblings=[SimpleNamespace(rfilename=s) for s in siblings],
            gated=gated,
            library_name="diffusers",
            pipeline_tag="text-to-image",
            downloads=100,
            author="org",
            sha="abc123commit",
        )

    def _tiny_files(self, contents):
        """hf_hub_download side effect serving JSON from a temp dir."""
        def download(repo_id, filename, **kwargs):
            if filename not in contents:
                raise FileNotFoundError(filename)
            path = os.path.join(self.tmp, filename.replace("/", "--"))
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(contents[filename], handle)
            return path

        return download

    def _fetch(self, info, downloads=None):
        api = mock.MagicMock()
        api.model_info.return_value = info
        with mock.patch("huggingface_hub.HfApi", return_value=api), \
                mock.patch(
                    "huggingface_hub.hf_hub_download",
                    side_effect=self._tiny_files(downloads or {}),
                ) as dl:
            return fetch_repo_signals("org/model"), dl

    def test_auto_map_detected_from_config_census(self):
        # auto_map can point at code in ANOTHER repo - zero local .py files.
        info = self._info(["config.json", "unet/diffusion_pytorch_model.safetensors"])
        signals, _dl = self._fetch(
            info,
            downloads={"config.json": {"auto_map": {"AutoModel": "other/repo--mod.Cls"}}},
        )
        self.assertTrue(signals.reachable)
        self.assertTrue(signals.has_auto_map)

    def test_model_index_class_beats_tag_on_live_path(self):
        info = self._info(
            ["model_index.json", "unet/x.safetensors"],
            tags=["diffusers:WrongPipeline"],
        )
        signals, _dl = self._fetch(
            info, downloads={"model_index.json": {"_class_name": "StableDiffusionXLPipeline"}}
        )
        self.assertEqual(signals.class_name, "StableDiffusionXLPipeline")

    def test_gated_repo_skips_file_census_and_keeps_tag_signals(self):
        # Pre-license file fetches are impossible; gated repos classify from
        # tags + sibling names with the ladder's disclosure reason.
        info = self._info(["config.json", "unet/x.safetensors"], gated="manual")
        signals, dl = self._fetch(info)
        self.assertTrue(signals.reachable)
        self.assertEqual(signals.class_name, "StableDiffusionXLPipeline")
        dl.assert_not_called()

    def test_census_failure_on_public_repo_fails_closed(self):
        info = self._info(["config.json"])
        api = mock.MagicMock()
        api.model_info.return_value = info
        with mock.patch("huggingface_hub.HfApi", return_value=api), \
                mock.patch(
                    "huggingface_hub.hf_hub_download",
                    side_effect=ConnectionError("cdn down"),
                ):
            signals = fetch_repo_signals("org/model")
        self.assertFalse(signals.reachable)

    def test_no_census_files_means_no_fetch_and_no_auto_map(self):
        info = self._info(["unet/diffusion_pytorch_model.safetensors"])
        signals, dl = self._fetch(info)
        self.assertTrue(signals.reachable)
        self.assertFalse(signals.has_auto_map)
        dl.assert_not_called()

    def test_py_census_is_case_insensitive(self):
        info = self._info(["PIPELINE.PY", "unet/x.safetensors"])
        signals, _dl = self._fetch(info)
        self.assertEqual(signals.py_file_count, 1)

    def test_revision_sha_captured(self):
        info = self._info(["unet/diffusion_pytorch_model.safetensors"])
        signals, _dl = self._fetch(info)
        self.assertEqual(signals.revision, "abc123commit")

    def test_token_is_forwarded_to_both_calls_and_never_stored(self):
        info = self._info(["config.json"])
        api = mock.MagicMock()
        api.model_info.return_value = info
        with mock.patch("huggingface_hub.HfApi", return_value=api) as hf_api, \
                mock.patch(
                    "huggingface_hub.hf_hub_download",
                    side_effect=self._tiny_files({"config.json": {}}),
                ) as dl:
            signals = fetch_repo_signals("org/model", token="hf_secret_42")
        hf_api.assert_called_once_with(token="hf_secret_42")
        self.assertEqual(dl.call_args.kwargs.get("token"), "hf_secret_42")
        self.assertNotIn("hf_secret_42", repr(signals))


if __name__ == "__main__":
    unittest.main()
