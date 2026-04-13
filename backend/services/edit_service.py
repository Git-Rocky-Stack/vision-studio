"""
Edit service for AI-powered image editing tools.

Provides services for:
- Background removal (rembg)
- Image upscaling (Real-ESRGAN)
- Face restoration (GFPGAN)

All tools use stub implementations for now - actual model integration later.
"""

from __future__ import annotations

import base64
import logging
import os
import time
from io import BytesIO
from typing import Optional, Tuple

from PIL import Image

from utils.logging_config import get_logger

logger = get_logger(__name__)

# Configuration via environment variables
REMBG_MODEL = os.getenv("REMBG_MODEL", "u2net")
REAL_ESRGAN_MODEL_PATH = os.getenv("REAL_ESRGAN_MODEL_PATH", "models/RealESRGAN_x4plus.pth")
GFPGAN_MODEL_PATH = os.getenv("GFPGAN_MODEL_PATH", "models/GFPGANv1.4.pth")


def decode_base64_image(base64_string: str) -> Image.Image:
    """
    Decode a base64-encoded image string to PIL Image.

    Handles both raw base64 and data URL formats.

    Args:
        base64_string: Base64-encoded image data

    Returns:
        PIL Image object

    Raises:
        ValueError: If base64 string is invalid
    """
    # Handle data URL format
    if base64_string.startswith("data:image/"):
        parts = base64_string.split(",", 1)
        if len(parts) != 2:
            raise ValueError("Invalid data URL format")
        base64_string = parts[1]

    try:
        image_bytes = base64.b64decode(base64_string, validate=True)
        return Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise ValueError(f"Failed to decode base64 image: {e}")


def encode_image_base64(image: Image.Image, format: str = "PNG") -> str:
    """
    Encode a PIL Image to base64 string.

    Args:
        image: PIL Image to encode
        format: Output format (PNG, JPEG, etc.)

    Returns:
        Base64-encoded image string
    """
    buffer = BytesIO()
    image.save(buffer, format=format)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def validate_base64_image(base64_string: str) -> None:
    """
    Validate that a string is a valid base64-encoded image.

    Args:
        base64_string: String to validate

    Raises:
        ValueError: If string is not valid base64 image data
    """
    if not base64_string:
        raise ValueError("Image data is empty")

    # Handle data URL format
    if base64_string.startswith("data:image/"):
        parts = base64_string.split(",", 1)
        if len(parts) != 2:
            raise ValueError("Invalid data URL format")
        base64_string = parts[1]

    # Check if it's valid base64
    try:
        base64.b64decode(base64_string, validate=True)
    except Exception as e:
        raise ValueError(f"Invalid base64 encoding: {e}")


