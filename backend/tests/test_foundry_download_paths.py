import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_manager import DownloadManager  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def _manager(models_dir):
    return DownloadManager(
        registry=ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH),
        model_manager=ModelManager(models_dir),
        models_dir=models_dir,
    )


class TargetDirPathSafetyTests(unittest.TestCase):
    def test_single_file_artifact_targets_typed_subdir(self):
        manager = _manager(tempfile.mkdtemp())
        record = {"id": "flux-dev", "artifact_type": "checkpoint"}
        target = manager._target_dir(record)
        # Built with os.path.join -> uses the host separator, ends correctly.
        self.assertEqual(os.path.basename(target), "checkpoints")
        self.assertEqual(pathlib.Path(target).name, "checkpoints")

    def test_diffusers_artifact_targets_bundle_dir_by_id(self):
        manager = _manager(tempfile.mkdtemp())
        record = {"id": "ltx-video", "artifact_type": "diffusers-pipeline"}
        target = pathlib.Path(manager._target_dir(record))
        self.assertEqual(target.name, "ltx-video")
        self.assertEqual(target.parent.name, "diffusers")

    def test_join_is_correct_under_a_windows_style_drive_root(self):
        # A pure-path check that holds on both OSes (no real FS access).
        models_dir = "C:\\Users\\u\\AppData\\Roaming\\VisionStudio\\models"
        manager = DownloadManager.__new__(DownloadManager)
        manager._models_dir = models_dir
        record = {"id": "flux-dev", "artifact_type": "checkpoint"}
        target = manager._target_dir(record)
        self.assertTrue(target.startswith(models_dir))
        self.assertTrue(target.endswith("checkpoints"))
        # No doubled or missing separators.
        self.assertNotIn("checkpoints" + os.sep + os.sep, target)

    def test_long_path_join_does_not_truncate_or_corrupt(self):
        deep = os.path.join(tempfile.mkdtemp(), *(["seg"] * 40))
        manager = DownloadManager.__new__(DownloadManager)
        manager._models_dir = deep
        record = {"id": "ltx-video", "artifact_type": "diffusers-pipeline"}
        target = manager._target_dir(record)
        self.assertTrue(target.startswith(deep))
        self.assertEqual(pathlib.Path(target).name, "ltx-video")
        self.assertEqual(len(pathlib.Path(target).parts), len(pathlib.Path(deep).parts) + 2)


if __name__ == "__main__":
    unittest.main()
