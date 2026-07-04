# Guided Passes PR2: ControlNet SD1.5/SDXL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas ControlNet layers real on SD 1.5 and SDXL — preprocessed control images, Foundry-record model acquisition, MultiControlNet stacking, per-layer strength + step range — and retire the orphaned `/api/v1/controlnet` stub.

**Architecture:** Second of four staged PRs from the approved spec
(`docs/superpowers/specs/2026-07-04-guided-passes-end-to-end-design.md`).
Extends the `backend/guided/` package from PR1 with `preprocessors.py`
(canny/scribble via already-shipped OpenCV; depth/normal/openpose via
`controlnet_aux` with consent-gated annotator weights) and
`controlnet_registry.py` (per-family preprocessor → Foundry record map +
`resolve_controlnet_stack`, the same 422-through-one-seam pattern as
`resolve_guided_pass`). ControlNet models are catalog records
(`artifact_type: "controlnet"`) acquired through the existing M2
consent/download flow into `models/controlnet/<id>/`; annotator weights are
`artifact_type: "annotator"` records (flat files in `models/annotators/`,
pickle-consent-gated). The generator derives ControlNet pipeline variants from
the cached base pipeline via `from_pipe(controlnet=...)` inside a
`controlnets_attached()` context manager that always releases the weights.

**Tech Stack:** FastAPI + pydantic v2, diffusers 0.37 (`AutoPipelineFor*.from_pipe`, `ControlNetModel`), OpenCV (shipped), `controlnet_aux` (new, full-backend only), React 19 + Zustand + Vitest.

## Global Constraints

- Branch: `feat/guided-passes-pr2-controlnet` off up-to-date `main`. Never commit to main.
- Commit via the **Bash tool** with `export PATH="/c/Program Files/nodejs:$PATH"` first, and `git branch --show-current` in the same call. Never `git add -A` (`LICENSE.txt` stays untracked). Never `--no-verify`.
- Backend pytest via `backend/venv/Scripts/python.exe -m pytest ...` from the repo root; check piped exit codes with `echo "EXIT:${PIPESTATUS[0]}"`.
- **Stub-CI safety:** every `backend/guided/` module must import with no torch / diffusers / controlnet_aux installed. `cv2`, `numpy`, and `PIL` ARE installed on stub CI (`requirements.txt` ships them) — preprocessor math is CI-testable.
- **Honesty rails:** a guided field either works or fails loudly (422 pre-flight or failed job). No silent degradation to unguided output. User-facing error messages NEVER contain filesystem paths — basenames and record ids only. LoRA keeps its fail-soft contract (untouched).
- **No silent runtime downloads:** all model/annotator weights arrive only through consent-gated Foundry acquisition. Deleting the stub deletes its runtime `from_pretrained` downloads.
- Catalog invariants (`test_foundry_catalog.py`): every entry needs the 19 REQUIRED_FIELDS; `capability` ∈ {image, video, edit, inpaint}; `tier` ∈ {verified, compatible, experimental}; `runtime` ∈ {local, comfyui, cloud, byom}; `status` = "not_found"; entry key == `id`.
- Frontend design rails (DESIGN.md): lucide icons only, no emoji, existing utility classes, keyboard-accessible controls.
- Per the spec, hardware-fit gating, FLUX/SD3.5 ControlNet, the xinsir SDXL union model, and full GeneratePanel UI reconciliation are **PR3** — do not implement them here. IP-Adapter is PR4.

## File Structure

| File | Responsibility |
|---|---|
| `backend/guided/preprocessors.py` (create) | source image → control image per preprocessor; mask gating; detector cache |
| `backend/guided/controlnet_registry.py` (create) | (family, preprocessor) → ControlNet record id; `resolve_controlnet_stack` validation seam |
| `backend/guided/passes.py` (modify) | accept ControlNet layers into `GuidedPassPlan`; layer-prompt-ignored notice |
| `backend/guided/pipelines.py` (modify) | `derive_variant(..., controlnet=)` incl. txt2img; `controlnets_attached()` |
| `backend/foundry/verified-catalog.json` (modify) | 8 ControlNet records + 3 annotator records |
| `backend/foundry/model_record.py` (modify) | `annotator` artifact-type comment |
| `backend/foundry/registry.py` (modify) | `annotator` subdir mapping |
| `backend/foundry/download_manager.py` (modify) | per-id controlnet target dir; multi-file single-file map |
| `backend/utils/model_manager.py` (modify) | `single_file_names()`; annotator subdir/legacy type; dir-shaped ready checks |
| `backend/main.py` (modify) | ControlNet pre-flight 422s; router retirement |
| `backend/utils/direct_generator.py` (modify) | ControlNet execution branch |
| `backend/api/controlnet.py`, `backend/services/controlnet_service.py`, `backend/schemas/controlnet.py` (delete) | the orphaned stub |
| `src/features/generation/controlnetSupport.ts` (create) | frontend mirror of the registry + pre-flight resolution |
| `src/pages/GeneratePanel.tsx` (modify) | pre-flight block + Manage in Foundry link |

---

### Task 1: Branch + retire the orphaned `/api/v1/controlnet` stub

The stub has zero frontend callers, hardcodes an SD1.5 base, downloads from HF
at runtime bypassing Foundry consent, and discards its own `init_image`.
Retire it exactly the way #136 retired `/api/v1/lora`.

**Files:**
- Delete: `backend/api/controlnet.py`, `backend/services/controlnet_service.py`, `backend/schemas/controlnet.py`
- Delete: `backend/tests/test_controlnet_api.py`, `backend/tests/test_controlnet_service.py`, `backend/tests/test_controlnet_schemas.py`
- Modify: `backend/main.py:68` (import), `backend/main.py:403` (include_router)
- Modify: `backend/tests/benchmarks/test_generation_benchmark.py` (remove stub-importing benchmarks)
- Modify: `backend/pytest.ini:18`, `backend/tests/conftest.py:10` (stale ControlNet mentions in comments)

**Interfaces:**
- Consumes: nothing.
- Produces: `main.py` with no `controlnet_router`; later tasks re-use the freed `/api` surface only through `ImageGenerationRequest.controlnet`.

- [ ] **Step 1: Create the branch**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git checkout main && git pull --ff-only && git checkout -b feat/guided-passes-pr2-controlnet && git branch --show-current
```
Expected: `feat/guided-passes-pr2-controlnet`, clean tree (LICENSE.txt untracked is normal).

(Then commit this plan document: `git add docs/superpowers/plans/2026-07-04-guided-passes-pr2-controlnet.md && git commit -m "docs(guided): PR2 implementation plan - ControlNet SD1.5/SDXL (#34)"`.)

- [ ] **Step 2: Delete the stub and its tests**

```bash
git rm backend/api/controlnet.py backend/services/controlnet_service.py backend/schemas/controlnet.py backend/tests/test_controlnet_api.py backend/tests/test_controlnet_service.py backend/tests/test_controlnet_schemas.py
```

- [ ] **Step 3: Unregister the router in `backend/main.py`**

Remove line 68:
```python
from api.controlnet import router as controlnet_router
```
Remove line 403:
```python
app.include_router(controlnet_router)
```

- [ ] **Step 4: Remove stub-importing benchmarks**

In `backend/tests/benchmarks/test_generation_benchmark.py` remove:
- the whole `TestControlNetBenchmarks` class (lines 50–117),
- `test_memory_usage_controlnet_service` (lines 193–210, inside `TestMemoryUsageBenchmarks`),
- the whole `TestBatchOperationBenchmarks` class (lines 256–293) — both its tests exist only to benchmark the deleted service's base64 helpers,
- the now-unused `sample_image` fixture (lines 26–29) and the now-unused import line `from unittest.mock import AsyncMock, MagicMock, patch` (line 12).

Keep `sample_image_small`, `sample_image_base64`, `TestEditServiceBenchmarks`, `test_memory_usage_edit_service`, and `test_memory_usage_image_processing` (edit_service is next cycle).

- [ ] **Step 5: Fix the two stale comments**

`backend/pytest.ini` line 18: change `# Benchmarks load real diffusion/ControlNet weights at import time: slow, and they` to `# Benchmarks load real diffusion weights at import time: slow, and they`.

`backend/tests/conftest.py` line 10: change `benchmark    Real diffusion / ControlNet weight loading. Lives in` to `benchmark    Real diffusion weight loading. Lives in`.

- [ ] **Step 6: Verify nothing still references the stub, run the adjacent suites**

```bash
grep -rn "controlnet_service\|schemas.controlnet\|api.controlnet" backend --include="*.py" | grep -v tests/fixtures || echo "CLEAN"
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request.py backend/tests/test_sanitization.py -q 2>&1 | tail -2; echo "EXIT:${PIPESTATUS[0]}"
backend/venv/Scripts/python.exe -m py_compile backend/main.py backend/tests/benchmarks/test_generation_benchmark.py && echo "COMPILES"
```
Expected: `CLEAN`, all tests pass, `COMPILES`.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/main.py backend/tests/benchmarks/test_generation_benchmark.py backend/pytest.ini backend/tests/conftest.py && git commit -m "chore(guided): retire orphaned /api/v1/controlnet stub (#34)"
```
(The `git rm` deletions are already staged.)

---

### Task 2: ControlNet + annotator Foundry records; acquisition plumbing

ControlNet models and preprocessor annotator weights become catalog records
acquired through the existing consent/download flow. Two real plumbing gaps to
fix: (a) `download_manager._target_dir` writes non-diffusers artifacts flat, so
two multi-file ControlNet repos would collide on `config.json` — controlnet
gets a per-id dir (matching `registry._is_present`, which already expects
`models/controlnet/<id>/`); (b) the OpenPose annotator is three files, so the
single-file filename map learns list values.

**Files:**
- Modify: `backend/foundry/verified-catalog.json`
- Modify: `backend/foundry/model_record.py:17` (artifact_type comment)
- Modify: `backend/foundry/registry.py:195-203` (`_ARTIFACT_SUBDIR`)
- Modify: `backend/foundry/download_manager.py` (`_target_dir`, `_resolve_files`, `_ARTIFACT_SUBDIR` at line 561)
- Modify: `backend/utils/model_manager.py` (`_SINGLE_FILE_FILENAMES`, `single_file_names`, `_ARTIFACT_TYPE_TO_LEGACY`, `subdirs`, `_get_local_paths`)
- Test: `backend/tests/test_foundry_controlnet_records.py` (create)

**Interfaces:**
- Consumes: `ModelRecord` schema, `_SINGLE_FILE_FILENAMES` (model_manager), `_target_dir`/`_resolve_files` (download_manager).
- Produces: catalog ids `controlnet-canny-sd15`, `controlnet-depth-sd15`, `controlnet-openpose-sd15`, `controlnet-scribble-sd15`, `controlnet-normal-sd15`, `controlnet-canny-sdxl`, `controlnet-depth-sdxl`, `controlnet-openpose-sdxl`, `annotator-midas`, `annotator-openpose`, `annotator-normalbae`; `single_file_names(model_id: str) -> Optional[List[str]]` in `utils.model_manager`. Task 4's registry references these record ids verbatim.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_foundry_controlnet_records.py`:

