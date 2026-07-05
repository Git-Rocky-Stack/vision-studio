# Guided Passes PR3: FLUX/SD3.5 ControlNet + SDXL Union + Fit Gating + UI Reconciliation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (subagents are disabled for this project - execute inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the third staged PR of issue #34: real ControlNet on FLUX and SD 3.5 Large, scribble/normal on SDXL via the xinsir union model, a hardware-fit pre-flight gate for ControlNet stacks, and the GeneratePanel/layer-properties UI reconciliation (no dead controls remain).

**Architecture:** Extends the PR2 seams without new ones. `guided/controlnet_registry.py` grows union stacks (`control_mode`), per-checkpoint declines, and per-kind composition rules; `guided/pipelines.py` grows loader-specific model classes and explicit pipeline-variant classes (the diffusers `from_pipe` name surgery cannot derive the union class); a new `guided/fit.py` composes the M5 fit math with exact ControlNet header bytes and refuses over-budget stacks at the endpoint pre-flight; the frontend mirror (`controlnetSupport.ts`) is restructured to match, the dead `referenceMode` selector + `ControlNetPanel` are retired, and `CanvasControlLayerProperties` gains a real preprocessor select with install/compat surfacing.

**Tech Stack:** FastAPI + diffusers 0.37.1 (`FluxControlNetModel`/`FluxMultiControlNetModel`, `SD3ControlNetModel`/`SD3MultiControlNetModel`, `ControlNetUnionModel` + the three `StableDiffusionXLControlNetUnion*` pipelines - all verified present in the venv), React 19 + Zustand, Vitest + pytest.

## Global Constraints

- Honesty rails: guided fields work or fail loudly (422 pre-flight or failed job); never silent degradation; measured never masquerades as estimated (fit messages carry the basis label).
- User-facing error messages never contain filesystem paths (basenames / record ids only).
- `backend/guided/` and `backend/foundry/` modules import cleanly with no torch/diffusers/controlnet_aux (stub CI stays authoritative).
- All conditioning weights arrive ONLY through consent-gated Foundry acquisition - no runtime `from_pretrained` downloads from the hub.
- No emoji in app source; lucide icons only; `.mono-label`/type-* classes per DESIGN.md.
- Commit via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` first; `git branch --show-current` in the same call as the commit; never `git add -A` (LICENSE.txt stays untracked); never `--no-verify`.
- Backend pytest via `backend/venv/Scripts/python.exe -m pytest` from the repo root with piped exit checks (`echo "EXIT:${PIPESTATUS[0]}"`).
- Branch: `feat/guided-passes-pr3-controlnet-expansion` (created). PAUSE at the end - do not merge the PR without the user's go-ahead.

## Verified ground truth (2026-07-04 survey)

- diffusers 0.37.1 auto-mappings include `flux-controlnet`, `stable-diffusion-3-controlnet`, `stable-diffusion-xl-controlnet-union`; `from_pipe(controlnet=...)` name surgery derives `FluxControlNetPipeline`/`StableDiffusion3ControlNetPipeline` but can NEVER produce the Union classes (pure string surgery on the class name) - union needs explicit class derivation.
- Call-signature facts (venv-inspected): ALL PR3 pipelines take the control map as `control_image` (even txt2img); union + FLUX take `control_mode`; `control_guidance_start/end` and per-condition `controlnet_conditioning_scale` lists are consumed on every PR3 pipeline (union zips scale with `controlnet_keep` per condition; `FluxMultiControlNetModel` zips `(image, mode, scale)` per condition). SD3 has no img2img+ControlNet pipeline.
- HF repos (API-verified, all ungated): `xinsir/controlnet-union-sdxl-1.0` (weights 2.34 GiB, apache-2.0, repo also holds a 2.5 GiB promax duplicate + example images -> needs a download allowlist), `InstantX/FLUX.1-dev-Controlnet-Union` (6.15 GiB, FLUX.1-dev license), `stabilityai/stable-diffusion-3.5-large-controlnet-canny`/`-depth` (8.02 GiB each, stabilityai-community). All are root-level `config.json` + `diffusion_pytorch_model.safetensors` diffusers layouts.
- Union control_mode maps (model cards + diffusers' own docstring example): xinsir SDXL `openpose=0, depth=1, scribble=2, canny=3, normal=4`; InstantX FLUX `canny=0, depth=2, openpose=4`.
- The xinsir root config declares `_class_name: ControlNetModel`, yet `ControlNetUnionModel.from_pretrained("xinsir/controlnet-union-sdxl-1.0")` is diffusers' own documented example - the model class reads its own schema, so the local per-id dir loads fine.
- SD 3.5 official ControlNets are trained for SD 3.5 **Large** only; InstantX FLUX union targets FLUX.1 **[dev]** (schnell is distilled) -> per-checkpoint declines for `sd3.5-medium` and `flux-schnell`.
- Fit machinery: `resolve_model_runtime(record, profile, consent)` -> `RuntimePlan.vram_plan` (`VramEstimate` with basis) + `hardware_fit` rungs; `probe_hardware(MODELS_DIR)` degrades honestly (no GPU -> `gpu_available=False`). `read_safetensors_header` validates only the 8-byte prefix + JSON, so tests can craft headers claiming any shape.
- The fit gate runs only on INSTALLED ControlNets (resolve 422s uninstalled records first), so exact local header bytes are always available - no size-string guessing.
- `load_catalog` does strict `ModelRecord(**entry)` -> the new catalog `files` key requires a dataclass field.
- Dead UI confirmed: `refConfig.referenceMode` + `refConfig.controlNetConfig`/`ControlNetPanel` never reach any payload; the denoising slider IS threaded and stays. `ui-glyphs.test.ts` does not list `ControlNetPanel.tsx` (safe to delete); `tests/e2e/accessibility.spec.ts:34` has a stale comment naming it.
- `ControlNetConfig` type stays: `types/project.ts` `GenerationConfig.controlNet` (persisted Phase-1 project data) references it.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/foundry/verified-catalog.json` | modify | +4 records: `controlnet-union-sdxl`, `controlnet-union-flux`, `controlnet-canny-sd35`, `controlnet-depth-sd35` |
| `backend/foundry/model_record.py` | modify | `files: List[str]` acquisition allowlist field |
| `backend/foundry/download_manager.py` | modify | `_resolve_files` honors the record `files` allowlist |
| `backend/foundry/fit.py` | modify | `GUIDED_PASS_OVERHEAD_BYTES` per-family band |
| `backend/guided/fit.py` | create | ControlNet stack fit gate (exact header bytes + band -> refusal message) |
| `backend/guided/controlnet_registry.py` | rewrite | unions + sd35 stack + checkpoint declines + kind composition + loader/control_mode on `ResolvedControlLayer` |
| `backend/guided/pipelines.py` | modify | loader model classes, explicit ControlNet variant classes, `combine_controlnets` |
| `backend/utils/direct_generator.py` | modify | loader-aware threading: dedupe dirs, `control_mode`, `combine_controlnets`, kwarg naming |
| `backend/main.py` | modify | pre-flight passes `model_id`/`kind`; fit gate 422 |
| `src/features/generation/controlnetSupport.ts` | rewrite | full mirror: dedicated + unions + declines + kind rules + panel helpers |
| `src/pages/GeneratePanel.tsx` | modify | retire referenceMode selector + ControlNetPanel; kind-aware preflight; summary fix |
| `src/components/generate/ControlNetPanel.tsx` | delete | dead control (config never reaches a payload) |
| `src/components/canvas/CanvasControlLayerProperties.tsx` | modify | preprocessor select, install/compat status + Foundry link, prompts inpaint-only |
| `tests/e2e/accessibility.spec.ts` | modify | stale ControlNetPanel comment |
| Backend tests | modify/create | `test_foundry_controlnet_records.py`, `test_guided_controlnet_registry.py`, `test_guided_pipelines.py`, `test_guided_fit.py` (new), `test_direct_generator_guided.py`, `test_guided_request_api.py`, `test_guided_smoke_controlnet_local.py` |
| Frontend tests | modify | `controlnetSupport.test.ts`, `GeneratePanel.test.tsx`, `CanvasControlLayerProperties.test.tsx` |

Execution order: Task 1 (records/acquisition) -> 2 (registry) -> 3 (pipelines) -> 4 (fit) -> 5 (generator) -> 6 (endpoint) -> 7 (frontend mirror) -> 8 (GeneratePanel) -> 9 (layer properties) -> 10 (smokes + sweep + PR).

---

### Task 1: Catalog records + `files` acquisition allowlist

**Files:**
- Modify: `backend/foundry/verified-catalog.json` (append 4 records before the closing `}`)
- Modify: `backend/foundry/model_record.py:60-61` (new field after `measured_vram_bytes`)
- Modify: `backend/foundry/download_manager.py:295-333` (`_resolve_files`)
- Test: `backend/tests/test_foundry_controlnet_records.py`

**Interfaces:**
- Produces: catalog ids `controlnet-union-sdxl` / `controlnet-union-flux` / `controlnet-canny-sd35` / `controlnet-depth-sd35` (consumed by Tasks 2/7); `ModelRecord.files: List[str]`; `_resolve_files` short-circuit on `record["files"]`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_foundry_controlnet_records.py`, replace the `CONTROLNET_IDS` constant and `test_controlnet_records_present_and_typed`, and append three tests:

```python
CONTROLNET_IDS = {
    "controlnet-canny-sd15", "controlnet-depth-sd15", "controlnet-openpose-sd15",
    "controlnet-scribble-sd15", "controlnet-normal-sd15",
    "controlnet-canny-sdxl", "controlnet-depth-sdxl", "controlnet-openpose-sdxl",
    "controlnet-union-sdxl", "controlnet-union-flux",
    "controlnet-canny-sd35", "controlnet-depth-sd35",
}
```

```python
def test_controlnet_records_present_and_typed():
    catalog = load_catalog()
    assert CONTROLNET_IDS.issubset(catalog.keys())
    for record_id in CONTROLNET_IDS:
        entry = catalog[record_id]
        assert entry["artifact_type"] == "controlnet"
        assert entry["base_architecture"] in {"sd15", "sdxl", "flux", "sd35"}
        assert entry["status"] == "not_found"
        assert entry["source"] == "huggingface" and entry["repo_id"]
```

```python
def test_pr3_records_scope_their_downloads():
    """The xinsir repo carries a 2.5 GiB promax duplicate + example images;
    the explicit files allowlist keeps acquisition to exactly the weights."""
    catalog = load_catalog()
    for record_id in ("controlnet-union-sdxl", "controlnet-union-flux",
                      "controlnet-canny-sd35", "controlnet-depth-sd35"):
        assert catalog[record_id]["files"] == [
            "config.json", "diffusion_pytorch_model.safetensors",
        ]
    # PR2 records keep the full-repo-list behavior (no files key or empty).
    assert not catalog["controlnet-canny-sd15"].get("files")


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
```

Also update `test_single_file_names_normalizes_str_and_list` - append one line asserting the new records do NOT use the single-file map:

```python
    assert single_file_names("controlnet-union-sdxl") is None  # files allowlist
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_controlnet_records.py -v 2>&1 | tail -20; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL - missing catalog ids, missing `files` key, `_resolve_files` ignores allowlist.

- [ ] **Step 3: Add the `files` field to ModelRecord**

In `backend/foundry/model_record.py`, after the `measured_vram_bytes` line (line 61):

```python
    # Acquisition scoping (#34 PR3): explicit repo paths to download. Empty =
    # the full filtered repo file list. Curated in the catalog, so entries are
    # trusted the same way _SINGLE_FILE_FILENAMES entries are.
    files: List[str] = field(default_factory=list)
```

- [ ] **Step 4: Append the four catalog records**

In `backend/foundry/verified-catalog.json`, after the `annotator-normalbae` record (add a comma after its closing brace), before the final `}`:

