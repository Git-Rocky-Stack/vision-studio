"""#34 PR1: vector canvas masks -> PIL L masks. Pure PIL - runs on stub CI."""
import pytest

from guided.masks import mask_coverage, rasterize_mask


def _mask(mask_type, points, bounds, brush_size=None):
    return {
        "type": mask_type,
        "points": [{"x": x, "y": y} for x, y in points],
        "bounds": bounds,
        "brush_size": brush_size,
    }


def test_rectangle_fills_bounds():
    mask = _mask("rectangle", [(10, 10), (50, 10), (50, 30), (10, 30)],
                 {"x": 10, "y": 10, "width": 40, "height": 20})
    img = rasterize_mask(mask, 100, 100)
    assert img.mode == "L"
    assert img.size == (100, 100)
    assert img.getpixel((30, 20)) == 255   # inside
    assert img.getpixel((5, 5)) == 0       # outside
    assert img.getpixel((80, 80)) == 0


def test_polygon_fills_interior_only():
    mask = _mask("polygon", [(0, 0), (60, 0), (0, 60)],
                 {"x": 0, "y": 0, "width": 60, "height": 60})
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((10, 10)) == 255   # inside the triangle
    assert img.getpixel((59, 59)) == 0     # outside the hypotenuse


def test_brush_stroke_covers_path_with_width():
    mask = _mask("brush", [(20, 50), (80, 50)],
                 {"x": 20, "y": 50, "width": 60, "height": 0}, brush_size=10)
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((50, 50)) == 255   # on the stroke
    assert img.getpixel((50, 54)) == 255   # within radius (10/2 = 5px)
    assert img.getpixel((50, 70)) == 0     # far off the stroke


def test_brush_without_brush_size_uses_default_radius():
    mask = _mask("brush", [(20, 50), (80, 50)],
                 {"x": 20, "y": 50, "width": 60, "height": 0})
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((50, 50)) == 255
    assert mask_coverage(img) > 0.0


def test_erase_alone_produces_empty_mask():
    # A standalone erase stroke subtracts from nothing - honest empty result.
    mask = _mask("erase", [(20, 50), (80, 50)],
                 {"x": 20, "y": 50, "width": 60, "height": 0}, brush_size=10)
    img = rasterize_mask(mask, 100, 100)
    assert mask_coverage(img) == 0.0


def test_points_clamped_to_canvas():
    mask = _mask("rectangle", [(-10, -10), (500, -10), (500, 500), (-10, 500)],
                 {"x": -10, "y": -10, "width": 510, "height": 510})
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((50, 50)) == 255
    assert img.size == (100, 100)


def test_empty_points_produce_empty_mask():
    mask = _mask("polygon", [], {"x": 0, "y": 0, "width": 0, "height": 0})
    img = rasterize_mask(mask, 100, 100)
    assert mask_coverage(img) == 0.0


def test_unknown_type_raises():
    mask = _mask("lasso", [(1, 1)], {"x": 0, "y": 0, "width": 2, "height": 2})
    with pytest.raises(ValueError):
        rasterize_mask(mask, 100, 100)


def test_coverage_fraction():
    mask = _mask("rectangle", [(0, 0), (50, 0), (50, 100), (0, 100)],
                 {"x": 0, "y": 0, "width": 50, "height": 100})
    img = rasterize_mask(mask, 100, 100)
    assert 0.45 < mask_coverage(img) < 0.55