```python
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
        assert entry["base_architecture"] in {"sd15", "sdxl"}
        assert entry["status"] == "not_found"
        assert entry["source"] == "huggingface" and entry["repo_id"]


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
```

- [ ] **Step 2: Run to verify failure**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_controlnet_records.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL (missing catalog ids / missing `single_file_names`).

- [ ] **Step 3: Add the catalog records**

Append to `backend/foundry/verified-catalog.json` before the closing `}` (comma-separate from the last existing entry). Every entry follows the existing field layout:

```json
  "controlnet-canny-sd15": {
    "id": "controlnet-canny-sd15", "name": "ControlNet Canny (SD 1.5)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "lllyasviel/control_v11p_sd15_canny", "revision": "main", "aux_repo_id": null,
    "size": "~2.2 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "~0.7 GB",
    "description": "Edge-map conditioning for SD 1.5 canvas ControlNet layers.",
    "license": "openrail", "gated": false, "format": "safetensors",
    "companions": [], "measured_vram_bytes": null
  },
  "controlnet-depth-sd15": {
    "id": "controlnet-depth-sd15", "name": "ControlNet Depth (SD 1.5)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "lllyasviel/control_v11f1p_sd15_depth", "revision": "main", "aux_repo_id": null,
    "size": "~2.2 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "~0.7 GB",
    "description": "Depth-map conditioning for SD 1.5 canvas ControlNet layers.",
    "license": "openrail", "gated": false, "format": "safetensors",
    "companions": ["annotator-midas"], "measured_vram_bytes": null
  },
  "controlnet-openpose-sd15": {
    "id": "controlnet-openpose-sd15", "name": "ControlNet OpenPose (SD 1.5)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "lllyasviel/control_v11p_sd15_openpose", "revision": "main", "aux_repo_id": null,
    "size": "~2.2 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "~0.7 GB",
    "description": "Human-pose conditioning for SD 1.5 canvas ControlNet layers.",
    "license": "openrail", "gated": false, "format": "safetensors",
    "companions": ["annotator-openpose"], "measured_vram_bytes": null
  },
  "controlnet-scribble-sd15": {
    "id": "controlnet-scribble-sd15", "name": "ControlNet Scribble (SD 1.5)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "lllyasviel/control_v11p_sd15_scribble", "revision": "main", "aux_repo_id": null,
    "size": "~2.2 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "~0.7 GB",
    "description": "Scribble/sketch conditioning for SD 1.5 canvas ControlNet layers.",
    "license": "openrail", "gated": false, "format": "safetensors",
    "companions": [], "measured_vram_bytes": null
  },
  "controlnet-normal-sd15": {
    "id": "controlnet-normal-sd15", "name": "ControlNet Normal (SD 1.5)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "lllyasviel/control_v11p_sd15_normalbae", "revision": "main", "aux_repo_id": null,
    "size": "~2.2 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "~0.7 GB",
    "description": "Surface-normal conditioning for SD 1.5 canvas ControlNet layers.",
    "license": "openrail", "gated": false, "format": "safetensors",
    "companions": ["annotator-normalbae"], "measured_vram_bytes": null
  },
  "controlnet-canny-sdxl": {
    "id": "controlnet-canny-sdxl", "name": "ControlNet Canny (SDXL)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "diffusers/controlnet-canny-sdxl-1.0", "revision": "main", "aux_repo_id": null,
    "size": "~3.8 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~2.5 GB",
    "description": "Edge-map conditioning for SDXL canvas ControlNet layers.",
    "license": "openrail++", "gated": false, "format": "safetensors",
    "companions": [], "measured_vram_bytes": null
  },
  "controlnet-depth-sdxl": {
    "id": "controlnet-depth-sdxl", "name": "ControlNet Depth (SDXL)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "diffusers/controlnet-depth-sdxl-1.0", "revision": "main", "aux_repo_id": null,
    "size": "~3.8 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~2.5 GB",
    "description": "Depth-map conditioning for SDXL canvas ControlNet layers.",
    "license": "openrail++", "gated": false, "format": "safetensors",
    "companions": ["annotator-midas"], "measured_vram_bytes": null
  },
  "controlnet-openpose-sdxl": {
    "id": "controlnet-openpose-sdxl", "name": "ControlNet OpenPose (SDXL)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "xinsir/controlnet-openpose-sdxl-1.0", "revision": "main", "aux_repo_id": null,
    "size": "~2.5 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~2.5 GB",
    "description": "Human-pose conditioning for SDXL canvas ControlNet layers.",
    "license": "apache-2.0", "gated": false, "format": "safetensors",
    "companions": ["annotator-openpose"], "measured_vram_bytes": null
  },
  "annotator-midas": {
    "id": "annotator-midas", "name": "MiDaS Depth Annotator", "artifact_type": "annotator",
    "capability": "image", "base_architecture": "unknown", "source": "huggingface",
    "repo_id": "lllyasviel/Annotators", "revision": "main", "aux_repo_id": null,
    "size": "~0.5 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Depth-estimation weights for the ControlNet depth preprocessor.",
    "license": null, "gated": false, "format": "pickle",
    "companions": [], "measured_vram_bytes": null
  },
  "annotator-openpose": {
    "id": "annotator-openpose", "name": "OpenPose Annotator", "artifact_type": "annotator",
    "capability": "image", "base_architecture": "unknown", "source": "huggingface",
    "repo_id": "lllyasviel/Annotators", "revision": "main", "aux_repo_id": null,
    "size": "~0.5 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Body/hand/face pose weights for the ControlNet openpose preprocessor.",
    "license": null, "gated": false, "format": "pickle",
    "companions": [], "measured_vram_bytes": null
  },
  "annotator-normalbae": {
    "id": "annotator-normalbae", "name": "NormalBAE Annotator", "artifact_type": "annotator",
    "capability": "image", "base_architecture": "unknown", "source": "huggingface",
    "repo_id": "lllyasviel/Annotators", "revision": "main", "aux_repo_id": null,
    "size": "~0.3 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "Unknown",
    "description": "Surface-normal weights for the ControlNet normal preprocessor.",
    "license": null, "gated": false, "format": "pickle",
    "companions": [], "measured_vram_bytes": null
  }
```

Note: `format: "pickle"` on the annotators is load-bearing — it drives the
enqueue-time pickle-consent 403 in `main.enqueue_download`. Without it the
per-file pickle filter would silently strip the `.pth` files instead.

- [ ] **Step 4: Plumb the `annotator` artifact type**

`backend/foundry/model_record.py` line 17 — extend the comment:
```python
    artifact_type: str          # checkpoint | diffusers-pipeline | lora | vae | controlnet | embedding | motion-adapter | annotator
```

`backend/foundry/registry.py` — add to `_ARTIFACT_SUBDIR` (line 195):
```python
    "embedding": "embeddings",
    "annotator": "annotators",
```

`backend/foundry/download_manager.py` — add the same `"annotator": "annotators"` entry to its `_ARTIFACT_SUBDIR` (line 561), and replace `_target_dir` (line 344):
```python
    def _target_dir(self, record: dict) -> str:
        """Destination directory matching the model_manager storage layout."""
        artifact_type = record.get("artifact_type", "checkpoint")
        if artifact_type in {"diffusers-pipeline", "motion-adapter"}:
            return os.path.join(self._models_dir, "diffusers", record["id"])
        if artifact_type == "controlnet":
            # Multi-file diffusers-format repos get a per-id dir so two
            # ControlNet records can never collide on config.json. Matches
            # registry._is_present, which already expects controlnet/<id>/.
            return os.path.join(self._models_dir, "controlnet", record["id"])
        subdir = _ARTIFACT_SUBDIR.get(artifact_type, "checkpoints")
        return os.path.join(self._models_dir, subdir)
```

- [ ] **Step 5: Multi-file single-file map + ready checks in `model_manager.py`**

Extend `_SINGLE_FILE_FILENAMES` (line 58) — values may now be a list:
```python
_SINGLE_FILE_FILENAMES = {
    "flux-dev": "flux1-dev.safetensors",
    "flux-schnell": "flux1-schnell.safetensors",
    "flux-fill": "flux1-fill-dev.safetensors",
    "sdxl-base": "sd_xl_base_1.0.safetensors",
    "sdxl-refiner": "sd_xl_refiner_1.0.safetensors",
    "sd-1-5": "v1-5-pruned-emaonly.safetensors",
    "sdxl-vae": "sdxl.vae.safetensors",
    "sd-vae-ft-mse": "diffusion_pytorch_model.safetensors",
    # #34 PR2: ControlNet preprocessor annotators (lllyasviel/Annotators).
    # OpenPose needs three files; the value may be a list.
    "annotator-midas": "dpt_hybrid-midas-501f0c75.pt",
    "annotator-openpose": ["body_pose_model.pth", "hand_pose_model.pth", "facenet.pth"],
    "annotator-normalbae": "scannet.pt",
}


def single_file_names(model_id: str) -> Optional[List[str]]:
    """Explicit file list for single/few-file artifacts, else None (repo pull)."""
    value = _SINGLE_FILE_FILENAMES.get(model_id)
    if value is None:
        return None
    return [value] if isinstance(value, str) else list(value)
```

Add to `_ARTIFACT_TYPE_TO_LEGACY` (line 49 area): `"annotator": "annotator",`.
Add to `self.subdirs` in `__init__` (line 112 area): `'annotator': os.path.join(models_dir, 'annotators'),`.

In `_load_predefined_models` (line 84) change `filename=_SINGLE_FILE_FILENAMES.get(model_id),` to:
```python
            filename=(single_file_names(model_id) or [None])[0],
```

Add a presence helper (module level, next to `single_file_names`):
```python
def _path_present(path: str) -> bool:
    """A required artifact path: an existing file, or a NON-EMPTY directory."""
    if os.path.isdir(path):
        return bool(os.listdir(path))
    return os.path.isfile(path)
```