```json
  "controlnet-union-sdxl": {
    "id": "controlnet-union-sdxl", "name": "ControlNet Union (SDXL)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "xinsir/controlnet-union-sdxl-1.0", "revision": "main", "aux_repo_id": null,
    "size": "~2.4 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~1.2 GB",
    "description": "All-in-one SDXL ControlNet: openpose, depth, scribble, canny, and normal through one set of weights.",
    "license": "apache-2.0", "gated": false, "format": "safetensors",
    "companions": [], "measured_vram_bytes": null,
    "files": ["config.json", "diffusion_pytorch_model.safetensors"]
  },
  "controlnet-union-flux": {
    "id": "controlnet-union-flux", "name": "ControlNet Union (FLUX.1 dev)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "flux", "source": "huggingface",
    "repo_id": "InstantX/FLUX.1-dev-Controlnet-Union", "revision": "main", "aux_repo_id": null,
    "size": "~6.2 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "workstation", "vram": "~6.2 GB",
    "description": "All-in-one FLUX.1 [dev] ControlNet: canny, depth, and pose conditioning. Trained for FLUX.1 [dev]; schnell is not supported.",
    "license": "flux-1-dev-non-commercial", "gated": false, "format": "safetensors",
    "companions": [], "measured_vram_bytes": null,
    "files": ["config.json", "diffusion_pytorch_model.safetensors"]
  },
  "controlnet-canny-sd35": {
    "id": "controlnet-canny-sd35", "name": "ControlNet Canny (SD 3.5 Large)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd35", "source": "huggingface",
    "repo_id": "stabilityai/stable-diffusion-3.5-large-controlnet-canny", "revision": "main", "aux_repo_id": null,
    "size": "~8.1 GB", "status": "not_found", "tier": "verified", "quality": "pro",
    "runtime": "local", "hardware_class": "workstation", "vram": "~8.1 GB",
    "description": "Edge-map conditioning for SD 3.5 Large canvas ControlNet layers. SD 3.5 Large only.",
    "license": "stabilityai-community", "gated": false, "format": "safetensors",
    "companions": [], "measured_vram_bytes": null,
    "files": ["config.json", "diffusion_pytorch_model.safetensors"]
  },
  "controlnet-depth-sd35": {
    "id": "controlnet-depth-sd35", "name": "ControlNet Depth (SD 3.5 Large)", "artifact_type": "controlnet",
    "capability": "image", "base_architecture": "sd35", "source": "huggingface",
    "repo_id": "stabilityai/stable-diffusion-3.5-large-controlnet-depth", "revision": "main", "aux_repo_id": null,
    "size": "~8.1 GB", "status": "not_found", "tier": "verified", "quality": "pro",
    "runtime": "local", "hardware_class": "workstation", "vram": "~8.1 GB",
    "description": "Depth-map conditioning for SD 3.5 Large canvas ControlNet layers. SD 3.5 Large only.",
    "license": "stabilityai-community", "gated": false, "format": "safetensors",
    "companions": ["annotator-midas"], "measured_vram_bytes": null,
    "files": ["config.json", "diffusion_pytorch_model.safetensors"]
  }
```

- [ ] **Step 5: Honor the allowlist in `_resolve_files`**

In `backend/foundry/download_manager.py`, replace the file-selection block inside `_resolve_files` (currently `single = single_file_names(model_id)` / `if single is not None: ... else: ...`):

```python
        single = single_file_names(model_id)
        explicit = record.get("files") or []
        if explicit:
            # Catalog-curated allowlist (#34 PR3): fetch exactly these paths.
            # Same trust anchor as _SINGLE_FILE_FILENAMES - the .py/pickle
            # filters below guard DISCOVERED repo lists, not curated ones.
            paths = list(explicit)
        elif single is not None:
            paths = list(single)
        else:
            infos = huggingface_hub.get_paths_info(repo_id, [], revision=revision)
            paths = [getattr(info, "path", None) or info["path"] for info in infos]
            paths = [p for p in paths if not p.lower().endswith(".py")]
            if not self._pickle_allowed(model_id):
                paths = [p for p in paths if not p.lower().endswith(_PICKLE_SUFFIXES)]
```

Also extend the docstring's second paragraph first sentence to mention the allowlist: `Records may carry an explicit ``files`` allowlist (curated in the catalog) which wins over both maps.`

- [ ] **Step 6: Run the tests**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_foundry_controlnet_records.py backend/tests/test_foundry_catalog.py backend/tests/test_foundry_model_record.py backend/tests/test_foundry_download_manager.py -v 2>&1 | tail -15; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS (if `test_foundry_download_manager.py` does not exist under that exact name, run `backend/venv/Scripts/python.exe -m pytest backend/tests/ -k "download" -v` instead; fix any constructor-shape fallout from the new field).

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/foundry/verified-catalog.json backend/foundry/model_record.py backend/foundry/download_manager.py backend/tests/test_foundry_controlnet_records.py && git commit -m "feat(guided): FLUX/SD3.5/union ControlNet catalog records + files allowlist (#34 PR3)"
```

---

### Task 2: Registry expansion - unions, SD3.5 stack, checkpoint declines, kind composition

**Files:**
- Rewrite: `backend/guided/controlnet_registry.py`
- Test: `backend/tests/test_guided_controlnet_registry.py`

**Interfaces:**
- Consumes: `PREPROCESSORS` from `guided/preprocessors.py` (keys: canny, scribble, depth, normal, openpose; `spec.annotator_record_id`).
- Produces: `resolve_controlnet_stack(layers, family, resolve_record, model_id=None, kind="none") -> List[ResolvedControlLayer]` where `ResolvedControlLayer` has `record_id: str`, `annotator_record_id: Optional[str]`, `layer: Dict`, `loader: str`, `control_mode: Optional[int]`. Loader constants `LOADER_CONTROLNET = "controlnet"`, `LOADER_UNION_SDXL = "controlnet-union"`, `LOADER_FLUX = "flux-controlnet"`, `LOADER_SD3 = "sd3-controlnet"`. Maps `_DEDICATED`, `_UNIONS` (for Task 7's mirror and the preprocessor-exists test). Defaults keep existing callsites (main.py, direct_generator) working until Tasks 5/6 update them.

- [ ] **Step 1: Update the test file**

Replace `backend/tests/test_guided_controlnet_registry.py` in full:

```python
"""#34 PR2/PR3: (family, preprocessor) -> Foundry record resolution + honest declines."""
import pytest

from guided.controlnet_registry import (
    LOADER_CONTROLNET,
    LOADER_FLUX,
    LOADER_SD3,
    LOADER_UNION_SDXL,
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


def test_supported_families_cover_all_four():
    assert SUPPORTED_FAMILIES == {"sd15", "sdxl", "flux", "sd35"}


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
    assert sd15[0].loader == LOADER_CONTROLNET and sd15[0].control_mode is None
    assert sdxl[0].loader == LOADER_CONTROLNET and sdxl[0].control_mode is None


def test_depth_carries_its_annotator():
    resolved = resolve_controlnet_stack(
        [dict(LAYER, preprocessor="depth")], "sd15", _ready_registry())
    assert resolved[0].record_id == "controlnet-depth-sd15"
    assert resolved[0].annotator_record_id == "annotator-midas"


# -- #34 PR3: FLUX / SD3.5 / SDXL union -----------------------------------------

def test_flux_resolves_through_the_union_with_modes():
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth"),
         dict(LAYER, layer_id="c3", preprocessor="openpose")],
        "flux", _ready_registry())
    assert [item.record_id for item in resolved] == ["controlnet-union-flux"] * 3
    assert [item.control_mode for item in resolved] == [0, 2, 4]
    assert all(item.loader == LOADER_FLUX for item in resolved)
    assert resolved[1].annotator_record_id == "annotator-midas"


def test_sdxl_scribble_routes_through_the_union():
    resolved = resolve_controlnet_stack(
        [dict(LAYER, preprocessor="scribble")], "sdxl", _ready_registry())
    assert resolved[0].record_id == "controlnet-union-sdxl"
    assert resolved[0].loader == LOADER_UNION_SDXL
    assert resolved[0].control_mode == 2
    assert resolved[0].annotator_record_id is None


def test_sdxl_mixed_stack_routes_every_layer_through_the_union():
    """Dedicated + union models cannot mix in one MultiControlNet - when any
    layer needs the union, the whole stack rides it (deterministic routing)."""
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="normal")],
        "sdxl", _ready_registry())
    assert [item.record_id for item in resolved] == ["controlnet-union-sdxl"] * 2
    assert [item.control_mode for item in resolved] == [3, 4]  # canny=3, normal=4


def test_sdxl_dedicated_stack_keeps_pr2_routing():
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth")],
        "sdxl", _ready_registry())
    assert [item.record_id for item in resolved] == [
        "controlnet-canny-sdxl", "controlnet-depth-sdxl",
    ]
    assert all(item.loader == LOADER_CONTROLNET and item.control_mode is None
               for item in resolved)


def test_sd35_resolves_dedicated_records():
    resolved = resolve_controlnet_stack(
        [dict(LAYER), dict(LAYER, layer_id="c2", preprocessor="depth")],
        "sd35", _ready_registry())
    assert [item.record_id for item in resolved] == [
        "controlnet-canny-sd35", "controlnet-depth-sd35",
    ]
    assert all(item.loader == LOADER_SD3 and item.control_mode is None
               for item in resolved)


def test_flux_schnell_declines_with_checkpoint_reason():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "flux", _ready_registry(),
                                 model_id="flux-schnell")
    message = str(excinfo.value)
    assert "schnell" in message and "FLUX.1 [dev]" in message


def test_sd35_medium_declines_with_checkpoint_reason():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "sd35", _ready_registry(),
                                 model_id="sd3.5-medium")
    assert "SD 3.5 Large" in str(excinfo.value)


def test_flux_inpaint_composition_declines():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "flux", _ready_registry(),
                                 kind="inpaint")
    assert "FLUX.1 Fill" in str(excinfo.value)


def test_sd35_img2img_and_inpaint_composition_decline():
    for kind in ("img2img", "inpaint"):
        with pytest.raises(GuidedValidationError) as excinfo:
            resolve_controlnet_stack([dict(LAYER)], "sd35", _ready_registry(),
                                     kind=kind)
        assert "SD 3.5" in str(excinfo.value)


def test_unknown_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack([dict(LAYER)], "svd", _ready_registry())
    message = str(excinfo.value)
    assert "not supported" in message and "SD 3.5 Large" in message


def test_unsupported_preprocessor_on_family_declines_loudly():
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="scribble")], "flux", _ready_registry())
    message = str(excinfo.value)
    assert "scribble" in message and "FLUX" in message
    assert "canny" in message  # lists what IS supported


def test_uninstalled_union_declines_with_foundry_hint():
    registry = _ready_registry({"controlnet-union-sdxl": "not_found"})
    with pytest.raises(GuidedValidationError) as excinfo:
        resolve_controlnet_stack(
            [dict(LAYER, preprocessor="scribble")], "sdxl", registry)
    message = str(excinfo.value)
    assert "controlnet-union-sdxl" in message and "Foundry" in message


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
    from guided.controlnet_registry import _DEDICATED, _UNIONS

    for family_map in _DEDICATED.values():
        for preprocessor in family_map:
            assert preprocessor in PREPROCESSORS
    for union in _UNIONS.values():
        for preprocessor in union["modes"]:
            assert preprocessor in PREPROCESSORS
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_controlnet_registry.py -v 2>&1 | tail -30; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL - `LOADER_*` imports missing, families incomplete.

- [ ] **Step 3: Rewrite the registry**

Replace `backend/guided/controlnet_registry.py` in full:

