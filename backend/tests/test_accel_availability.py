"""Optional acceleration features report honest availability, and the typed
acceleration_settings request model rejects malformed toggles."""

import sys
from unittest import mock

import pytest
from pydantic import ValidationError

from foundry import accelerator, tensorrt_engine
from foundry.accelerator import (
    AccelerationSettings,
    AccelerationSettingsRequest,
    acceleration_feature_availability,
)


def _spec(present):
    return lambda name: name in present


def test_everything_available_when_installed_and_a_family_is_verified():
    with mock.patch.object(accelerator, "_spec_present",
                           _spec({"optimum.quanto", "torch_tensorrt", "triton"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", {"sdxl"}):
        features = acceleration_feature_availability()
    assert features == {
        "quantization": {"available": True, "reason": None},
        "tensorrt": {"available": True, "reason": None},
        "compile": {"available": True, "reason": None},
    }


# --- TensorRT: runtime -> NVIDIA GPU -> compute capability -> verified family -----------

def test_tensorrt_bundled_but_no_family_verified_is_unavailable_with_the_reason():
    # The shipped state: the runtime is bundled (Windows/Linux CUDA builds) and
    # the GPU is fine, but TRT_PROVEN_FAMILIES is empty. Never fake it.
    with mock.patch.object(accelerator, "_spec_present", _spec({"torch_tensorrt", "tensorrt"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", set()):
        state = accelerator.tensorrt_availability(
            gpu_available=True, compute_capability=(12, 0), cuda=True)
    assert state == {"available": False,
                     "reason": "No model family has been verified for TensorRT yet"}


def test_tensorrt_available_once_a_family_is_verified_on_a_supported_gpu():
    with mock.patch.object(accelerator, "_spec_present", _spec({"torch_tensorrt"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", {"sdxl"}):
        assert accelerator.tensorrt_availability(
            gpu_available=True, compute_capability=(7, 5), cuda=True) == {"available": True, "reason": None}


@pytest.mark.parametrize("kwargs,expected", [
    ({"gpu_available": False}, "requires an NVIDIA GPU (none detected)"),
    ({"gpu_available": True, "cuda": False}, "requires an NVIDIA GPU (none detected)"),  # Apple MPS
    ({"gpu_available": True, "cuda": True, "compute_capability": (6, 1)}, "compute capability 7.5"),
])
def test_tensorrt_reports_why_the_gpu_cannot_run_it(kwargs, expected):
    with mock.patch.object(accelerator, "_spec_present", _spec({"torch_tensorrt"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", {"sdxl"}):
        state = accelerator.tensorrt_availability(**kwargs)
    assert state["available"] is False
    assert expected in state["reason"]


def test_tensorrt_not_in_this_build_wins_over_everything():
    with mock.patch.object(accelerator, "_spec_present", _spec(set())):
        state = accelerator.tensorrt_availability(gpu_available=True, compute_capability=(12, 0), cuda=True)
    assert state["available"] is False
    assert "not included in this build" in state["reason"]


def test_auto_declines_an_unverified_family_and_says_why():
    notes = []
    settings = AccelerationSettings(tensorrt="auto")
    with mock.patch.object(accelerator, "_spec_present", _spec({"torch_tensorrt"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", set()):
        assert accelerator._resolve_tensorrt("sdxl", settings, True, notes) is False
    assert notes == ["tensorrt off: No model family has been verified for TensorRT yet"]

    notes = []
    with mock.patch.object(accelerator, "_spec_present", _spec({"torch_tensorrt"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", {"sd15"}):
        assert accelerator._resolve_tensorrt("sdxl", settings, True, notes) is False
        assert accelerator._resolve_tensorrt("sd15", settings, True, []) is True
    assert notes == ["tensorrt off: sdxl has not been verified for TensorRT"]


def test_explicit_on_still_builds_for_the_verification_sweep():
    # docs/TENSORRT_VERIFICATION.md forces tensorrt="on" to exercise an
    # unproven family (with a hard fallback to eager); auto never does.
    with mock.patch.object(accelerator, "_spec_present", _spec({"torch_tensorrt"})), \
            mock.patch.object(tensorrt_engine, "TRT_PROVEN_FAMILIES", set()):
        assert accelerator._resolve_tensorrt("sdxl", AccelerationSettings(tensorrt="on"), True, []) is True


def test_missing_backends_are_unavailable_with_a_reason():
    with mock.patch.object(accelerator, "_spec_present", _spec(set())):
        features = acceleration_feature_availability()
    for name in ("quantization", "tensorrt", "compile"):
        assert features[name]["available"] is False
        assert features[name]["reason"]
    assert "optimum-quanto" in features["quantization"]["reason"]
    assert "triton" in features["compile"]["reason"]


def test_frozen_bundle_reports_compile_unavailable():
    with mock.patch.object(accelerator, "_spec_present", _spec({"triton"})), \
            mock.patch.object(sys, "frozen", True, create=True):
        features = acceleration_feature_availability()
    assert features["compile"]["available"] is False
    assert "frozen" in features["compile"]["reason"]


def test_no_gpu_marks_installed_features_unavailable():
    with mock.patch.object(accelerator, "_spec_present",
                           _spec({"optimum.quanto", "tensorrt", "triton"})):
        features = acceleration_feature_availability(gpu_available=False)
    assert all(not state["available"] for state in features.values())
    assert all("GPU" in state["reason"] for state in features.values())


def test_typed_settings_round_trip_to_the_dataclass():
    request = AccelerationSettingsRequest(compile="off", tensorrt="on", master_enable=False)
    settings = request.to_settings()
    assert settings == AccelerationSettings(master_enable=False, compile="off", tensorrt="on")
    assert AccelerationSettingsRequest().to_settings() == AccelerationSettings()


@pytest.mark.parametrize("payload", [
    {"compile": "turbo"},
    {"quantization": "int8"},
    {"unknown_toggle": "on"},
    {"master_enable": "maybe"},
])
def test_typed_settings_reject_malformed_payloads(payload):
    with pytest.raises(ValidationError):
        AccelerationSettingsRequest(**payload)


def test_renderer_payload_shape_is_accepted():
    # src/features/generation/accelerationRequest.ts
    payload = {"master_enable": True, "sdpa": "auto", "channels_last": "on",
               "compile": "off", "quantization": "auto", "attention_slicing": "auto",
               "tensorrt": "off"}
    assert AccelerationSettingsRequest(**payload).to_settings().channels_last == "on"
