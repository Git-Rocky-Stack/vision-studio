import json
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.library_roots import (  # type: ignore[import-not-found]
    LAYOUT_SUBDIR_TYPES,
    LibraryRoot,
    RootsStore,
    layout_type_for,
)


class RootsStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-roots-")
        self.store = RootsStore(os.path.join(self.tmp, ".foundry", "library_roots.json"))
        self.root_dir = os.path.join(self.tmp, "comfy")
        os.makedirs(self.root_dir)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_returns_root_with_stable_id(self):
        root = self.store.add(self.root_dir, "comfyui")
        self.assertIsInstance(root, LibraryRoot)
        self.assertEqual(root.layout_hint, "comfyui")
        self.assertTrue(root.id)
        from datetime import datetime

        parsed = datetime.fromisoformat(root.added_at)
        self.assertIsNotNone(parsed.tzinfo)  # UTC-aware ISO timestamp

    def test_add_missing_path_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.store.add(os.path.join(self.tmp, "nope"), "generic")

    def test_add_bad_hint_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.store.add(self.root_dir, "sketchy")

    def test_add_same_path_is_idempotent(self):
        first = self.store.add(self.root_dir, "comfyui")
        second = self.store.add(self.root_dir, "comfyui")
        self.assertEqual(first.id, second.id)
        self.assertEqual(len(self.store.list()), 1)

    def test_persists_across_instances(self):
        added = self.store.add(self.root_dir, "a1111")
        reloaded = RootsStore(os.path.join(self.tmp, ".foundry", "library_roots.json"))
        self.assertEqual([r.id for r in reloaded.list()], [added.id])

    def test_remove(self):
        added = self.store.add(self.root_dir, "generic")
        self.assertTrue(self.store.remove(added.id))
        self.assertEqual(self.store.list(), [])
        self.assertFalse(self.store.remove(added.id))

    def test_corrupt_store_starts_empty_and_preserves_evidence(self):
        store_path = os.path.join(self.tmp, ".foundry", "library_roots.json")
        os.makedirs(os.path.dirname(store_path), exist_ok=True)
        with open(store_path, "w", encoding="utf-8") as handle:
            handle.write("{not json!!")
        store = RootsStore(store_path)
        self.assertEqual(store.list(), [])
        self.assertTrue(os.path.isfile(store_path + ".corrupt"))

    def test_wrong_shape_store_treated_as_corrupt(self):
        store_path = os.path.join(self.tmp, ".foundry", "library_roots.json")
        os.makedirs(os.path.dirname(store_path), exist_ok=True)
        with open(store_path, "w", encoding="utf-8") as handle:
            json.dump({"not": "a list"}, handle)
        store = RootsStore(store_path)
        self.assertEqual(store.list(), [])
        self.assertTrue(os.path.isfile(store_path + ".corrupt"))

    def test_schema_drift_entry_treated_as_corrupt(self):
        import json as json_module

        store_path = os.path.join(self.tmp, ".foundry", "library_roots.json")
        os.makedirs(os.path.dirname(store_path), exist_ok=True)
        with open(store_path, "w", encoding="utf-8") as handle:
            json_module.dump(
                [{"id": "x", "path": "/x", "layout_hint": "generic", "added_at": "2026", "extra": "boom"}],
                handle,
            )
        store = RootsStore(store_path)
        self.assertEqual(store.list(), [])
        self.assertTrue(os.path.isfile(store_path + ".corrupt"))

    def test_save_leaves_no_temp_files(self):
        store_path = os.path.join(self.tmp, ".foundry", "library_roots.json")
        self.store.add(self.root_dir, "comfyui")
        foundry_dir = os.path.dirname(store_path)
        leftovers = [n for n in os.listdir(foundry_dir) if n.endswith(".tmp")]
        self.assertEqual(leftovers, [])
        # Saved store is valid JSON loadable by a fresh instance.
        self.assertEqual(len(RootsStore(store_path).list()), 1)


class LayoutHintTests(unittest.TestCase):
    def test_comfyui_map_types_known_subdirs(self):
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["checkpoints"], "checkpoint")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["loras"], "lora")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["vae"], "vae")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["comfyui"]["controlnet"], "controlnet")

    def test_a1111_map_types_known_subdirs(self):
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["Stable-diffusion"], "checkpoint")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["Lora"], "lora")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["VAE"], "vae")
        self.assertEqual(LAYOUT_SUBDIR_TYPES["a1111"]["embeddings"], "embedding")

    def test_layout_type_for_resolves_first_matching_segment(self):
        rel = os.path.join("models", "Stable-diffusion", "ckpt.safetensors")
        self.assertEqual(layout_type_for("a1111", rel), "checkpoint")

    def test_generic_hint_has_no_opinion(self):
        self.assertIsNone(layout_type_for("generic", os.path.join("anything", "f.safetensors")))


if __name__ == "__main__":
    unittest.main()
