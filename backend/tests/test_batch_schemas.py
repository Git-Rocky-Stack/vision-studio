"""Tests for batch export Pydantic schemas."""
import pytest
from pydantic import ValidationError

from schemas.batch import BatchExportRequest, BatchExportResponse, BatchErrorResponse


class TestBatchExportRequest:
    """Tests for BatchExportRequest schema validation."""

    def test_valid_request_minimal(self):
        """Test valid request with minimal required fields."""
        request = BatchExportRequest(
            image_ids=["img-001", "img-002"],
        )
        assert request.image_ids == ["img-001", "img-002"]
        assert request.format == "png"
        assert request.quality == 95
        assert request.resize is None

    def test_valid_request_full(self):
        """Test valid request with all fields specified."""
        request = BatchExportRequest(
            image_ids=["img-001", "img-002", "img-003"],
            format="jpg",
            quality=85,
            resize={"width": 1024, "height": 768},
        )
        assert request.image_ids == ["img-001", "img-002", "img-003"]
        assert request.format == "jpg"
        assert request.quality == 85
        assert request.resize == {"width": 1024, "height": 768}

    def test_empty_image_ids_raises_error(self):
        """Test that empty image_ids list raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            BatchExportRequest(image_ids=[])
        assert "image_ids" in str(exc_info.value)

    def test_format_validation_png(self):
        """Test that format accepts png."""
        request = BatchExportRequest(
            image_ids=["img-001"],
            format="png",
        )
        assert request.format == "png"

    def test_format_validation_jpg(self):
        """Test that format accepts jpg."""
        request = BatchExportRequest(
            image_ids=["img-001"],
            format="jpg",
        )
        assert request.format == "jpg"

    def test_format_validation_webp(self):
        """Test that format accepts webp."""
        request = BatchExportRequest(
            image_ids=["img-001"],
            format="webp",
        )
        assert request.format == "webp"

    def test_invalid_format_raises_error(self):
        """Test that invalid format raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            BatchExportRequest(
                image_ids=["img-001"],
                format="gif",
            )
        assert "format" in str(exc_info.value)

    def test_quality_bounds_min(self):
        """Test quality minimum bound (1)."""
        request = BatchExportRequest(
            image_ids=["img-001"],
            quality=1,
        )
        assert request.quality == 1

    def test_quality_bounds_max(self):
        """Test quality maximum bound (100)."""
        request = BatchExportRequest(
            image_ids=["img-001"],
            quality=100,
        )
        assert request.quality == 100

    def test_quality_below_min_raises_error(self):
        """Test that quality below 1 raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            BatchExportRequest(
                image_ids=["img-001"],
                quality=0,
            )
        assert "quality" in str(exc_info.value)

    def test_quality_above_max_raises_error(self):
        """Test that quality above 100 raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            BatchExportRequest(
                image_ids=["img-001"],
                quality=101,
            )
        assert "quality" in str(exc_info.value)

    def test_resize_optional(self):
        """Test that resize is optional and defaults to None."""
        request = BatchExportRequest(image_ids=["img-001"])
        assert request.resize is None

    def test_resize_with_dimensions(self):
        """Test resize with width and height."""
        request = BatchExportRequest(
            image_ids=["img-001"],
            resize={"width": 800, "height": 600},
        )
        assert request.resize == {"width": 800, "height": 600}


class TestBatchExportResponse:
    """Tests for BatchExportResponse schema."""

    def test_valid_response(self):
        """Test valid response creation."""
        response = BatchExportResponse(
            success=True,
            zip_file="UEsDBBQAAAAI...",
            file_count=5,
            total_size_bytes=102400,
            processing_time_ms=1234.56,
        )
        assert response.success is True
        assert response.zip_file == "UEsDBBQAAAAI..."
        assert response.file_count == 5
        assert response.total_size_bytes == 102400
        assert response.processing_time_ms == 1234.56

    def test_response_with_zero_files(self):
        """Test response with zero file count."""
        response = BatchExportResponse(
            success=True,
            zip_file="UEsFBgAAAAABAAEASgAAADwAAAAAAA==",
            file_count=0,
            total_size_bytes=22,
            processing_time_ms=10.0,
        )
        assert response.success is True
        assert response.file_count == 0


class TestBatchErrorResponse:
    """Tests for BatchErrorResponse schema."""

    def test_error_response(self):
        """Test error response creation."""
        response = BatchErrorResponse(
            success=False,
            error="Image not found: img-999",
            error_code="IMAGE_NOT_FOUND",
        )
        assert response.success is False
        assert response.error == "Image not found: img-999"
        assert response.error_code == "IMAGE_NOT_FOUND"

    def test_error_response_missing_image(self):
        """Test error response for missing images."""
        response = BatchErrorResponse(
            success=False,
            error="One or more images not found",
            error_code="MISSING_IMAGES",
        )
        assert response.success is False
        assert response.error == "One or more images not found"
        assert response.error_code == "MISSING_IMAGES"
