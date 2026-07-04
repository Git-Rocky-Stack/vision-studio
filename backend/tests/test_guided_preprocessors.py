"""#34 PR2: control-image preprocessing - cv2 paths run on stub CI."""
import numpy as np
import pytest
from PIL import Image

from guided.passes import GuidedValidationError
from guided import preprocessors as pp

MASK_FULL = {"type": "rectangle", "points": [{"x": 0, "y": 0}],
             "bounds": {"x": 0, "y": 0, "width": 64, "height": 64}}
MASK_RIGHT = {"type": "rectangle", "points": [{"x": 32, "y": 0}],
              "bounds": {"x": 32, "y": 0, "width": 32, "height": 64}}
MASK_EMPTY = {"type": "erase", "points": [{"x": 0, "y": 0}],
              "bounds": {"x": 0, "y": 0, "width": 64, "height": 64}}


def _square_source(tmp_path):
    array = np.zeros((64, 64, 3), dtype=np.uint8)
    array[16:48, 16:48] = 255
    path = tmp_path / "source.png"
    Image.fromarray(array).save(path)
    return str(path)


def _layer(tmp_path, preprocessor="canny", mask=MASK_FULL):
    return {"layer_id": "c1", "layer_name": "Edges", "source_path": _square_source(tmp_path),
            "preprocessor": preprocessor, "strength": 1.0, "start_step": 0.0,
            "end_step": 1.0, "mask": mask, "prompt": None, "negative_prompt": None}


def test_canny_finds_edges_of_a_square(tmp_path):
    control = pp.produce_control_image(_layer(tmp_path), 64, 64, None)
    assert control.mode == "RGB" and control.size == (64, 64)
    assert np.asarray(control).sum() > 0


def test_scribble_is_a_thicker_edge_map(tmp_path):
    canny = np.asarray(pp.produce_control_image(_layer(tmp_path, "canny"), 64, 64, None))
    scribble = np.asarray(pp.produce_control_image(_layer(tmp_path, "scribble"), 64, 64, None))
    assert scribble.sum() > canny.sum()


def test_mask_gates_the_control_signal(tmp_path):
    control = np.asarray(pp.produce_control_image(_layer(tmp_path, mask=MASK_RIGHT), 64, 64, None))
    assert control[:, :32].sum() == 0        # outside the mask: zeroed
    assert control[:, 32:].sum() > 0          # inside: edges survive


def test_empty_mask_raises_with_layer_name(tmp_path):
    with pytest.raises(GuidedValidationError) as excinfo:
        pp.produce_control_image(_layer(tmp_path, mask=MASK_EMPTY), 64, 64, None)
    assert "Edges" in str(excinfo.value)
    assert "\\" not in str(excinfo.value) and "/" not in str(excinfo.value)


def test_unknown_preprocessor_raises(tmp_path):
    with pytest.raises(GuidedValidationError):
        pp.produce_control_image(_layer(tmp_path, "mystery"), 64, 64, None)


def test_registry_annotator_ids():
    assert pp.PREPROCESSORS["canny"].annotator_record_id is None
    assert pp.PREPROCESSORS["scribble"].annotator_record_id is None
    assert pp.PREPROCESSORS["depth"].annotator_record_id == "annotator-midas"
    assert pp.PREPROCESSORS["normal"].annotator_record_id == "annotator-normalbae"
    assert pp.PREPROCESSORS["openpose"].annotator_record_id == "annotator-openpose"


def test_annotator_detector_is_cached_and_needs_a_dir(tmp_path, monkeypatch):
    constructed = []

    class _FakeDetector:
        @classmethod
        def from_pretrained(cls, path):
            constructed.append(path)
            return lambda image: image

    monkeypatch.setattr(pp, "MidasDetector", _FakeDetector)
    pp._DETECTORS.clear()
    annotators_dir = str(tmp_path)
    layer_run = pp.PREPROCESSORS["depth"].run
    source = Image.new("RGB", (8, 8))
    layer_run(source, annotators_dir)
    layer_run(source, annotators_dir)
    assert constructed == [annotators_dir]  # cached after first construction

    with pytest.raises(RuntimeError) as excinfo:
        layer_run(source, str(tmp_path / "missing"))
    assert "Foundry" in str(excinfo.value)


def test_missing_controlnet_aux_fails_loudly(monkeypatch):
    monkeypatch.setattr(pp, "OpenposeDetector", None)
    pp._DETECTORS.clear()
    with pytest.raises(RuntimeError) as excinfo:
        pp.PREPROCESSORS["openpose"].run(Image.new("RGB", (8, 8)), "anywhere")
    assert "controlnet_aux" in str(excinfo.value)