```python
"""#34 PR2/PR3: per-family preprocessor -> installed ControlNet Foundry record.

THE ControlNet honesty seam, mirroring resolve_guided_pass: a layer either
resolves to an installed record (and installed annotator weights, when the
preprocessor needs them) or raises GuidedValidationError with a user-facing,
path-free message. main.py 422s through it pre-flight; the generator
re-resolves in the worker.

PR3: FLUX and SD 3.5 Large land, and the SDXL union model unlocks scribble +
normal. Union stacks resolve every layer to ONE record with a per-layer
control_mode; dedicated stacks keep the PR2 one-record-per-preprocessor
shape. Known-incompatible checkpoints (flux-schnell, sd3.5-medium) and
pipeline combos diffusers does not ship decline with the exact reason.
Keep src/features/generation/controlnetSupport.ts in sync with every map
and message below. No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from guided.passes import GuidedValidationError
from guided.preprocessors import PREPROCESSORS

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

FAMILY_LABELS = {"sd15": "SD 1.5", "sdxl": "SDXL", "flux": "FLUX", "sd35": "SD 3.5"}

# Loader vocabulary consumed by guided.pipelines (one diffusers model class
# and pipeline-variant family per value).
LOADER_CONTROLNET = "controlnet"
LOADER_UNION_SDXL = "controlnet-union"
LOADER_FLUX = "flux-controlnet"
LOADER_SD3 = "sd3-controlnet"

# Dedicated one-record-per-preprocessor stacks (PR2 shape). Annotator ids come
# from PREPROCESSORS - single source of truth for preprocessor requirements.
_DEDICATED: Dict[str, Dict[str, str]] = {
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
    "sd35": {
        "canny": "controlnet-canny-sd35",
        "depth": "controlnet-depth-sd35",
    },
}

# Union stacks: ONE record serves several preprocessors via control_mode.
# Mode indices come from the model cards (xinsir/controlnet-union-sdxl-1.0;
# InstantX/FLUX.1-dev-Controlnet-Union) - diffusers' own union example uses
# the same numbering.
_UNIONS: Dict[str, Dict[str, Any]] = {
    "sdxl": {
        "record_id": "controlnet-union-sdxl",
        "loader": LOADER_UNION_SDXL,
        "modes": {"openpose": 0, "depth": 1, "scribble": 2, "canny": 3, "normal": 4},
    },
    "flux": {
        "record_id": "controlnet-union-flux",
        "loader": LOADER_FLUX,
        "modes": {"canny": 0, "depth": 2, "openpose": 4},
    },
}

_FAMILY_LOADERS = {"sd15": LOADER_CONTROLNET, "sdxl": LOADER_CONTROLNET,
                   "sd35": LOADER_SD3}

SUPPORTED_FAMILIES = set(_DEDICATED) | set(_UNIONS)

# Known-incompatible catalog checkpoints inside supported families. User
# imports resolve by family and fail loudly at load time if truly mismatched.
_CHECKPOINT_DECLINES = {
    "flux-schnell": (
        "FLUX.1 [schnell] is a distilled checkpoint the FLUX ControlNet union "
        "does not support - switch to FLUX.1 [dev]."
    ),
    "sd3.5-medium": (
        "The SD 3.5 ControlNets are trained for SD 3.5 Large only - switch to "
        "the SD 3.5 Large checkpoint."
    ),
}

# ControlNet composes only where diffusers ships the combined pipeline class.
_UNSUPPORTED_KINDS = {
    "flux": {
        "inpaint": (
            "FLUX inpainting runs on FLUX.1 Fill, which has no ControlNet "
            "path - hide the ControlNet layer(s) or clear the inpaint mask."
        ),
    },
    "sd35": {
        "img2img": (
            "ControlNet with a reference image is not supported on SD 3.5 - "
            "remove the reference layer or switch to SD 1.5, SDXL, or FLUX."
        ),
        "inpaint": (
            "ControlNet with inpainting is not supported on SD 3.5 - clear "
            "the inpaint mask or switch to SD 1.5 or SDXL."
        ),
    },
}


@dataclass(frozen=True)
class ResolvedControlLayer:
    record_id: str
    annotator_record_id: Optional[str]
    layer: Dict[str, Any]
    loader: str = LOADER_CONTROLNET
    control_mode: Optional[int] = None


def _require_installed(record_id: str, resolve_record: RecordResolver, kind: str) -> None:
    record = resolve_record(record_id) or {}
    if record.get("status") != "ready":
        name = record.get("name") or record_id
        raise GuidedValidationError(
            f"The {kind} '{name}' is not installed - install '{record_id}' "
            "from the Foundry first."
        )


def _raise_unsupported_preprocessor(name: str, family: str, supported: List[str]) -> None:
    label = FAMILY_LABELS.get(family, family or "this model")
    raise GuidedValidationError(
        f"No ControlNet model is available for the '{name}' preprocessor on "
        f"{label} - supported on {label}: {', '.join(supported)}."
    )


def _require_annotator(preprocessor: str, resolve_record: RecordResolver) -> Optional[str]:
    spec = PREPROCESSORS[preprocessor]
    if spec.annotator_record_id:
        _require_installed(spec.annotator_record_id, resolve_record, "preprocessor annotator")
    return spec.annotator_record_id


def resolve_controlnet_stack(
    layers: Optional[List[Dict[str, Any]]],
    family: Optional[str],
    resolve_record: RecordResolver,
    model_id: Optional[str] = None,
    kind: str = "none",
) -> List[ResolvedControlLayer]:
    layers = layers or []
    if not layers:
        return []

    family = family or ""
    if family not in SUPPORTED_FAMILIES:
        label = FAMILY_LABELS.get(family, family or "this model")
        raise GuidedValidationError(
            f"ControlNet is not supported on {label} - switch to an SD 1.5, "
            "SDXL, FLUX, or SD 3.5 Large checkpoint, or hide the ControlNet "
            "layer(s)."
        )
    decline = _CHECKPOINT_DECLINES.get(model_id or "")
    if decline:
        raise GuidedValidationError(decline)
    kind_reason = _UNSUPPORTED_KINDS.get(family, {}).get(kind)
    if kind_reason:
        raise GuidedValidationError(kind_reason)

    dedicated = _DEDICATED.get(family, {})
    union = _UNIONS.get(family)
    names = [(layer.get("preprocessor") or "").strip() for layer in layers]
    supported = sorted(set(dedicated) | set((union or {}).get("modes", {})))

    # Dedicated + union models cannot mix in one MultiControlNet: when any
    # layer needs the union, the whole stack rides it (deterministic routing,
    # independent of what happens to be installed).
    use_union = union is not None and (
        family not in _DEDICATED or any(name not in dedicated for name in names)
    )

    resolved: List[ResolvedControlLayer] = []
    if use_union:
        modes = union["modes"]
        for name in names:
            if name not in modes:
                _raise_unsupported_preprocessor(name, family, supported)
        _require_installed(union["record_id"], resolve_record, "ControlNet model")
        for layer, name in zip(layers, names):
            resolved.append(ResolvedControlLayer(
                record_id=union["record_id"],
                annotator_record_id=_require_annotator(name, resolve_record),
                layer=dict(layer),
                loader=union["loader"],
                control_mode=modes[name],
            ))
        return resolved

    loader = _FAMILY_LOADERS[family]
    for layer, name in zip(layers, names):
        record_id = dedicated.get(name)
        if record_id is None:
            _raise_unsupported_preprocessor(name, family, supported)
        _require_installed(record_id, resolve_record, "ControlNet model")
        resolved.append(ResolvedControlLayer(
            record_id=record_id,
            annotator_record_id=_require_annotator(name, resolve_record),
            layer=dict(layer),
            loader=loader,
            control_mode=None,
        ))
    return resolved
```

- [ ] **Step 4: Run the registry tests**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_controlnet_registry.py -v 2>&1 | tail -30; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS (all ~21 tests).

- [ ] **Step 5: Sweep the suites that consume the old messages**

The PR2 tests `test_guided_request_api.py::test_controlnet_on_flux_preflights_422` (asserts "PR3" in the message) and `test_direct_generator_guided.py::test_controlnet_on_flux_family_fails_loudly` now see flux as SUPPORTED. Update both minimally here so the suite stays green (Tasks 5/6 rework them properly):

In `test_guided_request_api.py`, replace `test_controlnet_on_flux_preflights_422` with:

```python
def test_controlnet_on_unknown_family_preflights_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="svd"))
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 422
    assert "not supported" in response.json()["detail"]
```

In `test_direct_generator_guided.py`, replace `test_controlnet_on_flux_family_fails_loudly` with:

```python
def test_controlnet_on_unknown_family_fails_loudly(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _ = _generator(tmp_path, calls, monkeypatch, family="svd")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "inpaint": None, "denoising_strength": 0.75}
    with pytest.raises(GuidedValidationError):
        _run(gen, tmp_path, guided)
    assert calls == []
```

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request_api.py backend/tests/test_direct_generator_guided.py backend/tests/test_guided_passes.py -v 2>&1 | tail -15; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/guided/controlnet_registry.py backend/tests/test_guided_controlnet_registry.py backend/tests/test_guided_request_api.py backend/tests/test_direct_generator_guided.py && git commit -m "feat(guided): registry unions + SD3.5 stack + checkpoint/kind declines (#34 PR3)"
```

---

### Task 3: pipelines.py - loader model classes, explicit variants, combine_controlnets

**Files:**
- Modify: `backend/guided/pipelines.py`
- Test: `backend/tests/test_guided_pipelines.py`

**Interfaces:**
- Produces: `controlnets_attached(model_dirs, torch_dtype, device, loader="controlnet")`; `derive_variant(base_pipeline, kind, controlnet=None, loader="controlnet")`; `combine_controlnets(models, loader)` (union -> the single instance, flux -> `FluxMultiControlNetModel(models)`, sd3 -> `SD3MultiControlNetModel(models)`, dedicated -> the list). Defaults keep PR2 callers working until Task 5.

- [ ] **Step 1: Append the failing tests**

Append to `backend/tests/test_guided_pipelines.py`:

```python
# -- #34 PR3: loader-specific model classes + explicit variant classes ---------

def _fake_diffusers_pr3():
    module = _fake_diffusers()

    class _FakeLoaderModel:
        loads = []

        def __init__(self, model_dir):
            self.model_dir = model_dir

        @classmethod
        def from_pretrained(cls, model_dir, torch_dtype=None):
            cls.loads.append((cls.__name__, model_dir, torch_dtype))
            return cls(model_dir)

        def to(self, device):
            return self

    for name in ("ControlNetModel", "ControlNetUnionModel",
                 "FluxControlNetModel", "SD3ControlNetModel"):
        setattr(module, name, type(name, (_FakeLoaderModel,), {"loads": []}))

    class _FakeExplicitPipeline:
        seen = None
        seen_kwargs = None

        @classmethod
        def from_pipe(cls, base, **kwargs):
            cls.seen = base
            cls.seen_kwargs = kwargs
            return (cls.__name__, base)

    for name in ("StableDiffusionXLControlNetUnionPipeline",
                 "StableDiffusionXLControlNetUnionImg2ImgPipeline",
                 "StableDiffusionXLControlNetUnionInpaintPipeline",
                 "FluxControlNetPipeline", "FluxControlNetImg2ImgPipeline",
                 "StableDiffusion3ControlNetPipeline"):
        setattr(module, name, type(name, (_FakeExplicitPipeline,), {}))

    module.FluxMultiControlNetModel = lambda models: ("flux-multi", list(models))
    module.SD3MultiControlNetModel = lambda models: ("sd3-multi", list(models))
    return module


def test_controlnets_attached_uses_loader_class(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    with gp.controlnets_attached(["dir-u"], "dtype", "cpu", loader="controlnet-union") as models:
        assert models[0].model_dir == "dir-u"
    assert fake.ControlNetUnionModel.loads == [("ControlNetUnionModel", "dir-u", "dtype")]

    with gp.controlnets_attached(["dir-f"], "dtype", "cpu", loader="flux-controlnet"):
        pass
    assert fake.FluxControlNetModel.loads == [("FluxControlNetModel", "dir-f", "dtype")]

    with gp.controlnets_attached(["dir-s"], "dtype", "cpu", loader="sd3-controlnet"):
        pass
    assert fake.SD3ControlNetModel.loads == [("SD3ControlNetModel", "dir-s", "dtype")]


def test_controlnets_attached_unknown_loader_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers_pr3())
    with pytest.raises(ValueError):
        with gp.controlnets_attached(["d"], None, "cpu", loader="nope"):
            pass


def test_derive_variant_explicit_classes_per_loader(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()

    assert derive_variant(base, "none", controlnet="u", loader="controlnet-union") == \
        ("StableDiffusionXLControlNetUnionPipeline", base)
    assert fake.StableDiffusionXLControlNetUnionPipeline.seen_kwargs == {"controlnet": "u"}
    assert derive_variant(base, "img2img", controlnet="u", loader="controlnet-union") == \
        ("StableDiffusionXLControlNetUnionImg2ImgPipeline", base)
    assert derive_variant(base, "inpaint", controlnet="u", loader="controlnet-union") == \
        ("StableDiffusionXLControlNetUnionInpaintPipeline", base)
    assert derive_variant(base, "none", controlnet="f", loader="flux-controlnet") == \
        ("FluxControlNetPipeline", base)
    assert derive_variant(base, "img2img", controlnet="f", loader="flux-controlnet") == \
        ("FluxControlNetImg2ImgPipeline", base)
    assert derive_variant(base, "none", controlnet="s", loader="sd3-controlnet") == \
        ("StableDiffusion3ControlNetPipeline", base)


def test_derive_variant_unshipped_combo_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers_pr3())
    # The registry declines these earlier; derive_variant is the backstop.
    with pytest.raises(ValueError):
        derive_variant(object(), "inpaint", controlnet="f", loader="flux-controlnet")
    with pytest.raises(ValueError):
        derive_variant(object(), "img2img", controlnet="s", loader="sd3-controlnet")


def test_derive_variant_dedicated_loader_keeps_auto_path(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "none", controlnet=["cn"], loader="controlnet") == ("derived", base)
    assert fake.AutoPipelineForText2Image.seen_kwargs == {"controlnet": ["cn"]}


def test_combine_controlnets_shapes_by_loader(monkeypatch):
    fake = _fake_diffusers_pr3()
    monkeypatch.setattr(gp, "diffusers", fake)
    assert gp.combine_controlnets(["a", "b"], "controlnet") == ["a", "b"]
    assert gp.combine_controlnets(["u"], "controlnet-union") == "u"
    assert gp.combine_controlnets(["f"], "flux-controlnet") == ("flux-multi", ["f"])
    assert gp.combine_controlnets(["s1", "s2"], "sd3-controlnet") == ("sd3-multi", ["s1", "s2"])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_pipelines.py -v 2>&1 | tail -20; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL - `controlnets_attached` has no `loader` kwarg, `combine_controlnets` missing.

- [ ] **Step 3: Implement**

In `backend/guided/pipelines.py`, after `_VARIANT_CLASSES`, add:

