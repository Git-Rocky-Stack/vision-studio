import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.indexer import (  # type: ignore[import-not-found]
    IndexedArtifact,
    artifact_to_record,
    scan_tree,
)
from tests.foundry_fixtures import CHECKPOINT_TENSORS, LORA_TENSORS, make_safetensors


class ScanTreeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-indexer-")
        self.root = os.path.join(self.tmp, "comfy")
        make_safetensors(
            os.path.join(self.root, "checkpoints", "dream.safetensors"), CHECKPOINT_TENSORS
        )
        make_safetensors(os.path.join(self.root, "loras", "style.safetensors"), LORA_TENSORS)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_indexes_safetensors_with_types_from_headers(self):
        artifacts, signatures = scan_tree(self.root, "comfyui", "root1", {})
        by_name = {os.path.basename(a.path): a for a in artifacts}
        self.assertEqual(by_name["dream.safetensors"].artifact_type, "checkpoint")
        self.assertEqual(by_name["style.safetensors"].artifact_type, "lora")
        self.assertEqual(len(signatures), 2)

    def test_header_trumps_layout_hint_on_mismatch(self):
        # LoRA keys inside checkpoints/: the header wins (spec 4.4 / seed test 11).
        make_safetensors(
            os.path.join(self.root, "checkpoints", "actually-a-lora.safetensors"), LORA_TENSORS
        )
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        target = next(a for a in artifacts if "actually-a-lora" in a.path)
        self.assertEqual(target.artifact_type, "lora")

    def test_unreadable_header_falls_back_to_layout_hint(self):
        bad = os.path.join(self.root, "loras", "corrupt.safetensors")
        with open(bad, "wb") as handle:
            handle.write(b"\xff" * 32)
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        target = next(a for a in artifacts if "corrupt" in a.path)
        self.assertEqual(target.artifact_type, "lora")

    def test_incremental_skips_unchanged_files(self):
        _, signatures = scan_tree(self.root, "comfyui", "root1", {})
        with mock.patch("foundry.indexer.read_safetensors_header") as header_spy:
            artifacts, _ = scan_tree(self.root, "comfyui", "root1", signatures)
        header_spy.assert_not_called()  # nothing re-read
        self.assertEqual(len(artifacts), 2)  # records still emitted from signatures

    def test_touched_file_is_reindexed(self):
        _, signatures = scan_tree(self.root, "comfyui", "root1", {})
        make_safetensors(
            os.path.join(self.root, "loras", "style.safetensors"),
            {"lora_unet_other.lora_down.weight": [8, 8]},
        )
        from foundry.safetensors_header import read_safetensors_header as real_read_header

        with mock.patch(
            "foundry.indexer.read_safetensors_header", wraps=real_read_header
        ) as header_spy:
            scan_tree(self.root, "comfyui", "root1", signatures)
        self.assertEqual(header_spy.call_count, 1)  # ONLY the touched file

    def test_diffusers_folder_indexed_as_pipeline_dir(self):
        ddir = os.path.join(self.root, "diffusers", "some-pipeline")
        os.makedirs(ddir)
        with open(os.path.join(ddir, "model_index.json"), "w", encoding="utf-8") as handle:
            handle.write("{}")
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        target = next(a for a in artifacts if a.path == ddir)
        self.assertEqual(target.artifact_type, "diffusers-pipeline")

    def test_same_named_pipeline_dirs_with_different_content_get_distinct_identities(self):
        import json as json_module

        a = os.path.join(self.root, "diffusers", "pipeline-x")
        b = os.path.join(self.root, "other", "pipeline-x")
        os.makedirs(a)
        os.makedirs(b)
        with open(os.path.join(a, "model_index.json"), "w", encoding="utf-8") as handle:
            json_module.dump({"_class_name": "StableDiffusionPipeline"}, handle)
        with open(os.path.join(b, "model_index.json"), "w", encoding="utf-8") as handle:
            json_module.dump({"_class_name": "FluxPipeline"}, handle)
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        identities = {a2.identity for a2 in artifacts if a2.artifact_type == "diffusers-pipeline"}
        self.assertEqual(len(identities), 2)

    def test_identical_pipeline_dirs_share_identity(self):
        import json as json_module

        a = os.path.join(self.root, "diffusers", "pipeline-y")
        b = os.path.join(self.root, "other", "pipeline-y")
        os.makedirs(a)
        os.makedirs(b)
        for d in (a, b):
            with open(os.path.join(d, "model_index.json"), "w", encoding="utf-8") as handle:
                json_module.dump({"_class_name": "StableDiffusionPipeline"}, handle)
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        identities = [a2.identity for a2 in artifacts if a2.artifact_type == "diffusers-pipeline"]
        self.assertEqual(len(identities), 2)
        self.assertEqual(identities[0], identities[1])

    def test_indexed_lora_record_carries_compatible_tier_and_reason(self):
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        lora = next(a for a in artifacts if os.path.basename(a.path) == "style.safetensors")
        record = artifact_to_record(lora, {})
        self.assertEqual(record.tier, "compatible")
        self.assertIn("load_lora_weights", record.tier_reason)

    def test_indexed_checkpoint_record_stays_experimental(self):
        artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        checkpoint = next(a for a in artifacts if os.path.basename(a.path) == "dream.safetensors")
        record = artifact_to_record(checkpoint, {})
        self.assertEqual(record.tier, "experimental")
        self.assertIn("single-file", record.tier_reason)

    def test_cached_signature_hit_reuses_persisted_tier_without_reread(self):
        _, signatures = scan_tree(self.root, "comfyui", "root1", {})
        with mock.patch("foundry.indexer.read_safetensors_header") as header_spy:
            artifacts, _ = scan_tree(self.root, "comfyui", "root1", signatures)
        header_spy.assert_not_called()
        lora = next(a for a in artifacts if os.path.basename(a.path) == "style.safetensors")
        self.assertEqual(lora.tier, "compatible")
        self.assertIn("load_lora_weights", lora.tier_reason)

    def test_legacy_four_entry_state_recomputes_tier_with_one_header_read(self):
        _, signatures = scan_tree(self.root, "comfyui", "root1", {})
        legacy = {key: entry[:4] for key, entry in signatures.items()}
        from foundry.safetensors_header import read_safetensors_header as real_read_header

        with mock.patch(
            "foundry.indexer.read_safetensors_header", wraps=real_read_header
        ) as header_spy:
            artifacts, next_signatures = scan_tree(self.root, "comfyui", "root1", legacy)
        self.assertEqual(header_spy.call_count, 2)  # exactly one re-read per legacy entry
        self.assertTrue(all(len(entry) == 6 for entry in next_signatures.values()))
        lora = next(a for a in artifacts if os.path.basename(a.path) == "style.safetensors")
        self.assertEqual(lora.tier, "compatible")
        self.assertIn("load_lora_weights", lora.tier_reason)

    def test_vanished_file_mid_scan_is_skipped_not_fatal(self):
        real_stat = os.stat

        def flaky_stat(path, *args, **kwargs):
            if str(path).endswith("style.safetensors"):
                raise OSError(2, "vanished mid-scan")
            return real_stat(path, *args, **kwargs)

        with mock.patch("foundry.indexer.os.stat", side_effect=flaky_stat):
            artifacts, _ = scan_tree(self.root, "comfyui", "root1", {})
        names = {os.path.basename(a.path) for a in artifacts}
        self.assertIn("dream.safetensors", names)
        self.assertNotIn("style.safetensors", names)


