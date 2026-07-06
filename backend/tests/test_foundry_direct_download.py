"""#34 second half: direct-URL download generalization (github release assets)."""
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_manager import (  # type: ignore[import-not-found]
    _direct_filename,
    validate_direct_url,
)


class ValidateDirectUrlTests(unittest.TestCase):
    def test_accepts_https_github_for_github_source(self):
        validate_direct_url(
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
            "github",
        )

    def test_accepts_https_civitai_for_civitai_source(self):
        validate_direct_url("https://civitai.com/api/download/models/1", "civitai")

    def test_rejects_cross_source_hosts(self):
        with self.assertRaises(ValueError):
            validate_direct_url("https://github.com/x/y", "civitai")
        with self.assertRaises(ValueError):
            validate_direct_url("https://civitai.com/api/download/models/1", "github")

    def test_rejects_http_and_userinfo_spoofs(self):
        with self.assertRaises(ValueError):
            validate_direct_url("http://github.com/x/y", "github")
        with self.assertRaises(ValueError):
            validate_direct_url("https://github.com@evil.example.com/x", "github")

    def test_rejects_subdomains(self):
        with self.assertRaises(ValueError):
            validate_direct_url("https://evil.github.com/x", "github")

    def test_rejects_sources_without_a_direct_path(self):
        with self.assertRaises(ValueError):
            validate_direct_url("https://github.com/x/y", "huggingface")


class DirectFilenameTests(unittest.TestCase):
    def test_pickle_records_get_ckpt(self):
        self.assertEqual(
            _direct_filename("edit-gfpgan-v14", {"format": "pickle"}),
            "edit-gfpgan-v14.ckpt",
        )

    def test_onnx_records_get_onnx(self):
        self.assertEqual(
            _direct_filename("edit-u2net", {"format": "onnx"}), "edit-u2net.onnx"
        )

    def test_default_stays_safetensors(self):
        self.assertEqual(_direct_filename("x", {}), "x.safetensors")


class TargetDirTests(unittest.TestCase):
    def test_edit_model_records_get_a_per_id_dir(self):
        from foundry.download_manager import DownloadManager

        manager = DownloadManager.__new__(DownloadManager)  # no init needed
        manager._models_dir = "models"
        path = manager._target_dir({"artifact_type": "edit-model", "id": "edit-u2net"})
        self.assertEqual(path.replace("\\", "/"), "models/edit-model/edit-u2net")


if __name__ == "__main__":
    unittest.main()
