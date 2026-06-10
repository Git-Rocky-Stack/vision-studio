import json
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

from foundry.linker import (  # type: ignore[import-not-found]
    LinkLedger,
    is_reparse_point,
    materialize_link,
    safe_remove,
    same_volume,
)


class PredicateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-linker-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_same_volume_true_for_sibling_paths(self):
        a = os.path.join(self.tmp, "a")
        b = os.path.join(self.tmp, "b")
        os.makedirs(a)
        os.makedirs(b)
        self.assertTrue(same_volume(a, b))

    def test_plain_file_is_not_reparse_point(self):
        path = os.path.join(self.tmp, "f.bin")
        with open(path, "wb") as handle:
            handle.write(b"x")
        self.assertFalse(is_reparse_point(path))


class LinkLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-ledger-")
        self.ledger_path = os.path.join(self.tmp, "links.json")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_then_is_foundry_link(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "app", "model.safetensors")
        ledger.add(mechanism="hardlink", source=os.path.join(self.tmp, "src.safetensors"), dest=dest)
        self.assertTrue(ledger.is_foundry_link(dest))
        self.assertFalse(ledger.is_foundry_link(os.path.join(self.tmp, "unrelated.bin")))

    def test_persists_across_instances(self):
        LinkLedger(self.ledger_path).add(mechanism="copy", source="s", dest=os.path.join(self.tmp, "d"))
        reloaded = LinkLedger(self.ledger_path)
        self.assertTrue(reloaded.is_foundry_link(os.path.join(self.tmp, "d")))
        self.assertEqual(reloaded.entries()[0]["mechanism"], "copy")

    def test_remove_drops_entry(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "d2")
        ledger.add(mechanism="junction", source="s", dest=dest)
        self.assertTrue(ledger.remove(dest))
        self.assertFalse(ledger.is_foundry_link(dest))
        self.assertFalse(ledger.remove(dest))  # second remove is a no-op False

    def test_path_comparison_is_normalized(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "Sub", "d3.bin")
        ledger.add(mechanism="hardlink", source="s", dest=dest)
        # Redundant '.' segment exercises normpath on every platform; Windows
        # additionally gets case-folding + forward slashes.
        alt = os.path.join(os.path.dirname(dest), ".", os.path.basename(dest))
        if sys.platform == "win32":
            alt = alt.replace(os.sep, "/").upper()
        self.assertTrue(ledger.is_foundry_link(alt))

    def test_corrupt_ledger_starts_empty_and_preserves_evidence(self):
        with open(self.ledger_path, "w", encoding="utf-8") as handle:
            handle.write("{not json!!")
        ledger = LinkLedger(self.ledger_path)
        self.assertEqual(ledger.entries(), [])
        self.assertTrue(os.path.isfile(self.ledger_path + ".corrupt"))

    def test_wrong_shape_ledger_treated_as_corrupt(self):
        with open(self.ledger_path, "w", encoding="utf-8") as handle:
            json.dump({"not": "a list"}, handle)
        ledger = LinkLedger(self.ledger_path)
        self.assertEqual(ledger.entries(), [])
        self.assertTrue(os.path.isfile(self.ledger_path + ".corrupt"))

    def test_add_same_dest_twice_upserts(self):
        ledger = LinkLedger(self.ledger_path)
        dest = os.path.join(self.tmp, "d4")
        ledger.add(mechanism="hardlink", source="s1", dest=dest)
        ledger.add(mechanism="copy", source="s2", dest=dest)
        self.assertEqual(len(ledger.entries()), 1)
        self.assertEqual(ledger.entries()[0]["mechanism"], "copy")

    def test_save_leaves_no_temp_files(self):
        ledger = LinkLedger(self.ledger_path)
        ledger.add(mechanism="copy", source="s", dest=os.path.join(self.tmp, "d5"))
        leftovers = [n for n in os.listdir(self.tmp) if n.endswith(".tmp")]
        self.assertEqual(leftovers, [])
        # Saved ledger is valid JSON loadable by a fresh instance.
        self.assertEqual(len(LinkLedger(self.ledger_path).entries()), 1)


class MaterializeLadderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-ladder-")
        self.ledger = LinkLedger(os.path.join(self.tmp, ".foundry", "links.json"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _src_file(self, payload=b"W" * 4096):
        path = os.path.join(self.tmp, "user", "weights.safetensors")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(payload)
        return path

    def test_same_volume_file_hardlinks(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app", "weights.safetensors")
        result = materialize_link(src, dest, self.ledger)
        self.assertEqual(result.mechanism, "hardlink")
        self.assertEqual(os.stat(dest).st_nlink, 2)
        self.assertTrue(self.ledger.is_foundry_link(dest))

    def test_cross_volume_copies_without_link_attempt(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app2", "w.safetensors")
        with mock.patch("foundry.linker.same_volume", return_value=False), mock.patch(
            "foundry.linker.os.link"
        ) as link_spy:
            result = materialize_link(src, dest, self.ledger)
        link_spy.assert_not_called()
        self.assertEqual(result.mechanism, "copy")
        self.assertTrue(os.path.isfile(dest))

    def test_oserror_from_link_falls_back_to_copy(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app3", "w.safetensors")
        winerror17 = OSError(17, "The system cannot move the file to a different disk drive")
        with mock.patch("foundry.linker.os.link", side_effect=winerror17):
            result = materialize_link(src, dest, self.ledger)
        self.assertEqual(result.mechanism, "copy")
        self.assertTrue(os.path.isfile(dest))

    def test_reparse_point_source_is_copy_only(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app4", "w.safetensors")
        with mock.patch("foundry.linker.is_reparse_point", return_value=True), mock.patch(
            "foundry.linker.os.link"
        ) as link_spy:
            result = materialize_link(src, dest, self.ledger)
        link_spy.assert_not_called()
        self.assertEqual(result.mechanism, "copy")

    @unittest.skipUnless(sys.platform == "win32", "Windows-only")
    def test_directory_links_as_junction_on_windows(self):
        srcdir = os.path.join(self.tmp, "user", "diffusers-model")
        os.makedirs(srcdir)
        with open(os.path.join(srcdir, "model_index.json"), "w", encoding="utf-8") as handle:
            handle.write("{}")
        dest = os.path.join(self.tmp, "app5", "diffusers-model")
        result = materialize_link(srcdir, dest, self.ledger)
        self.assertEqual(result.mechanism, "junction")
        self.assertTrue(os.path.isfile(os.path.join(dest, "model_index.json")))
        # Spike-B rule: islink is False for junctions; the ledger is the authority.
        self.assertFalse(os.path.islink(dest))
        self.assertTrue(self.ledger.is_foundry_link(dest))

    @unittest.skipUnless(sys.platform != "win32", "POSIX-only")
    def test_directory_links_as_symlink_on_posix(self):
        srcdir = os.path.join(self.tmp, "user", "diffusers-model")
        os.makedirs(srcdir)
        dest = os.path.join(self.tmp, "app5", "diffusers-model")
        result = materialize_link(srcdir, dest, self.ledger)
        self.assertEqual(result.mechanism, "symlink")

    @unittest.skipUnless(sys.platform == "win32", "Windows-only")
    def test_never_symlinks_on_windows(self):
        src = self._src_file()
        dest = os.path.join(self.tmp, "app6", "w.safetensors")
        with mock.patch("foundry.linker.os.symlink") as symlink_spy:
            materialize_link(src, dest, self.ledger)
        symlink_spy.assert_not_called()


class SafeRemoveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-remove-")
        self.app_root = os.path.join(self.tmp, "models")
        os.makedirs(self.app_root)
        self.ledger = LinkLedger(os.path.join(self.app_root, ".foundry", "links.json"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_removes_app_managed_path(self):
        path = os.path.join(self.app_root, "checkpoints", "m.safetensors")
        os.makedirs(os.path.dirname(path))
        with open(path, "wb") as handle:
            handle.write(b"x")
        self.assertTrue(safe_remove(path, self.ledger, self.app_root))
        self.assertFalse(os.path.exists(path))

    def test_refuses_user_path_not_in_ledger(self):
        user_file = os.path.join(self.tmp, "user", "precious.safetensors")
        os.makedirs(os.path.dirname(user_file))
        with open(user_file, "wb") as handle:
            handle.write(b"x")
        self.assertFalse(safe_remove(user_file, self.ledger, self.app_root))
        self.assertTrue(os.path.exists(user_file))  # bytes untouched

    def test_removes_recorded_foundry_link_outside_app_root(self):
        src = os.path.join(self.tmp, "user", "w.safetensors")
        os.makedirs(os.path.dirname(src), exist_ok=True)
        with open(src, "wb") as handle:
            handle.write(b"x" * 64)
        dest = os.path.join(self.tmp, "elsewhere", "w.safetensors")
        materialize_link(src, dest, self.ledger)
        self.assertTrue(safe_remove(dest, self.ledger, self.app_root))
        self.assertFalse(os.path.exists(dest))
        self.assertTrue(os.path.exists(src))  # source NEVER touched
        self.assertFalse(self.ledger.is_foundry_link(dest))  # ledger entry dropped

    @unittest.skipUnless(sys.platform == "win32", "Windows-only")
    def test_rmtree_through_junction_spares_user_bytes(self):
        # Spike-B E5 regression: rmtree on a tree CONTAINING a junction must not
        # recurse into the junction target.
        user_dir = os.path.join(self.tmp, "user", "lib")
        os.makedirs(user_dir)
        keep = os.path.join(user_dir, "precious.safetensors")
        with open(keep, "wb") as handle:
            handle.write(b"P" * 8192)
        app_tree = os.path.join(self.app_root, "linked")
        os.makedirs(app_tree)
        materialize_link(user_dir, os.path.join(app_tree, "lib"), self.ledger)
        shutil.rmtree(app_tree)
        self.assertTrue(os.path.exists(keep))


if __name__ == "__main__":
    unittest.main()
