"""#34 PR1: guided fields on ImageGenerationRequest + pre-flight 422s."""
import pytest
from pydantic import ValidationError

from main import ImageGenerationRequest, VideoGenerationRequest, _guided_payload

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}], "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}


def test_image_request_accepts_guided_fields():
    req = ImageGenerationRequest(
        prompt="x",
        reference_images=[{"layer_id": "r1", "source_path": "ref.png", "mask": MASK}],
        denoising_strength=0.6,
    )
    assert req.reference_images[0].source_path == "ref.png"
    assert req.denoising_strength == 0.6


def test_image_request_accepts_inpaint_with_brush_size_mask():
    mask = dict(MASK, type="brush", brush_size=24.0)
    req = ImageGenerationRequest(
        prompt="x",
        inpaint={"layer_id": "i1", "image_path": "base.png", "mask": mask},
    )
    assert req.inpaint.mask.brush_size == 24.0


def test_guided_defaults_are_empty():
    req = ImageGenerationRequest(prompt="x")
    assert req.controlnet == []
    assert req.reference_images == []
    assert req.inpaint is None
    assert req.denoising_strength == 0.75


def test_denoising_strength_range_enforced():
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", denoising_strength=1.5)
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", denoising_strength=0.0)


def test_video_request_has_no_guided_fields():
    req = VideoGenerationRequest(prompt="x")
    assert not hasattr(req, "controlnet")
    assert not hasattr(req, "inpaint")


def test_guided_payload_none_when_no_guided_fields():
    assert _guided_payload(ImageGenerationRequest(prompt="x")) is None


def test_guided_payload_projects_dicts():
    req = ImageGenerationRequest(
        prompt="x",
        inpaint={"layer_id": "i1", "image_path": "base.png", "mask": MASK, "prompt": "door"},
        denoising_strength=0.9,
    )
    payload = _guided_payload(req)
    assert payload["inpaint"]["image_path"] == "base.png"
    assert payload["inpaint"]["prompt"] == "door"
    assert payload["denoising_strength"] == 0.9
    assert payload["controlnet"] == []