Add `_get_local_paths` and turn `_get_local_path` (lines 170–179) into a thin
delegate — it has other callers (`download_model` paths at lines ~290/331 and
`test_model_manager.py`), so it stays:
```python
    def _get_local_paths(self, model_info: ModelInfo) -> List[str]:
        """Every path that must exist for the model to report ready."""
        if model_info.type in ("diffusers", "controlnet"):
            return [os.path.join(self.subdirs[model_info.type], model_info.id)]
        names = single_file_names(model_info.id)
        if names:
            subdir = self.subdirs.get(model_info.type, self.models_dir)
            return [os.path.join(subdir, name) for name in names]
        if not model_info.filename:
            return []
        subdir = self.subdirs.get(model_info.type, self.models_dir)
        return [os.path.join(subdir, model_info.filename)]

    def _get_local_path(self, model_info: ModelInfo) -> Optional[str]:
        """First required path (legacy single-path callers)."""
        paths = self._get_local_paths(model_info)
        return paths[0] if paths else None
```
(The `single_file_names` branch covers catalog ids; the `model_info.filename`
fallback preserves the old behavior for locally-scanned single-file models
whose ids are not in the map.)

Update the ready check in `scan_models` (lines 133–137):
```python
            paths = self._get_local_paths(model_info)
            if paths and all(_path_present(path) for path in paths):
                model_info.local_path = paths[0]
                model_info.status = "ready"
```

Update `download_manager._resolve_files` (line 309/315): replace
`from utils.model_manager import _SINGLE_FILE_FILENAMES` with
`from utils.model_manager import single_file_names`, and
```python
        single = single_file_names(model_id)
        if single is not None:
            paths = list(single)
```

- [ ] **Step 6: Run the new tests + the foundry suites**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_controlnet_records.py backend/tests/test_foundry_catalog.py backend/tests/test_foundry_registry.py backend/tests/test_foundry_download_manager.py backend/tests/test_foundry_download_paths.py backend/tests/test_foundry_model_manager_catalog.py backend/tests/test_model_manager.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: all pass — the new records file plus every existing registry / download-manager / model-manager suite stays green.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/foundry/verified-catalog.json backend/foundry/model_record.py backend/foundry/registry.py backend/foundry/download_manager.py backend/utils/model_manager.py backend/tests/test_foundry_controlnet_records.py && git commit -m "feat(guided): ControlNet + annotator Foundry records, consent-gated acquisition (#34)"
```

---

### Task 3: Preprocessors (`backend/guided/preprocessors.py`)

**Files:**
- Create: `backend/guided/preprocessors.py`
- Test: `backend/tests/test_guided_preprocessors.py` (create)

**Interfaces:**
- Consumes: `rasterize_mask`, `mask_coverage` (guided.masks); `GuidedValidationError` (guided.passes).
- Produces: `PreprocessorSpec` (frozen dataclass: `name: str`, `annotator_record_id: Optional[str]`, `run: Callable[[Image, Optional[str]], Image]`); `PREPROCESSORS: Dict[str, PreprocessorSpec]` with keys `canny, scribble, depth, normal, openpose`; `produce_control_image(layer: Dict, width: int, height: int, annotators_dir: Optional[str]) -> Image` (RGB, exactly width×height, zeroed outside the layer mask). Task 4 reads `PREPROCESSORS[p].annotator_record_id`; Task 7 calls `produce_control_image`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_guided_preprocessors.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_preprocessors.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL (`No module named 'guided.preprocessors'`).

- [ ] **Step 3: Implement `backend/guided/preprocessors.py`**

```python
"""#34 PR2: source image -> control image for ControlNet guided passes.

canny/scribble run on the already-shipped OpenCV (zero downloads). depth /
normal / openpose need controlnet_aux plus annotator weights that arrive ONLY
as consent-gated Foundry records (models/annotators/) - never a runtime
download. The layer's vector mask gates the control map: signal is zeroed
outside the mask. Imports cleanly with no torch/controlnet_aux (stub CI).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:  # pragma: no cover - opencv ships in requirements
    cv2 = None  # type: ignore[assignment]

try:
    from controlnet_aux import MidasDetector, NormalBaeDetector, OpenposeDetector
except ImportError:  # stub CI / slim install - annotator passes fail loudly
    MidasDetector = None  # type: ignore[assignment]
    NormalBaeDetector = None  # type: ignore[assignment]
    OpenposeDetector = None  # type: ignore[assignment]

from guided.masks import mask_coverage, rasterize_mask
from guided.passes import GuidedValidationError

# Detector instances are expensive to build; cache per (name, weights dir).
_DETECTORS: Dict[str, Any] = {}


@dataclass(frozen=True)
class PreprocessorSpec:
    name: str
    annotator_record_id: Optional[str]  # Foundry record with the weights; None = zero-download
    run: Callable[[Image.Image, Optional[str]], Image.Image]


def _require_cv2() -> None:
    if cv2 is None:
        raise RuntimeError(
            "OpenCV is not available - the canny/scribble preprocessors need "
            "the backend's shipped opencv-python."
        )


def _gray(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.uint8)


def _edges_to_rgb(edges: np.ndarray) -> Image.Image:
    return Image.fromarray(np.stack([edges] * 3, axis=-1))


def _canny(image: Image.Image, annotators_dir: Optional[str] = None) -> Image.Image:
    _require_cv2()
    return _edges_to_rgb(cv2.Canny(_gray(image), 100, 200))


def _scribble(image: Image.Image, annotators_dir: Optional[str] = None) -> Image.Image:
    _require_cv2()
    edges = cv2.Canny(_gray(image), 100, 200)
    thick = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    return _edges_to_rgb(thick)


def _detector(name: str, detector_class: Any, annotators_dir: Optional[str]) -> Any:
    if detector_class is None:
        raise RuntimeError(
            f"The '{name}' preprocessor needs controlnet_aux, which is not "
            "installed - guided ControlNet passes require the full backend."
        )
    if not annotators_dir or not os.path.isdir(annotators_dir):
        raise RuntimeError(
            f"The '{name}' preprocessor's annotator weights are missing - "
            "install the annotator from the Foundry first."
        )
    key = f"{name}:{annotators_dir}"
    if key not in _DETECTORS:
        _DETECTORS[key] = detector_class.from_pretrained(annotators_dir)
    return _DETECTORS[key]


def _depth(image: Image.Image, annotators_dir: Optional[str]) -> Image.Image:
    return _detector("depth", MidasDetector, annotators_dir)(image)


def _normal(image: Image.Image, annotators_dir: Optional[str]) -> Image.Image:
    return _detector("normal", NormalBaeDetector, annotators_dir)(image)


def _openpose(image: Image.Image, annotators_dir: Optional[str]) -> Image.Image:
    return _detector("openpose", OpenposeDetector, annotators_dir)(image)


PREPROCESSORS: Dict[str, PreprocessorSpec] = {
    "canny": PreprocessorSpec("canny", None, _canny),
    "scribble": PreprocessorSpec("scribble", None, _scribble),
    "depth": PreprocessorSpec("depth", "annotator-midas", _depth),
    "normal": PreprocessorSpec("normal", "annotator-normalbae", _normal),
    "openpose": PreprocessorSpec("openpose", "annotator-openpose", _openpose),
}


def produce_control_image(
    layer: Dict[str, Any], width: int, height: int, annotators_dir: Optional[str]
) -> Image.Image:
    """Preprocess one ControlNet layer into its mask-gated control image."""
    preprocessor = (layer.get("preprocessor") or "").strip()
    spec = PREPROCESSORS.get(preprocessor)
    if spec is None:
        supported = ", ".join(sorted(PREPROCESSORS))
        raise GuidedValidationError(
            f"Unknown ControlNet preprocessor '{preprocessor}' - supported: {supported}."
        )

    source = Image.open(layer["source_path"]).convert("RGB")
    base_width, base_height = source.size

    # Mask coordinates are intrinsic source pixels: rasterize at source size,
    # then resize alongside the control map.
    mask_image = rasterize_mask(layer.get("mask") or {}, base_width, base_height)
    if mask_coverage(mask_image) == 0.0:
        name = layer.get("layer_name") or layer.get("layer_id") or "the ControlNet layer"
        raise GuidedValidationError(
            f"The mask on '{name}' is empty - draw a mask region on the canvas first."
        )

    control = spec.run(source.resize((width, height), Image.Resampling.LANCZOS), annotators_dir)
    control = control.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)

    mask_array = np.asarray(mask_image.resize((width, height), Image.Resampling.NEAREST))
    control_array = np.asarray(control, dtype=np.uint8).copy()
    control_array[mask_array == 0] = 0
    return Image.fromarray(control_array)
```

- [ ] **Step 4: Run to verify pass**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_preprocessors.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/guided/preprocessors.py backend/tests/test_guided_preprocessors.py && git commit -m "feat(guided): control-image preprocessors - cv2 canny/scribble + consent-gated annotators (#34)"
```

---

### Task 4: ControlNet registry (`backend/guided/controlnet_registry.py`)

**Files:**
- Create: `backend/guided/controlnet_registry.py`
- Test: `backend/tests/test_guided_controlnet_registry.py` (create)

**Interfaces:**
- Consumes: `PREPROCESSORS` (guided.preprocessors) for annotator ids; `GuidedValidationError` (guided.passes); a `resolve_record: Callable[[str], Optional[Dict]]` (the registry/`_resolve_record` seam, same shape as `foundry/lora.py`).
- Produces: `ResolvedControlLayer` (frozen dataclass: `record_id: str`, `annotator_record_id: Optional[str]`, `layer: Dict[str, Any]`); `resolve_controlnet_stack(layers, family, resolve_record) -> List[ResolvedControlLayer]`; `SUPPORTED_FAMILIES = {"sd15", "sdxl"}`. Tasks 6 and 7 call `resolve_controlnet_stack` — endpoint pre-flight and generator re-resolve through the SAME seam.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_guided_controlnet_registry.py`:

```python
"""#34 PR2: (family, preprocessor) -> Foundry record resolution + honest declines."""
import pytest

from guided.controlnet_registry import (
    SUPPORTED_FAMILIES,
    resolve_controlnet_stack,
)
from guided.passes import GuidedValidationError

LAYER = {"layer_id": "c1", "layer_name": "Edges", "source_path": "s.png",
         "preprocessor": "canny", "strength": 1.2, "start_step": 0.1,
         "end_step": 0.9, "mask": {}, "prompt": None, "negative_prompt": None}


def _ready_registry(record_id_status=None):
    statuses = record_id_status or {}

    def resolve(record_id):
        return {"id": record_id, "name": record_id,
                "status": statuses.get(record_id, "ready")}

    return resolve


def test_supported_families_are_sd15_and_sdxl():
    assert SUPPORTED_FAMILIES == {"sd15", "sdxl"}