class ArtifactToRecordTests(unittest.TestCase):
    def _artifact(self, **overrides):
        base = dict(
            path=os.path.join("C:" + os.sep, "lib", "style.safetensors"),
            artifact_type="lora",
            identity="4096:aabbccddeeff0011",
            size_bytes=4096,
            mtime_ns=1,
            root_id="root1",
        )
        base.update(overrides)
        return IndexedArtifact(**base)

    def test_unknown_local_record_shape(self):
        # Hand-built artifact with NO stamped tier and NO header keys: this
        # exercises artifact_to_record's keyless FALLBACK path, where even a
        # lora honestly degrades to experimental (family unprovable). Scanned
        # loras of a recognized family arrive with tier="compatible" stamped.
        record = artifact_to_record(self._artifact(), {})
        self.assertEqual(record.id, "local-aabbccddeeff0011")
        self.assertEqual(record.source, "linked")
        self.assertEqual(record.tier, "experimental")
        self.assertIn("unrecognized", record.tier_reason)
        self.assertEqual(record.quality, "local")
        self.assertEqual(record.status, "ready")
        self.assertEqual(record.base_architecture, "unknown")
        self.assertEqual(record.locations, [self._artifact().path])
        self.assertEqual(record.library_root_id, "root1")
        self.assertEqual(record.name, "style")

    def test_known_filename_reconciles_to_catalog_id(self):
        artifact = self._artifact(
            path=os.path.join("C:" + os.sep, "lib", "flux1-dev.safetensors")
        )
        record = artifact_to_record(artifact, {"flux1-dev.safetensors": "flux-dev"})
        self.assertEqual(record.id, "flux-dev")
        self.assertEqual(record.status, "ready")


if __name__ == "__main__":
    unittest.main()
