"""#34: GFPGAN orchestration against fake helper/restorer seams (no torch/facexlib)."""
import pathlib
import sys
import unittest

import numpy as np
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from edit_tools.faces import restore_faces  # type: ignore[import-not-found]
from edit_tools.weights import EditCancelled, EditModelUnavailable  # type: ignore[import-not-found]


class FakeHelper:
    """Mimics facexlib.FaceRestoreHelper's orchestration surface."""

    def __init__(self, face_count: int):
        self._face_count = face_count
        self.cropped_faces = []
        self.restored = []
        self.pasted = None

    def clean_all(self):
        self.cropped_faces = []
        self.restored = []

    def read_image(self, bgr):
        self._image = bgr

    def get_face_landmarks_5(self, **kwargs):
        return self._face_count

    def align_warp_face(self):
        self.cropped_faces = [
            np.full((512, 512, 3), 100, dtype=np.uint8) for _ in range(self._face_count)
        ]

    def add_restored_face(self, face):
        self.restored.append(face)

    def get_inverse_affine(self, _):
        pass

    def paste_faces_to_input_image(self):
        self.pasted = np.full_like(self._image, 200)
        return self.pasted


def _brighten(crop: np.ndarray) -> np.ndarray:
    return np.full_like(crop, 220)


class RestoreFacesTests(unittest.TestCase):
    def test_zero_faces_returns_the_input_unchanged(self):
        image = Image.new("RGB", (32, 32), (10, 20, 30))
        result, count = restore_faces(image, 50, helper=FakeHelper(0), restore_crop=_brighten)
        self.assertEqual(count, 0)
        np.testing.assert_array_equal(np.asarray(result), np.asarray(image))

    def test_detected_faces_are_restored_and_counted(self):
        helper = FakeHelper(2)
        image = Image.new("RGB", (64, 64), (10, 20, 30))
        result, count = restore_faces(image, 100, helper=helper, restore_crop=_brighten)
        self.assertEqual(count, 2)
        self.assertEqual(len(helper.restored), 2)
        self.assertIsNotNone(helper.pasted)
        # strength 100 -> the restored crop lands verbatim
        np.testing.assert_array_equal(
            helper.restored[0], np.full((512, 512, 3), 220, np.uint8)
        )

    def test_strength_blends_restored_over_original(self):
        helper = FakeHelper(1)
        restore_faces(Image.new("RGB", (64, 64)), 50, helper=helper, restore_crop=_brighten)
        # original crop 100, restored 220, strength 0.5 -> 160
        self.assertEqual(int(helper.restored[0][0, 0, 0]), 160)

    def test_strength_zero_keeps_the_original_crop(self):
        helper = FakeHelper(1)
        restore_faces(Image.new("RGB", (64, 64)), 0, helper=helper, restore_crop=_brighten)
        self.assertEqual(int(helper.restored[0][0, 0, 0]), 100)

    def test_cancellation_between_faces(self):
        helper = FakeHelper(3)
        seen = []

        def restore(crop):
            seen.append(1)
            return _brighten(crop)

        with self.assertRaises(EditCancelled):
            restore_faces(Image.new("RGB", (64, 64)), 50, helper=helper,
                          restore_crop=restore, cancel_check=lambda: len(seen) >= 1)
        self.assertEqual(len(seen), 1)

    def test_missing_runtime_refuses_loudly(self):
        import edit_tools.faces as faces_module
        original = faces_module.FaceRestoreHelper
        faces_module.FaceRestoreHelper = None
        try:
            with self.assertRaises(EditModelUnavailable):
                restore_faces(Image.new("RGB", (8, 8)), 50,
                              gfpgan_path="x", detection_path="y", parsing_path="z")
        finally:
            faces_module.FaceRestoreHelper = original


if __name__ == "__main__":
    unittest.main()