```python
# Loader vocabulary (guided.controlnet_registry) -> diffusers model class.
_LOADER_MODEL_CLASSES = {
    "controlnet": "ControlNetModel",
    "controlnet-union": "ControlNetUnionModel",
    "flux-controlnet": "FluxControlNetModel",
    "sd3-controlnet": "SD3ControlNetModel",
}

# ControlNet pipeline variants from_pipe's name surgery cannot derive: the
# union classes depend on the MODEL type (pure class-name string surgery
# never inserts "Union"), and flux/sd3 are pinned explicitly rather than
# trusting auto-mapping drift. Combos the registry declines have no entry -
# a missing key here is the defensive backstop, not the primary gate.
_CONTROLNET_VARIANT_CLASSES = {
    ("controlnet-union", "none"): "StableDiffusionXLControlNetUnionPipeline",
    ("controlnet-union", "img2img"): "StableDiffusionXLControlNetUnionImg2ImgPipeline",
    ("controlnet-union", "inpaint"): "StableDiffusionXLControlNetUnionInpaintPipeline",
    ("flux-controlnet", "none"): "FluxControlNetPipeline",
    ("flux-controlnet", "img2img"): "FluxControlNetImg2ImgPipeline",
    ("sd3-controlnet", "none"): "StableDiffusion3ControlNetPipeline",
}
```

Replace `derive_variant` with:

```python
def derive_variant(base_pipeline: Any, kind: str, controlnet: Any = None,
                   loader: str = "controlnet") -> Any:
    """Derive a guided-pass variant of a loaded pipeline via from_pipe.

    kind "none" is only meaningful WITH a controlnet (txt2img + ControlNet);
    an unguided pass calls the base pipeline directly. Non-dedicated loaders
    resolve their explicit pipeline class (see _CONTROLNET_VARIANT_CLASSES).
    """
    if kind not in _VARIANT_CLASSES:
        raise ValueError(f"no pipeline variant for guided pass '{kind}'")
    if kind == "none" and controlnet is None:
        raise ValueError("an unguided pass needs no variant - call the base pipeline")
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    if controlnet is not None and loader != "controlnet":
        class_name = _CONTROLNET_VARIANT_CLASSES.get((loader, kind))
        if class_name is None:
            raise ValueError(
                f"diffusers ships no '{kind}' ControlNet pipeline for loader '{loader}'"
            )
        return getattr(diffusers, class_name).from_pipe(base_pipeline, controlnet=controlnet)
    auto_class = getattr(diffusers, _VARIANT_CLASSES[kind])
    if controlnet is not None:
        return auto_class.from_pipe(base_pipeline, controlnet=controlnet)
    return auto_class.from_pipe(base_pipeline)
```

Replace `controlnets_attached` with:

```python
@contextmanager
def controlnets_attached(model_dirs: List[str], torch_dtype: Any, device: str,
                         loader: str = "controlnet"):
    """Load ControlNet weights for one generation; always release afterward."""
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    class_name = _LOADER_MODEL_CLASSES.get(loader)
    if class_name is None:
        raise ValueError(f"unknown ControlNet loader '{loader}'")
    model_class = getattr(diffusers, class_name)
    models: List[Any] = []
    try:
        for model_dir in model_dirs:
            model = model_class.from_pretrained(model_dir, torch_dtype=torch_dtype)
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

After `controlnets_attached`, add:

```python
def combine_controlnets(models: List[Any], loader: str) -> Any:
    """Shape loaded ControlNet models the way the target pipeline expects.

    Union stacks share ONE instance across every condition; FLUX and SD3
    always ride their Multi wrapper (the documented pattern, and it makes
    the per-condition scale/mode lists uniform); dedicated SD/SDXL keeps the
    PR2 plain-list MultiControlNet shape.
    """
    if loader == "controlnet-union":
        return models[0]
    if loader == "flux-controlnet":
        return diffusers.FluxMultiControlNetModel(models)
    if loader == "sd3-controlnet":
        return diffusers.SD3MultiControlNetModel(models)
    return models
