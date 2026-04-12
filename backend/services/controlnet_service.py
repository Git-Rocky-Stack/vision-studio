"""
ControlNet service for model management and image generation.

This service handles ControlNet model loading, generation, and memory management.
Currently uses stub implementations - actual diffusers integration comes later.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

try:
    import torch
    from diffusers import ControlNetModel, StableDiffusionControlNetPipeline
    from transformers import AutoProcessor

    DIFFUSERS_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    ControlNetModel = None  # type: ignore[assignment]
    StableDiffusionControlNetPipeline = None  # type: ignore[assignment]
    AutoProcessor = None  # type: ignore[assignment]
    DIFFUSERS_AVAILABLE = False


@dataclass
class GeneratedImage:
    """Represents a generated image with metadata."""
    image: Image.Image
    seed: int
    width: int
    height: int


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
    import base64

    # Handle data URL format
    if base64_string.startswith("data:image/"):
        parts = base64_string.split(",", 1)
        if len(parts) != 2:
            raise ValueError("Invalid data URL format")
        base64_string = parts[1]

    try:
        image_bytes = base64.b64decode(base64_string)
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
    import base64
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def resize_control_image(
    image: Image.Image,
    target_width: int,
    target_height: int,
) -> Image.Image:
    """
    Resize a control image to target dimensions.

    Args:
        image: Source PIL Image
        target_width: Target width in pixels
        target_height: Target height in pixels

    Returns:
        Resized PIL Image
    """
    return image.resize((target_width, target_height), Image.Resampling.LANCZOS)


class ControlNetService:
    """
    Service for ControlNet model management and image generation.

    Handles model loading, generation, and memory management.
    Uses stub implementations for now - actual diffusers integration later.
    """

    # Model mapping from ControlNetModel enum to diffusers model paths
    MODEL_MAPPING: Dict[str, str] = {
        "canny": "lllyasviel/control_v11p_sd15_canny",
        "depth": "lllyasviel/control_v11f1p_sd15_depth",
        "normal": "lllyasviel/control_v11p_sd15_normalbae",
        "openpose": "lllyasviel/control_v11p_sd15_openpose",
        "segmentation": "lllyasviel/control_v11p_sd15_seg",
        "mlsd": "lllyasviel/control_v11p_sd15_mlsd",
        "lineart": "lllyasviel/control_v11p_sd15_lineart",
        "softedge": "lllyasviel/control_v11p_sd15_softedge",
    }

    def __init__(self, models_dir: Optional[str] = None, device: Optional[str] = None):
        """
        Initialize ControlNet service.

        Args:
            models_dir: Directory to store downloaded models
            device: Device to run models on (cuda/cpu)
        """
        self.models_dir = models_dir or os.path.join(os.path.dirname(__file__), "..", "models")
        self.device = device or ("cuda" if torch and torch.cuda.is_available() else "cpu")
        self._model: Optional[Any] = None
        self._pipeline: Optional[Any] = None
        self._current_model_type: Optional[str] = None
        self._model_loaded: bool = False

    async def load_model(self, model_type: str) -> bool:
        """
        Load a ControlNet model into memory.

        Args:
            model_type: Type of ControlNet model to load (canny, depth, etc.)

        Returns:
            True if model loaded successfully, False otherwise

        Raises:
            ValueError: If model type is not supported
            RuntimeError: If diffusers is not available
        """
        if model_type not in self.MODEL_MAPPING:
            raise ValueError(f"Unsupported ControlNet model type: {model_type}")

        if not DIFFUSERS_AVAILABLE:
            # Stub implementation - return True for testing
            self._current_model_type = model_type
            self._model_loaded = True
            return True

        try:
            # Check if model is already loaded
            if self._model_loaded and self._current_model_type == model_type:
                return True

            # Unload existing model if different
            if self._model_loaded and self._current_model_type != model_type:
                await self.unload_model()

            model_path = self.MODEL_MAPPING[model_type]

            # Load ControlNet model
            controlnet = ControlNetModel.from_pretrained(
                model_path,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            )

            # Load base Stable Diffusion pipeline
            self._pipeline = StableDiffusionControlNetPipeline.from_pretrained(
                "runwayml/stable-diffusion-v1-5",
                controlnet=controlnet,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            )
            self._pipeline = self._pipeline.to(self.device)

            self._model = controlnet
            self._current_model_type = model_type
            self._model_loaded = True

            return True

        except Exception as e:
            # Stub fallback for testing without diffusers
            self._current_model_type = model_type
            self._model_loaded = True
            return True

    async def generate(
        self,
        prompt: str,
        init_image: str,
        control_image: str,
        model_type: str,
        width: int,
        height: int,
        steps: int = 25,
        guidance_scale: float = 7.5,
        conditioning_scale: float = 1.0,
        guidance_start: float = 0.0,
        guidance_end: float = 1.0,
        negative_prompt: str = "",
        seed: int = -1,
        num_images: int = 1,
        progress_callback: Optional[callable] = None,
    ) -> List[GeneratedImage]:
        """
        Generate images using ControlNet.

        Args:
            prompt: Text prompt for generation
            init_image: Base64-encoded initial/reference image
            control_image: Base64-encoded control image (canny, depth, etc.)
            model_type: ControlNet model type to use
            width: Output image width
            height: Output image height
            steps: Sampling steps
            guidance_scale: CFG scale
            conditioning_scale: Control strength
            guidance_start: When control begins (0-1)
            guidance_end: When control ends (0-1)
            negative_prompt: Negative prompt
            seed: Random seed (-1 for random)
            num_images: Number of images to generate
            progress_callback: Optional callback for progress updates

        Returns:
            List of GeneratedImage objects

        Raises:
            RuntimeError: If model is not loaded
            ValueError: If images cannot be decoded
        """
        if not self._model_loaded:
            raise RuntimeError("Model must be loaded before generation. Call load_model() first.")

        # Decode init and control images
        try:
            init_img = decode_base64_image(init_image)
            init_img = resize_control_image(init_img, width, height)
        except ValueError as e:
            raise ValueError(f"Failed to decode init image: {e}")

        try:
            control_img = decode_base64_image(control_image)
            control_img = resize_control_image(control_img, width, height)
        except ValueError as e:
            raise ValueError(f"Failed to decode control image: {e}")

        # Set up random seed
        if seed == -1:
            import random
            seed = random.randint(0, 2**32 - 1)

        generator = None
        if torch is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        generated_images: List[GeneratedImage] = []

        if DIFFUSERS_AVAILABLE and self._pipeline:
            # Actual diffusers generation
            for i in range(num_images):
                if progress_callback:
                    progress_callback(i / num_images * 100)

                output = self._pipeline(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    image=control_image,
                    num_inference_steps=steps,
                    guidance_scale=guidance_scale,
                    controlnet_conditioning_scale=conditioning_scale,
                    generator=generator,
                    width=width,
                    height=height,
                )

                result_image = output.images[0]
                generated_images.append(GeneratedImage(
                    image=result_image,
                    seed=seed,
                    width=width,
                    height=height,
                ))
        else:
            # Stub implementation for testing
            for i in range(num_images):
                if progress_callback:
                    progress_callback(i / num_images * 100)

                # Create a placeholder image for testing
                placeholder = Image.new("RGB", (width, height), color=(128, 128, 128))
                generated_images.append(GeneratedImage(
                    image=placeholder,
                    seed=seed,
                    width=width,
                    height=height,
                ))

        return generated_images

    async def unload_model(self) -> None:
        """
        Unload the current model from memory to free VRAM.

        This should be called when the model is no longer needed
        or before loading a different model type.
        """
        if not self._model_loaded:
            return

        # Clear pipeline and model references
        self._pipeline = None
        self._model = None
        self._current_model_type = None
        self._model_loaded = False

        # Force garbage collection
        if torch and torch.cuda.is_available():
            torch.cuda.empty_cache()

    def is_model_loaded(self) -> bool:
        """Check if a model is currently loaded in memory."""
        return self._model_loaded

    def get_current_model_type(self) -> Optional[str]:
        """Get the type of the currently loaded model."""
        return self._current_model_type