def test_empty_stack_resolves_to_empty():
    assert resolve_controlnet_stack([], "sd15", _ready_registry()) == []
    assert resolve_controlnet_stack(None, "flux", _ready_registry()) == []


def test_canny_resolves_per_family():
    sd15 = resolve_controlnet_stack([dict(LAYER)], "sd15", _ready_registry())
    sdxl = resolve_controlnet_stack([dict(LAYER)], "sdxl", _ready_registry())
    assert sd15[0].record_id == "controlnet-canny-sd15"
    assert sdxl[0].record_id == "controlnet-canny-sdxl"
    assert sd15[0].annotator_record_id is None
    assert sd15[0].layer["strength"] == 1.2


def test_depth_carries_its_annotator():
    resolved = resolve_controlnet_stack(
        [dict(LAYER, preprocessor="depth")], "sd15", _ready_registry())
    assert resolved[0].record_id == "controlnet-depth-sd15"
    assert resolved[0].annotator_record_id == "annotator-midas"


def test_unsupported_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "flux", _ready_registry())
    message = str(excinfo.value)
    assert "FLUX" in message and "PR3" in message


def test_unsupported_preprocessor_on_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="scribble")], "sdxl", _ready_registry())
    message = str(excinfo.value)
    assert "scribble" in message and "SDXL" in message


def test_uninstalled_controlnet_record_declines_with_foundry_hint():
    registry = _ready_registry({"controlnet-canny-sd15": "not_found"})
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "sd15", registry)
    message = str(excinfo.value)
    assert "controlnet-canny-sd15" in message and "Foundry" in message


def test_uninstalled_annotator_declines_with_foundry_hint():
    registry = _ready_registry({"annotator-openpose": "not_found"})
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="openpose")], "sd15", registry)
    assert "annotator-openpose" in str(excinfo.value)


def test_multi_layer_stack_resolves_in_order():
    layers = [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth")]
    resolved = resolve_controlnet_stack(layers, "sd15", _ready_registry())
    assert [item.record_id for item in resolved] == [
        "controlnet-canny-sd15", "controlnet-depth-sd15",
    ]


def test_every_registry_preprocessor_exists():
    from guided.preprocessors import PREPROCESSORS
    from guided.controlnet_registry import _STACKS

    for family_map in _STACKS.values():
        for preprocessor in family_map:
            assert preprocessor in PREPROCESSORS
```

- [ ] **Step 2: Run to verify failure**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_controlnet_registry.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `backend/guided/controlnet_registry.py`**

```python
"""#34 PR2: per-family preprocessor -> installed ControlNet Foundry record.

THE ControlNet honesty seam, mirroring resolve_guided_pass: a layer either
resolves to an installed record (and installed annotator weights, when the
preprocessor needs them) or raises GuidedValidationError with a user-facing,
path-free message. main.py 422s through it pre-flight; the generator
re-resolves in the worker. FLUX/SD3.5 and the SDXL union model land in PR3.
No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from guided.passes import GuidedValidationError
from guided.preprocessors import PREPROCESSORS

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

FAMILY_LABELS = {"sd15": "SD 1.5", "sdxl": "SDXL", "flux": "FLUX", "sd35": "SD 3.5"}

# (family -> preprocessor -> ControlNet catalog record id). Annotator ids come
# from PREPROCESSORS - single source of truth for preprocessor requirements.
_STACKS: Dict[str, Dict[str, str]] = {
    "sd15": {
        "canny": "controlnet-canny-sd15",
        "depth": "controlnet-depth-sd15",
        "openpose": "controlnet-openpose-sd15",
        "scribble": "controlnet-scribble-sd15",
        "normal": "controlnet-normal-sd15",
    },
    "sdxl": {
        "canny": "controlnet-canny-sdxl",
        "depth": "controlnet-depth-sdxl",
        "openpose": "controlnet-openpose-sdxl",
    },
}

SUPPORTED_FAMILIES = set(_STACKS)


@dataclass(frozen=True)
class ResolvedControlLayer:
    record_id: str
    annotator_record_id: Optional[str]
    layer: Dict[str, Any]


def _require_installed(record_id: str, resolve_record: RecordResolver, kind: str) -> None:
    record = resolve_record(record_id) or {}
    if record.get("status") != "ready":
        name = record.get("name") or record_id
        raise GuidedValidationError(
            f"The {kind} '{name}' is not installed - install '{record_id}' "
            "from the Foundry first."
        )


def resolve_controlnet_stack(
    layers: Optional[List[Dict[str, Any]]],
    family: Optional[str],
    resolve_record: RecordResolver,
) -> List[ResolvedControlLayer]:
    layers = layers or []
    if not layers:
        return []

    stacks = _STACKS.get(family or "")
    if stacks is None:
        label = FAMILY_LABELS.get(family or "", family or "this model")
        raise GuidedValidationError(
            f"ControlNet on {label} is not supported yet - it lands in the next "
            "update (#34 PR3). Switch to an SD 1.5 or SDXL checkpoint, or hide "
            "the ControlNet layer(s)."
        )

    resolved: List[ResolvedControlLayer] = []
    for layer in layers:
        preprocessor = (layer.get("preprocessor") or "").strip()
        record_id = stacks.get(preprocessor)
        if record_id is None:
            label = FAMILY_LABELS.get(family or "", family or "this model")
            supported = ", ".join(sorted(stacks))
            raise GuidedValidationError(
                f"No ControlNet model is available for the '{preprocessor}' "
                f"preprocessor on {label} yet - supported on {label}: {supported}."
            )
        spec = PREPROCESSORS[preprocessor]
        _require_installed(record_id, resolve_record, "ControlNet model")
        if spec.annotator_record_id:
            _require_installed(spec.annotator_record_id, resolve_record, "preprocessor annotator")
        resolved.append(ResolvedControlLayer(
            record_id=record_id,
            annotator_record_id=spec.annotator_record_id,
            layer=dict(layer),
        ))
    return resolved
```

- [ ] **Step 4: Run to verify pass**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_controlnet_registry.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/guided/controlnet_registry.py backend/tests/test_guided_controlnet_registry.py && git commit -m "feat(guided): ControlNet registry - family/preprocessor record resolution + declines (#34)"
```

---

### Task 5: Pass plan + pipeline derivation (`passes.py`, `pipelines.py`)

**Files:**
- Modify: `backend/guided/passes.py`
- Modify: `backend/guided/pipelines.py`
- Test: `backend/tests/test_guided_passes.py`, `backend/tests/test_guided_pipelines.py` (extend/modify)

**Interfaces:**
- Consumes: existing `GuidedPassPlan`, `derive_variant`, PR1 message constants.
- Produces: `GuidedPassPlan.controlnet: List[Dict[str, Any]]`; `NOTICE_CONTROLNET_PROMPT_IGNORED`; `derive_variant(base_pipeline, kind, controlnet=None)` where `kind="none"` + controlnet → `AutoPipelineForText2Image.from_pipe(base, controlnet=...)`; `controlnets_attached(model_dirs: List[str], torch_dtype, device)` context manager yielding the loaded `ControlNetModel` list. `MSG_CONTROLNET_NOT_YET` is DELETED. Task 7 uses all of these.

- [ ] **Step 1: Update the passes tests**

In `backend/tests/test_guided_passes.py`:
1. Delete the PR1 test that asserts ControlNet layers raise (it asserts `MSG_CONTROLNET_NOT_YET` / `pytest.raises` on a controlnet layer) and remove `MSG_CONTROLNET_NOT_YET` from the import list if present.
2. Add:

```python
CN_LAYER = {"layer_id": "c1", "layer_name": "Edges", "source_path": "s.png",
            "preprocessor": "canny", "strength": 1.0, "start_step": 0.0,
            "end_step": 1.0, "mask": {}, "prompt": None, "negative_prompt": None}


def test_controlnet_layers_thread_into_the_plan():
    plan = resolve_guided_pass([dict(CN_LAYER)], [], None, 0.75)
    assert plan.kind == "none"
    assert plan.controlnet == [CN_LAYER]
    assert plan.notices == []


def test_controlnet_composes_with_inpaint():
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": {},
               "prompt": None, "negative_prompt": None}
    plan = resolve_guided_pass([dict(CN_LAYER)], [], inpaint, 0.6)
    assert plan.kind == "inpaint"
    assert plan.controlnet == [CN_LAYER]


def test_controlnet_layer_prompt_gets_an_ignored_notice():
    from guided.passes import NOTICE_CONTROLNET_PROMPT_IGNORED

    plan = resolve_guided_pass([dict(CN_LAYER, prompt="  regional  ")], [], None, 0.75)
    assert NOTICE_CONTROLNET_PROMPT_IGNORED in plan.notices
```

- [ ] **Step 2: Run to verify failure**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_passes.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL (controlnet still raises; no `controlnet` field/notice).

- [ ] **Step 3: Implement the `passes.py` changes**

1. Delete the `MSG_CONTROLNET_NOT_YET` constant.
2. Add after `NOTICE_REFERENCE_MASK_IGNORED`:
```python
NOTICE_CONTROLNET_PROMPT_IGNORED = (
    "ControlNet layer prompts are not supported by the local engine - the "
    "layer prompt was ignored; use the main prompt (layer prompts stay "
    "inpaint-only)."
)
```
3. Add to `GuidedPassPlan`:
```python
    controlnet: List[Dict[str, Any]] = field(default_factory=list)
```
4. Replace the body of `resolve_guided_pass`:
```python
    controlnet = controlnet or []
    reference_images = reference_images or []

    if len(reference_images) > 1:
        raise GuidedValidationError(MSG_MULTI_REFERENCE_NOT_YET)
    if inpaint and reference_images:
        raise GuidedValidationError(MSG_INPAINT_PLUS_REFERENCE)

    # diffusers has no per-layer ControlNet prompting; say so, don't pretend.
    notices: List[str] = []
    if any(_clean(layer.get("prompt")) or _clean(layer.get("negative_prompt"))
           for layer in controlnet):
        notices.append(NOTICE_CONTROLNET_PROMPT_IGNORED)
    controlnet = [dict(layer) for layer in controlnet]

    if inpaint:
        return GuidedPassPlan(
            kind="inpaint",
            image_path=inpaint.get("image_path"),
            mask=inpaint.get("mask"),
            strength=denoising_strength,
            prompt_override=_clean(inpaint.get("prompt")),
            negative_prompt_override=_clean(inpaint.get("negative_prompt")),
            notices=notices,
            controlnet=controlnet,
        )

    if reference_images:
        reference = reference_images[0]
        return GuidedPassPlan(
            kind="img2img",
            image_path=reference.get("source_path"),
            mask=None,  # honestly not applied - see the notice
            strength=denoising_strength,
            notices=notices + [NOTICE_REFERENCE_MASK_IGNORED],
            controlnet=controlnet,
        )

    return GuidedPassPlan(notices=notices, controlnet=controlnet)
```
5. Update the module docstring's first line from PR1 to `"""#34: resolve the request's guided-pass fields into one validated plan.` (drop "PR1").

- [ ] **Step 4: Extend the pipelines tests**

`backend/tests/test_guided_pipelines.py` builds a fake diffusers via
`types.SimpleNamespace` + `_FakeAutoPipeline` and monkeypatches `gp.diffusers`
(the module is imported as `import guided.pipelines as gp`). Extend it:

1. Give `_FakeAutoPipeline.from_pipe` a kwargs channel and add txt2img to the fake module:
```python
class _FakeAutoPipeline:
    seen = None
    seen_kwargs = None

    @classmethod
    def from_pipe(cls, base, **kwargs):
        cls.seen = base
        cls.seen_kwargs = kwargs
        return ("derived", base)


def _fake_diffusers():
    module = types.SimpleNamespace()
    module.AutoPipelineForText2Image = type("T2I", (_FakeAutoPipeline,), {})
    module.AutoPipelineForImage2Image = type("A2I", (_FakeAutoPipeline,), {})
    module.AutoPipelineForInpainting = type("A2P", (_FakeAutoPipeline,), {})
    return module
```
2. Append the new tests:
```python
def test_derive_variant_none_requires_controlnet(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers())
    with pytest.raises(ValueError):
        derive_variant(object(), "none")


def test_derive_variant_passes_controlnet_to_from_pipe(monkeypatch):
    fake = _fake_diffusers()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "none", controlnet=["cn"]) == ("derived", base)
    assert fake.AutoPipelineForText2Image.seen is base
    assert fake.AutoPipelineForText2Image.seen_kwargs == {"controlnet": ["cn"]}
    assert derive_variant(base, "img2img", controlnet=["cn"]) == ("derived", base)
    assert fake.AutoPipelineForImage2Image.seen_kwargs == {"controlnet": ["cn"]}
    # Without a controlnet, from_pipe gets NO controlnet kwarg (PR1 behavior).
    assert derive_variant(base, "inpaint") == ("derived", base)
    assert fake.AutoPipelineForInpainting.seen_kwargs == {}


def test_controlnets_attached_loads_and_always_releases(monkeypatch):
    events = []

    class _FakeModel:
        def __init__(self, name):
            self.name = name

        def to(self, device):
            events.append(("to", self.name, device))
            return self

    class _FakeControlNetModel:
        @classmethod
        def from_pretrained(cls, model_dir, torch_dtype=None):
            events.append(("load", model_dir, torch_dtype))
            return _FakeModel(model_dir)

    fake = types.SimpleNamespace(ControlNetModel=_FakeControlNetModel)
    monkeypatch.setattr(gp, "diffusers", fake)

    with gp.controlnets_attached(["dir-a", "dir-b"], "dtype", "cpu") as models:
        assert [m.name for m in models] == ["dir-a", "dir-b"]
    assert ("load", "dir-a", "dtype") in events and ("to", "dir-b", "cpu") in events

    with pytest.raises(RuntimeError):
        with gp.controlnets_attached(["dir-a"], "dtype", "cpu"):
            raise RuntimeError("boom")
    # No assertion on empty_cache (torch may be absent) - the contract is that
    # the manager exits cleanly and clears its model list either way.


def test_controlnets_attached_without_diffusers_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", None)
    with pytest.raises(RuntimeError):
        with gp.controlnets_attached(["dir-a"], None, "cpu"):
            pass
```
The four existing derive/filter tests stay green: `from_pipe(cls, base, **kwargs)`
is backward-compatible, and `derive_variant(base, "controlnet")` still raises
ValueError (not a variant kind).

- [ ] **Step 5: Implement the `pipelines.py` changes**

Replace `_VARIANT_CLASSES` and `derive_variant`, and add `controlnets_attached`:

```python
from contextlib import contextmanager

_VARIANT_CLASSES = {
    "none": "AutoPipelineForText2Image",
    "img2img": "AutoPipelineForImage2Image",
    "inpaint": "AutoPipelineForInpainting",
}


def derive_variant(base_pipeline: Any, kind: str, controlnet: Any = None) -> Any:
    """Derive a guided-pass variant of a loaded pipeline via from_pipe.

    kind "none" is only meaningful WITH a controlnet (txt2img + ControlNet);
    an unguided pass calls the base pipeline directly.
    """
    class_name = _VARIANT_CLASSES.get(kind)
    if class_name is None:
        raise ValueError(f"no pipeline variant for guided pass '{kind}'")
    if kind == "none" and controlnet is None:
        raise ValueError("an unguided pass needs no variant - call the base pipeline")
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    auto_class = getattr(diffusers, class_name)
    if controlnet is not None:
        return auto_class.from_pipe(base_pipeline, controlnet=controlnet)
    return auto_class.from_pipe(base_pipeline)


@contextmanager
def controlnets_attached(model_dirs: List[str], torch_dtype: Any, device: str):
    """Load ControlNet weights for one generation; always release afterward."""
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    models: List[Any] = []
    try:
        for model_dir in model_dirs:
            model = diffusers.ControlNetModel.from_pretrained(model_dir, torch_dtype=torch_dtype)
            models.append(model.to(device))
        yield models
    finally:
        models.clear()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
```
Update the module docstring to mention ControlNet variant derivation. Keep `filter_call_kwargs` unchanged.

- [ ] **Step 6: Run both suites**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_passes.py backend/tests/test_guided_pipelines.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/guided/passes.py backend/guided/pipelines.py backend/tests/test_guided_passes.py backend/tests/test_guided_pipelines.py && git commit -m "feat(guided): ControlNet in the pass plan + from_pipe(controlnet) variants (#34)"
```

---

### Task 6: Endpoint pre-flight (`backend/main.py`)

**Files:**
- Modify: `backend/main.py` (imports; the `#34 pre-flight` block at ~line 1223; `ControlNetLayerPayload` docstring at line 444; field description at line 489)
- Test: `backend/tests/test_guided_request.py` (extend)

**Interfaces:**
- Consumes: `resolve_controlnet_stack` (Task 4), `pass_plan.controlnet` (Task 5), `model_registry.get_record`.
- Produces: 422 responses for every structural ControlNet problem BEFORE a job exists. No new schema fields.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_guided_request.py`:

```python
class _FakeRegistry:
    """get_record stand-in: family for the gen model, status for CN records."""

    def __init__(self, family="sd15", statuses=None):
        self.family = family
        self.statuses = statuses or {}

    def get_record(self, model_id):
        if model_id.startswith(("controlnet-", "annotator-")):
            return {"id": model_id, "name": model_id,
                    "status": self.statuses.get(model_id, "ready")}
        return {"id": model_id, "base_architecture": self.family, "status": "ready"}


def _client(monkeypatch, registry):
    from fastapi.testclient import TestClient

    import main as main_module

    monkeypatch.setattr(main_module, "model_registry", registry)

    async def _noop(job_id, request):
        return None

    monkeypatch.setattr(main_module, "process_image_generation", _noop)
    return TestClient(main_module.app)


def _cn_request(tmp_path, preprocessor="canny"):
    source = tmp_path / "pose.png"
    from PIL import Image

    Image.new("RGB", (8, 8)).save(source)
    return {
        "prompt": "a castle",
        "model": "sd-1-5",
        "controlnet": [{
            "layer_id": "c1", "layer_name": "Edges", "source_path": str(source),
            "preprocessor": preprocessor, "strength": 1.0,
            "start_step": 0.0, "end_step": 1.0, "mask": MASK,
        }],
    }


def test_controlnet_on_flux_preflights_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="flux"))
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 422
    assert "PR3" in response.json()["detail"]