class EditService:
    """
    Service for AI-powered image editing tools.

    Handles background removal, upscaling, and face restoration.
    Uses stub implementations for now - actual model integration later.
    """

    def __init__(self, models_dir: Optional[str] = None):
        """
        Initialize Edit service.

        Args:
            models_dir: Directory containing model files
        """
        self.models_dir = models_dir or os.path.join(os.path.dirname(__file__), "..", "models")
        self._models_loaded: dict[str, bool] = {
            "rembg": False,
            "realesrgan": False,
            "gfpgan": False,
        }

    async def remove_background(
        self,
        image: str,
        alpha_matting: bool = False,
        alpha_matting_foreground_threshold: int = 240,
        alpha_matting_background_threshold: int = 10,
    ) -> Tuple[str, float]:
        """
        Remove background from an image.

        Args:
            image: Base64-encoded input image
            alpha_matting: Enable alpha matting for refined edges
            alpha_matting_foreground_threshold: Foreground threshold (0-255)
            alpha_matting_background_threshold: Background threshold (0-255)

        Returns:
            Tuple of (base64-encoded image with alpha, processing time in ms)

        Raises:
            ValueError: If image is invalid
            RuntimeError: If background removal fails
        """
        logger.info("Starting background removal", extra={"operation": "remove_background", "alpha_matting": alpha_matting})
        start_time = time.time()

        # Validate input
        validate_base64_image(image)

        # Decode image
        try:
            img = decode_base64_image(image)
        except ValueError as e:
            raise ValueError(f"Failed to decode input image: {e}")

        logger.debug(f"Input image size: {img.size}")

        # Stub implementation - create image with alpha channel
        # In production, this would use rembg:
        # from rembg import remove
        # result = remove(
        #     img,
        #     alpha_matting=alpha_matting,
        #     alpha_matting_foreground_threshold=alpha_matting_foreground_threshold,
        #     alpha_matting_background_threshold=alpha_matting_background_threshold,
        # )

        # Create RGBA version with transparent background (stub)
        result = img.convert("RGBA")
        # For stub, just make it RGBA without actual removal

        # Encode result
        result_base64 = encode_image_base64(result, format="PNG")

        processing_time_ms = (time.time() - start_time) * 1000
        logger.info("Background removal complete", extra={"operation": "remove_background", "duration_ms": round(processing_time_ms, 2)})

        return result_base64, processing_time_ms

    async def upscale(
        self,
        image: str,
        scale: int = 4,
        face_enhance: bool = False,
    ) -> Tuple[str, Tuple[int, int], Tuple[int, int], float]:
        """
        Upscale an image using Real-ESRGAN.

        Args:
            image: Base64-encoded input image
            scale: Upscale factor (2, 4, or 8)
            face_enhance: Enable face enhancement for portraits

        Returns:
            Tuple of (base64-encoded upscaled image, original_size, new_size, processing time in ms)
            where size tuples are (width, height)

        Raises:
            ValueError: If image is invalid or scale is unsupported
            RuntimeError: If upscaling fails
        """
        logger.info("Starting upscaling", extra={"operation": "upscale", "scale": scale, "face_enhance": face_enhance})
        start_time = time.time()

        # Validate input
        validate_base64_image(image)

        # Validate scale
        if scale not in (2, 4, 8):
            raise ValueError(f"Unsupported scale factor: {scale}. Must be 2, 4, or 8.")

        # Decode image
        try:
            img = decode_base64_image(image)
        except ValueError as e:
            raise ValueError(f"Failed to decode input image: {e}")

        original_size = (img.width, img.height)
        logger.debug(f"Original image size: {original_size}")

        # Stub implementation - resize using PIL
        # In production, this would use Real-ESRGAN:
        # from realesrgan import RealESRGANer
        # upsampler = RealESRGANer(
        #     scale=scale,
        #     model_path=self.models_dir + "/RealESRGAN_x4plus.pth",
        #     model="RealESRGAN_x4plus",
        #     tile=0,
        #     tile_pad=10,
        #     pre_pad=0,
        #     half=True,
        #     gpu_id=None,
        # )
        # if face_enhance:
        #     from gfpgan import GFPGANer
        #     face_enhancer = GFPGANer(...)
        #     result, _ = upsampler.enhance(img, outscale=scale, has_aligned=False, only_center_face=False)
        # else:
        #     result, _ = upsampler.enhance(img, outscale=scale)

        # Stub: simple resize
        new_width = img.width * scale
        new_height = img.height * scale
        result = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        new_size = (result.width, result.height)
        logger.debug(f"Upscaled image size: {new_size}")

        # Encode result
        result_base64 = encode_image_base64(result, format="PNG")

        processing_time_ms = (time.time() - start_time) * 1000
        logger.info("Upscaling complete", extra={"operation": "upscale", "duration_ms": round(processing_time_ms, 2), "original_size": original_size, "new_size": new_size})

        return result_base64, original_size, new_size, processing_time_ms

    async def restore_faces(
        self,
        image: str,
        fidelity: float = 0.5,
    ) -> Tuple[str, int, float]:
        """
        Restore faces in an image using GFPGAN.

        Args:
            image: Base64-encoded input image
            fidelity: Restoration fidelity (0.0-1.0, higher = more faithful to original)

        Returns:
            Tuple of (base64-encoded restored image, faces_detected, processing time in ms)

        Raises:
            ValueError: If image is invalid or fidelity is out of range
            RuntimeError: If face restoration fails
        """
        logger.info("Starting face restoration", extra={"operation": "restore_faces", "fidelity": fidelity})
        start_time = time.time()

        # Validate input
        validate_base64_image(image)

        # Validate fidelity
        if fidelity < 0.0 or fidelity > 1.0:
            raise ValueError(f"Fidelity must be between 0.0 and 1.0, got {fidelity}")

        # Decode image
        try:
            img = decode_base64_image(image)
        except ValueError as e:
            raise ValueError(f"Failed to decode input image: {e}")

        logger.debug(f"Input image size: {img.size}")

        # Stub implementation - return original image
        # In production, this would use GFPGAN:
        # from gfpgan import GFPGANer
        # restorer = GFPGANer(
        #     model_path=self.models_dir + "/GFPGANv1.4.pth",
        #     upscale=2,
        #     arch="clean",
        #     channel_multiplier=2,
        #     bg_upsampler=None,
        # )
        # _, _, output = restorer.enhance(
        #     img,
        #     has_aligned=False,
        #     only_center_face=False,
        #     paste_back=True,
        # )
        # faces_detected = len(output)  # or however GFPGAN reports this

        # Stub: return original image with 0 faces detected
        result = img.convert("RGB")
        faces_detected = 0  # Stub: no faces detected

        # Encode result
        result_base64 = encode_image_base64(result, format="PNG")

        processing_time_ms = (time.time() - start_time) * 1000
        logger.info("Face restoration complete", extra={"operation": "restore_faces", "duration_ms": round(processing_time_ms, 2), "faces_detected": faces_detected})

        return result_base64, faces_detected, processing_time_ms

    async def load_models(self) -> None:
        """
        Pre-load all edit models into memory.

        This is optional and can be called during application startup
        to reduce latency on first request.

        In production, this would download/load actual models.
        """
        logger.info("Loading edit models (stub mode)")

        # Stub: just mark models as loaded
        self._models_loaded["rembg"] = True
        self._models_loaded["realesrgan"] = True
        self._models_loaded["gfpgan"] = True

        logger.info("Edit models loaded successfully (stub mode)")

    async def unload_models(self) -> None:
        """
        Unload all models from memory to free resources.

        In production, this would clear GPU memory.
        """
        logger.info("Unloading edit models")

        self._models_loaded = {
            "rembg": False,
            "realesrgan": False,
            "gfpgan": False,
        }

        logger.info("Edit models unloaded")

    def is_model_loaded(self, model_name: str) -> bool:
        """
        Check if a specific model is loaded.

        Args:
            model_name: Name of the model ('rembg', 'realesrgan', 'gfpgan')

        Returns:
            True if model is loaded, False otherwise
        """
        return self._models_loaded.get(model_name, False)