```

Update the module docstring's last paragraph to mention PR3: append the sentence `PR3 adds loader-specific model classes and explicit union/FLUX/SD3 variant classes (from_pipe's name surgery cannot derive the union pipeline).`

- [ ] **Step 4: Run the tests**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_pipelines.py -v 2>&1 | tail -25; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS (all, including the PR1/PR2 ones - defaults preserve old behavior).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/guided/pipelines.py backend/tests/test_guided_pipelines.py && git commit -m "feat(guided): loader-aware ControlNet classes + explicit union/FLUX/SD3 variants (#34 PR3)"
```

---

### Task 4: Hardware-fit gate for ControlNet stacks

**Files:**
- Modify: `backend/foundry/fit.py` (band constant after `RUNTIME_BAND_BYTES`)
- Create: `backend/guided/fit.py`
- Test: `backend/tests/test_guided_fit.py` (new)

**Interfaces:**
- Consumes: `RuntimePlan` (`.refusal`, `.vram_plan: VramEstimate`), `HardwareProfile` (`.gpu_available`, `.vram_free_bytes`, `.system_ram_available_bytes`), `read_safetensors_header`/`weight_bytes_from_header`.
- Produces: `controlnet_fit_refusal(base_plan, cn_model_dirs, family, profile) -> Optional[str]` and `controlnet_weight_bytes(model_dir) -> int` (consumed by Task 6). `GUIDED_PASS_OVERHEAD_BYTES` in `foundry.fit`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_guided_fit.py`:

```python
"""#34 PR3: ControlNet stacks refuse over-budget up front, with the basis label."""
import json
import os
import struct
from dataclasses import dataclass, field
from typing import List, Optional

import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.fit import GUIDED_PASS_OVERHEAD_BYTES, VramEstimate
from guided.fit import controlnet_fit_refusal, controlnet_weight_bytes

_GIB = 2 ** 30


@dataclass
class _Plan:
    vram_plan: Optional[VramEstimate] = None
    refusal: Optional[str] = None


@dataclass
class _Profile:
    gpu_available: bool = True
    vram_free_bytes: int = 8 * _GIB
    system_ram_available_bytes: int = 32 * _GIB


def _write_header_only_safetensors(path, param_count, dtype="F16"):
    """A real safetensors prefix+header claiming param_count params; the fit
    math reads ONLY the header, so no tensor bytes are needed."""
    header = json.dumps({
        "weight": {"dtype": dtype, "shape": [param_count],
                   "data_offsets": [0, param_count * 2]},
    }).encode("utf-8")
    with open(path, "wb") as handle:
        handle.write(struct.pack("<Q", len(header)))
        handle.write(header)


def _cn_dir(tmp_path, name, param_count):
    model_dir = tmp_path / name
    model_dir.mkdir()
    _write_header_only_safetensors(
        str(model_dir / "diffusion_pytorch_model.safetensors"), param_count)
    return str(model_dir)


def _estimate(total_gib, weights_gib, basis="estimated"):
    weights = int(weights_gib * _GIB)
    total = int(total_gib * _GIB)
    return VramEstimate(weight_bytes=weights, activation_bytes=total - weights,
                        runtime_bytes=0, total_bytes=total, basis=basis)


def test_controlnet_weight_bytes_reads_exact_header_bytes(tmp_path):
    model_dir = _cn_dir(tmp_path, "cn", param_count=1000)
    assert controlnet_weight_bytes(model_dir) == 2000  # 1000 params x F16


def test_fitting_stack_passes(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=4.0, weights_gib=2.0))
    dirs = [_cn_dir(tmp_path, "cn", param_count=1000)]
    assert controlnet_fit_refusal(plan, dirs, "sd15", _Profile()) is None


def test_over_budget_stack_refuses_with_basis_and_numbers(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    # A ControlNet claiming ~4 GiB of F16 params.
    dirs = [_cn_dir(tmp_path, "cn", param_count=2 * _GIB)]
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=1 * _GIB)
    message = controlnet_fit_refusal(plan, dirs, "sd15", profile)
    assert message is not None
    assert "estimated" in message
    assert "GB" in message
    assert str(profile.system_ram_available_bytes) not in message  # human units only
    assert "\\" not in message and "/" not in message  # never a filesystem path


def test_offload_capable_stack_is_not_refused(tmp_path):
    """Weights fit in system RAM + non-weights fit in VRAM -> the loader's
    offload rung handles it; the gate stays out of the way."""
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    dirs = [_cn_dir(tmp_path, "cn", param_count=2 * _GIB)]
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=32 * _GIB)
    assert controlnet_fit_refusal(plan, dirs, "sd15", profile) is None


def test_cpu_only_and_broken_plans_skip_the_gate(tmp_path):
    dirs = [_cn_dir(tmp_path, "cn", param_count=1000)]
    ok_plan = _Plan(vram_plan=_estimate(4.0, 2.0))
    assert controlnet_fit_refusal(ok_plan, dirs, "sd15",
                                  _Profile(gpu_available=False)) is None
    assert controlnet_fit_refusal(_Plan(refusal="nope"), dirs, "sd15", _Profile()) is None
    assert controlnet_fit_refusal(_Plan(vram_plan=None), dirs, "sd15", _Profile()) is None
    assert controlnet_fit_refusal(None, dirs, "sd15", _Profile()) is None


def test_unreadable_weights_never_guess(tmp_path):
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    plan = _Plan(vram_plan=_estimate(100.0, 90.0))  # would refuse if gated
    assert controlnet_fit_refusal(plan, [str(empty_dir)], "sd15", _Profile()) is None


def test_overhead_band_covers_all_image_families():
    for family in ("sd15", "sdxl", "flux", "sd35", "default"):
        assert GUIDED_PASS_OVERHEAD_BYTES[family] > 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_fit.py -v 2>&1 | tail -15; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: FAIL - `guided.fit` does not exist, `GUIDED_PASS_OVERHEAD_BYTES` missing.

- [ ] **Step 3: Add the band to foundry/fit.py**

After `RUNTIME_BAND_BYTES` (line 43):

```python
# Guided-pass (ControlNet) activation overhead per family, in bytes - the
# extra working memory a ControlNet forward adds beyond the base activation
# band. Seeded estimates; tools/calibrate_vram.py refines as data edits.
GUIDED_PASS_OVERHEAD_BYTES: Dict[str, int] = {
    "sd15": int(0.3 * _GIB),
    "sdxl": int(0.6 * _GIB),
    "flux": int(1.0 * _GIB),
    "sd35": int(1.0 * _GIB),
    "default": int(1.0 * _GIB),
}
```

- [ ] **Step 4: Create guided/fit.py**

```python
"""#34 PR3: hardware-fit gate for ControlNet stacks (spec section 3).

ControlNet weights ride along the base RuntimePlan: EXACT bytes from the
installed safetensors headers (never observed RSS, never a size-string
guess - the gate only runs on installed records), plus a labeled per-family
guided-pass activation band. The gate only ever refuses genuinely
over-budget combinations - cpu-only and offload-capable plans keep today's
behavior, and anything unmeasurable passes through untouched (never guess).
Messages are user-facing and path-free. No heavy imports - loads on stub CI.
"""
from __future__ import annotations

import glob
import os
from typing import List, Optional

from foundry.fit import GUIDED_PASS_OVERHEAD_BYTES, weight_bytes_from_header
from foundry.safetensors_header import HeaderError, read_safetensors_header

_GIB = 2 ** 30


def controlnet_weight_bytes(model_dir: str) -> int:
    """Exact bytes for every safetensors file under an installed record dir."""
    total = 0
    pattern = os.path.join(model_dir, "**", "*.safetensors")
    for path in glob.glob(pattern, recursive=True):
        try:
            total += weight_bytes_from_header(read_safetensors_header(path))
        except (HeaderError, OSError):
            continue
    return total


def controlnet_fit_refusal(
    base_plan,
    cn_model_dirs: List[str],
    family: Optional[str],
    profile,
) -> Optional[str]:
    """None when the stack fits (or the gate has nothing truthful to add)."""
    if base_plan is None or base_plan.refusal or base_plan.vram_plan is None:
        return None  # base-model problems surface through their own channels
    if not profile.gpu_available:
        return None  # cpu-only generation keeps today's behavior
    cn_bytes = sum(controlnet_weight_bytes(model_dir) for model_dir in cn_model_dirs)
    if cn_bytes == 0:
        return None  # nothing measurable - never refuse on a guess

    estimate = base_plan.vram_plan
    overhead = GUIDED_PASS_OVERHEAD_BYTES.get(
        family or "", GUIDED_PASS_OVERHEAD_BYTES["default"])
    total = estimate.total_bytes + cn_bytes + overhead
    if total <= profile.vram_free_bytes:
        return None
    weights = estimate.weight_bytes + cn_bytes
    if (weights <= profile.system_ram_available_bytes
            and (total - weights) <= profile.vram_free_bytes):
        return None  # fits-with-offload: the loader's offload rung handles it

    count = len(cn_model_dirs)
    plural = "s" if count != 1 else ""
    return (
        f"This ControlNet stack does not fit on this GPU: the checkpoint plus "
        f"{count} ControlNet model{plural} needs ~{total / _GIB:.1f} GB VRAM but "
        f"{profile.vram_free_bytes / _GIB:.1f} GB is free ({estimate.basis} basis). "
        "Close other GPU apps, drop a layer, or switch to a smaller checkpoint."
    )
```

- [ ] **Step 5: Run the tests**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_fit.py backend/tests/test_foundry_fit.py -v 2>&1 | tail -15; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS. (Note: the refusal message contains no `/` because it holds no paths and `~X.X GB` uses a tilde - the test asserts that.)

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/foundry/fit.py backend/guided/fit.py backend/tests/test_guided_fit.py && git commit -m "feat(guided): hardware-fit gate for ControlNet stacks - exact header bytes + labeled band (#34 PR3)"
```

---

### Task 5: direct_generator - loader-aware threading

**Files:**
- Modify: `backend/utils/direct_generator.py` (the `_generate_sync` ControlNet blocks, ~lines 420-541)
- Test: `backend/tests/test_direct_generator_guided.py`

**Interfaces:**
- Consumes: Task 2's `resolve_controlnet_stack(..., model_id=, kind=)` + `ResolvedControlLayer.loader/control_mode`; Task 3's `controlnets_attached(loader=)`, `derive_variant(loader=)`, `combine_controlnets`.
- Produces: `guided_report["controlnet"]` entries gain `"control_mode"`.

- [ ] **Step 1: Update the test harness and add the failing tests**

In `backend/tests/test_direct_generator_guided.py`:

(a) Extend `_FakePipeline.__call__` signature with `control_mode=None` and record it - the parameter list becomes:

```python
    def __call__(self, prompt=None, negative_prompt=None, image=None,
                 mask_image=None, strength=0.75, width=None, height=None,
                 num_inference_steps=25, guidance_scale=7.5, generator=None,
                 callback_on_step_end=None, control_image=None,
                 controlnet_conditioning_scale=None,
                 control_guidance_start=None, control_guidance_end=None,
                 control_mode=None):
```

and add `"control_mode": control_mode,` to the recorded dict.

(b) In `_generator`, replace the `derive_variant` and `controlnets_attached` monkeypatches with loader-aware fakes and record derivations:

```python
    derived = []
    monkeypatch.setattr(
        dg, "derive_variant",
        lambda base, kind, controlnet=None, loader="controlnet":
            derived.append({"kind": kind, "controlnet": controlnet,
                            "loader": loader}) or base)
    monkeypatch.setattr(
        dg, "combine_controlnets",
        lambda models, loader: {"combined": list(models), "loader": loader})
```

```python
    monkeypatch.setattr(
        dg, "controlnets_attached",
        lambda dirs, dtype, device, loader="controlnet":
            _FakeAttached(dirs, dtype, device))
```

and return `gen, loaded, attached, derived` from `_generator`. Update every existing unpack site: `gen, _, _ = _generator(...)` -> `gen, _, _, _ = _generator(...)`, `gen, loaded, _ =` -> `gen, loaded, _, _ =`, and in `test_controlnet_txt2img_threads_controls_and_scales`: `gen, _, attached =` -> `gen, _, attached, derived =`.

(c) In `test_controlnet_txt2img_threads_controls_and_scales`, the guided_report assertion gains the mode key:

```python
    assert result["guided"]["controlnet"] == [
        {"layer_id": "c1", "preprocessor": "canny",
         "record_id": "controlnet-canny-sd15", "control_mode": None},
    ]
```

and append after the `attached` assertions:

```python
    assert derived[0]["loader"] == "controlnet"
    assert derived[0]["controlnet"] == {"combined": ["cn-model"], "loader": "controlnet"}
```

(d) Append the new PR3 tests:

```python
def test_flux_union_txt2img_threads_control_modes(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, derived = _generator(tmp_path, calls, monkeypatch, family="flux")
    union_dir = _cn_model_dir(tmp_path, "controlnet-union-flux")
    guided = {"controlnet": [_cn_layer(tmp_path),
                             _cn_layer(tmp_path, layer_id="c2", strength=0.5)],
              "reference_images": [], "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    # Non-dedicated loaders take the control maps as control_image even for
    # txt2img, plus the per-condition mode list.
    assert isinstance(call["control_image"], list) and len(call["control_image"]) == 2
    assert call["image"] is None
    assert call["control_mode"] == [0, 0]                       # canny twice
    assert call["controlnet_conditioning_scale"] == [1.4, 0.5]
    # ONE shared union record -> the weights load exactly once.
    assert attached[0]["dirs"] == [union_dir]
    assert attached[0]["released"] is True
    assert derived[0]["loader"] == "flux-controlnet"
    assert result["guided"]["controlnet"][0]["record_id"] == "controlnet-union-flux"
    assert result["guided"]["controlnet"][0]["control_mode"] == 0


def test_sdxl_union_mixed_stack_shares_one_model(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, derived = _generator(tmp_path, calls, monkeypatch, family="sdxl")
    union_dir = _cn_model_dir(tmp_path, "controlnet-union-sdxl")
    guided = {"controlnet": [_cn_layer(tmp_path),
                             _cn_layer(tmp_path, layer_id="c2", preprocessor="scribble")],
              "reference_images": [], "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert call["control_mode"] == [3, 2]                       # canny=3, scribble=2
    assert attached[0]["dirs"] == [union_dir]                   # deduped: loaded once
    assert derived[0]["loader"] == "controlnet-union"
    assert len(result["guided"]["controlnet"]) == 2


def test_sd35_dedicated_stack_loads_each_record(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, _ = _generator(tmp_path, calls, monkeypatch, family="sd35")
    canny_dir = _cn_model_dir(tmp_path, "controlnet-canny-sd35")
    depth_dir = _cn_model_dir(tmp_path, "controlnet-depth-sd35")
    guided = {"controlnet": [_cn_layer(tmp_path),
                             _cn_layer(tmp_path, layer_id="c2", preprocessor="depth")],
              "reference_images": [], "inpaint": None, "denoising_strength": 0.75}
    result = _run(gen, tmp_path, guided)
    call = calls[0]
    assert call["control_mode"] is None                         # dedicated: no modes
    assert attached[0]["dirs"] == [canny_dir, depth_dir]
    assert result["guided"]["pass"] == "none"


def test_flux_controlnet_with_inpaint_fails_before_pipeline(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _, _, _ = _generator(tmp_path, calls, monkeypatch, family="flux")
    _cn_model_dir(tmp_path, "controlnet-union-flux")
    guided = {"controlnet": [_cn_layer(tmp_path)], "reference_images": [],
              "denoising_strength": 0.75,
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    with pytest.raises(GuidedValidationError) as excinfo:
        _run(gen, tmp_path, guided)
    assert calls == []
    assert "FLUX.1 Fill" in str(excinfo.value)
```

Note `_cn_layer` uses `depth` for the depth tests: the depth preprocessor requires the midas annotator record - the `_resolve_record` fake already answers "ready" for every id, and `produce_control_image` is what would touch annotator weights. The tests above with `preprocessor="depth"` therefore need `produce_control_image` stubbed. Add to `_generator` (after the `combine_controlnets` monkeypatch):

```python
    from PIL import Image as _PILImage
    monkeypatch.setattr(
        dg, "produce_control_image",
        lambda layer, width, height, annotators_dir:
            _PILImage.new("RGB", (width, height)))
```

(This also makes the existing canny tests independent of OpenCV timing; the real preprocessing is covered by `test_guided_preprocessors.py` and the local smoke.)

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_direct_generator_guided.py -v 2>&1 | tail -25; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: new tests FAIL (missing model_id/kind threading, no control_mode, no dedupe); PR1/PR2 tests PASS.

- [ ] **Step 3: Implement in `_generate_sync`**

(a) Update the import line in `backend/utils/direct_generator.py` (currently `from guided.pipelines import controlnets_attached, derive_variant, filter_call_kwargs`):

```python
from guided.pipelines import (
    combine_controlnets,
    controlnets_attached,
    derive_variant,
    filter_call_kwargs,
)
```

(b) Replace the ControlNet resolution block (currently starting `cn_stack = []` through the `control_images = [...]` assignment):

```python
        # #34 PR2/PR3: resolve the ControlNet stack through the same seam the
        # endpoint 422s through, and build the control images on CPU before
        # any weights move. Union stacks resolve to ONE record - dedupe dirs
        # so the shared weights load exactly once.
        cn_stack = []
        cn_model_dirs: List[str] = []
        control_images: List[Any] = []
        cn_loader = "controlnet"
        if pass_plan.controlnet:
            base_record = _resolve_record(model_name) or {}
            cn_stack = resolve_controlnet_stack(
                pass_plan.controlnet, base_record.get("base_architecture"),
                _resolve_record, model_id=model_name, kind=pass_plan.kind,
            )
            cn_loader = cn_stack[0].loader
            for item in cn_stack:
                model_dir = os.path.join(self.models_dir, "controlnet", item.record_id)
                if not os.path.isdir(model_dir):
                    raise GuidedValidationError(
                        f"The ControlNet model '{item.record_id}' looks incomplete "
                        "on disk - reinstall it from the Foundry."
                    )
                if model_dir not in cn_model_dirs:
                    cn_model_dirs.append(model_dir)
            annotators_dir = os.path.join(self.models_dir, "annotators")
            control_images = [
                produce_control_image(item.layer, width, height, annotators_dir)
                for item in cn_stack
            ]
```

(c) Replace the ControlNet kwargs block (currently `if cn_stack:` with the `image`/`control_image` split):

```python
        if cn_stack:
            # Dedicated SD/SDXL txt2img variants take the control map as
            # `image`; every other ControlNet pipeline (img2img/inpaint
            # variants, union, FLUX, SD3) takes `control_image`.
            if pass_plan.kind == "none" and cn_loader == "controlnet":
                call_kwargs["image"] = control_images
            else:
                call_kwargs["control_image"] = control_images
            call_kwargs["controlnet_conditioning_scale"] = [
                float(item.layer.get("strength", 1.0)) for item in cn_stack]
            call_kwargs["control_guidance_start"] = [
                float(item.layer.get("start_step", 0.0)) for item in cn_stack]
            call_kwargs["control_guidance_end"] = [
                float(item.layer.get("end_step", 1.0)) for item in cn_stack]
            modes = [item.control_mode for item in cn_stack]
            if all(mode is not None for mode in modes):
                call_kwargs["control_mode"] = modes
```

(d) In the `ExitStack` block, replace the attach/derive lines:

```python
            if cn_stack:
                cn_models = stack.enter_context(controlnets_attached(
                    cn_model_dirs, getattr(pipeline, "dtype", None), self.device,
                    loader=cn_loader))
                run_pipeline = derive_variant(
                    pipeline, pass_plan.kind,
                    controlnet=combine_controlnets(cn_models, cn_loader),
                    loader=cn_loader)
```

(e) In the `guided_report` construction, extend the controlnet entries:

```python
                    "controlnet": [
                        {"layer_id": item.layer.get("layer_id"),
                         "preprocessor": item.layer.get("preprocessor"),
                         "record_id": item.record_id,
                         "control_mode": item.control_mode}
                        for item in cn_stack
                    ],
```

- [ ] **Step 4: Run the generator suites**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_direct_generator_guided.py backend/tests/test_direct_generator.py backend/tests/test_direct_generator_loras.py backend/tests/test_direct_generator_accel.py -v 2>&1 | tail -20; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/utils/direct_generator.py backend/tests/test_direct_generator_guided.py && git commit -m "feat(guided): loader-aware ControlNet execution - modes, shared unions, kwarg routing (#34 PR3)"
```

---

### Task 6: Endpoint pre-flight - model/kind threading + fit gate

**Files:**
- Modify: `backend/main.py` (the `if pass_plan.controlnet:` pre-flight block, ~lines 1252-1268; imports)
- Test: `backend/tests/test_guided_request_api.py`

**Interfaces:**
- Consumes: Task 2 signature, Task 4's `controlnet_fit_refusal`; existing `probe_hardware`, `resolve_model_runtime`, `consent_store`, `MODELS_DIR` in main.py (verify imports with `Grep "probe_hardware|resolve_model_runtime|MODELS_DIR" backend/main.py` - all three are already imported/defined for the `/resolve-runtime` endpoint; add none).

- [ ] **Step 1: Add the failing API tests**

Append to `backend/tests/test_guided_request_api.py`:

```python
def test_controlnet_on_flux_schnell_preflights_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="flux"))
    body = _cn_request(tmp_path)
    body["model"] = "flux-schnell"
    response = client.post("/api/generate/image", json=body)
    assert response.status_code == 422
    assert "FLUX.1 [dev]" in response.json()["detail"]


def test_controlnet_on_flux_dev_enqueues_via_union(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="flux"))
    body = _cn_request(tmp_path)
    body["model"] = "flux-dev"
    response = client.post("/api/generate/image", json=body)
    assert response.status_code == 200
    assert response.json()["status"] == "pending"