def test_controlnet_uninstalled_record_preflights_422(monkeypatch, tmp_path):
    registry = _FakeRegistry(statuses={"controlnet-canny-sd15": "not_found"})
    client = _client(monkeypatch, registry)
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "controlnet-canny-sd15" in detail and "Foundry" in detail


def test_controlnet_missing_source_is_basename_only_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry())
    body = _cn_request(tmp_path)
    body["controlnet"][0]["source_path"] = str(tmp_path / "gone.png")
    response = client.post("/api/generate/image", json=body)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "gone.png" in detail
    assert str(tmp_path) not in detail  # never leak filesystem paths


def test_controlnet_installed_stack_enqueues(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry())
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
```

- [ ] **Step 2: Run to verify failure**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: the four new tests FAIL (no ControlNet pre-flight yet — flux/uninstalled cases return 200).

- [ ] **Step 3: Implement the pre-flight**

In `backend/main.py`:

1. Next to the existing guided imports (`from guided.passes import ...`), add:
```python
from guided.controlnet_registry import resolve_controlnet_stack
```
2. Update `ControlNetLayerPayload`'s docstring (line 444) to `"""#34: canvas ControlNet layer (SD 1.5 / SDXL real since PR2)."""` and the `controlnet` field description (line 489-490) to `"#34 canvas ControlNet layers"`.
3. Inside the endpoint's `if guided is not None:` pre-flight block, append after the existing `if pass_plan.kind != "none":` section (same indent level as it):
```python
        if pass_plan.controlnet:
            for layer in pass_plan.controlnet:
                if not os.path.isfile(layer.get("source_path") or ""):
                    name = os.path.basename(layer.get("source_path") or "")
                    raise HTTPException(
                        status_code=422,
                        detail=f"ControlNet source image '{name}' was not found on disk.",
                    )
            record = model_registry.get_record(gen_request.model) or {}
            try:
                resolve_controlnet_stack(
                    pass_plan.controlnet,
                    record.get("base_architecture"),
                    model_registry.get_record,
                )
            except GuidedValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
```

- [ ] **Step 4: Run to verify pass**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: all pass (7 PR1 tests + 4 new).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/main.py backend/tests/test_guided_request.py && git commit -m "feat(guided): ControlNet pre-flight 422s - family, install, source checks (#34)"
```

---

### Task 7: Generator execution (`backend/utils/direct_generator.py`)

**Files:**
- Modify: `backend/utils/direct_generator.py` (imports; `_generate_sync` guided branch, lines ~400–488)
- Test: `backend/tests/test_direct_generator_guided.py` (extend)

