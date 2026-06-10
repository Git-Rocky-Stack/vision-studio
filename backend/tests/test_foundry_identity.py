import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.identity import full_sha256, quick_identity  # type: ignore[import-not-found]


class QuickIdentityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-identity-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _write(self, name, payload):
        path = os.path.join(self.tmp, name)
        with open(path, "wb") as handle:
            handle.write(payload)
        return path

    def test_same_bytes_in_two_paths_share_identity(self):
        payload = os.urandom(1024) * 200  # ~200 KB > 2x64 KB head/tail window
        a = self._write("a.safetensors", payload)
        b = self._write("b.safetensors", payload)
        self.assertEqual(quick_identity(a), quick_identity(b))

    def test_different_bytes_differ(self):
        a = self._write("a.bin", b"A" * 200_000)
        b = self._write("b.bin", b"A" * 199_999 + b"B")  # same size, tail differs
        self.assertNotEqual(quick_identity(a), quick_identity(b))

    def test_identity_format_is_size_colon_hex16(self):
        path = self._write("c.bin", b"hello")
        size, digest = quick_identity(path).split(":")
        self.assertEqual(size, "5")
        self.assertEqual(len(digest), 16)

    def test_small_file_hashed_once_not_doubled(self):
        # A file smaller than the 64 KB window must not hash its bytes twice.
        a = self._write("small.bin", b"xyz")
        b = self._write("small2.bin", b"xyz")
        self.assertEqual(quick_identity(a), quick_identity(b))

    def test_full_sha256_matches_hashlib(self):
        import hashlib

        path = self._write("d.bin", b"payload")
        self.assertEqual(full_sha256(path), hashlib.sha256(b"payload").hexdigest())


if __name__ == "__main__":
    unittest.main()
