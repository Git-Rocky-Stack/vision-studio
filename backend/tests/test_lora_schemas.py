"""Tests for LoRA Pydantic schemas."""
import pytest
from pydantic import ValidationError

from schemas.lora import LoRARequest, LoRAResponse, LoRAErrorResponse


class TestLoRARequest:
    """Tests for LoRARequest schema validation."""

    def test_valid_request_minimal(self):
        """Test valid request with minimal required fields."""
        request = LoRARequest(
            base_model="runwayml/stable-diffusion-v1-5",
            lora_path="path/to/lora.safetensors",
            prompt="A beautiful landscape",
        )
        assert request.base_model == "runwayml/stable-diffusion-v1-5"
        assert request.lora_path == "path/to/lora.safetensors"
        assert request.prompt == "A beautiful landscape"
        assert request.lora_scale == 0.8
        assert request.num_inference_steps == 30
        assert request.guidance_scale == 7.5
        assert request.width == 512
        assert request.height == 512
        assert request.seed is None
        assert request.num_images == 1

    def test_valid_request_full(self):
        """Test valid request with all fields specified."""
        request = LoRARequest(
            base_model="runwayml/stable-diffusion-v1-5",
            lora_path="path/to/lora.safetensors",
            lora_scale=1.5,
            prompt="A beautiful landscape with mountains",
            negative_prompt="ugly, blurry, low quality",
            num_inference_steps=50,
            guidance_scale=8.0,
            width=1024,
            height=768,
            seed=42,
            num_images=4,
        )
        assert request.lora_scale == 1.5
        assert request.negative_prompt == "ugly, blurry, low quality"
        assert request.num_inference_steps == 50
        assert request.guidance_scale == 8.0
        assert request.width == 1024
        assert request.height == 768
        assert request.seed == 42
        assert request.num_images == 4

    def test_empty_base_model_raises_error(self):
        """Test that empty base_model raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="",
                lora_path="path/to/lora.safetensors",
                prompt="A test prompt",
            )
        assert "base_model" in str(exc_info.value)

    def test_empty_lora_path_raises_error(self):
        """Test that empty lora_path raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="runwayml/stable-diffusion-v1-5",
                lora_path="",
                prompt="A test prompt",
            )
        assert "lora_path" in str(exc_info.value)

    def test_empty_prompt_raises_error(self):
        """Test that empty prompt raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="runwayml/stable-diffusion-v1-5",
                lora_path="path/to/lora.safetensors",
                prompt="",
            )
        assert "prompt" in str(exc_info.value)

    def test_lora_scale_bounds(self):
        """Test lora_scale validation bounds (0.0 to 2.0)."""
        # Valid boundary values
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            lora_scale=0.0,
        )
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            lora_scale=2.0,
        )
        # Invalid: below 0
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                lora_scale=-0.1,
            )
        assert "lora_scale" in str(exc_info.value)
        # Invalid: above 2.0
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                lora_scale=2.1,
            )
        assert "lora_scale" in str(exc_info.value)

    def test_num_inference_steps_bounds(self):
        """Test num_inference_steps validation bounds (1 to 150)."""
        # Valid boundary values
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            num_inference_steps=1,
        )
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            num_inference_steps=150,
        )
        # Invalid: below 1
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                num_inference_steps=0,
            )
        assert "num_inference_steps" in str(exc_info.value)
        # Invalid: above 150
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                num_inference_steps=151,
            )
        assert "num_inference_steps" in str(exc_info.value)

    def test_guidance_scale_bounds(self):
        """Test guidance_scale validation bounds (1.0 to 30.0)."""
        # Valid boundary values
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            guidance_scale=1.0,
        )
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            guidance_scale=30.0,
        )
        # Invalid: below 1.0
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                guidance_scale=0.9,
            )
        assert "guidance_scale" in str(exc_info.value)
        # Invalid: above 30.0
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                guidance_scale=30.1,
            )
        assert "guidance_scale" in str(exc_info.value)

    def test_dimensions_bounds(self):
        """Test width/height validation bounds (64 to 2048)."""
        # Valid boundary values
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            width=64,
            height=64,
        )
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            width=2048,
            height=2048,
        )
        # Invalid: below 64
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                width=63,
            )
        assert "width" in str(exc_info.value)
        # Invalid: above 2048
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                height=2049,
            )
        assert "height" in str(exc_info.value)

    def test_num_images_bounds(self):
        """Test num_images validation bounds (1 to 8)."""
        # Valid boundary values
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            num_images=1,
        )
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            num_images=8,
        )
        # Invalid: below 1
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                num_images=0,
            )
        assert "num_images" in str(exc_info.value)
        # Invalid: above 8
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                num_images=9,
            )
        assert "num_images" in str(exc_info.value)

    def test_seed_validation(self):
        """Test seed validation (must be >= 0 when provided)."""
        # Valid: None is allowed
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            seed=None,
        )
        # Valid: 0 is allowed
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            seed=0,
        )
        # Valid: positive values allowed
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="test",
            seed=999999,
        )
        # Invalid: negative not allowed
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="test",
                seed=-1,
            )
        assert "seed" in str(exc_info.value)

    def test_prompt_max_length(self):
        """Test prompt max_length validation (2000 chars)."""
        # Valid: exactly 2000 chars
        LoRARequest(
            base_model="model",
            lora_path="lora.safetensors",
            prompt="a" * 2000,
        )
        # Invalid: 2001 chars
        with pytest.raises(ValidationError) as exc_info:
            LoRARequest(
                base_model="model",
                lora_path="lora.safetensors",
                prompt="a" * 2001,
            )
        assert "prompt" in str(exc_info.value)


class TestLoRAResponse:
    """Tests for LoRAResponse schema."""

    def test_valid_response(self):
        """Test valid response creation."""
        response = LoRAResponse(
            success=True,
            images=["base64_image_1", "base64_image_2"],
            seed=42,
            processing_time_ms=1234.56,
            lora_applied="path/to/lora.safetensors",
            lora_scale=0.8,
        )
        assert response.success is True
        assert response.images == ["base64_image_1", "base64_image_2"]
        assert response.seed == 42
        assert response.processing_time_ms == 1234.56
        assert response.lora_applied == "path/to/lora.safetensors"
        assert response.lora_scale == 0.8

    def test_response_with_empty_images(self):
        """Test response with empty images list."""
        response = LoRAResponse(
            success=False,
            images=[],
            seed=0,
            processing_time_ms=0.0,
            lora_applied="",
            lora_scale=0.0,
        )
        assert response.success is False
        assert response.images == []


class TestLoRAErrorResponse:
    """Tests for LoRAErrorResponse schema."""

    def test_error_response(self):
        """Test error response creation."""
        response = LoRAErrorResponse(
            success=False,
            error="Failed to load LoRA model",
            error_code="MODEL_LOAD_ERROR",
        )
        assert response.success is False
        assert response.error == "Failed to load LoRA model"
        assert response.error_code == "MODEL_LOAD_ERROR"