**Interfaces:**
- Consumes: `resolve_controlnet_stack`, `produce_control_image`, `controlnets_attached`, `derive_variant(..., controlnet=)`.
- Produces: job results whose `guided` report gains `"controlnet": [{"layer_id", "preprocessor", "record_id"}]`; ControlNet weights loaded from `<models_dir>/controlnet/<record_id>/`, annotators from `<models_dir>/annotators/`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_direct_generator_guided.py`:

1. Update the `_generator` helper: set `gen.models_dir = str(tmp_path)` after `gen.applied_acceleration = {}`; change the `_resolve_record` monkeypatch to `lambda _id: {"base_architecture": family, "status": "ready", "id": _id, "name": _id}`; change the `derive_variant` monkeypatch to `lambda base, kind, controlnet=None: base`; and add:
```python
    attached = []

    class _FakeAttached:
        def __init__(self, dirs, dtype, device):
            attached.append({"dirs": list(dirs), "dtype": dtype,
                             "device": device, "released": False})
            self._entry = attached[-1]

        def __enter__(self):
            return ["cn-model"] * len(self._entry["dirs"])

        def __exit__(self, *exc):
            self._entry["released"] = True
            return False

    monkeypatch.setattr(dg, "controlnets_attached",
                        lambda dirs, dtype, device: _FakeAttached(dirs, dtype, device))
    return gen, loaded, attached
```
Update the four existing call sites of `_generator(...)` to unpack three values (`gen, _, _ = ...` / `gen, loaded, _ = ...`).

2. Extend `_FakePipeline.__call__` with ControlNet kwargs, recording them:
```python
    def __call__(self, prompt=None, negative_prompt=None, image=None,
                 mask_image=None, strength=0.75, width=None, height=None,
                 num_inference_steps=25, guidance_scale=7.5, generator=None,
                 callback_on_step_end=None, control_image=None,
                 controlnet_conditioning_scale=None,
                 control_guidance_start=None, control_guidance_end=None):
        self._calls.append({
            "prompt": prompt, "image": image, "mask_image": mask_image,
            "strength": strength, "width": width, "height": height,
            "control_image": control_image,
            "controlnet_conditioning_scale": controlnet_conditioning_scale,
            "control_guidance_start": control_guidance_start,
            "control_guidance_end": control_guidance_end,
        })
```

3. Add helpers + tests:
```python
def _cn_source(tmp_path):
    import numpy as np
    from PIL import Image

    array = np.zeros((16, 16, 3), dtype=np.uint8)
    array[4:12, 4:12] = 255
    path = tmp_path / "cn-source.png"
    Image.fromarray(array).save(path)
    return str(path)


def _cn_layer(tmp_path, **overrides):
    layer = {"layer_id": "c1", "layer_name": "Edges", "source_path": _cn_source(tmp_path),
             "preprocessor": "canny", "strength": 1.4, "start_step": 0.2,
             "end_step": 0.8, "mask": MASK, "prompt": None, "negative_prompt": None}
    layer.update(overrides)
    return layer


def _cn_model_dir(tmp_path, record_id):
    import os

    path = tmp_path / "controlnet" / record_id
    path.mkdir(parents=True)
    (path / "config.json").write_text("{}")
    return str(path)


def test_controlnet_txt2img_threads_controls_and_scales(monkeypatch, tmp_path):
    calls = []
    gen, _, attached = _generator(tmp_path, calls, monkeypatch)
    expected_dir = _cn_model_dir(tmp_path, "controlnet-canny-sd15")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert isinstance(call["image"], list) and len(call["image"]) == 1
    assert call["width"] == 8 and call["height"] == 8
    assert call["controlnet_conditioning_scale"] == [1.4]
    assert call["control_guidance_start"] == [0.2]
    assert call["control_guidance_end"] == [0.8]
    assert result["guided"]["pass"] == "none"
    assert result["guided"]["controlnet"] == [
        {"layer_id": "c1", "preprocessor": "canny", "record_id": "controlnet-canny-sd15"},
    ]
    assert attached[0]["dirs"] == [expected_dir]
    assert attached[0]["released"] is True


def test_controlnet_composes_with_img2img(monkeypatch, tmp_path):
    calls = []
    gen, _, _ = _generator(tmp_path, calls, monkeypatch)
    _cn_model_dir(tmp_path, "controlnet-canny-sd15")
    guided = {"controlnet": [_cn_layer(tmp_path)], "denoising_strength": 0.6,
              "inpaint": None,
              "reference_images": [{"layer_id": "r1", "source_path": _base_image(tmp_path),
                                    "mask": MASK, "strength": 1.0}]}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert call["image"] is not None and not isinstance(call["image"], list)  # init image
    assert isinstance(call["control_image"], list)                            # control map
    assert call["strength"] == 0.6
    assert result["guided"]["pass"] == "img2img"


