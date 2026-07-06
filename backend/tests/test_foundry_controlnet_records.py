"""#34 PR2: ControlNet/annotator catalog records + acquisition plumbing."""
import json
import os
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"

CONTROLNET_IDS = {
    "controlnet-canny-sd15", "controlnet-depth-sd15", "controlnet-openpose-sd15",
    "controlnet-scribble-sd15", "controlnet-normal-sd15",
    "controlnet-canny-sdxl", "controlnet-depth-sdxl", "controlnet-openpose-sdxl",
    "controlnet-union-sdxl", "controlnet-union-flux",
    "controlnet-canny-sd35", "controlnet-depth-sd35",
}
ANNOTATOR_IDS = {"annotator-midas", "annotator-openpose", "annotator-normalbae"}


def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def test_controlnet_records_present_and_typed():
    catalog = load_catalog()
    assert CONTROLNET_IDS.issubset(catalog.keys())
    for record_id in CONTROLNET_IDS:
        entry = catalog[record_id]
        assert entry["artifact_type"] == "controlnet"
        assert entry["base_architecture"] in {"sd15", "sdxl", "flux", "sd35"}
        assert entry["status"] == "not_found"
        assert entry["source"] == "huggingface" and entry["repo_id"]


def test_pr3_records_scope_their_downloads():
    """The xinsir repo carries a 2.5 GiB promax duplicate + example images;
    the explicit files allowlist keeps acquisition to exactly the weights."""
    catalog = load_catalog()
    for record_id in ("controlnet-union-sdxl", "controlnet-union-flux",
                      "controlnet-canny-sd35", "controlnet-depth-sd35"):
        assert catalog[record_id]["files"] == [
            "config.json", "diffusion_pytorch_model.safetensors",
        ]
    # The PR2 records gained the same allowlists once the full-repo-list
    # branch's latent 400 surfaced (see
    # test_dedicated_controlnet_records_carry_files_allowlists).


def test_sd35_depth_wires_midas_companion():
    catalog = load_catalog()
    assert catalog["controlnet-depth-sd35"]["companions"] == ["annotator-midas"]
    assert catalog["controlnet-canny-sd35"]["companions"] == []
    # Union records serve several preprocessors; annotator needs are per-layer
    # (resolved through guided.preprocessors), so companions stay empty.
    assert catalog["controlnet-union-sdxl"]["companions"] == []
    assert catalog["controlnet-union-flux"]["companions"] == []


def test_resolve_files_honors_record_allowlist(monkeypatch):
    import foundry.download_manager as dm_module
    from foundry.download_manager import DownloadManager

    seen = []

    def fake_paths_info(repo_id, paths, revision=None):
        seen.append(list(paths))
        return [{"path": p, "size": 7} for p in (paths or ["a.safetensors"])]

    monkeypatch.setattr(dm_module.huggingface_hub, "get_paths_info", fake_paths_info)
    dm = DownloadManager.__new__(DownloadManager)
    dm._models_dir = "X"
    dm._consent_lookup = None
    record = {"id": "controlnet-union-sdxl", "artifact_type": "controlnet",
              "repo_id": "xinsir/controlnet-union-sdxl-1.0", "revision": "main",
              "files": ["config.json", "diffusion_pytorch_model.safetensors"]}
    filenames, total, target_dir = dm._resolve_files("controlnet-union-sdxl", record)
    assert filenames == ["config.json", "diffusion_pytorch_model.safetensors"]
    assert total == 14
    assert target_dir.endswith("controlnet-union-sdxl")
    # The repo file list was never enumerated - only the allowlist was sized.
    assert seen == [["config.json", "diffusion_pytorch_model.safetensors"]]


def test_resolve_files_enumerates_repos_via_list_repo_files(monkeypatch):
    """No allowlist + no single-file map -> the repo file LIST endpoint.

    get_paths_info REQUIRES concrete paths (an empty list is an HTTP 400 -
    the latent PR2 bug that broke every dedicated-ControlNet download);
    enumeration must go through list_repo_files first.
    """
    import foundry.download_manager as dm_module
    from foundry.download_manager import DownloadManager

    def fake_list_repo_files(repo_id, revision=None):
        return ["config.json", "diffusion_pytorch_model.safetensors",
                "handler.py", "weights.bin"]

    def fake_paths_info(repo_id, paths, revision=None):
        assert paths, "get_paths_info must never be called with an empty list"
        return [{"path": p, "size": 5} for p in paths]

    monkeypatch.setattr(dm_module.huggingface_hub, "list_repo_files", fake_list_repo_files)
    monkeypatch.setattr(dm_module.huggingface_hub, "get_paths_info", fake_paths_info)
    dm = DownloadManager.__new__(DownloadManager)
    dm._models_dir = "X"
    dm._consent_lookup = None
    record = {"id": "some-user-import", "artifact_type": "controlnet",
              "repo_id": "someone/some-controlnet", "revision": "main"}
    filenames, total, _target = dm._resolve_files("some-user-import", record)
    # .py never fetched; pickle-bearing .bin filtered without consent.
    assert filenames == ["config.json", "diffusion_pytorch_model.safetensors"]
    assert total == 10


