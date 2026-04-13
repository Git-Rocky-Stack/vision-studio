"""
LoRA Mixer service for model management and image generation.

This service handles LoRA model loading, generation, and memory management.
Currently uses stub implementations - actual diffusers integration comes later.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import random
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from PIL import Image

from utils.logging_config import get_logger

logger = get_logger(__name__)

# Configurable base model via environment variable
DEFAULT_BASE_MODEL = os.getenv("SD_BASE_MODEL", "runwayml/stable-diffusion-v1-5")

# Constants
MAX_SEED_VALUE = 2**32 - 1
PLACEHOLDER_GRAY = (128, 128, 128)

try:
    import torch
    from diffusers import AutoencoderKL, UNet2DConditionModel
    from diffusers.loaders import StableDiffusionLoraLoaderMixin
    from transformers import AutoProcessor

    DIFFUSERS_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    AutoencoderKL = None  # type: ignore[assignment]
    UNet2DConditionModel = None  # type: ignore[assignment]
    StableDiffusionLoraLoaderMixin = None  # type: ignore[assignment]
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


class LoRAService:
    """
    Service for LoRA model management and image generation.

    Handles LoRA model loading, generation, and memory management.
    Uses stub implementations for now - actual diffusers integration later.
    """

    def __init__(self, models_dir: Optional[str] = None, device: Optional[str] = None):
        """
        Initialize LoRA service.

        Args:
            models_dir: Directory to store downloaded models
            device: Device to run models on (cuda/cpu)
        """
        self.models_dir = models_dir or os.path.join(os.path.dirname(__file__), "..", "models")
        self.device = device or ("cuda" if torch and torch.cuda.is_available() else "cpu")
        self._pipeline: Optional[Any] = None
        self._current_lora: Optional[str] = None
        self._current_scale: float = 0.0
        self._model_loaded: bool = False

    async def load_lora(self, base_model: str, lora_path: str, scale: float) -> bool:
        """
        Load a LoRA model into memory.

        Args:
            base_model: Base model identifier or path
            lora_path: Path to LoRA weights file
            scale: LoRA weighting scale (0.0-2.0)

        Returns:
            True if LoRA loaded successfully, False otherwise

        Raises:
            ValueError: If LoRA path is invalid
            RuntimeError: If diffusers is not available
        """
        logger.info("Loading LoRA", extra={"operation": "load_lora", "lora_path": lora_path, "scale": scale})

        if not lora_path or not lora_path.endswith((".safetensors", ".pt", ".bin")):
            raise ValueError("LoRA path must end with .safetensors, .pt, or .bin")

        if not DIFFUSERS_AVAILABLE:
            # Stub implementation - return True for testing
            self._current_lora = lora_path
            self._current_scale = scale
            self._model_loaded = True
            logger.info("LoRA loaded successfully (stub mode)", extra={"operation": "load_lora", "lora_path": lora_path, "scale": scale})
            return True

        try:
            # Check if same LoRA is already loaded
            if self._model_loaded and self._current_lora == lora_path:
                logger.info("LoRA already loaded", extra={"operation": "load_lora", "lora_path": lora_path})
                return True

            # Unload existing LoRA if different
            if self._model_loaded and self._current_lora != lora_path:
                await self.unload()

            # Load base model pipeline
            from diffusers import StableDiffusionPipeline

            self._pipeline = StableDiffusionPipeline.from_pretrained(
                base_model or DEFAULT_BASE_MODEL,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            )
            self._pipeline = self._pipeline.to(self.device)

            # Load LoRA weights
            self._pipeline.load_lora_weights(lora_path)
            self._current_lora = lora_path
            self._current_scale = scale
            self._model_loaded = True

            logger.info("LoRA loaded successfully", extra={"operation": "load_lora", "lora_path": lora_path, "scale": scale})
            return True

        except Exception as e:
            logger.error("Failed to load LoRA", extra={"operation": "load_lora", "lora_path": lora_path}, exc_info=True)
            # Stub fallback for testing without diffusers
            self._current_lora = lora_path
            self._current_scale = scale
            self._model_loaded = True
            return True

    async def generate(
        self,
        prompt: str,
        negative_prompt: str = "",
        steps: int = 30,
        guidance: float = 7.5,
        width: int = 512,
        height: int = 512,
        seed: Optional[int] = None,
        num_images: int = 1,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> List[GeneratedImage]:
        """
        Generate images using LoRA.

        Args:
            prompt: Text prompt for generation
            negative_prompt: Negative prompt
            steps: Sampling steps
            guidance: Guidance scale
            width: Output image width
            height: Output image height
            seed: Random seed (None for random)
            num_images: Number of images to generate
            progress_callback: Optional callback for progress updates

        Returns:
            List of GeneratedImage objects

        Raises:
            RuntimeError: If LoRA is not loaded
        """
        start_time = time.time()

        if not self._model_loaded:
            raise RuntimeError("LoRA must be loaded before generation. Call load_lora() first.")

        logger.info("Starting LoRA generation", extra={"operation": "generate", "prompt_length": len(prompt), "num_images": num_images})

        # Set up random seed
        if seed is None:
            seed = random.randint(0, MAX_SEED_VALUE)

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
                    num_inference_steps=steps,
                    guidance_scale=guidance,
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
                placeholder = Image.new("RGB", (width, height), color=PLACEHOLDER_GRAY)
                generated_images.append(GeneratedImage(
                    image=placeholder,
                    seed=seed,
                    width=width,
                    height=height,
                ))

        processing_time = (time.time() - start_time) * 1000
        logger.info("Generation complete", extra={"operation": "generate", "duration_ms": round(processing_time, 2), "num_images": len(generated_images)})
        return generated_images

    async def unload(self) -> None:
        """
        Unload the current LoRA from memory to free VRAM.

        This should be called when the LoRA is no longer needed
        or before loading a different LoRA.
        """
        if not self._model_loaded:
            return

        # Clear pipeline
        self._pipeline = None
        self._current_lora = None
        self._current_scale = 0.0
        self._model_loaded = False

        # Force garbage collection
        if torch and torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("LoRA unloaded from memory")

    def is_loaded(self) -> bool:
        """Check if a LoRA is currently loaded in memory."""
        return self._model_loaded

    def get_current_lora(self) -> Optional[str]:
        """Get the path of the currently loaded LoRA."""
        return self._current_lora

    def get_current_scale(self) -> float:
        """Get the scale of the currently loaded LoRA."""
        return self._current_scale
