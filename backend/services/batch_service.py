"""
Batch export service for image processing and ZIP archive creation.

This service handles batch image processing, format conversion,
resizing, and ZIP archive generation.
"""

from __future__ import annotations

import base64
import io
import logging
import time
import zipfile
from typing import Optional

from PIL import Image

from utils.logging_config import get_logger

logger = get_logger(__name__)

# WEBP compression method: 6 = best compression (slowest)
WEBP_BEST_COMPRESSION = 6


class BatchService:
    """
    Service for batch image processing and ZIP export.

    Handles loading images from the in-memory store, processing
    (format conversion, resizing), and creating ZIP archives.
    """

    def __init__(self, images_store: Optional[dict] = None):
        """
        Initialize batch service.

        Args:
            images_store: Dictionary mapping image IDs to image data.
                         If None, uses an empty dict.
        """
        self.images_store = images_store if images_store is not None else {}

    def _get_image(self, image_id: str) -> Optional[Image.Image]:
        """
        Retrieve an image from the store by ID.

        Args:
            image_id: The image identifier

        Returns:
            PIL Image if found, None otherwise
        """
        image_data = self.images_store.get(image_id)
        if image_data is None:
            logger.warning(f"Image not found: {image_id}")
            return None

        try:
            # Handle base64-encoded images
            if isinstance(image_data, str):
                # Strip data URL prefix if present
                if image_data.startswith("data:image/"):
                    parts = image_data.split(",", 1)
                    if len(parts) != 2:
                        logger.error(f"Invalid data URL format for image {image_id}")
                        return None
                    image_data = parts[1]

                image_bytes = base64.b64decode(image_data)
                return Image.open(io.BytesIO(image_bytes)).convert("RGB")
            # Handle PIL Image objects directly
            elif isinstance(image_data, Image.Image):
                return image_data.convert("RGB")
            else:
                logger.error(f"Unknown image data type for {image_id}: {type(image_data)}")
                return None
        except Exception as e:
            logger.error(f"Failed to decode image {image_id}: {e}")
            return None

    def export_to_zip(
        self,
        image_ids: list[str],
        format: str = "png",
        quality: int = 95,
        resize: Optional[dict] = None,
    ) -> tuple[bytes, int]:
        """
        Export multiple images to a ZIP archive.

        Args:
            image_ids: List of image identifiers to export
            format: Output format (png, jpg, webp)
            quality: JPEG/WEBP quality (1-100)
            resize: Optional resize dimensions {"width": int, "height": int}

        Returns:
            Tuple of (ZIP file bytes, number of files in ZIP)

        Raises:
            ValueError: If no valid images are found
        """
        logger.info("Starting batch export", extra={"operation": "export_to_zip", "num_images": len(image_ids), "format": format, "quality": quality})
        start_time = time.time()

        # Create ZIP in memory
        zip_buffer = io.BytesIO()

        file_count = 0
        for image_id in image_ids:
            image = self._get_image(image_id)
            if image is None:
                logger.warning(f"Skipping missing image: {image_id}")
                continue

            try:
                # Apply resize if requested
                if resize and "width" in resize and "height" in resize:
                    width = resize["width"]
                    height = resize["height"]
                    image = image.resize((width, height), Image.Resampling.LANCZOS)
                    logger.debug(f"Resized image {image_id} to {width}x{height}")

                # Convert to target format
                image_buffer = io.BytesIO()
                save_kwargs = {}

                if format.lower() in ("jpg", "jpeg"):
                    # JPEG doesn't support transparency, ensure RGB
                    if image.mode in ("RGBA", "LA", "P"):
                        image = image.convert("RGB")
                    save_kwargs["quality"] = quality
                    save_kwargs["optimize"] = True
                    file_ext = "jpg"
                    save_format = "JPEG"
                elif format.lower() == "webp":
                    save_kwargs["quality"] = quality
                    save_kwargs["method"] = WEBP_BEST_COMPRESSION
                    file_ext = "webp"
                    save_format = "WEBP"
                else:  # png
                    save_kwargs["optimize"] = True
                    file_ext = "png"
                    save_format = "PNG"

                image.save(image_buffer, format=save_format, **save_kwargs)
                image_buffer.seek(0)

                # Add to ZIP archive
                # Sanitize image_id for filename
                safe_filename = "".join(c for c in image_id if c.isalnum() or c in "-_").strip("-_")
                if not safe_filename:
                    safe_filename = f"image_{file_count}"
                zip_filename = f"{safe_filename}.{file_ext}"

                with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED) as zip_file:
                    zip_file.writestr(zip_filename, image_buffer.getvalue())

                file_count += 1
                logger.debug(f"Added {zip_filename} to ZIP")

            except Exception as e:
                logger.error(f"Failed to process image {image_id}: {e}")
                continue

        # Finalize ZIP
        zip_bytes = zip_buffer.getvalue()
        processing_time = (time.time() - start_time) * 1000

        logger.info("Batch export complete", extra={"operation": "export_to_zip", "file_count": file_count, "zip_size_bytes": len(zip_bytes), "duration_ms": round(processing_time, 2)})

        if file_count == 0:
            raise ValueError("No valid images found to export")

        return zip_bytes, file_count