def test_controlnet_composition_decline_preflights_422(monkeypatch, tmp_path):
    from PIL import Image

    client = _client(monkeypatch, _FakeRegistry(family="sd35"))
    body = _cn_request(tmp_path)
    body["model"] = "sd3.5-large"
    base = tmp_path / "base.png"
    Image.new("RGB", (8, 8)).save(base)
    body["reference_images"] = [{
        "layer_id": "r1", "layer_name": "Ref", "source_path": str(base),
        "mask": MASK, "strength": 1.0,
    }]
    response = client.post("/api/generate/image", json=body)
    assert response.status_code == 422
    assert "SD 3.5" in response.json()["detail"]


def test_over_budget_controlnet_stack_preflights_422(monkeypatch, tmp_path):
    import main as main_module

    client = _client(monkeypatch, _FakeRegistry())
    monkeypatch.setattr(
        main_module, "controlnet_fit_refusal",
        lambda base_plan, dirs, family, profile: "does not fit (estimated basis)")
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 422
    assert "does not fit" in response.json()["detail"]


def test_fitting_controlnet_stack_still_enqueues(monkeypatch, tmp_path):
    import main as main_module

    client = _client(monkeypatch, _FakeRegistry())
    monkeypatch.setattr(
        main_module, "controlnet_fit_refusal",
        lambda base_plan, dirs, family, profile: None)
    response = client.post("/api/generate/image", json=_cn_request(tmp_path))
    assert response.status_code == 200
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request_api.py -v 2>&1 | tail -15; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: the new tests FAIL (`controlnet_fit_refusal` not on main; schnell not declined).

- [ ] **Step 3: Implement in main.py**

(a) Next to the existing guided imports (`from guided.controlnet_registry import resolve_controlnet_stack`), add:

```python
from guided.fit import controlnet_fit_refusal
```

(b) Replace the tail of the `if pass_plan.controlnet:` block (the `record = ...` / `try: resolve_controlnet_stack(...)` part) with:

```python
            record = model_registry.get_record(gen_request.model) or {}
            try:
                cn_stack = resolve_controlnet_stack(
                    pass_plan.controlnet,
                    record.get("base_architecture"),
                    model_registry.get_record,
                    model_id=gen_request.model,
                    kind=pass_plan.kind,
                )
            except GuidedValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            # #34 PR3: refuse over-budget stacks up front with the labeled
            # basis instead of letting the job OOM minutes into a run. The
            # gate reads exact installed-header bytes; probe + plan run in
            # the executor like /resolve-runtime does.
            if record:
                loop = asyncio.get_running_loop()
                profile = await loop.run_in_executor(None, probe_hardware, MODELS_DIR)
                base_plan = await loop.run_in_executor(
                    None, resolve_model_runtime, record, profile,
                    consent_store.get(gen_request.model))
                cn_dirs = []
                for item in cn_stack:
                    cn_dir = os.path.join(MODELS_DIR, "controlnet", item.record_id)
                    if cn_dir not in cn_dirs:
                        cn_dirs.append(cn_dir)
                refusal = controlnet_fit_refusal(
                    base_plan, cn_dirs, record.get("base_architecture"), profile)
                if refusal:
                    raise HTTPException(status_code=422, detail=refusal)
```

(c) Update the `ControlNetLayerPayload` docstring in main.py from "(SD 1.5 / SDXL real since PR2)" to "(SD 1.5 / SDXL / FLUX / SD 3.5 Large real since #34 PR3)".

Note: `test_over_budget_controlnet_stack_preflights_422` monkeypatches `main.controlnet_fit_refusal`, so the real probe/plan still run against the fake registry's minimal record - `resolve_model_runtime` handles a record without locations (size-string fallback) and `probe_hardware` degrades safely on any machine, so the endpoint path is exercised end-to-end without CUDA.

- [ ] **Step 4: Run the API tests**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request_api.py backend/tests/test_generation_api.py -v 2>&1 | tail -15; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS (if `test_generation_api.py` does not exist, substitute `-k "generate" backend/tests/`).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/main.py backend/tests/test_guided_request_api.py && git commit -m "feat(guided): pre-flight model/kind-aware ControlNet resolve + fit gate 422 (#34 PR3)"
```

---

### Task 7: Frontend mirror - controlnetSupport.ts

**Files:**
- Rewrite: `src/features/generation/controlnetSupport.ts`
- Test: `src/features/generation/controlnetSupport.test.ts`

**Interfaces:**
- Produces: `resolveControlNetPreflight(layers, baseArchitecture, availableModels, options?: { modelId?: string | null; kind?: GuidedKind })` (same return shape), `supportedPreprocessors(baseArchitecture)`, `requiredRecordsFor(preprocessor, baseArchitecture)`, `type GuidedKind = 'none' | 'img2img' | 'inpaint'`. Consumed by Tasks 8/9. Message strings are verbatim copies of Task 2's backend strings.

- [ ] **Step 1: Rewrite the module**

Replace `src/features/generation/controlnetSupport.ts` in full:

```ts
import type { GenerationControlNetLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

/**
 * Frontend mirror of backend/guided/controlnet_registry.py (#34 PR2/PR3).
 * The backend registry is the source of truth; keep every map and message
 * below in sync with it verbatim.
 */

export type GuidedKind = 'none' | 'img2img' | 'inpaint';

/** Annotator weights each preprocessor needs (guided/preprocessors.py). */
export const PREPROCESSOR_ANNOTATORS: Record<string, string | null> = {
  canny: null,
  scribble: null,
  depth: 'annotator-midas',
  normal: 'annotator-normalbae',
  openpose: 'annotator-openpose',
};

/** Dedicated one-record-per-preprocessor stacks. */
export const CONTROLNET_DEDICATED: Record<string, Record<string, string>> = {
  sd15: {
    canny: 'controlnet-canny-sd15',
    depth: 'controlnet-depth-sd15',
    openpose: 'controlnet-openpose-sd15',
    scribble: 'controlnet-scribble-sd15',
    normal: 'controlnet-normal-sd15',
  },
  sdxl: {
    canny: 'controlnet-canny-sdxl',
    depth: 'controlnet-depth-sdxl',
    openpose: 'controlnet-openpose-sdxl',
  },
  sd35: {
    canny: 'controlnet-canny-sd35',
    depth: 'controlnet-depth-sd35',
  },
};

/** Union stacks: one record serves several preprocessors via control_mode. */
export const CONTROLNET_UNIONS: Record<string, { recordId: string; modes: Record<string, number> }> = {
  sdxl: {
    recordId: 'controlnet-union-sdxl',
    modes: { openpose: 0, depth: 1, scribble: 2, canny: 3, normal: 4 },
  },
  flux: {
    recordId: 'controlnet-union-flux',
    modes: { canny: 0, depth: 2, openpose: 4 },
  },
};

const FAMILY_LABELS: Record<string, string> = {
  sd15: 'SD 1.5',
  sdxl: 'SDXL',
  flux: 'FLUX',
  sd35: 'SD 3.5',
};

/** Known-incompatible catalog checkpoints inside supported families. */
export const CHECKPOINT_DECLINES: Record<string, string> = {
  'flux-schnell':
    'FLUX.1 [schnell] is a distilled checkpoint the FLUX ControlNet union does not support - switch to FLUX.1 [dev].',
  'sd3.5-medium':
    'The SD 3.5 ControlNets are trained for SD 3.5 Large only - switch to the SD 3.5 Large checkpoint.',
};

/** ControlNet composes only where diffusers ships the combined pipeline. */
const UNSUPPORTED_KINDS: Record<string, Partial<Record<GuidedKind, string>>> = {
  flux: {
    inpaint:
      'FLUX inpainting runs on FLUX.1 Fill, which has no ControlNet path - hide the ControlNet layer(s) or clear the inpaint mask.',
  },
  sd35: {
    img2img:
      'ControlNet with a reference image is not supported on SD 3.5 - remove the reference layer or switch to SD 1.5, SDXL, or FLUX.',
    inpaint:
      'ControlNet with inpainting is not supported on SD 3.5 - clear the inpaint mask or switch to SD 1.5 or SDXL.',
  },
};

export interface ControlNetPreflight {
  errors: string[];
  missingRecordIds: string[];
}

const EMPTY: ControlNetPreflight = { errors: [], missingRecordIds: [] };

/** Preprocessors that can run at all on a family (dedicated or via union). */
export function supportedPreprocessors(baseArchitecture: string | null): string[] {
  if (!baseArchitecture) {
    return Object.keys(PREPROCESSOR_ANNOTATORS).sort();
  }
  const dedicated = CONTROLNET_DEDICATED[baseArchitecture] ?? {};
  const union = CONTROLNET_UNIONS[baseArchitecture];
  return [...new Set([...Object.keys(dedicated), ...Object.keys(union?.modes ?? {})])].sort();
}

/**
 * Per-layer record needs for the properties panel: the layer's own model
 * (dedicated first, union fallback) plus its annotator. Full-stack routing
 * (mixed stacks forcing the union) is the submit preflight's job.
 */
export function requiredRecordsFor(
  preprocessor: string,
  baseArchitecture: string | null,
): string[] {
  if (!baseArchitecture) return [];
  const dedicated = CONTROLNET_DEDICATED[baseArchitecture] ?? {};
  const union = CONTROLNET_UNIONS[baseArchitecture];
  const controlNetRecord =
    dedicated[preprocessor] ??
    (union && preprocessor in union.modes ? union.recordId : null);
  if (!controlNetRecord) return [];
  const annotator = PREPROCESSOR_ANNOTATORS[preprocessor] ?? null;
  return annotator ? [controlNetRecord, annotator] : [controlNetRecord];
}

/**
 * Best-effort client mirror of the backend 422 pre-flight. A null family
 * (models list not loaded) stays silent - the backend check is authoritative.
 */
export function resolveControlNetPreflight(
  layers: GenerationControlNetLayerPayload[],
  baseArchitecture: string | null,
  availableModels: ModelRecord[],
  options: { modelId?: string | null; kind?: GuidedKind } = {},
): ControlNetPreflight {
  if (layers.length === 0 || !baseArchitecture) {
    return EMPTY;
  }

  const label = FAMILY_LABELS[baseArchitecture] ?? baseArchitecture;
  const dedicated = CONTROLNET_DEDICATED[baseArchitecture];
  const union = CONTROLNET_UNIONS[baseArchitecture];
  if (!dedicated && !union) {
    return {
      errors: [
        `ControlNet is not supported on ${label} - switch to an SD 1.5, SDXL, FLUX, ` +
          'or SD 3.5 Large checkpoint, or hide the ControlNet layer(s).',
      ],
      missingRecordIds: [],
    };
  }

  const decline = CHECKPOINT_DECLINES[options.modelId ?? ''];
  if (decline) {
    return { errors: [decline], missingRecordIds: [] };
  }
  const kindReason = UNSUPPORTED_KINDS[baseArchitecture]?.[options.kind ?? 'none'];
  if (kindReason) {
    return { errors: [kindReason], missingRecordIds: [] };
  }

  const supported = supportedPreprocessors(baseArchitecture);
  const useUnion =
    union != null &&
    (!dedicated || layers.some((layer) => !(layer.preprocessor in dedicated)));

  const errors = new Set<string>();
  const missing = new Set<string>();
  const requireReady = (recordId: string, layerName: string) => {
    const record = availableModels.find((model) => model.id === recordId);
    if (record?.status !== 'ready') {
      errors.add(`${layerName} needs '${recordId}' - install it from the Foundry first.`);
      missing.add(recordId);
    }
  };

  for (const layer of layers) {
    const inUnion = union != null && layer.preprocessor in union.modes;
    const inDedicated = dedicated != null && layer.preprocessor in dedicated;
    if (!(useUnion ? inUnion : inDedicated)) {
      errors.add(
        `No ControlNet model is available for the '${layer.preprocessor}' preprocessor on ` +
          `${label} - supported on ${label}: ${supported.join(', ')}.`,
      );
      continue;
    }
    const controlNetRecord = useUnion ? union.recordId : dedicated[layer.preprocessor];
    requireReady(controlNetRecord, layer.layer_name);
    const annotator = PREPROCESSOR_ANNOTATORS[layer.preprocessor];
    if (annotator) {
      requireReady(annotator, layer.layer_name);
    }
  }
  return { errors: [...errors], missingRecordIds: [...missing] };
}
```

- [ ] **Step 2: Update the tests**

In `src/features/generation/controlnetSupport.test.ts`, replace the `declines unsupported families with the PR3 message` and `declines preprocessors with no model on the family` tests and append the PR3 cases:

```ts
  it('declines truly unsupported families', () => {
    const result = resolveControlNetPreflight([buildLayer()], 'svd', []);
    expect(result.errors[0]).toMatch(/not supported/);
    expect(result.errors[0]).toMatch(/SD 3.5 Large/);
    expect(result.missingRecordIds).toEqual([]);
  });

  it('declines preprocessors with no model on the family', () => {
    const result = resolveControlNetPreflight([buildLayer({ preprocessor: 'scribble' })], 'flux', []);
    expect(result.errors[0]).toMatch(/scribble/);
    expect(result.errors[0]).toMatch(/FLUX/);
    expect(result.errors[0]).toMatch(/canny/); // lists what IS supported
  });

  it('routes flux layers through the union record', () => {
    const result = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', []);
    expect(result.missingRecordIds).toEqual(['controlnet-union-flux']);

    const ready = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', [
      buildRecord({ id: 'controlnet-union-flux' }),
    ]);
    expect(ready).toEqual({ errors: [], missingRecordIds: [] });
  });

  it('routes a mixed sdxl stack entirely through the union', () => {
    const result = resolveControlNetPreflight(
      [buildLayer({ preprocessor: 'canny' }), buildLayer({ layer_id: 'c2', preprocessor: 'scribble' })],
      'sdxl',
      [buildRecord({ id: 'controlnet-canny-sdxl' })],
    );
    expect(result.missingRecordIds).toEqual(['controlnet-union-sdxl']);
  });

  it('declines known-incompatible checkpoints by id', () => {
    const schnell = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', [], {
      modelId: 'flux-schnell',
    });
    expect(schnell.errors[0]).toMatch(/FLUX.1 \[dev\]/);

    const medium = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'sd35', [], {
      modelId: 'sd3.5-medium',
    });
    expect(medium.errors[0]).toMatch(/SD 3.5 Large/);
  });

  it('declines composition kinds diffusers does not ship', () => {
    const fluxInpaint = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'flux', [
      buildRecord({ id: 'controlnet-union-flux' }),
    ], { kind: 'inpaint' });
    expect(fluxInpaint.errors[0]).toMatch(/FLUX.1 Fill/);

    const sd35Img2img = resolveControlNetPreflight([buildLayer({ preprocessor: 'canny' })], 'sd35', [
      buildRecord({ id: 'controlnet-canny-sd35' }),
    ], { kind: 'img2img' });
    expect(sd35Img2img.errors[0]).toMatch(/SD 3.5/);
  });

  it('exposes per-family supported preprocessors and per-layer record needs', () => {
    expect(supportedPreprocessors('sdxl')).toEqual(['canny', 'depth', 'normal', 'openpose', 'scribble']);
    expect(supportedPreprocessors('flux')).toEqual(['canny', 'depth', 'openpose']);
    expect(supportedPreprocessors('sd35')).toEqual(['canny', 'depth']);
    expect(requiredRecordsFor('scribble', 'sdxl')).toEqual(['controlnet-union-sdxl']);
    expect(requiredRecordsFor('depth', 'sd15')).toEqual(['controlnet-depth-sd15', 'annotator-midas']);
    expect(requiredRecordsFor('scribble', 'flux')).toEqual([]);
  });