def test_controlnet_missing_model_dir_fails_before_pipeline(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _ = _generator(tmp_path, calls, monkeypatch)
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    with pytest.raises(GuidedValidationError) as excinfo:
        _run(gen, tmp_path, guided)
    assert calls == []
    assert str(tmp_path) not in str(excinfo.value)  # no paths in the message


def test_controlnet_on_flux_family_fails_loudly(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _ = _generator(tmp_path, calls, monkeypatch, family="flux")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    with pytest.raises(GuidedValidationError):
        _run(gen, tmp_path, guided)
    assert calls == []
```

- [ ] **Step 2: Run to verify failure**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_direct_generator_guided.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: new tests FAIL (generator ignores `pass_plan.controlnet`).

- [ ] **Step 3: Implement the generator branch**

In `backend/utils/direct_generator.py`:

1. Extend the guided import block (lines 38–41):
```python
# #34 guided passes (all modules import with no torch/diffusers).
from guided.controlnet_registry import resolve_controlnet_stack
from guided.masks import mask_coverage, rasterize_mask
from guided.passes import GuidedValidationError, resolve_guided_pass
from guided.pipelines import controlnets_attached, derive_variant, filter_call_kwargs
from guided.preprocessors import produce_control_image
```
2. Add `from contextlib import ExitStack` to the stdlib imports at the top.
3. In `_generate_sync`, after the `model_for_pass` flux-fill block (line ~415), insert:
```python
        # #34 PR2: resolve the ControlNet stack through the same seam the
        # endpoint 422s through, and build the control images on CPU before
        # any weights move.
        cn_stack = []
        if pass_plan.controlnet:
            base_record = _resolve_record(model_name) or {}
            cn_stack = resolve_controlnet_stack(
                pass_plan.controlnet, base_record.get("base_architecture"), _resolve_record,
            )
        cn_model_dirs: List[str] = []
        for item in cn_stack:
            model_dir = os.path.join(self.models_dir, "controlnet", item.record_id)
            if not os.path.isdir(model_dir):
                raise GuidedValidationError(
                    f"The ControlNet model '{item.record_id}' looks incomplete "
                    "on disk - reinstall it from the Foundry."
                )
            cn_model_dirs.append(model_dir)
        annotators_dir = os.path.join(self.models_dir, "annotators")
        control_images = [
            produce_control_image(item.layer, width, height, annotators_dir)
            for item in cn_stack
        ]
```
4. Replace the block from `guided_report: Optional[Dict[str, Any]] = None` (line 451) through `output = run_pipeline(**call_kwargs)` (line 488) with:
```python
        guided_report: Optional[Dict[str, Any]] = None
        if pass_plan.kind == "none":
            call_kwargs["width"] = width
            call_kwargs["height"] = height
        else:
            init_image = Image.open(pass_plan.image_path).convert("RGB")
            base_size = init_image.size
            init_image = init_image.resize((width, height), Image.Resampling.LANCZOS)
            call_kwargs["image"] = init_image
            call_kwargs["strength"] = pass_plan.strength
            if pass_plan.kind == "inpaint":
                mask_image = rasterize_mask(pass_plan.mask or {}, base_size[0], base_size[1])
                if mask_coverage(mask_image) == 0.0:
                    raise GuidedValidationError(
                        "The inpaint mask is empty - draw a mask region on the canvas first."
                    )
                call_kwargs["mask_image"] = mask_image.resize(
                    (width, height), Image.Resampling.LANCZOS)
                call_kwargs["width"] = width
                call_kwargs["height"] = height

        if cn_stack:
            # txt2img ControlNet variants take the control map as `image`;
            # img2img/inpaint variants keep `image` for the init and take the
            # control map as `control_image`.
            if pass_plan.kind == "none":
                call_kwargs["image"] = control_images
            else:
                call_kwargs["control_image"] = control_images
            call_kwargs["controlnet_conditioning_scale"] = [
                float(item.layer.get("strength", 1.0)) for item in cn_stack]
            call_kwargs["control_guidance_start"] = [
                float(item.layer.get("start_step", 0.0)) for item in cn_stack]
            call_kwargs["control_guidance_end"] = [
                float(item.layer.get("end_step", 1.0)) for item in cn_stack]

        with ExitStack() as stack:
            if cn_stack:
                cn_models = stack.enter_context(controlnets_attached(
                    cn_model_dirs, getattr(pipeline, "dtype", None), self.device))
                run_pipeline = derive_variant(pipeline, pass_plan.kind, controlnet=cn_models)
            elif pass_plan.kind == "none":
                run_pipeline = pipeline
            else:
                # flux-fill IS the inpaint pipeline - only derive for base models.
                run_pipeline = (
                    pipeline if model_for_pass != model_name
                    else derive_variant(pipeline, pass_plan.kind)
                )

            call_kwargs, dropped_params = filter_call_kwargs(run_pipeline, call_kwargs)
            if pass_plan.kind != "none" or cn_stack:
                guided_report = {
                    "pass": pass_plan.kind,
                    "notices": list(pass_plan.notices),
                    "dropped_params": dropped_params,
                    "controlnet": [
                        {"layer_id": item.layer.get("layer_id"),
                         "preprocessor": item.layer.get("preprocessor"),
                         "record_id": item.record_id}
                        for item in cn_stack
                    ],
                }

            with loras_applied(pipeline, loras or [], _resolve_lora_record) as lora_result:
                with torch.inference_mode():
                    output = run_pipeline(**call_kwargs)
```
(Everything after — save image, return dict — is unchanged. `run_pipeline` and
`output`/`lora_result` are consumed after the `ExitStack` closes only via the
return dict, which is built from `lora_result`, `guided_report`, and the saved
file — move the `image = output.images[0]` + save lines INSIDE the
`with ExitStack()` block, directly after the `loras_applied` block, so the
image is extracted before the ControlNet weights are released. The `return`
statement stays outside.)

- [ ] **Step 4: Run the guided + LoRA generator suites**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_direct_generator_guided.py backend/tests/test_direct_generator_loras.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: all pass (6 PR1 + 4 new + LoRA suite).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/utils/direct_generator.py backend/tests/test_direct_generator_guided.py && git commit -m "feat(guided): MultiControlNet execution - attach, generate, always release (#34)"
```

---

### Task 8: Frontend pre-flight + Foundry link

PR2's acceptance requires the UI to block generate with a reason and a Foundry
link when a visible ControlNet layer needs an uninstalled model. Full layer-
properties reconciliation is PR3 — this task adds only the pre-flight seam.
The check is best-effort: when the frontend cannot resolve the active model's
family (models list not loaded), it stays silent and the backend 422 is
authoritative — so the existing canvas-layer tests (which never seed
`availableModels`) keep passing unchanged.

**Files:**
- Create: `src/features/generation/controlnetSupport.ts`
- Test: `src/features/generation/controlnetSupport.test.ts` (create)
- Modify: `src/pages/GeneratePanel.tsx` (pre-flight memo ~line 398 area; submit throw ~line 824; footerWarning chain ~line 1247; warning JSX ~line 1690)
- Test: `src/pages/GeneratePanel.test.tsx` (extend)

**Interfaces:**
- Consumes: `GenerationControlNetLayerPayload`, `ModelRecord`, `selectedImageBaseArch` (GeneratePanel:355), `useAppStore((s) => s.setActiveTab)`.
- Produces: `CONTROLNET_STACKS` (mirror of `backend/guided/controlnet_registry.py::_STACKS` + annotator ids — keep them in sync; the backend registry is the source of truth); `resolveControlNetPreflight(layers, baseArchitecture, availableModels): { errors: string[]; missingRecordIds: string[] }`.

- [ ] **Step 1: Write the failing support-module tests**

Create `src/features/generation/controlnetSupport.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { resolveControlNetPreflight } from './controlnetSupport';
import type { GenerationControlNetLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

function buildLayer(overrides: Partial<GenerationControlNetLayerPayload> = {}): GenerationControlNetLayerPayload {
  return {
    layer_id: 'c1',
    layer_name: 'Pose Guide',
    source_path: 'C:/inputs/pose.png',
    preprocessor: 'openpose',
    strength: 1,
    start_step: 0,
    end_step: 1,
    mask: { type: 'rectangle', points: [{ x: 0, y: 0 }], bounds: { x: 0, y: 0, width: 8, height: 8 } },
    ...overrides,
  };
}

function buildRecord(overrides: Partial<ModelRecord>): ModelRecord {
  // Only the required (M1) ModelRecord fields; the M3+ fields are optional.
  return {
    id: 'record',
    name: 'Record',
    artifact_type: 'controlnet',
    capability: 'image',
    base_architecture: 'sd15',
    source: 'huggingface',
    repo_id: null,
    revision: null,
    aux_repo_id: null,
    size: 'Unknown',
    status: 'ready',
    tier: 'verified',
    quality: 'balanced',
    runtime: 'local',
    hardware_class: 'laptop',
    vram: 'Unknown',
    description: '',
    license: null,
    gated: false,
    ...overrides,
  };
}

describe('resolveControlNetPreflight', () => {
  it('stays silent with no layers or an unresolved family', () => {
    expect(resolveControlNetPreflight([], 'sd15', [])).toEqual({ errors: [], missingRecordIds: [] });
    expect(resolveControlNetPreflight([buildLayer()], null, [])).toEqual({ errors: [], missingRecordIds: [] });
  });

  it('declines unsupported families with the PR3 message', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'flux', []);
    expect(result.errors[0]).toMatch(/FLUX/);
    expect(result.errors[0]).toMatch(/#34 PR3/);
    expect(result.missingRecordIds).toEqual([]);
  });

  it('declines preprocessors with no model on the family', () => {
    const result = resolveControlNetPreflight([buildLayer({ preprocessor: 'scribble' })], 'sdxl', []);
    expect(result.errors[0]).toMatch(/scribble/);
    expect(result.errors[0]).toMatch(/SDXL/);
  });

  it('reports uninstalled ControlNet and annotator records', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'sd15', [
      buildRecord({ id: 'controlnet-openpose-sd15', status: 'not_found' }),
    ]);
    expect(result.missingRecordIds).toEqual(['controlnet-openpose-sd15', 'annotator-openpose']);
    expect(result.errors[0]).toMatch(/Foundry/);
  });

  it('passes when every required record is ready', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'sd15', [
      buildRecord({ id: 'controlnet-openpose-sd15' }),
      buildRecord({ id: 'annotator-openpose', artifact_type: 'annotator' }),
    ]);
    expect(result).toEqual({ errors: [], missingRecordIds: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx vitest run src/features/generation/controlnetSupport.test.ts 2>&1 | tail -5
```
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/features/generation/controlnetSupport.ts`**

```typescript
import type { GenerationControlNetLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

/**
 * Frontend mirror of backend/guided/controlnet_registry.py (#34 PR2).
 * The backend registry is the source of truth; keep the two in sync when
 * families or preprocessors land (FLUX/SD3.5 + SDXL union arrive in PR3).
 */
export const CONTROLNET_STACKS: Record<string, Record<string, { recordId: string; annotatorRecordId: string | null }>> = {
  sd15: {
    canny: { recordId: 'controlnet-canny-sd15', annotatorRecordId: null },
    depth: { recordId: 'controlnet-depth-sd15', annotatorRecordId: 'annotator-midas' },
    openpose: { recordId: 'controlnet-openpose-sd15', annotatorRecordId: 'annotator-openpose' },
    scribble: { recordId: 'controlnet-scribble-sd15', annotatorRecordId: null },
    normal: { recordId: 'controlnet-normal-sd15', annotatorRecordId: 'annotator-normalbae' },
  },
  sdxl: {
    canny: { recordId: 'controlnet-canny-sdxl', annotatorRecordId: null },
    depth: { recordId: 'controlnet-depth-sdxl', annotatorRecordId: 'annotator-midas' },
    openpose: { recordId: 'controlnet-openpose-sdxl', annotatorRecordId: 'annotator-openpose' },
  },
};

const FAMILY_LABELS: Record<string, string> = {
  sd15: 'SD 1.5',
  sdxl: 'SDXL',
  flux: 'FLUX',
  sd35: 'SD 3.5',
};

export interface ControlNetPreflight {
  errors: string[];
  missingRecordIds: string[];
}

/**
 * Best-effort client mirror of the backend 422 pre-flight. A null family
 * (models list not loaded) stays silent - the backend check is authoritative.
 */
export function resolveControlNetPreflight(
  layers: GenerationControlNetLayerPayload[],
  baseArchitecture: string | null,
  availableModels: ModelRecord[],
): ControlNetPreflight {
  if (layers.length === 0 || !baseArchitecture) {
    return { errors: [], missingRecordIds: [] };
  }

  const stacks = CONTROLNET_STACKS[baseArchitecture];
  const label = FAMILY_LABELS[baseArchitecture] ?? baseArchitecture;
  if (!stacks) {
    return {
      errors: [
        `ControlNet on ${label} is not supported yet - it lands in the next update (#34 PR3). ` +
          'Switch to an SD 1.5 or SDXL checkpoint, or hide the ControlNet layer(s).',
      ],
      missingRecordIds: [],
    };
  }

  const errors = new Set<string>();
  const missing = new Set<string>();
  for (const layer of layers) {
    const entry = stacks[layer.preprocessor];
    if (!entry) {
      const supported = Object.keys(stacks).sort().join(', ');
      errors.add(
        `No ControlNet model is available for the '${layer.preprocessor}' preprocessor on ${label} yet - ` +
          `supported on ${label}: ${supported}.`,
      );
      continue;
    }
    const required = [entry.recordId, entry.annotatorRecordId].filter(
      (recordId): recordId is string => recordId !== null,
    );
    for (const recordId of required) {
      const record = availableModels.find((model) => model.id === recordId);
      if (record?.status !== 'ready') {
        errors.add(`${layer.layer_name} needs '${recordId}' - install it from the Foundry first.`);
        missing.add(recordId);
      }
    }
  }
  return { errors: [...errors], missingRecordIds: [...missing] };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx vitest run src/features/generation/controlnetSupport.test.ts 2>&1 | tail -5
```
Expected: 5 passed.

- [ ] **Step 5: Wire GeneratePanel**

In `src/pages/GeneratePanel.tsx`:

1. Import: `import { resolveControlNetPreflight } from '@/features/generation/controlnetSupport';`
2. Selector next to the existing store reads: `const setActiveTab = useAppStore((s) => s.setActiveTab);`
3. After the `selectedImageBaseArch` declaration (line ~356) add:
```tsx
  // #34 PR2: best-effort mirror of the backend ControlNet pre-flight - block
  // with the same reason the backend 422 would give, plus a Foundry link.
  const controlNetPreflight = useMemo(
    () =>
      imageConfig.generationType === 'image'
        ? resolveControlNetPreflight(
            resolvedCanvasControlLayers.controlnet,
            selectedImageBaseArch,
            availableModels,
          )
        : { errors: [], missingRecordIds: [] },
    [imageConfig.generationType, resolvedCanvasControlLayers.controlnet, selectedImageBaseArch, availableModels],
  );
```
(Place it AFTER `resolvedCanvasControlLayers` is declared — move it below line 398's memo if needed.)
4. In the submit handler, directly after the existing `if (resolvedCanvasControlLayers.errors.length > 0) { throw ... }` (line ~824):
```tsx
        if (controlNetPreflight.errors.length > 0) {
          throw new Error(controlNetPreflight.errors[0]);
        }
```
5. In the `footerWarning` chain (line ~1247), insert a branch after the canvas-errors branch:
```tsx
      : imageConfig.generationType === 'image' && controlNetPreflight.errors.length > 0
        ? controlNetPreflight.errors[0]
```
6. Replace the warning JSX (lines 1690–1694):
```tsx
          {footerWarning && (
            <p data-testid="generate-preflight-warning" className="mt-2 text-xs text-status-warning">
              {footerWarning}
              {controlNetPreflight.missingRecordIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('foundry')}
                  className="ml-2 underline underline-offset-2 text-status-warning hover:text-text-primary transition-colors"
                >
                  Manage in Foundry
                </button>
              )}
            </p>
          )}
```

- [ ] **Step 6: Extend the GeneratePanel tests**

In `src/pages/GeneratePanel.test.tsx`, add a record helper near `seedCanvasControlLayerScene` (the file already imports `ModelRecord`) — copy in the exact `buildRecord` from Step 1. Then add three tests after the existing `'threads denoising_strength...'` test:

```tsx
  function seedInstalledModels(records: ModelRecord[]) {
    useAppStore.getState().setAvailableModels(records);
  }

  it('blocks generate with a Foundry hint when a ControlNet layer needs an uninstalled model', async () => {
    seedCanvasControlLayerScene();
    seedInstalledModels([
      buildRecord({ id: 'sd-1-5', artifact_type: 'checkpoint', base_architecture: 'sd15' }),
    ]);
    render(<GeneratePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Use SD 1.5' }));
    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'cinematic portrait pass' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('generate-preflight-warning')).toHaveTextContent(
        /controlnet-openpose-sd15/,
      );
    });
    expect(window.electron.generation.generateImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Manage in Foundry' }));
    expect(useAppStore.getState().activeTab).toBe('foundry');
  });

  it('blocks ControlNet layers on families without support yet', async () => {
    seedCanvasControlLayerScene();
    seedInstalledModels([
      buildRecord({ id: 'flux-dev', artifact_type: 'checkpoint', base_architecture: 'flux' }),
    ]);
    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'cinematic portrait pass' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('generate-preflight-warning')).toHaveTextContent(/#34 PR3/);
    });
    expect(window.electron.generation.generateImage).not.toHaveBeenCalled();
  });

  it('submits ControlNet layers when the records are installed', async () => {
    seedCanvasControlLayerScene();
    seedInstalledModels([
      buildRecord({ id: 'sd-1-5', artifact_type: 'checkpoint', base_architecture: 'sd15' }),
      buildRecord({ id: 'controlnet-openpose-sd15' }),
      buildRecord({ id: 'annotator-openpose', artifact_type: 'annotator' }),
    ]);
    render(<GeneratePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Use SD 1.5' }));
    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'cinematic portrait pass' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          controlnet: [expect.objectContaining({ preprocessor: 'openpose' })],
        }),
      );
    });
  });
