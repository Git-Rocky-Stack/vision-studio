"""RepoSignals parsing - pure, no network. Fixture-driven where possible."""

import json
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hub_signals import (  # type: ignore[import-not-found]
    RepoSignals,
    signals_from_fixture,
    signals_from_listing,
)

CORPUS = pathlib.Path(__file__).parent / "fixtures" / "classifier_corpus"


class FixtureParsingTests(unittest.TestCase):
    def _load(self, name):
        return json.loads((CORPUS / name).read_text(encoding="utf-8"))

    def test_gated_repo_class_from_diffusers_tag(self):
        sig = signals_from_fixture(self._load("black-forest-labs--FLUX.1-dev.json"))
        self.assertEqual(sig.class_name, "FluxPipeline")
        self.assertTrue(sig.gated)
        self.assertTrue(sig.reachable)

    def test_model_index_class_beats_tag(self):
        fixture = self._load("Qwen--Qwen-Image.json")
        sig = signals_from_fixture(fixture)
        self.assertEqual(sig.class_name, "QwenImagePipeline")

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


if __name__ == "__main__":
    unittest.main()