```

Add the imports at the top: `import { resolveControlNetPreflight, supportedPreprocessors, requiredRecordsFor } from './controlnetSupport';`

- [ ] **Step 3: Run the tests**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/features/generation/controlnetSupport.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add src/features/generation/controlnetSupport.ts src/features/generation/controlnetSupport.test.ts && git commit -m "feat(guided): frontend mirror - unions, checkpoint/kind declines, panel helpers (#34 PR3)"
```

---

### Task 8: GeneratePanel reconciliation - retire the dead controls

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`
- Delete: `src/components/generate/ControlNetPanel.tsx`
- Modify: `tests/e2e/accessibility.spec.ts` (stale comment, line ~34)
- Test: `src/pages/GeneratePanel.test.tsx`

**Interfaces:**
- Consumes: Task 7's options parameter. `ControlNetConfig` stays in `types/generation.ts` (persisted `GenerationConfig.controlNet` in `types/project.ts` references it) - only the panel and dead state go.

- [ ] **Step 1: Add/adjust the failing tests**

In `src/pages/GeneratePanel.test.tsx`:

(a) Replace the `blocks ControlNet layers on families without support yet` test (the seeded scene includes an inpaint layer, so PR3's kind rule fires):

```ts
  it('blocks flux ControlNet + inpaint compositions with the Fill reason', async () => {
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
      expect(screen.getByTestId('generate-preflight-warning')).toHaveTextContent(/FLUX.1 Fill/);
    });
    expect(window.electron.generation.generateImage).not.toHaveBeenCalled();
  });
```

(b) Append the retirement regressions:

```ts
  it('renders no dead reference-routing or ControlNet toggle controls', () => {
    render(<GeneratePanel />);
    expect(screen.queryByText('Reference routing')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Enable ControlNet' })).not.toBeInTheDocument();
    // The threaded denoising slider stays.
    expect(screen.getByText('Denoising strength')).toBeInTheDocument();
  });

  it('summarizes control layers from the canvas, never from dead config', () => {
    render(<GeneratePanel />);
    expect(screen.getByText(/No canvas layers, 0 LoRAs/)).toBeInTheDocument();
  });
```

(The default store has no canvas layers, so the Control Layers card summary shows the else-branch. If the summary element renders collapsed, assert via `getByText` on the card summary text - the `GenerateSectionCard` renders `summary` as visible text.)

- [ ] **Step 2: Run to verify the new tests fail**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/pages/GeneratePanel.test.tsx 2>&1 | tail -20
```
Expected: FAIL (routing selector still present; summary says "ControlNet off"; flux test sees the old union-install message path only after Task 7 - the Fill reason requires the kind option, not yet passed).

- [ ] **Step 3: Implement in GeneratePanel.tsx**

(a) Remove the `ControlNetPanel` import (line 10) and the `ControlNetConfig` type from the type-import line 35 (keep `ImageGenerationRequestPayload, LoRAConfig`).

(b) Delete the `DEFAULT_CONTROLNET` constant (lines 82-88).

(c) Shrink `refConfig` (lines 383-388) to:

```ts
  const [refConfig, setRefConfig] = useState({
    denoisingStrength: 0.75,
    loraConfigs: [] as LoRAConfig[],
  });
```

(d) Derive the guided kind and thread it into the preflight memo (lines 413-423):

```ts
  // #34 PR2/PR3: best-effort mirror of the backend ControlNet pre-flight -
  // block with the same reason the backend 422 would give, plus a Foundry link.
  const guidedKind = resolvedCanvasControlLayers.inpaint
    ? ('inpaint' as const)
    : resolvedCanvasControlLayers.referenceImages.length > 0
      ? ('img2img' as const)
      : ('none' as const);
  const controlNetPreflight = useMemo(
    () =>
      imageConfig.generationType === 'image'
        ? resolveControlNetPreflight(
            resolvedCanvasControlLayers.controlnet,
            selectedImageBaseArch,
            availableModels,
            { modelId: imageConfig.model, kind: guidedKind },
          )
        : { errors: [], missingRecordIds: [] },
    [availableModels, guidedKind, imageConfig.generationType, imageConfig.model, resolvedCanvasControlLayers.controlnet, selectedImageBaseArch],
  );
```

(e) Fix the summary else-branch (line ~1256):

```ts
    : `No canvas layers, ${refConfig.loraConfigs.length} LoRA${refConfig.loraConfigs.length === 1 ? '' : 's'}`;
```

(f) Replace the reference-routing block (lines 1514-1542) - the selector goes, the slider stays full-width:

```tsx
            {imageConfig.generationType === 'image' ? (
              <div className="recessed-well px-3 py-3">
                <Slider
                  label="Denoising strength"
                  value={refConfig.denoisingStrength}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => updateRefConfig({ denoisingStrength: value })}
                  valueFormatter={(v) => v.toFixed(2)}
                />
              </div>
            ) : (
```

(g) Remove the `<ControlNetPanel ... />` usage (lines 1605-1608) - the Control Layers card keeps `LoRAMixer` only.

(h) Delete the file `src/components/generate/ControlNetPanel.tsx`:

```bash
git rm src/components/generate/ControlNetPanel.tsx
```

(i) In `tests/e2e/accessibility.spec.ts` line ~34, update the stale comment: replace the clause naming `ControlNetPanel's collapsible header` with `the collapsible section headers keep interactive elements as siblings, never nested` (comment-only edit). Validate the suite still parses: `npx playwright test --list 2>&1 | tail -3`.

- [ ] **Step 4: Run the panel tests + typecheck**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/pages/GeneratePanel.test.tsx 2>&1 | tail -15 && npm run typecheck 2>&1 | tail -5
```
Expected: PASS / clean. If `types/generation.ts`'s `ControlNetConfig` is now only referenced by `types/project.ts` + `GenerationControlNetLayerPayload`, that is correct - do NOT delete the type.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add src/pages/GeneratePanel.tsx src/pages/GeneratePanel.test.tsx tests/e2e/accessibility.spec.ts && git commit -m "feat(generate): retire dead referenceMode selector + ControlNetPanel; kind-aware preflight (#34 PR3)"
```

(The `git rm` from Step 3h is already staged.)

---

### Task 9: CanvasControlLayerProperties - preprocessor select + install/compat surfacing

**Files:**
- Modify: `src/components/canvas/CanvasControlLayerProperties.tsx`
- Test: `src/components/canvas/CanvasControlLayerProperties.test.tsx`

**Interfaces:**
- Consumes: Task 7's `supportedPreprocessors`/`requiredRecordsFor`/`CHECKPOINT_DECLINES`; store fields `availableModels`, `imageConfig.model`, `setActiveTab` (same fields GeneratePanel reads).

- [ ] **Step 1: Add the failing tests**

Replace `src/components/canvas/CanvasControlLayerProperties.test.tsx` describe-block additions - keep `buildLayer` and the existing two tests, but update them per the new behavior and add three tests. Full new test list:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasControlLayerProperties } from './CanvasControlLayerProperties';
import { useAppStore } from '@/store';
import type { CanvasControlLayer } from '@/types/project';
import type { ModelRecord } from '@/types/model';
import { DEFAULT_CANVAS_CONTROL_LAYER_MASK } from '@/types/project';
```

(keep the existing `buildLayer` helper unchanged, then:)

```tsx
function buildRecord(overrides: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'record', name: 'Record', artifact_type: 'controlnet', capability: 'image',
    base_architecture: 'sd15', source: 'huggingface', repo_id: null, revision: null,
    aux_repo_id: null, size: 'Unknown', status: 'ready', tier: 'verified',
    quality: 'balanced', runtime: 'local', hardware_class: 'laptop', vram: 'Unknown',
    description: '', license: null, gated: false,
    ...overrides,
  };
}

function seedModels(model: string, records: ModelRecord[]) {
  useAppStore.setState((state) => ({
    availableModels: records,
    imageConfig: { ...state.imageConfig, model },
  }));
}

describe('CanvasControlLayerProperties', () => {
  afterEach(cleanup);

  beforeEach(() => {
    seedModels('sd-1-5', [
      buildRecord({ id: 'sd-1-5', artifact_type: 'checkpoint', base_architecture: 'sd15' }),
    ]);
  });

  it('renders controlnet controls and forwards edits', () => {
    const onMaskToolChange = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    render(
      <CanvasControlLayerProperties
        layer={buildLayer()}
        activeMaskTool="rectangle"
        onMaskToolChange={onMaskToolChange}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    fireEvent.change(screen.getByLabelText(/control layer name/i), {
      target: { value: 'Depth Guide' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lasso mask tool/i }));
    fireEvent.change(screen.getByLabelText(/control layer weight/i), {
      target: { value: '1.55' },
    });
    fireEvent.click(screen.getByRole('button', { name: /visible/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete control layer/i }));

    expect(onUpdate).toHaveBeenCalledWith({ name: 'Depth Guide' });
    expect(onMaskToolChange).toHaveBeenCalledWith('polygon');
    expect(onUpdate).toHaveBeenCalledWith({ weight: 1.55 });
    expect(onUpdate).toHaveBeenCalledWith({ visible: false });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/controlnet preprocessor/i)).toBeInTheDocument();
    expect(screen.getByText(/layer ready for generation/i)).toBeInTheDocument();
  });

  it('offers only the active family preprocessors in a select and forwards changes', () => {
    const onUpdate = vi.fn();
    render(
      <CanvasControlLayerProperties
        layer={buildLayer()}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );

    const select = screen.getByLabelText(/controlnet preprocessor/i);
    const options = [...select.querySelectorAll('option')].map((option) => option.value);
    expect(options).toEqual(['canny', 'depth', 'normal', 'openpose', 'scribble']);
    fireEvent.change(select, { target: { value: 'depth' } });
    expect(onUpdate).toHaveBeenCalledWith({ preprocessor: 'depth' });
  });

  it('surfaces missing records with a Manage in Foundry link', () => {
    const setActiveTab = vi.fn();
    useAppStore.setState({ setActiveTab });

    render(
      <CanvasControlLayerProperties
        layer={buildLayer({ preprocessor: 'depth' })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(/controlnet-depth-sd15/)).toBeInTheDocument();
    expect(screen.getByText(/annotator-midas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /manage in foundry/i }));
    expect(setActiveTab).toHaveBeenCalledWith('foundry');
  });

  it('shows installed state when every required record is ready', () => {
    seedModels('sd-1-5', [
      buildRecord({ id: 'sd-1-5', artifact_type: 'checkpoint', base_architecture: 'sd15' }),
      buildRecord({ id: 'controlnet-canny-sd15' }),
    ]);
    render(
      <CanvasControlLayerProperties
        layer={buildLayer()}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/models installed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage in foundry/i })).not.toBeInTheDocument();
  });

  it('never claims an unsupported legacy preprocessor value is installed', () => {
    render(
      <CanvasControlLayerProperties
        layer={buildLayer({ preprocessor: 'segmentation' })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/'segmentation' is not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/models installed/i)).not.toBeInTheDocument();
  });

  it('marks prompt overrides inpaint-only', () => {
    const { rerender } = render(
      <CanvasControlLayerProperties
        layer={buildLayer()} // controlnet layer
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // diffusers has no per-layer ControlNet prompting - the fields are gone.
    expect(screen.queryByLabelText(/control layer prompt override/i)).not.toBeInTheDocument();

    rerender(
      <CanvasControlLayerProperties
        layer={buildLayer({ type: 'inpaint-mask', preprocessor: undefined })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/control layer prompt override/i)).toBeInTheDocument();
  });

  it('hides controlnet-only controls for reference image layers and exposes setup issues', () => {
    render(
      <CanvasControlLayerProperties
        layer={buildLayer({
          type: 'reference-image',
          name: 'Style Board',
          preprocessor: undefined,
          sourcePath: undefined,
          mask: {
            ...DEFAULT_CANVAS_CONTROL_LAYER_MASK,
            points: [],
            bounds: { x: 0, y: 0, width: 0, height: 0 },
          },
          prompt: undefined,
          negativePrompt: undefined,
        })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/controlnet preprocessor/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/control layer prompt override/i)).not.toBeInTheDocument();
    expect(screen.getByText(/layer needs setup/i)).toBeInTheDocument();
    expect(screen.getByText(/draw a mask on the canvas/i)).toBeInTheDocument();
    expect(screen.getByText(/attach the reference image/i)).toBeInTheDocument();
  });
});
```

(If `useAppStore.setState({ setActiveTab })` fights the store's action type, use `useAppStore.setState({ setActiveTab } as never)` - the established GeneratePanel.test pattern for action stubs applies; check how that file stubs actions and mirror it.)

- [ ] **Step 2: Run to verify the new tests fail**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/components/canvas/CanvasControlLayerProperties.test.tsx 2>&1 | tail -20
```
Expected: FAIL (free-text preprocessor input, prompts still shown for controlnet, no status box).

