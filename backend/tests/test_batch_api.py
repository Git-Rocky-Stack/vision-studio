"""Tests for batch export API."""
import base64
import io
import zipfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from api.batch import router as batch_router  # type: ignore[import-not-found]


def create_test_base64_image(
    width: int = 100,
    height: int = 100,
    color: tuple = (255, 0, 0),
) -> str:
    """Helper to create a base64-encoded test image."""
    img = Image.new("RGB", (width, height), color=color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


# Create test app with batch router
app = FastAPI()
app.include_router(batch_router)
client = TestClient(app)


class TestBatchExportApi:
    """Tests for POST /api/v1/batch/export-zip endpoint."""

    def test_export_zip_success_single_image(self):
        """Test successful export with single image."""
        # Setup: Add image to store via service
        from services.batch_service import BatchService
        service = BatchService()
        service.images_store["img-001"] = create_test_base64_image(50, 50, (255, 0, 0))

        # Patch the get_service to use our test service
        import api.batch as batch_module
        original_get_service = batch_module.get_service
        batch_module._service = service

        try:
            response = client.post(
                "/api/v1/batch/export-zip",
                json={"image_ids": ["img-001"]},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "zip_file" in data
            assert data["file_count"] == 1
            assert "total_size_bytes" in data
            assert "processing_time_ms" in data

            # Verify ZIP is valid base64
            zip_bytes = base64.b64decode(data["zip_file"])
            assert len(zip_bytes) > 0

            # Verify ZIP contents
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
                assert len(zf.namelist()) == 1
                assert "img-001.png" in zf.namelist()
        finally:
            batch_module._service = None

    def test_export_zip_success_multiple_images(self):
        """Test successful export with multiple images."""
        from services.batch_service import BatchService
        service = BatchService()
        service.images_store["img-001"] = create_test_base64_image(50, 50, (255, 0, 0))
        service.images_store["img-002"] = create_test_base64_image(50, 50, (0, 255, 0))
        service.images_store["img-003"] = create_test_base64_image(50, 50, (0, 0, 255))

        import api.batch as batch_module
        batch_module._service = service

        try:
            response = client.post(
                "/api/v1/batch/export-zip",
                json={
                    "image_ids": ["img-001", "img-002", "img-003"],
                    "format": "jpg",
                    "quality": 85,
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["file_count"] == 3

            zip_bytes = base64.b64decode(data["zip_file"])
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
                assert len(zf.namelist()) == 3
        finally:
            batch_module._service = None

    def test_export_zip_with_resize(self):
        """Test export with image resizing."""
        from services.batch_service import BatchService
        service = BatchService()
        service.images_store["img-large"] = create_test_base64_image(200, 200, (255, 0, 0))

        import api.batch as batch_module
        batch_module._service = service

        try:
            response = client.post(
                "/api/v1/batch/export-zip",
                json={
                    "image_ids": ["img-large"],
                    "resize": {"width": 50, "height": 50},
                },
            )

            assert response.status_code == 200
            data = response.json()

            zip_bytes = base64.b64decode(data["zip_file"])
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
                with zf.open("img-large.png") as f:
                    img = Image.open(f)
                    assert img.width == 50
                    assert img.height == 50
        finally:
            batch_module._service = None

    def test_export_zip_missing_image_returns_404(self):
        """Test that missing images return 404."""
        from services.batch_service import BatchService
        service = BatchService()
        # Empty store - no images

        import api.batch as batch_module
        batch_module._service = service

        try:
            response = client.post(
                "/api/v1/batch/export-zip",
                json={"image_ids": ["nonexistent-001", "nonexistent-002"]},
            )

            assert response.status_code == 404
            data = response.json()
            # HTTPException returns detail dict with error and error_code
            assert "detail" in data
            assert "error" in data["detail"]
            assert "IMAGES_NOT_FOUND" in data["detail"]["error_code"]
        finally:
            batch_module._service = None

    def test_export_zip_partial_missing_images(self):
        """Test export when some images are missing (should continue with existing)."""
        from services.batch_service import BatchService
        service = BatchService()
        service.images_store["img-existing"] = create_test_base64_image(50, 50, (255, 0, 0))
        # img-missing is not in store

        import api.batch as batch_module
        batch_module._service = service

        try:
            response = client.post(
                "/api/v1/batch/export-zip",
                json={"image_ids": ["img-existing", "img-missing"]},
            )

            # Should succeed with the one existing image
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["file_count"] == 1
        finally:
            batch_module._service = None

    def test_export_zip_empty_image_ids_returns_400(self):
        """Test that empty image_ids returns 400 validation error."""
        response = client.post(
            "/api/v1/batch/export-zip",
            json={"image_ids": []},
        )

        # Pydantic validation should reject empty list
        assert response.status_code == 422  # Validation error

    def test_export_zip_invalid_format_returns_422(self):
        """Test that invalid format returns validation error."""
        response = client.post(
            "/api/v1/batch/export-zip",
            json={
                "image_ids": ["img-001"],
                "format": "gif",  # Invalid format
            },
        )

        assert response.status_code == 422

    def test_export_zip_invalid_quality_returns_422(self):
        """Test that invalid quality returns validation error."""
        response = client.post(
            "/api/v1/batch/export-zip",
            json={
                "image_ids": ["img-001"],
                "quality": 150,  # Above max 100
            },
        )

        assert response.status_code == 422

    def test_export_zip_quality_bounds(self):
        """Test quality at min and max bounds."""
        from services.batch_service import BatchService
        service = BatchService()
        service.images_store["img-001"] = create_test_base64_image(50, 50, (255, 0, 0))

        import api.batch as batch_module
        batch_module._service = service

        try:
            # Test minimum quality
            response = client.post(
                "/api/v1/batch/export-zip",
                json={"image_ids": ["img-001"], "quality": 1, "format": "jpg"},
            )
            assert response.status_code == 200

            # Test maximum quality
            response = client.post(
                "/api/v1/batch/export-zip",
                json={"image_ids": ["img-001"], "quality": 100, "format": "jpg"},
            )
            assert response.status_code == 200
        finally:
            batch_module._service = None
