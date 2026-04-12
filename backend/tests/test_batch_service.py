"""Tests for batch export service."""
import base64
import io
import zipfile

import pytest
from PIL import Image

from services.batch_service import BatchService


def create_test_image(width: int = 100, height: int = 100, color: str = "red") -> str:
    """Helper to create a base64-encoded test image."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def create_test_base64_image(
    width: int = 100,
    height: int = 100,
    color: tuple = (255, 0, 0),
) -> str:
    """Helper to create a base64-encoded test image with tuple color."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class TestBatchServiceInitialization:
    """Tests for BatchService initialization."""

    def test_service_initialization_default_store(self):
        """Test that service initializes with empty store by default."""
        service = BatchService()
        assert service.images_store == {}

    def test_service_initialization_custom_store(self):
        """Test that service initializes with provided store."""
        store = {"img-001": "data"}
        service = BatchService(images_store=store)
        assert service.images_store == store


class TestBatchServiceGetImage:
    """Tests for _get_image method."""

    def test_get_image_not_found(self):
        """Test that _get_image returns None for missing image."""
        service = BatchService()
        result = service._get_image("nonexistent")
        assert result is None

    def test_get_image_from_base64(self):
        """Test retrieving an image from base64 data."""
        base64_data = create_test_base64_image(50, 50, (0, 255, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        result = service._get_image("img-001")
        assert result is not None
        assert result.width == 50
        assert result.height == 50
        assert result.mode == "RGB"

    def test_get_image_with_data_url(self):
        """Test retrieving an image with data URL prefix."""
        base64_data = create_test_base64_image(30, 30, (0, 0, 255))
        data_url = f"data:image/png;base64,{base64_data}"
        store = {"img-001": data_url}
        service = BatchService(images_store=store)

        result = service._get_image("img-001")
        assert result is not None
        assert result.width == 30
        assert result.height == 30

    def test_get_image_pil_object(self):
        """Test retrieving a PIL Image object directly."""
        pil_image = Image.new("RGB", (40, 40), color=(128, 128, 128))
        store = {"img-001": pil_image}
        service = BatchService(images_store=store)

        result = service._get_image("img-001")
        assert result is not None
        assert result.width == 40
        assert result.height == 40


class TestBatchServiceExportToZip:
    """Tests for export_to_zip method."""

    def test_export_single_image(self):
        """Test exporting a single image to ZIP."""
        base64_data = create_test_base64_image(100, 100, (255, 0, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img-001"])

        assert count == 1
        assert len(zip_bytes) > 0

        # Verify ZIP contents
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert len(zf.namelist()) == 1
            assert "img-001.png" in zf.namelist()

    def test_export_multiple_images(self):
        """Test exporting multiple images to ZIP."""
        store = {
            "img-001": create_test_base64_image(50, 50, (255, 0, 0)),
            "img-002": create_test_base64_image(50, 50, (0, 255, 0)),
            "img-003": create_test_base64_image(50, 50, (0, 0, 255)),
        }
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img-001", "img-002", "img-003"])

        assert count == 3
        assert len(zip_bytes) > 0

        # Verify ZIP contents
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert len(zf.namelist()) == 3
            assert "img-001.png" in zf.namelist()
            assert "img-002.png" in zf.namelist()
            assert "img-003.png" in zf.namelist()

    def test_export_with_missing_image(self):
        """Test exporting when some images are missing."""
        store = {
            "img-001": create_test_base64_image(50, 50, (255, 0, 0)),
            # img-002 is missing
        }
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img-001", "img-002", "img-003"])

        # Should only export the one existing image
        assert count == 1

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert len(zf.namelist()) == 1
            assert "img-001.png" in zf.namelist()

    def test_export_all_missing_images_raises_error(self):
        """Test that exporting all missing images raises ValueError."""
        service = BatchService(images_store={})

        with pytest.raises(ValueError, match="No valid images found"):
            service.export_to_zip(["img-001", "img-002"])

    def test_export_with_resize(self):
        """Test exporting with image resizing."""
        base64_data = create_test_base64_image(200, 200, (255, 0, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(
            ["img-001"],
            resize={"width": 50, "height": 50},
        )

        assert count == 1

        # Verify image was resized
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            with zf.open("img-001.png") as f:
                img = Image.open(f)
                assert img.width == 50
                assert img.height == 50

    def test_export_jpg_format(self):
        """Test exporting to JPEG format."""
        base64_data = create_test_base64_image(100, 100, (255, 0, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img-001"], format="jpg", quality=85)

        assert count == 1

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert "img-001.jpg" in zf.namelist()

    def test_export_webp_format(self):
        """Test exporting to WEBP format."""
        base64_data = create_test_base64_image(100, 100, (255, 0, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img-001"], format="webp", quality=80)

        assert count == 1

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert "img-001.webp" in zf.namelist()

    def test_export_png_format(self):
        """Test exporting to PNG format."""
        base64_data = create_test_base64_image(100, 100, (255, 0, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img-001"], format="png")

        assert count == 1

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert "img-001.png" in zf.namelist()

    def test_export_with_quality_setting(self):
        """Test that quality setting is applied (both exports succeed)."""
        base64_data = create_test_base64_image(100, 100, (255, 0, 0))
        store = {"img-001": base64_data}
        service = BatchService(images_store=store)

        # Export with low quality - should succeed
        zip_low, count_low = service.export_to_zip(["img-001"], format="jpg", quality=10)
        assert count_low == 1
        assert len(zip_low) > 0

        # Export with high quality - should succeed
        zip_high, count_high = service.export_to_zip(["img-001"], format="jpg", quality=100)
        assert count_high == 1
        assert len(zip_high) > 0

        # Both should produce valid ZIP files with the same image
        with zipfile.ZipFile(io.BytesIO(zip_low), "r") as zf:
            assert "img-001.jpg" in zf.namelist()
        with zipfile.ZipFile(io.BytesIO(zip_high), "r") as zf:
            assert "img-001.jpg" in zf.namelist()

    def test_export_preserves_image_id_in_filename(self):
        """Test that image ID is preserved in ZIP filename."""
        base64_data = create_test_base64_image(50, 50, (255, 0, 0))
        store = {"my-special-image-001": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["my-special-image-001"])

        assert count == 1

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert "my-special-image-001.png" in zf.namelist()

    def test_export_sanitizes_special_chars_in_filename(self):
        """Test that special characters are sanitized from filename."""
        base64_data = create_test_base64_image(50, 50, (255, 0, 0))
        store = {"img@#$%test!": base64_data}
        service = BatchService(images_store=store)

        zip_bytes, count = service.export_to_zip(["img@#$%test!"])

        assert count == 1

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            names = zf.namelist()
            # Should be sanitized to alphanumeric + -_
            assert any("imgtest.png" in name for name in names)