def test_dedicated_controlnet_records_carry_files_allowlists():
    """Every dedicated CN record scopes its download to config + fp32 weights
    (skips fp16 duplicates and the xinsir _twins variant - and sidesteps
    repo enumeration entirely)."""
    catalog = load_catalog()
    for record_id in [
        "controlnet-canny-sd15", "controlnet-depth-sd15",
        "controlnet-openpose-sd15", "controlnet-scribble-sd15",
        "controlnet-normal-sd15", "controlnet-canny-sdxl",
        "controlnet-depth-sdxl", "controlnet-openpose-sdxl",
    ]:
        assert catalog[record_id]["files"] == [
            "config.json", "diffusion_pytorch_model.safetensors",
        ], record_id


def test_annotator_records_present_and_pickle_gated():
    catalog = load_catalog()
    assert ANNOTATOR_IDS.issubset(catalog.keys())
    for record_id in ANNOTATOR_IDS:
        entry = catalog[record_id]
        assert entry["artifact_type"] == "annotator"
        # .pt/.pth weights: format drives the enqueue-time pickle-consent gate.
        assert entry["format"] == "pickle"
        assert entry["repo_id"] == "lllyasviel/Annotators"


def test_annotator_companions_wire_controlnet_to_weights():
    catalog = load_catalog()
    assert catalog["controlnet-depth-sd15"]["companions"] == ["annotator-midas"]
    assert catalog["controlnet-openpose-sd15"]["companions"] == ["annotator-openpose"]
    assert catalog["controlnet-normal-sd15"]["companions"] == ["annotator-normalbae"]
    assert catalog["controlnet-canny-sd15"]["companions"] == []


def test_single_file_names_normalizes_str_and_list():
    from utils.model_manager import single_file_names

    assert single_file_names("flux-dev") == ["flux1-dev.safetensors"]
    assert single_file_names("annotator-midas") == ["dpt_hybrid-midas-501f0c75.pt"]
    assert single_file_names("annotator-openpose") == [
        "body_pose_model.pth", "hand_pose_model.pth", "facenet.pth",
    ]
    assert single_file_names("controlnet-canny-sd15") is None  # repo download
    assert single_file_names("controlnet-union-sdxl") is None  # files allowlist
    assert single_file_names("no-such-id") is None


def test_download_target_dir_is_per_id_for_controlnet():
    from foundry.download_manager import DownloadManager

    dm = DownloadManager.__new__(DownloadManager)
    dm._models_dir = os.path.join("X", "models")
    assert dm._target_dir({"id": "controlnet-canny-sd15", "artifact_type": "controlnet"}) == \
        os.path.join("X", "models", "controlnet", "controlnet-canny-sd15")
    assert dm._target_dir({"id": "annotator-midas", "artifact_type": "annotator"}) == \
        os.path.join("X", "models", "annotators")


def test_registry_knows_annotator_subdir():
    from foundry.registry import _ARTIFACT_SUBDIR

    assert _ARTIFACT_SUBDIR["annotator"] == "annotators"
    assert _ARTIFACT_SUBDIR["controlnet"] == "controlnet"


def test_model_manager_ready_paths(tmp_path):
    from utils.model_manager import PREDEFINED_MODELS, ModelManager, single_file_names

    manager = ModelManager(models_dir=str(tmp_path))
    cn_info = PREDEFINED_MODELS["controlnet-canny-sd15"]
    ann_info = PREDEFINED_MODELS["annotator-openpose"]

    # ControlNet: per-id directory must exist AND be non-empty.
    assert manager._get_local_paths(cn_info) == [
        os.path.join(str(tmp_path), "controlnet", "controlnet-canny-sd15")
    ]
    # Annotator: every file in the list is required.
    assert manager._get_local_paths(ann_info) == [
        os.path.join(str(tmp_path), "annotators", name)
        for name in single_file_names("annotator-openpose")
    ]