```
The two existing canvas-layer tests stay unchanged: they never seed
`availableModels`, the family resolves to null, and the client check stays
silent by design.

- [ ] **Step 7: Run the frontend suites**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx vitest run src/features/generation/controlnetSupport.test.ts src/pages/GeneratePanel.test.tsx src/features/generation/resolveCanvasControlLayers.test.ts 2>&1 | tail -6
npm run typecheck 2>&1 | tail -3
```
Expected: all pass, typecheck clean.

- [ ] **Step 8: Commit** (pre-commit hook runs full vitest + typecheck — expect it to take a while)

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add src/features/generation/controlnetSupport.ts src/features/generation/controlnetSupport.test.ts src/pages/GeneratePanel.tsx src/pages/GeneratePanel.test.tsx && git commit -m "feat(guided): ControlNet UI pre-flight - block with reason + Foundry link (#34)"
```

---

### Task 9: Dependency, smoke test, gates, PR

**Files:**
- Modify: `backend/requirements.txt` (commented AI/ML line, like peft)
- Create: `backend/tests/test_guided_smoke_controlnet_local.py` (env-gated)

**Interfaces:**
- Consumes: everything above.
- Produces: PR "Guided passes PR2: real ControlNet on SD1.5/SDXL (#34)".

- [ ] **Step 1: Declare + install `controlnet_aux`**

In `backend/requirements.txt`, add to the commented AI/ML block after the peft line:
```
# controlnet_aux>=0.0.10  # ControlNet preprocessor annotators (#34); install alongside torch/diffusers
```
Install into the local venv:
```bash
backend/venv/Scripts/python.exe -m pip install "controlnet_aux>=0.0.10" 2>&1 | tail -2
backend/venv/Scripts/python.exe -c "import controlnet_aux; print(controlnet_aux.__version__)"
```
Expected: version prints.

- [ ] **Step 2: Write the env-gated smoke test**

Create `backend/tests/test_guided_smoke_controlnet_local.py`:

```python
"""#34 PR2 acceptance smoke: a canny ControlNet layer measurably constrains
SD 1.5 output. Runs ONLY with VS_REAL_SMOKE=1, the full backend, and the
controlnet-canny-sd15 record installed. Maintainer gate before merging PR2.
"""
import os

import pytest

RUN = os.getenv("VS_REAL_SMOKE") == "1"
HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(
    not (RUN and HAS_DEPS), reason="set VS_REAL_SMOKE=1 with the full backend to run"
)

MODELS_DIR = os.environ.get("VS_MODELS_DIR", "models")


def test_canny_controlnet_constrains_sd15_output(tmp_path):
    import numpy as np
    from PIL import Image

    from utils.direct_generator import DirectGenerator

    cn_dir = os.path.join(MODELS_DIR, "controlnet", "controlnet-canny-sd15")
    if not os.path.isdir(cn_dir):
        pytest.skip("install controlnet-canny-sd15 from the Foundry to run this smoke")

    # A high-contrast circle: its canny edges are the control signal.
    import cv2

    array = np.zeros((512, 512, 3), dtype=np.uint8)
    cv2.circle(array, (256, 256), 140, (255, 255, 255), -1)
    source_path = str(tmp_path / "circle.png")
    Image.fromarray(array).save(source_path)

    layer = {"layer_id": "c1", "layer_name": "Circle", "source_path": source_path,
             "preprocessor": "canny", "strength": 1.0, "start_step": 0.0, "end_step": 1.0,
             "mask": {"type": "rectangle", "points": [{"x": 0, "y": 0}],
                      "bounds": {"x": 0, "y": 0, "width": 512, "height": 512}},
             "prompt": None, "negative_prompt": None}
    guided = {"controlnet": [layer], "reference_images": [], "inpaint": None,
              "denoising_strength": 0.75}

    def run(out_name, guided_payload):
        out_dir = tmp_path / out_name
        out_dir.mkdir()
        gen = DirectGenerator(models_dir=MODELS_DIR, output_dir=str(out_dir))
        result = gen._generate_sync(
            "a stained glass window", "", 512, 512, 12, 7.5, 7, "sd-1-5", "euler",
            lambda *a: None, str(out_dir), None, None, guided_payload,
        )
        return np.asarray(Image.open(out_dir / "generated.png"), dtype=np.int32), result

    guided_image, result = run("guided", guided)
    plain_image, _ = run("plain", None)

    assert result["guided"]["controlnet"][0]["record_id"] == "controlnet-canny-sd15"
    diff = np.abs(guided_image - plain_image).mean()
    assert diff > 10, "the control layer did not change the output - ControlNet is not real"

    control_edges = cv2.Canny(array[:, :, 0], 100, 200) > 0
    guided_edges = cv2.Canny(guided_image.astype(np.uint8)[:, :, 0], 100, 200) > 0
    plain_edges = cv2.Canny(plain_image.astype(np.uint8)[:, :, 0], 100, 200) > 0
    guided_overlap = (guided_edges & control_edges).sum() / max(control_edges.sum(), 1)
    plain_overlap = (plain_edges & control_edges).sum() / max(control_edges.sum(), 1)
    assert guided_overlap > plain_overlap, "output edges do not follow the control map"
```

- [ ] **Step 3: Run the full gate suite**

1. Combined guided/foundry backend suites:
```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_masks.py backend/tests/test_guided_passes.py backend/tests/test_guided_pipelines.py backend/tests/test_guided_preprocessors.py backend/tests/test_guided_controlnet_registry.py backend/tests/test_guided_request.py backend/tests/test_direct_generator_guided.py backend/tests/test_direct_generator_loras.py backend/tests/test_lora_request.py backend/tests/test_foundry_controlnet_records.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
2. Real-model smoke, IF `controlnet-canny-sd15` is installed locally (install it via the app's Foundry first if practical; otherwise report the skip honestly in the PR body):
```bash
VS_REAL_SMOKE=1 backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_smoke_controlnet_local.py -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
3. Targeted fast backend sweep (CI stub suite stays authoritative):
```bash
backend/venv/Scripts/python.exe -m pytest backend/tests -q --ignore=backend/tests/test_direct_generator.py --ignore=backend/tests/test_direct_generator_progress.py --ignore=backend/tests/test_direct_generator_accel.py --ignore=backend/tests/test_direct_generator_accel_cache.py --ignore=backend/tests/test_direct_video_generator_accel.py --ignore=backend/tests/test_video_service.py --ignore=backend/tests/test_edit_service.py --ignore=backend/tests/test_retrieval_embedder.py --ignore=backend/tests/test_foundry_hardware.py 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"
```
4. Frontend: typecheck + vitest already ran green in the Task 8 commit hook; re-run only if anything changed since.
5. `export PATH="/c/Program Files/nodejs:$PATH" && npm run build 2>&1 | tail -4`

Expected: everything green.

- [ ] **Step 4: Commit, push, open the PR**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current && git add backend/requirements.txt backend/tests/test_guided_smoke_controlnet_local.py && git commit -m "test(guided): env-gated real-model ControlNet smoke + controlnet_aux declaration (#34)"
git push -u origin feat/guided-passes-pr2-controlnet
```
Open the PR with `gh pr create --base main --head feat/guided-passes-pr2-controlnet --title "Guided passes PR2: real ControlNet on SD1.5/SDXL (#34)"` and a body covering: what lands (preprocessors, registry, Foundry records + consent acquisition incl. the per-id target-dir fix and pickle-gated annotators, MultiControlNet execution, UI pre-flight + Foundry link, orphan retired), honesty semantics, what's deferred to PR3/PR4, and the test-plan checklist with the real gate evidence (including whether the real-model smoke ran or was skipped).

- [ ] **Step 5: Watch CI, then PAUSE**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && gh pr checks <PR#> --watch --fail-fast
```
**PAUSE — do not merge without the user's go-ahead (per release process).**

---

## Self-review notes (spec coverage)

- Spec §1 ControlNet mapping (strength → conditioning scale, step range → guidance window, mask-gated control map, MultiControlNet): Tasks 3, 5, 7.
- Spec §2 `preprocessors.py` + `controlnet_registry.py` + `controlnets_attached()` + retirement: Tasks 1, 3, 4, 5.
- Spec §3 Foundry records, consent acquisition, no runtime downloads, annotator consent (pickle): Task 2.
- Spec §5 422 pre-flight + failed-job honesty + path-free messages: Tasks 3, 4, 6, 7.
- Spec §6 stub-CI-safe imports, unit tiers, real-model gate: Tasks 3–9.
- Spec §7 PR2 acceptance (canny/depth/openpose constrain SD1.5+SDXL; strength + step range honored; uninstalled → 422 + UI block with Foundry link): Tasks 2, 6, 7, 8, 9.
- Deferred by design (PR3): FLUX/SD3.5, xinsir SDXL union (scribble/normal/segmentation on SDXL decline honestly until then), hardware-fit gating, GeneratePanel dead-control retirement, layer-properties install/compat surfacing.
