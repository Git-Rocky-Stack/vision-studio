import pytest
from pydantic import ValidationError

from main import ImageGenerationRequest, VideoGenerationRequest


def test_image_request_accepts_loras():
    req = ImageGenerationRequest(prompt="x", loras=[{"id": "l1", "weight": 0.8}])
    assert req.loras[0].id == "l1"
    assert req.loras[0].weight == 0.8


def test_video_request_defaults_loras_empty():
    req = VideoGenerationRequest(prompt="x")
    assert req.loras == []


def test_weight_out_of_range_is_rejected():
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", loras=[{"id": "l1", "weight": 5.0}])
