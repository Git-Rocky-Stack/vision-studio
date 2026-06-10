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
        record = artifact_to_record(self._artifact(), {})
        self.assertEqual(record.id, "local-aabbccddeeff0011")
        self.assertEqual(record.source, "linked")
        self.assertEqual(record.tier, "experimental")
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
