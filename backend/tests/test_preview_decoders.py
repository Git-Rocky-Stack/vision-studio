"""#33: taesd decoder registry - family map, dir resolution, FLUX unpack."""

import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from preview import decoders  # noqa: E402


class FamilyMapTests(unittest.TestCase):
    def test_exactly_the_four_supported_families(self):
        self.assertEqual(decoders.FAMILY_DECODERS, {
            "sd15": "taesd",
            "sdxl": "taesdxl",
            "sd35": "taesd3",
            "flux": "taef1",
        })


class ResolveDecodersDirTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))

    def test_env_override_wins(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            self.assertEqual(decoders.resolve_decoders_dir(), self.tmp)

    def test_env_override_pointing_nowhere_disables_previews(self):
        missing = os.path.join(self.tmp, "nope")
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: missing}):
            self.assertIsNone(decoders.resolve_decoders_dir())

    def test_frozen_resolves_beside_the_executable(self):
        exe_dir = os.path.join(self.tmp, "resources")
        os.makedirs(os.path.join(exe_dir, "preview-decoders"))
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(sys, "frozen", True, create=True), \
                mock.patch.object(sys, "executable", os.path.join(exe_dir, "backend.exe")):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertEqual(
                decoders.resolve_decoders_dir(),
                os.path.join(exe_dir, "preview-decoders"))

    def test_source_run_resolves_repo_resources(self):
        backend_root = os.path.join(self.tmp, "repo", "backend")
        target = os.path.join(self.tmp, "repo", "resources", "preview-decoders")
        os.makedirs(backend_root)
        os.makedirs(target)
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(decoders, "_backend_root", lambda: backend_root):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertEqual(
                os.path.normpath(decoders.resolve_decoders_dir()),
                os.path.normpath(target))

    def test_packaged_source_fallback_resolves_sibling_dir(self):
        backend_root = os.path.join(self.tmp, "res", "backend-source")
        target = os.path.join(self.tmp, "res", "preview-decoders")
        os.makedirs(backend_root)
        os.makedirs(target)
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(decoders, "_backend_root", lambda: backend_root):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertEqual(
                os.path.normpath(decoders.resolve_decoders_dir()),
                os.path.normpath(target))

    def test_nothing_installed_returns_none(self):
        backend_root = os.path.join(self.tmp, "empty", "backend")
        os.makedirs(backend_root)
        with mock.patch.dict(os.environ, {}, clear=False), \
                mock.patch.object(decoders, "_backend_root", lambda: backend_root):
            os.environ.pop(decoders.ENV_DECODERS_DIR, None)
            self.assertIsNone(decoders.resolve_decoders_dir())


class DecoderDirForFamilyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(self.tmp, ignore_errors=True))

    def test_unsupported_family_raises(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            for family in ("svd", "ltx", "animatediff", "unknown", None):
                with self.assertRaises(decoders.PreviewDecoderUnavailable):
                    decoders.decoder_dir_for_family(family)

    def test_missing_weights_dir_raises(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            with self.assertRaises(decoders.PreviewDecoderUnavailable):
                decoders.decoder_dir_for_family("sd15")

    def test_installed_family_resolves(self):
        os.makedirs(os.path.join(self.tmp, "taesd"))
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            self.assertEqual(
                decoders.decoder_dir_for_family("sd15"),
                os.path.join(self.tmp, "taesd"))

    def test_error_messages_carry_no_paths(self):
        with mock.patch.dict(os.environ, {decoders.ENV_DECODERS_DIR: self.tmp}):
            try:
                decoders.decoder_dir_for_family("sd15")
            except decoders.PreviewDecoderUnavailable as exc:
                self.assertNotIn(self.tmp, str(exc))
                self.assertNotIn("\\", str(exc))


def test_flux_unpack_shape_and_patch_placement():
    torch = pytest.importorskip("torch")

    # width=64, height=32 -> lat 8x4 -> patch grid 4x2 -> 8 packed patches of 64.
    packed = torch.zeros(1, 8, 64)
    packed[0, 0, :] = 1.0  # only patch (0, 0) carries signal

    unpacked = decoders._unpack_flux_latents(packed, width=64, height=32)

    assert tuple(unpacked.shape) == (1, 16, 4, 8)
    # Patch (0, 0) covers the 2x2 top-left spatial block on every channel...
    assert torch.all(unpacked[0, :, 0:2, 0:2] == 1.0)
    # ...and nothing else.
    assert float(unpacked.abs().sum()) == float(unpacked[0, :, 0:2, 0:2].sum())


def test_flux_unpack_constant_stays_constant():
    torch = pytest.importorskip("torch")
    packed = torch.full((1, 8, 64), 3.5)
    unpacked = decoders._unpack_flux_latents(packed, width=64, height=32)
    assert torch.all(unpacked == 3.5)


if __name__ == "__main__":
    unittest.main()
