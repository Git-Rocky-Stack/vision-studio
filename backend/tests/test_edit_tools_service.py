"""#34: edit operation dispatch (weights + heavy passes monkeypatched)."""
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import edit_tools.service as service  # type: ignore[import-not-found]
from edit_tools.weights import EditModelUnavailable, EditToolError  # type: ignore[import-not-found]


def _write_source(directory: str) -> str:
    path = os.path.join(directory, "source.png")
    Image.new("RGB", (32, 16), (50, 60, 70)).save(path)
    return path


def _ready_resolver(record_id):
    return {"status": "ready", "format": "onnx" if record_id == "edit-u2net" else "pickle"}


class RunEditOperationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = _write_source(self.tmp.name)
        self.output_root = os.path.join(self.tmp.name, "outputs")

    def _run(self, operation, params, **kwargs):
        return service.run_edit_operation(
            "job-1", operation, {"source_path": self.source, **params},
            self.output_root, self.tmp.name, kwargs.pop("resolve_record", _ready_resolver),
            **kwargs,
        )

    def test_unreadable_source_is_a_path_free_edit_error(self):
        broken = os.path.join(self.tmp.name, "broken.png")
        with open(broken, "w", encoding="utf-8") as handle:
            handle.write("not an image")
        with self.assertRaises(EditToolError) as ctx:
            service.run_edit_operation(
                "job-1", "remove-background", {"source_path": broken},
                self.output_root, self.tmp.name, _ready_resolver,
            )
        self.assertNotIn(self.tmp.name, str(ctx.exception))

    def test_missing_weights_surface_the_foundry_refusal(self):
        with self.assertRaises(EditModelUnavailable) as ctx:
            self._run("remove-background", {}, resolve_record=lambda _record_id: None)
        self.assertIn("edit-u2net", str(ctx.exception))

    def test_remove_background_writes_rgba_and_reports_it(self):
        with mock.patch.object(service, "require_edit_weights", return_value="w.onnx"), \
             mock.patch.object(service, "remove_background",
                               return_value=Image.new("RGBA", (32, 16))) as passthrough:
            result = self._run("remove-background", {"edge_refinement": 80})
        passthrough.assert_called_once()
        self.assertEqual(passthrough.call_args.kwargs.get("model_path"), "w.onnx")
        self.assertEqual(result["images"], ["/outputs/job-1/edit_remove-background.png"])
        saved = Image.open(os.path.join(self.output_root, "job-1", "edit_remove-background.png"))
        self.assertEqual(saved.mode, "RGBA")

    def test_upscale_routes_models_and_reports_scales_honestly(self):
        with mock.patch.object(service, "require_edit_weights", return_value="m.ckpt") as req, \
             mock.patch.object(service, "upscale",
                               return_value=Image.new("RGB", (64, 32))):
            result = self._run("upscale", {"scale": 2, "model": "anime"})
        self.assertEqual(req.call_args.args[0], "edit-realesrgan-x4plus-anime")
        self.assertEqual(result["model_used"], "edit-realesrgan-x4plus-anime")
        self.assertEqual(result["model_scale"], 4)
        self.assertEqual(result["output_scale"], 2)
        self.assertEqual(result["original_size"], [32, 16])
        self.assertEqual(result["new_size"], [64, 32])

    def test_upscale_face_enhance_runs_the_face_pass_on_the_result(self):
        with mock.patch.object(service, "require_edit_weights", return_value="w"), \
             mock.patch.object(service, "upscale", return_value=Image.new("RGB", (64, 32))), \
             mock.patch.object(service, "restore_faces",
                               return_value=(Image.new("RGB", (64, 32)), 1)) as faces:
            result = self._run("upscale", {"scale": 2, "face_enhance": True})
        faces.assert_called_once()
        self.assertEqual(result["faces_detected"], 1)

    def test_restore_faces_reports_honest_zero(self):
        with mock.patch.object(service, "require_edit_weights", return_value="w"), \
             mock.patch.object(service, "restore_faces",
                               return_value=(Image.new("RGB", (32, 16)), 0)):
            result = self._run("restore-faces", {"strength": 70})
        self.assertEqual(result["faces_detected"], 0)

    def test_unknown_operation_refuses(self):
        with self.assertRaises(EditToolError):
            self._run("sharpen", {})


if __name__ == "__main__":
    unittest.main()
