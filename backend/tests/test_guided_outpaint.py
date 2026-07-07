"""#34 PR2: AI Expand pre-step - canvas expansion + border mask (stub-CI-safe)."""
import numpy as np
import pytest
from PIL import Image

from guided.outpaint import SEAM_OVERLAP, expand_canvas, normalize_directions


def _source(width=64, height=48):
    """Deterministic non-uniform fixture so preservation checks mean something."""
    array = np.zeros((height, width, 3), dtype=np.uint8)
    array[:, :, 0] = np.tile(np.arange(width, dtype=np.uint8), (height, 1))
    array[:, :, 1] = np.tile(np.arange(height, dtype=np.uint8)[:, None], (1, width))
    return Image.fromarray(array)


def test_normalize_directions_validates_and_dedupes():
    assert normalize_directions(["right", "right", "up"]) == ["right", "up"]
    with pytest.raises(ValueError):
        normalize_directions(["diagonal"])
    with pytest.raises(ValueError):
        normalize_directions([])


def test_expand_right_grows_only_the_right_edge():
    image = _source()
    expanded, mask = expand_canvas(image, ["right"], 32)
    assert expanded.size == (96, 48)
    assert mask.size == (96, 48)
    assert expanded.mode == "RGB"
    assert mask.mode == "L"
    # Original pixels are preserved in place.
    np.testing.assert_array_equal(np.asarray(expanded)[:, :64], np.asarray(image))


def test_mask_covers_border_and_seam_band_only():
    _expanded, mask = expand_canvas(_source(), ["right"], 32)
    mask_array = np.asarray(mask)
    assert (mask_array[:, 64:] == 255).all(), "the new border must repaint"
    assert (mask_array[:, 64 - SEAM_OVERLAP:64] == 255).all(), "seam band repaints"
    assert (mask_array[:, :64 - SEAM_OVERLAP] == 0).all(), "interior is preserved"


def test_multi_direction_fills_corners_and_preserves_the_original():
    image = _source()
    expanded, mask = expand_canvas(image, ["up", "left"], 16)
    assert expanded.size == (80, 64)
    np.testing.assert_array_equal(np.asarray(expanded)[16:, 16:80], np.asarray(image))
    mask_array = np.asarray(mask)
    assert (mask_array[:16, :] == 255).all()
    assert (mask_array[:, :16] == 255).all()
    # Interior past both seam bands stays black.
    assert (mask_array[16 + SEAM_OVERLAP:, 16 + SEAM_OVERLAP:] == 0).all()


def test_pad_wider_than_source_falls_back_to_edge_repeat():
    image = _source(width=24, height=24)
    expanded, _mask = expand_canvas(image, ["left", "right"], 64)
    assert expanded.size == (24 + 128, 24)
    # Edge repeat: the outermost prefill column equals the source edge column.
    np.testing.assert_array_equal(
        np.asarray(expanded)[:, 0], np.asarray(image)[:, 0])


def test_rejects_nonpositive_pixels():
    with pytest.raises(ValueError):
        expand_canvas(_source(), ["right"], 0)