- [ ] **Step 3: Implement**

In `src/components/canvas/CanvasControlLayerProperties.tsx`:

(a) Add imports:

```tsx
import { useAppStore } from '@/store';
import {
  requiredRecordsFor,
  supportedPreprocessors,
} from '@/features/generation/controlnetSupport';
```

(b) Inside the component, before the readiness computation:

```tsx
  const availableModels = useAppStore((s) => s.availableModels);
  const activeModelId = useAppStore((s) => s.imageConfig.model);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const baseArchitecture =
    availableModels.find((model) => model.id === activeModelId)?.base_architecture ?? null;
  const preprocessorOptions = supportedPreprocessors(baseArchitecture);
  const requiredRecords =
    layer.type === 'controlnet' && layer.preprocessor
      ? requiredRecordsFor(layer.preprocessor, baseArchitecture)
      : [];
  const missingRecords = requiredRecords.filter(
    (recordId) => availableModels.find((model) => model.id === recordId)?.status !== 'ready',
  );
```

(c) Change the prompt gate (line 61): `const supportsPromptOverrides = layer.type === 'inpaint-mask';`

(d) Replace the free-text Preprocessor input block with a select + status box:

```tsx
            <label className="block">
              <span className="mb-1.5 block type-caption font-medium">Preprocessor</span>
              <select
                value={layer.preprocessor ?? ''}
                onChange={(event) => onUpdate({ preprocessor: event.target.value || undefined })}
                className={cn(
                  'w-full rounded-md border border-border bg-void px-3 py-2',
                  'type-ui text-text-primary',
                  'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                )}
                aria-label="ControlNet preprocessor"
              >
                {!layer.preprocessor ? <option value="">Choose a preprocessor</option> : null}
                {preprocessorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {layer.preprocessor && baseArchitecture ? (
              <div
                className={cn(
                  'rounded-xl border px-3 py-3',
                  requiredRecords.length > 0 && missingRecords.length === 0
                    ? 'border-border bg-void'
                    : 'border-status-warning-border bg-status-warning-muted',
                )}
                data-testid="controlnet-record-status"
              >
                {requiredRecords.length === 0 ? (
                  // A legacy free-text value (e.g. "segmentation") that no
                  // stack serves - never claim it is installed.
                  <p className="type-caption text-text-body">
                    {`'${layer.preprocessor}' is not available on the current checkpoint - choose one of: ${preprocessorOptions.join(', ')}.`}
                  </p>
                ) : missingRecords.length === 0 ? (
                  <p className="type-caption text-text-body">
                    Models installed - this layer can resolve on the current checkpoint.
                  </p>
                ) : (
                  <>
                    <p className="type-caption text-text-body">
                      This layer needs {missingRecords.map((id) => `'${id}'`).join(' and ')} on the
                      current checkpoint.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('foundry')}
                      className={cn(
                        'mt-2 type-caption font-medium text-accent-primary underline underline-offset-2',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                      )}
                    >
                      Manage in Foundry
                    </button>
                  </>
                )}
              </div>
            ) : null}
```

(e) Update the readiness note for prompt fields: inside the `supportsPromptOverrides` block nothing changes; controlnet layers simply no longer render it (diffusers has no per-layer ControlNet prompting - the backend surfaces the "ignored" notice if legacy data still carries one).

(f) Keep DESIGN.md rails: no new glyphs, lucide only, `type-caption`/`type-ui` classes as above (this file is on the `ui-glyphs.test.ts` audit list).

- [ ] **Step 4: Run the tests + full frontend gates**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npx vitest run src/components/canvas/CanvasControlLayerProperties.test.tsx src/pages/GeneratePanel.test.tsx 2>&1 | tail -15 && npm run typecheck 2>&1 | tail -5
```
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add src/components/canvas/CanvasControlLayerProperties.tsx src/components/canvas/CanvasControlLayerProperties.test.tsx && git commit -m "feat(canvas): preprocessor select + install/compat surfacing, prompts inpaint-only (#34 PR3)"
```

---

### Task 10: Real-model smokes, full sweep, PR

**Files:**
- Modify: `backend/tests/test_guided_smoke_controlnet_local.py`

- [ ] **Step 1: Add the per-family smokes**

Append to `backend/tests/test_guided_smoke_controlnet_local.py` (same env gate; each self-skips when its weights are absent):

```python
def _circle_layer(tmp_path, preprocessor="canny", size=512):
    import cv2
    import numpy as np
    from PIL import Image

    array = np.zeros((size, size, 3), dtype=np.uint8)
    cv2.circle(array, (size // 2, size // 2), int(size * 0.27), (255, 255, 255), -1)
    source_path = str(tmp_path / f"circle-{preprocessor}.png")
    Image.fromarray(array).save(source_path)
    return array, {
        "layer_id": "c1", "layer_name": "Circle", "source_path": source_path,
        "preprocessor": preprocessor, "strength": 1.0, "start_step": 0.0, "end_step": 1.0,
        "mask": {"type": "rectangle", "points": [{"x": 0, "y": 0}],
                 "bounds": {"x": 0, "y": 0, "width": size, "height": size}},
        "prompt": None, "negative_prompt": None,
    }


def _smoke(tmp_path, model_name, cn_record_id, base_dirs, preprocessor="canny",
           size=512, steps=8):
    import numpy as np
    from PIL import Image

    from utils.direct_generator import DirectGenerator

    for required in [os.path.join(MODELS_DIR, "controlnet", cn_record_id)] + base_dirs:
        if not os.path.exists(required):
            pytest.skip(f"install {os.path.basename(required)} from the Foundry to run this smoke")

    array, layer = _circle_layer(tmp_path, preprocessor, size)
    guided = {"controlnet": [layer], "reference_images": [], "inpaint": None,
              "denoising_strength": 0.75}

    def run(out_name, guided_payload):
        out_dir = tmp_path / out_name
        out_dir.mkdir()
        gen = DirectGenerator(models_dir=MODELS_DIR, output_dir=str(out_dir))
        result = gen._generate_sync(
            "a stained glass window", "", size, size, steps, 7.5, 7, model_name,
            "euler", lambda *a: None, str(out_dir), None, None, guided_payload,
        )
        return np.asarray(Image.open(out_dir / "generated.png"), dtype=np.int32), result

    guided_image, result = run("guided", guided)
    plain_image, _ = run("plain", None)
    assert result["guided"]["controlnet"][0]["record_id"] == cn_record_id
    diff = np.abs(guided_image - plain_image).mean()
    assert diff > 10, "the control layer did not change the output - ControlNet is not real"
    return array, guided_image


def test_sdxl_union_scribble_constrains_output(tmp_path):
    _smoke(tmp_path, "sdxl-base", "controlnet-union-sdxl",
           [os.path.join(MODELS_DIR, "checkpoints")], preprocessor="scribble",
           size=1024, steps=8)


def test_flux_union_canny_constrains_output(tmp_path):
    _smoke(tmp_path, "flux-dev", "controlnet-union-flux",
           [os.path.join(MODELS_DIR, "checkpoints")], preprocessor="canny",
           size=512, steps=4)


def test_sd35_large_canny_constrains_output(tmp_path):
    _smoke(tmp_path, "sd3.5-large", "controlnet-canny-sd35",
           [os.path.join(MODELS_DIR, "diffusers", "sd3.5-large")], preprocessor="canny",
           size=512, steps=8)
```

Run the stub-safe check (they must all SKIP without `VS_REAL_SMOKE`):

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_smoke_controlnet_local.py -v 2>&1 | tail -8; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: 4 skipped.

- [ ] **Step 2: Full backend sweep**

```bash
backend/venv/Scripts/python.exe -m pytest backend/tests/ -q 2>&1 | tail -6; echo "EXIT:${PIPESTATUS[0]}"
```
Expected: PASS (0 failures; env-gated smokes skip).

- [ ] **Step 3: Full frontend sweep**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run typecheck 2>&1 | tail -3 && npx vitest run 2>&1 | tail -6 && npm run build 2>&1 | tail -4
```
Expected: all green.

- [ ] **Step 4: Commit, push, open the PR**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git add backend/tests/test_guided_smoke_controlnet_local.py && git commit -m "test(guided): per-family real-model ControlNet smokes (#34 PR3)" && git push -u origin feat/guided-passes-pr3-controlnet-expansion
```

Open the PR with `gh pr create` - title `Guided passes PR3: FLUX/SD3.5 ControlNet + SDXL union + fit gating + UI reconciliation (#34)`; body summarizes: FLUX/SD3.5 Large ControlNet via union/dedicated records, scribble+normal on SDXL via xinsir union, the hardware-fit 422 gate with basis labels, dead-control retirement (referenceMode selector + ControlNetPanel), layer-properties install/compat surfacing, and the honest caveats: real-model smokes self-skip until the weights are installed through the Foundry consent flow (union-sdxl ~2.4 GB is the cheapest maintainer gate), and SD 3.5 / flux-schnell declines are per-checkpoint by design.

- [ ] **Step 5: Watch CI, then PAUSE**

```bash
gh pr checks --watch
```
**PAUSE - do not merge without the user's go-ahead (per release process).**

---

## Self-Review (done at authoring time)

- **Spec coverage:** PR3 row = FLUX + SD3.5 ControlNet (Tasks 1-6), hardware-fit gating (Task 4/6), UI reconciliation (Tasks 8-9); xinsir union deferred from PR2 (Tasks 1-2); "no dead controls remain in GeneratePanel" (Task 8); acceptance "unfittable combos refuse with measured reason" (Task 4's basis-labeled message). Segmentation is explicitly NOT offered anywhere (the spec's preprocessor list mentions it generically, but no PR3 acceptance requires it; the UI now only offers real preprocessors - noted as out of scope below).
- **Type consistency:** `ResolvedControlLayer.loader/control_mode` names match across registry (Task 2), pipelines (Task 3), generator (Task 5), report (Task 5), and tests. `resolveControlNetPreflight` options shape matches Tasks 7/8/9 usage.
- **Placeholder scan:** every step carries complete code or an exact command; no TBDs.

## Out of scope (explicit)

- Segmentation preprocessor (needs a transformers-based annotator; nothing in the app offers it after Task 8 removes the dead panel that listed it).
- IP-Adapter masked multi-reference (PR4).
- FLUX ControlNet + flux-fill inpainting (no diffusers path; declined with reason).
- Per-condition VRAM calibration data (`GUIDED_PASS_OVERHEAD_BYTES` seeds; `tools/calibrate_vram.py` refines later as data edits).
