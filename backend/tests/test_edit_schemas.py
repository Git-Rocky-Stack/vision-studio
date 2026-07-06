"""#34: edit request schema validation (source-path job contract)."""
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from pydantic import ValidationError

from schemas.edit import (  # type: ignore[import-not-found]
    BackgroundRemoveRequest,
    EditJobResponse,
    FaceRestoreRequest,
    UpscaleRequest,
)


class BackgroundRemoveRequestTests(unittest.TestCase):
    def test_defaults(self):
        request = BackgroundRemoveRequest(source_path="C:/img.png")
        self.assertEqual(request.edge_refinement, 50)

    def test_source_path_required_and_non_empty(self):
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest()
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(source_path="")

    def test_edge_refinement_bounds(self):
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(source_path="x", edge_refinement=101)
        with self.assertRaises(ValidationError):
            BackgroundRemoveRequest(source_path="x", edge_refinement=-1)


class UpscaleRequestTests(unittest.TestCase):
    def test_defaults(self):
        request = UpscaleRequest(source_path="C:/img.png")
        self.assertEqual(request.scale, 2)
        self.assertEqual(request.model, "general")
        self.assertFalse(request.face_enhance)

    def test_scale_is_two_or_four_only(self):
        UpscaleRequest(source_path="x", scale=4)
        with self.assertRaises(ValidationError):
            UpscaleRequest(source_path="x", scale=8)
        with self.assertRaises(ValidationError):
            UpscaleRequest(source_path="x", scale=3)

    def test_model_is_general_or_anime_only(self):
        UpscaleRequest(source_path="x", model="anime")
        with self.assertRaises(ValidationError):
            UpscaleRequest(source_path="x", model="face")


class FaceRestoreRequestTests(unittest.TestCase):
    def test_defaults(self):
        request = FaceRestoreRequest(source_path="C:/img.png")
        self.assertEqual(request.strength, 50)

    def test_strength_bounds(self):
        with self.assertRaises(ValidationError):
            FaceRestoreRequest(source_path="x", strength=101)
        with self.assertRaises(ValidationError):
            FaceRestoreRequest(source_path="x", strength=-1)


class EditJobResponseTests(unittest.TestCase):
    def test_shape(self):
        response = EditJobResponse(job_id="j", status="pending", message="m")
        self.assertEqual(response.job_id, "j")


if __name__ == "__main__":
    unittest.main()
