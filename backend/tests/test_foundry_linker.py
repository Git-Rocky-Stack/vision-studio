import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.linker import (  # type: ignore[import-not-found]
    LinkLedger,
    is_reparse_point,
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
        # Differently-cased / differently-separated spelling of the same path.
        alt = dest.replace(os.sep, "/").upper() if sys.platform == "win32" else dest
        self.assertTrue(ledger.is_foundry_link(alt))


if __name__ == "__main__":
    unittest.main()
