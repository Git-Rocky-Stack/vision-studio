"""#34: Foundry-record resolution for the edit tools (stub-CI-safe)."""
import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.weights import (  # type: ignore[import-not-found]
    EditModelUnavailable,
    expected_weights_filename,
    require_edit_weights,
)


def _resolver(record):
    return lambda record_id: record if record is not None else None


class ExpectedFilenameTests(unittest.TestCase):
    def test_tracks_format(self):
        self.assertEqual(expected_weights_filename("edit-u2net", {"format": "onnx"}), "edit-u2net.onnx")
        self.assertEqual(expected_weights_filename("edit-gfpgan-v14", {"format": "pickle"}), "edit-gfpgan-v14.ckpt")
        self.assertEqual(expected_weights_filename("x", {}), "x.safetensors")


class RequireEditWeightsTests(unittest.TestCase):
    def test_missing_record_refuses_with_foundry_copy(self):
        with self.assertRaises(EditModelUnavailable) as ctx:
            require_edit_weights("edit-u2net", _resolver(None), "C:/some/models/dir", "background removal")
        self.assertIn("install 'edit-u2net' from the Foundry first", str(ctx.exception))
        # User-facing copy never leaks the filesystem path.
        self.assertNotIn("C:/some/models/dir", str(ctx.exception))

    def test_not_ready_record_refuses(self):
        record = {"status": "not_found", "format": "onnx"}
        with self.assertRaises(EditModelUnavailable):
            require_edit_weights("edit-u2net", _resolver(record), "models", "background removal")

    def test_ready_but_file_missing_refuses_with_reinstall_copy(self):
        record = {"status": "ready", "format": "onnx"}
        with tempfile.TemporaryDirectory() as models_dir:
            with self.assertRaises(EditModelUnavailable) as ctx:
                require_edit_weights("edit-u2net", _resolver(record), models_dir, "background removal")
        self.assertIn("reinstall 'edit-u2net' from the Foundry", str(ctx.exception))
        self.assertNotIn(models_dir, str(ctx.exception))

    def test_ready_with_file_returns_the_path(self):
        record = {"status": "ready", "format": "onnx"}
        with tempfile.TemporaryDirectory() as models_dir:
            target = os.path.join(models_dir, "edit-model", "edit-u2net")
            os.makedirs(target)
            path = os.path.join(target, "edit-u2net.onnx")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("stub")
            self.assertEqual(
                require_edit_weights("edit-u2net", _resolver(record), models_dir, "background removal"),
                path,
            )


if __name__ == "__main__":
    unittest.main()
