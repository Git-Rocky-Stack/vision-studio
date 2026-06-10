"""Tier ladder unit tests - precedence, guards, lora channels, null tolerance."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.classifier import (  # type: ignore[import-not-found]
    TierVerdict,
    classify_repo,
    lora_family_from_keys,
    tree_weight_format,
)
from foundry.hub_signals import RepoSignals  # type: ignore[import-not-found]

VERIFIED = {"black-forest-labs/FLUX.1-dev"}


def sig(**kw) -> RepoSignals:
    return RepoSignals(repo_id=kw.pop("repo_id", "org/repo"), **kw)


class PrecedenceTests(unittest.TestCase):
    def test_catalog_beats_everything_even_unreachable(self):
        v = classify_repo(sig(repo_id="black-forest-labs/FLUX.1-dev", reachable=False), VERIFIED)
        self.assertEqual(v.tier, "verified")
        self.assertTrue(v.available is False)

    def test_unreachable_non_catalog_is_unavailable_not_a_tier_error(self):
        v = classify_repo(sig(reachable=False), VERIFIED)
        self.assertFalse(v.available)
        self.assertEqual(v.tier, "experimental")

    def test_library_guard_beats_class_signal(self):
        v = classify_repo(
            sig(library_name="transformers", class_name="StableDiffusionXLPipeline"),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertIn("transformers", v.reason)

    def test_remote_code_guard_beats_class_signal(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="StableDiffusionXLPipeline",
                has_auto_map=True, has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertIn("code", v.reason)

    def test_shipped_class_safetensors_compatible(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="StableDiffusionXLPipeline",
                siblings=["unet/diffusion_pytorch_model.safetensors"], has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("sdxl", v.reason)

    def test_shipped_class_gated_compatible_with_disclosure(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="FluxPipeline", gated="auto"),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("license", v.reason)

    def test_shipped_class_pickle_only_tree_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="StableDiffusionPipeline",
                siblings=["unet/diffusion_pytorch_model.bin", "root-extra.safetensors"],
                has_safetensors=True),
            VERIFIED,
        )
        # Tree-scoped: the loadable tree is pickle; root extras don't vouch (Spike C adj 3).
        self.assertEqual(v.tier, "experimental")
        self.assertIn("consent", v.reason)

    def test_unshipped_class_named_in_reason(self):
        v = classify_repo(sig(library_name="diffusers", class_name="WanPipeline"), VERIFIED)
        self.assertEqual(v.tier, "experimental")
        self.assertIn("WanPipeline", v.reason)

    def test_default_is_experimental_never_silent_compatible(self):
        v = classify_repo(sig(library_name="diffusers"), VERIFIED)
        self.assertEqual(v.tier, "experimental")

    def test_shipped_component_safetensors_compatible(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="ControlNetModel",
                siblings=["diffusion_pytorch_model.safetensors"], has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("ControlNetModel", v.reason)
        self.assertEqual(v.format, "safetensors")

    def test_shipped_component_pickle_only_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", class_name="ControlNetModel",
                siblings=["diffusion_pytorch_model.bin"]),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertEqual(v.format, "pickle")


class LoraChannelTests(unittest.TestCase):
    def test_lora_tag_with_catalog_base_compatible(self):
        v = classify_repo(
            sig(library_name="diffusers",
                tags=["lora", "base_model:stabilityai/stable-diffusion-xl-base-1.0"],
                has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "compatible")
        self.assertIn("sdxl", v.reason)

    def test_lora_tag_unresolvable_base_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", tags=["lora", "base_model:Qwen/Qwen-Image"],
                has_safetensors=True),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")

    def test_header_lora_kohya_sdxl_before_dit(self):
        # kohya sdxl keys CONTAIN transformer_blocks; unet prefix must win (Spike C).
        fam = lora_family_from_keys(
            ["lora_unet_input_blocks_4_1_transformer_blocks_0_attn1_to_k.lora_down.weight"]
        )
        self.assertEqual(fam, "sd-unet-family")

    def test_header_lora_xlabs_flux(self):
        fam = lora_family_from_keys(["double_blocks.0.processor.qkv_lora1.down.weight"])
        self.assertEqual(fam, "flux")

    def test_mixed_artifact_repo_experimental(self):
        v = classify_repo(
            sig(library_name="diffusers", has_safetensors=True,
                siblings=["a_lora.safetensors", "full_ckpt.safetensors"],
                per_file_keys={
                    "a_lora.safetensors": ["lora_unet_x.lora_down.weight"],
                    "full_ckpt.safetensors": ["model.diffusion_model.x.weight"],
                }),
            VERIFIED,
        )
        self.assertEqual(v.tier, "experimental")
        self.assertIn("ambiguous", v.reason)


class HelperTests(unittest.TestCase):
    def test_tree_weight_format_scopes_components(self):
        comp_st, comp_pickle, root_st, root_pickle = tree_weight_format(
            ["unet/diffusion_pytorch_model.bin", "loose.safetensors", "vae/x.safetensors"]
        )
        self.assertEqual((comp_st, comp_pickle, root_st, root_pickle), (1, 1, 1, 0))

    def test_classifier_never_raises_on_empty_signals(self):
        v = classify_repo(RepoSignals(repo_id="x/y"), set())
        self.assertIsInstance(v, TierVerdict)


if __name__ == "__main__":
    unittest.main()
