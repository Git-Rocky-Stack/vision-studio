# Guided Passes PR4: IP-Adapter Masked Multi-Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two or more visible reference-image layers become real IP-Adapter multi-reference conditioning: per-layer masks honored on SD 1.5 / SDXL (`ip_adapter_masks`), FLUX applies references globally with an explicit surfaced notice, SD 3.5 declines honestly, and all adapter + encoder weights arrive through consent-gated Foundry records.

**Architecture:** A new `backend/guided/ip_adapter.py` mirrors `controlnet_registry.py` (resolution seam raising `GuidedValidationError`) plus a `loras_applied`-style always-restore context manager around diffusers' `load_ip_adapter`/`unload_ip_adapter`. `passes.py` routes 2+ references to `kind="none"` with an `ip_references` list instead of the PR1 422. The endpoint pre-flights the same seam and extends the PR3 fit gate with adapter + encoder header bytes. The frontend gets a verbatim mirror (`referenceSupport.ts`), reference-layer strength threading, per-layer install/compat state, and a job-result notices strip.

**Tech Stack:** FastAPI + diffusers 0.37.1 + transformers 5.5.4 (backend venv, CPython 3.12); React 19 + TypeScript + Zustand + Vitest (frontend).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-guided-passes-end-to-end-design.md` (PR row 4 + sections 1, 2, 3, 5).
- Honesty rails: guided fields work or fail loudly; measured never masquerades as estimated; user-facing messages carry NO filesystem paths (basenames / record ids / layer names only).
- Stub-CI-safe: every `guided/` module imports with no torch / diffusers / transformers present; heavy imports live inside functions.
- No runtime hub downloads: weights load ONLY from installed Foundry record dirs.
- Frontend mirror files stay in sync with backend maps/messages VERBATIM.
- Backend tests: `backend/venv/Scripts/python.exe -m pytest` (bare `python` is a dep-less system 3.14). Check piped exit codes with `echo "EXIT:${PIPESTATUS[0]}"`.
- Commits via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` first; `git branch --show-current` in the same call; never `git add -A` (LICENSE.txt stays untracked); never `--no-verify`.
- Branch: `feat/guided-passes-pr4-ip-adapter`. No subagents - all work inline.
- Gates before PR: `npm run typecheck`, `npm test`, `npm run build`, full backend pytest.

## Verified ground truth (2026-07-05, diffusers 0.37.1 in the venv + HF API)

- `IPAdapterMixin` (SD 1.5/SDXL txt2img, img2img, inpaint, ControlNet, ControlNet union + variants): `load_ip_adapter(dir, subfolder, weight_name, image_encoder_folder)` loads from a local dir (`_get_model_file` checks `dir/weights_name` then `dir/subfolder/weights_name`); ONE adapter accepts a LIST of images (`ip_adapter_image=[[img1, img2]]`, outer length == adapter count); per-image masks ride `cross_attention_kwargs={"ip_adapter_masks": [tensor(1, N, H, W)]}` (`IPAdapterMaskProcessor.preprocess([m1, m2], height=H, width=W)` returns `(N, 1, H, W)` - reshape); per-image scales via `set_ip_adapter_scale([[s1, s2]])` (list entries pass through `_maybe_expand_lora_scales` unchanged; the attn processor zips scale[i] per image and errors on any length mismatch). `unload_ip_adapter()` restores original attention processors on the SHARED unet.
- `FluxIPAdapterMixin` (FluxPipeline, FluxImg2ImgPipeline, FluxControlNetPipeline; NOT FluxFillPipeline, NOT FluxControlNetImg2Img): one image PER ADAPTER INSTANCE (embeds ride the batch dim) - N references = `weight_name=[w]*N` from one local dir; `set_ip_adapter_scale([s1..sN])`; NO mask support; the pipeline auto-creates a zeros negative reference. XLabs key remapping (`double_blocks.`, `ip_adapter_proj_model.`) is built into the loader.
- `SD3IPAdapterMixin`: ONE adapter, ONE `ip_adapter_image` (no list support anywhere in the SD3 embed path) -> **multi-reference on SD 3.5 must decline**; the spec's "all families" meets ground truth here, mirroring the PR3 `sd3.5-medium` decline precedent.
- If the pipeline already has a registered `image_encoder`, `load_ip_adapter` skips its own encoder download path entirely - pre-registering our record-loaded encoder is the no-hub-download seam. Every target pipeline class has the `image_encoder` attribute post-init.
- HF repos (all ungated): `h94/IP-Adapter` (apache-2.0) - `models/ip-adapter_sd15.safetensors` 45 MB, `sdxl_models/ip-adapter_sdxl_vit-h.safetensors` 698 MB, shared ViT-H encoder `models/image_encoder/{config.json, model.safetensors}` 2.53 GB; `XLabs-AI/flux-ip-adapter` (flux-1-dev-non-commercial) - `ip_adapter.safetensors` 982 MB; `openai/clip-vit-large-patch14` (no declared license) - `model.safetensors` 1.71 GB + configs.
- `hf_hub_download(..., local_dir=target)` preserves repo-relative nesting - `files` allowlists land exactly where the loaders expect.
- Frontend today: `resolveCanvasControlLayers` does NOT thread `strength` on reference layers (backend schema already has it, default 1.0); `guidedKind` in GeneratePanel treats ANY reference count as `img2img` (wrong for 2+ after PR4); job-result `guided.notices` are surfaced NOWHERE in the UI yet.

---

### Task 1: Foundry records + `ip-adapter` artifact type

**Files:**
- Modify: `backend/foundry/verified-catalog.json` (append 5 records after `controlnet-depth-sd35`)
- Modify: `backend/foundry/model_record.py:17` (artifact_type comment)
- Modify: `backend/foundry/download_manager.py` (`_target_dir` + `_ARTIFACT_SUBDIR`)
- Modify: `backend/foundry/registry.py` (`_ARTIFACT_SUBDIR`)
- Test: `backend/tests/test_foundry_ip_adapter_records.py` (new)

**Interfaces:**
- Produces: catalog ids `ip-adapter-sd15`, `ip-adapter-sdxl`, `ip-adapter-encoder-vit-h`, `ip-adapter-flux`, `ip-adapter-encoder-clip-vit-l`; install dirs `models/ip-adapter/<id>/` with repo-relative file nesting preserved.

- [ ] **Step 1: Write the failing tests**

```python
"""#34 PR4: IP-Adapter catalog records + the ip-adapter artifact type."""
import json
import os
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG = json.loads(
    (BACKEND_ROOT / "foundry" / "verified-catalog.json").read_text(encoding="utf-8"))

ADAPTER_IDS = {
    "ip-adapter-sd15": "sd15",
    "ip-adapter-sdxl": "sdxl",
    "ip-adapter-flux": "flux",
}
ENCODER_IDS = ["ip-adapter-encoder-vit-h", "ip-adapter-encoder-clip-vit-l"]


def test_adapter_records_exist_with_families():
    for record_id, family in ADAPTER_IDS.items():
        record = CATALOG[record_id]
        assert record["artifact_type"] == "ip-adapter"
        assert record["base_architecture"] == family
        assert record["format"] == "safetensors"
        assert record["gated"] is False


def test_encoder_records_exist():
    for record_id in ENCODER_IDS:
        record = CATALOG[record_id]
        assert record["artifact_type"] == "ip-adapter"
        assert record["format"] == "safetensors"


def test_files_allowlists_scope_the_downloads():
    assert CATALOG["ip-adapter-sd15"]["files"] == [
        "models/ip-adapter_sd15.safetensors"]
    assert CATALOG["ip-adapter-sdxl"]["files"] == [
        "sdxl_models/ip-adapter_sdxl_vit-h.safetensors"]
    assert CATALOG["ip-adapter-encoder-vit-h"]["files"] == [
        "models/image_encoder/config.json",
        "models/image_encoder/model.safetensors"]
    assert CATALOG["ip-adapter-flux"]["files"] == ["ip_adapter.safetensors"]
    assert CATALOG["ip-adapter-encoder-clip-vit-l"]["files"] == [
        "config.json", "preprocessor_config.json", "model.safetensors"]


def test_encoder_companions_link_adapters_to_their_encoder():
    assert CATALOG["ip-adapter-sd15"]["companions"] == ["ip-adapter-encoder-vit-h"]
    assert CATALOG["ip-adapter-sdxl"]["companions"] == ["ip-adapter-encoder-vit-h"]
    assert CATALOG["ip-adapter-flux"]["companions"] == ["ip-adapter-encoder-clip-vit-l"]


def test_download_target_is_a_per_id_dir():
    from foundry.download_manager import DownloadManager

    manager = DownloadManager.__new__(DownloadManager)
    manager._models_dir = os.path.join("models-root")
    target = manager._target_dir({"artifact_type": "ip-adapter", "id": "ip-adapter-sd15"})
    assert target == os.path.join("models-root", "ip-adapter", "ip-adapter-sd15")


def test_registry_detects_installed_ip_adapter_dirs(tmp_path):
    from foundry.registry import _ARTIFACT_SUBDIR

    assert _ARTIFACT_SUBDIR["ip-adapter"] == "ip-adapter"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_foundry_ip_adapter_records.py -v; echo "EXIT:$?"`
Expected: FAIL with `KeyError: 'ip-adapter-sd15'`

- [ ] **Step 3: Append the 5 catalog records**

In `backend/foundry/verified-catalog.json`, immediately after the `"controlnet-depth-sd35"` entry's closing brace + comma, insert (keys match the top-level dict-keyed-by-id shape):

```json
  "ip-adapter-sd15": {
    "id": "ip-adapter-sd15",
    "name": "IP-Adapter (SD 1.5)",
    "artifact_type": "ip-adapter",
    "capability": "image",
    "base_architecture": "sd15",
    "source": "huggingface",
    "repo_id": "h94/IP-Adapter",
    "revision": "main",
    "aux_repo_id": null,
    "size": "~45 MB",
    "status": "not_found",
    "tier": "verified",
    "quality": "balanced",
    "runtime": "local",
    "hardware_class": "laptop",
    "vram": "~0.1 GB",
    "description": "Image-prompt adapter for SD 1.5: masked multi-reference conditioning through the shared ViT-H image encoder.",
    "license": "apache-2.0",
    "gated": false,
    "format": "safetensors",
    "companions": ["ip-adapter-encoder-vit-h"],
    "measured_vram_bytes": null,
    "files": ["models/ip-adapter_sd15.safetensors"]
  },
  "ip-adapter-sdxl": {
    "id": "ip-adapter-sdxl",
    "name": "IP-Adapter (SDXL)",
    "artifact_type": "ip-adapter",
    "capability": "image",
    "base_architecture": "sdxl",
    "source": "huggingface",
    "repo_id": "h94/IP-Adapter",
    "revision": "main",
    "aux_repo_id": null,
    "size": "~0.7 GB",
    "status": "not_found",
    "tier": "verified",
    "quality": "balanced",
    "runtime": "local",
    "hardware_class": "creator",
    "vram": "~0.4 GB",
    "description": "Image-prompt adapter for SDXL (ViT-H variant): masked multi-reference conditioning sharing the SD 1.5 image encoder.",
    "license": "apache-2.0",
    "gated": false,
    "format": "safetensors",
    "companions": ["ip-adapter-encoder-vit-h"],
    "measured_vram_bytes": null,
    "files": ["sdxl_models/ip-adapter_sdxl_vit-h.safetensors"]
  },
  "ip-adapter-encoder-vit-h": {
    "id": "ip-adapter-encoder-vit-h",
    "name": "IP-Adapter Image Encoder (ViT-H)",
    "artifact_type": "ip-adapter",
    "capability": "image",
    "base_architecture": "unknown",
    "source": "huggingface",
    "repo_id": "h94/IP-Adapter",
    "revision": "main",
    "aux_repo_id": null,
    "size": "~2.5 GB",
    "status": "not_found",
    "tier": "verified",
    "quality": "balanced",
    "runtime": "local",
    "hardware_class": "creator",
    "vram": "~1.3 GB",
    "description": "CLIP ViT-H image encoder shared by the SD 1.5 and SDXL IP-Adapters.",
    "license": "apache-2.0",
    "gated": false,
    "format": "safetensors",
    "companions": [],
    "measured_vram_bytes": null,
    "files": ["models/image_encoder/config.json", "models/image_encoder/model.safetensors"]
  },
  "ip-adapter-flux": {
    "id": "ip-adapter-flux",
    "name": "IP-Adapter (FLUX.1 dev)",
    "artifact_type": "ip-adapter",
    "capability": "image",
    "base_architecture": "flux",
    "source": "huggingface",
    "repo_id": "XLabs-AI/flux-ip-adapter",
    "revision": "main",
    "aux_repo_id": null,
    "size": "~1.0 GB",
    "status": "not_found",
    "tier": "verified",
    "quality": "balanced",
    "runtime": "local",
    "hardware_class": "workstation",
    "vram": "~0.5 GB",
    "description": "XLabs image-prompt adapter for FLUX.1 [dev]: references apply to the whole image (no per-layer masks on FLUX).",
    "license": "flux-1-dev-non-commercial",
    "gated": false,
    "format": "safetensors",
    "companions": ["ip-adapter-encoder-clip-vit-l"],
    "measured_vram_bytes": null,
    "files": ["ip_adapter.safetensors"]
  },
  "ip-adapter-encoder-clip-vit-l": {
    "id": "ip-adapter-encoder-clip-vit-l",
    "name": "IP-Adapter Image Encoder (CLIP ViT-L/14)",
    "artifact_type": "ip-adapter",
    "capability": "image",
    "base_architecture": "unknown",
    "source": "huggingface",
    "repo_id": "openai/clip-vit-large-patch14",
    "revision": "main",
    "aux_repo_id": null,
    "size": "~1.7 GB",
    "status": "not_found",
    "tier": "verified",
    "quality": "balanced",
    "runtime": "local",
    "hardware_class": "creator",
    "vram": "~0.9 GB",
    "description": "OpenAI CLIP ViT-L/14 image encoder for the FLUX IP-Adapter.",
    "license": null,
    "gated": false,
    "format": "safetensors",
    "companions": [],
    "measured_vram_bytes": null,
    "files": ["config.json", "preprocessor_config.json", "model.safetensors"]
  },
```

(The `openai/clip-vit-large-patch14` repo declares no license on HF - `license: null` mirrors the `annotator-midas` precedent; never invent one.)

- [ ] **Step 4: Register the artifact type in all three layout maps**

`backend/foundry/model_record.py:17` - extend the comment:

```python
    artifact_type: str          # checkpoint | diffusers-pipeline | lora | vae | controlnet | ip-adapter | embedding | motion-adapter | annotator
```

`backend/foundry/download_manager.py` `_target_dir` - replace the controlnet branch:

```python
        if artifact_type in {"controlnet", "ip-adapter"}:
            # Multi-file diffusers-format repos get a per-id dir so two
            # records can never collide on config.json. Matches
            # registry._is_present, which already expects <type>/<id>/.
            return os.path.join(self._models_dir, artifact_type, record["id"])
```

`backend/foundry/download_manager.py` `_ARTIFACT_SUBDIR` and `backend/foundry/registry.py` `_ARTIFACT_SUBDIR` - add to both:

```python
    "ip-adapter": "ip-adapter",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_foundry_ip_adapter_records.py tests/test_foundry_controlnet_records.py -v; echo "EXIT:$?"`
Expected: PASS (and the PR3 record tests stay green)

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/foundry/verified-catalog.json backend/foundry/model_record.py backend/foundry/download_manager.py backend/foundry/registry.py backend/tests/test_foundry_ip_adapter_records.py && git branch --show-current && git commit -m "feat(guided): IP-Adapter Foundry records + ip-adapter artifact type (#34 PR4)"
```

---

### Task 2: `passes.py` routes 2+ references to the IP-Adapter plan

**Files:**
- Modify: `backend/guided/passes.py`
- Test: `backend/tests/test_guided_request.py` (extend), `backend/tests/test_guided_passes.py` if present (grep for `MSG_MULTI_REFERENCE_NOT_YET` usages and update every one)

**Interfaces:**
- Produces: `GuidedPassPlan.ip_references: List[Dict]` (populated ONLY for 2+ references; `kind` stays `"none"`); reworded `NOTICE_REFERENCE_MASK_IGNORED`; `MSG_MULTI_REFERENCE_NOT_YET` deleted.
- Consumes: nothing new.

- [ ] **Step 1: Find every consumer of the old decline**

Run: `cd /c/vision-studio && grep -rn "MSG_MULTI_REFERENCE_NOT_YET\|Multiple reference images need" backend/ --include="*.py"`
Expected: the constant in `passes.py` plus its test assertions. Every hit gets updated in this task.

- [ ] **Step 2: Write the failing tests** (append to the passes test module that asserts the old 422; adjust the existing multi-ref test in place)

```python
def test_two_references_resolve_to_ip_adapter_plan():
    from guided.passes import resolve_guided_pass

    refs = [
        {"layer_id": "r1", "source_path": "a.png", "mask": MASK, "strength": 1.2},
        {"layer_id": "r2", "source_path": "b.png", "mask": MASK, "strength": 0.8},
    ]
    plan = resolve_guided_pass([], refs, None, 0.75)
    assert plan.kind == "none"
    assert plan.image_path is None
    assert [ref["layer_id"] for ref in plan.ip_references] == ["r1", "r2"]
    assert plan.ip_references[0]["strength"] == 1.2


def test_single_reference_stays_img2img_with_reworded_notice():
    from guided.passes import NOTICE_REFERENCE_MASK_IGNORED, resolve_guided_pass

    plan = resolve_guided_pass(
        [], [{"layer_id": "r1", "source_path": "a.png", "mask": MASK}], None, 0.6)
    assert plan.kind == "img2img"
    assert plan.ip_references == []
    assert NOTICE_REFERENCE_MASK_IGNORED in plan.notices
    assert "second visible reference layer" in NOTICE_REFERENCE_MASK_IGNORED


def test_inpaint_plus_references_still_declines():
    import pytest as _pytest

    from guided.passes import GuidedValidationError, resolve_guided_pass

    with _pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            [], [{"layer_id": "r1", "source_path": "a.png", "mask": MASK}],
            {"layer_id": "i1", "image_path": "b.png", "mask": MASK}, 0.75)
```

- [ ] **Step 3: Run to verify failure**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_request.py -v; echo "EXIT:$?"`
Expected: FAIL (`ip_references` attribute missing / old GuidedValidationError raised for 2 refs)

- [ ] **Step 4: Implement in `passes.py`**

Delete `MSG_MULTI_REFERENCE_NOT_YET`. Replace `NOTICE_REFERENCE_MASK_IGNORED`:

```python
NOTICE_REFERENCE_MASK_IGNORED = (
    "Reference mask not applied: a single reference image runs full-image "
    "img2img - add a second visible reference layer to use masked "
    "IP-Adapter referencing."
)
```

Extend the dataclass:

```python
    # #34 PR4: 2+ reference layers -> IP-Adapter multi-reference (kind stays
    # "none"; family/record validation lives in guided.ip_adapter).
    ip_references: List[Dict[str, Any]] = field(default_factory=list)
```

Replace the reference handling in `resolve_guided_pass` (the `len(reference_images) > 1` raise is deleted; the inpaint+reference decline stays FIRST):

```python
    if inpaint and reference_images:
        raise GuidedValidationError(MSG_INPAINT_PLUS_REFERENCE)
```

and after the `if inpaint:` return block:

```python
    if len(reference_images) >= 2:
        return GuidedPassPlan(
            kind="none",
            notices=notices,
            controlnet=controlnet,
            ip_references=[dict(ref) for ref in reference_images],
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
```

Update the module docstring's decline list accordingly.

- [ ] **Step 5: Run the passes + request tests**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_request.py tests/test_guided_passes.py -v 2>/dev/null || ./venv/Scripts/python.exe -m pytest tests/test_guided_request.py -v; echo "EXIT:$?"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/guided/passes.py backend/tests/ && git branch --show-current && git commit -m "feat(guided): 2+ reference layers resolve to an IP-Adapter plan (#34 PR4)"
```

---

### Task 3: `guided/ip_adapter.py` - the resolution seam

**Files:**
- Create: `backend/guided/ip_adapter.py`
- Test: `backend/tests/test_guided_ip_adapter.py` (new)

**Interfaces:**
- Produces: `LOADER_SD = "ip-sd"`, `LOADER_FLUX = "ip-flux"`, `SUPPORTED_FAMILIES`, `MSG_SD35_SINGLE_IMAGE`, `NOTICE_REFERENCE_MASKS_GLOBAL`, `ResolvedIPAdapterStack(adapter_record_id, encoder_record_id, adapter_subfolder, weight_name, encoder_subpath, loader, masked, references)` with `.instances` and `.notices` properties, and `resolve_ip_reference_stack(references, family, resolve_record, model_id=None) -> Optional[ResolvedIPAdapterStack]`.
- Consumes: `GuidedValidationError` and `_require_installed` message shape from Task 2 / PR2.

- [ ] **Step 1: Write the failing tests**

```python
"""#34 PR4: reference layers -> installed IP-Adapter records (pure, stub-safe)."""
import pathlib
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from guided.ip_adapter import (  # noqa: E402
    LOADER_FLUX,
    LOADER_SD,
    MSG_SD35_SINGLE_IMAGE,
    NOTICE_REFERENCE_MASKS_GLOBAL,
    resolve_ip_reference_stack,
)
from guided.passes import GuidedValidationError  # noqa: E402

REFS = [
    {"layer_id": "r1", "layer_name": "Face", "source_path": "a.png", "strength": 1.2,
     "mask": {"type": "rectangle", "points": [{"x": 0, "y": 0}],
              "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}},
    {"layer_id": "r2", "layer_name": "Style", "source_path": "b.png", "strength": 0.8,
     "mask": {"type": "rectangle", "points": [{"x": 4, "y": 4}],
              "bounds": {"x": 4, "y": 4, "width": 4, "height": 4}}},
]


def _ready(record_id):
    return {"id": record_id, "name": record_id, "status": "ready"}


def test_single_or_no_reference_is_not_this_seams_business():
    assert resolve_ip_reference_stack([], "sd15", _ready) is None
    assert resolve_ip_reference_stack([REFS[0]], "sd15", _ready) is None


def test_sd15_resolves_one_masked_adapter():
    stack = resolve_ip_reference_stack(REFS, "sd15", _ready)
    assert stack.adapter_record_id == "ip-adapter-sd15"
    assert stack.encoder_record_id == "ip-adapter-encoder-vit-h"
    assert stack.adapter_subfolder == "models"
    assert stack.weight_name == "ip-adapter_sd15.safetensors"
    assert stack.loader == LOADER_SD
    assert stack.masked is True
    assert stack.instances == 1
    assert stack.notices == []
    assert [ref["layer_id"] for ref in stack.references] == ["r1", "r2"]


def test_sdxl_resolves_the_vit_h_variant_with_shared_encoder():
    stack = resolve_ip_reference_stack(REFS, "sdxl", _ready)
    assert stack.adapter_record_id == "ip-adapter-sdxl"
    assert stack.adapter_subfolder == "sdxl_models"
    assert stack.weight_name == "ip-adapter_sdxl_vit-h.safetensors"
    assert stack.encoder_record_id == "ip-adapter-encoder-vit-h"
    assert stack.masked is True


def test_flux_loads_one_instance_per_reference_and_carries_the_global_notice():
    stack = resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-dev")
    assert stack.adapter_record_id == "ip-adapter-flux"
    assert stack.encoder_record_id == "ip-adapter-encoder-clip-vit-l"
    assert stack.loader == LOADER_FLUX
    assert stack.masked is False
    assert stack.instances == 2
    assert stack.notices == [NOTICE_REFERENCE_MASKS_GLOBAL]


def test_sd35_declines_multi_reference():
    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "sd35", _ready)
    assert str(exc.value) == MSG_SD35_SINGLE_IMAGE


def test_unknown_family_declines_with_supported_list():
    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "sd2", _ready)
    assert "Multiple reference images are not supported" in str(exc.value)


def test_flux_schnell_declines_by_checkpoint_id():
    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-schnell")
    assert "distilled" in str(exc.value)
    assert "FLUX.1 [dev]" in str(exc.value)


def test_missing_adapter_or_encoder_names_the_record():
    def missing_encoder(record_id):
        status = "not_found" if record_id == "ip-adapter-encoder-vit-h" else "ready"
        return {"id": record_id, "name": record_id, "status": status}

    with pytest.raises(GuidedValidationError) as exc:
        resolve_ip_reference_stack(REFS, "sd15", missing_encoder)
    assert "ip-adapter-encoder-vit-h" in str(exc.value)
    assert "Foundry" in str(exc.value)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_ip_adapter.py -v; echo "EXIT:$?"`
Expected: FAIL with `ModuleNotFoundError: guided.ip_adapter`

- [ ] **Step 3: Create the module (resolution half)**

```python
"""#34 PR4: reference-image layers -> per-family IP-Adapter execution.

THE multi-reference honesty seam, mirroring controlnet_registry: two or more
visible reference layers either resolve to installed adapter + encoder
records for the active family, or raise GuidedValidationError with a
user-facing, path-free message. SD 1.5 / SDXL honor per-layer masks via
diffusers ip_adapter_masks; FLUX applies references globally and says so
through an explicit notice; SD 3.5 declines (diffusers 0.37.x ships a
single-image SD3 IP-Adapter - verified against the venv source). Keep
src/features/generation/referenceSupport.ts in sync with every map and
message below. No heavy imports at module scope - loads on stub CI.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

# Same installed-record gate and message shape as the ControlNet seam - the
# two registries must decline identically, so share the helper.
from guided.controlnet_registry import _require_installed
from guided.passes import GuidedValidationError

RecordResolver = Callable[[str], Optional[Dict[str, Any]]]

FAMILY_LABELS = {"sd15": "SD 1.5", "sdxl": "SDXL", "flux": "FLUX", "sd35": "SD 3.5"}

# Loader vocabulary consumed by ip_adapter_applied / direct_generator.
# "ip-sd": IPAdapterMixin - ONE adapter, a list of images, per-image masks.
# "ip-flux": FluxIPAdapterMixin - one adapter INSTANCE per image, no masks.
LOADER_SD = "ip-sd"
LOADER_FLUX = "ip-flux"

_ADAPTERS: Dict[str, Dict[str, Any]] = {
    "sd15": {
        "adapter_record": "ip-adapter-sd15",
        "adapter_subfolder": "models",
        "weight_name": "ip-adapter_sd15.safetensors",
        "encoder_record": "ip-adapter-encoder-vit-h",
        "encoder_subpath": os.path.join("models", "image_encoder"),
        "loader": LOADER_SD,
        "masked": True,
    },
    "sdxl": {
        "adapter_record": "ip-adapter-sdxl",
        "adapter_subfolder": "sdxl_models",
        "weight_name": "ip-adapter_sdxl_vit-h.safetensors",
        "encoder_record": "ip-adapter-encoder-vit-h",
        "encoder_subpath": os.path.join("models", "image_encoder"),
        "loader": LOADER_SD,
        "masked": True,
    },
    "flux": {
        "adapter_record": "ip-adapter-flux",
        "adapter_subfolder": "",
        "weight_name": "ip_adapter.safetensors",
        "encoder_record": "ip-adapter-encoder-clip-vit-l",
        "encoder_subpath": "",
        "loader": LOADER_FLUX,
        "masked": False,
    },
}

SUPPORTED_FAMILIES = set(_ADAPTERS)

# Known-incompatible catalog checkpoints inside supported families (the PR3
# ControlNet decline precedent). User imports resolve by family and fail
# loudly at load time if truly mismatched.
_CHECKPOINT_DECLINES = {
    "flux-schnell": (
        "FLUX.1 [schnell] is a distilled checkpoint the FLUX IP-Adapter does "
        "not support - switch to FLUX.1 [dev]."
    ),
}

MSG_SD35_SINGLE_IMAGE = (
    "The SD 3.5 IP-Adapter accepts a single image, so multiple reference "
    "layers cannot run on SD 3.5 - keep one visible reference image layer "
    "or switch to SD 1.5, SDXL, or FLUX.1 [dev]."
)

NOTICE_REFERENCE_MASKS_GLOBAL = (
    "Reference masks are not supported on FLUX - every reference image was "
    "applied to the whole generation."
)


@dataclass(frozen=True)
class ResolvedIPAdapterStack:
    adapter_record_id: str
    encoder_record_id: str
    adapter_subfolder: str
    weight_name: str
    encoder_subpath: str
    loader: str
    masked: bool
    references: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def instances(self) -> int:
        """Adapter copies loaded into memory (FLUX: one per reference)."""
        return len(self.references) if self.loader == LOADER_FLUX else 1

    @property
    def notices(self) -> List[str]:
        return [] if self.masked else [NOTICE_REFERENCE_MASKS_GLOBAL]


def resolve_ip_reference_stack(
    references: Optional[List[Dict[str, Any]]],
    family: Optional[str],
    resolve_record: RecordResolver,
    model_id: Optional[str] = None,
) -> Optional[ResolvedIPAdapterStack]:
    """2+ references -> installed records, or a user-facing decline.

    A single reference is img2img (guided.passes) - not this seam's business.
    """
    references = references or []
    if len(references) < 2:
        return None

    family = family or ""
    if family == "sd35":
        raise GuidedValidationError(MSG_SD35_SINGLE_IMAGE)
    spec = _ADAPTERS.get(family)
    if spec is None:
        label = FAMILY_LABELS.get(family, family or "this model")
        raise GuidedValidationError(
            f"Multiple reference images are not supported on {label} - keep "
            "one visible reference image layer or switch to an SD 1.5, SDXL, "
            "or FLUX.1 [dev] checkpoint."
        )
    decline = _CHECKPOINT_DECLINES.get(model_id or "")
    if decline:
        raise GuidedValidationError(decline)

    _require_installed(spec["adapter_record"], resolve_record, "IP-Adapter model")
    _require_installed(spec["encoder_record"], resolve_record, "IP-Adapter image encoder")
    return ResolvedIPAdapterStack(
        adapter_record_id=spec["adapter_record"],
        encoder_record_id=spec["encoder_record"],
        adapter_subfolder=spec["adapter_subfolder"],
        weight_name=spec["weight_name"],
        encoder_subpath=spec["encoder_subpath"],
        loader=spec["loader"],
        masked=spec["masked"],
        references=[dict(ref) for ref in references],
    )
```

- [ ] **Step 4: Run to verify pass + stub-import safety**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_ip_adapter.py -v && ./venv/Scripts/python.exe -c "import guided.ip_adapter; print('imports clean')"; echo "EXIT:$?"`
Expected: PASS + `imports clean`

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/guided/ip_adapter.py backend/tests/test_guided_ip_adapter.py && git branch --show-current && git commit -m "feat(guided): IP-Adapter resolution seam - families, declines, records (#34 PR4)"
```

---

### Task 4: `guided/ip_adapter.py` - apply/scale/mask helpers + always-restore context manager

**Files:**
- Modify: `backend/guided/ip_adapter.py` (append)
- Test: `backend/tests/test_guided_ip_adapter.py` (extend; the apply tests skip without torch like `test_guided_pipelines.py`)

**Interfaces:**
- Produces: `ip_adapter_scales(stack) -> list`, `ip_adapter_mask_tensor(mask_images, height, width) -> list` (a one-element list holding the `[1, N, H, W]` tensor), `_load_image_encoder(encoder_dir, torch_dtype, device)` (monkeypatch seam), `ip_adapter_applied(pipeline, stack, adapter_dir, encoder_dir, device)` context manager.
- Consumes: `ResolvedIPAdapterStack` from Task 3.

- [ ] **Step 1: Write the failing tests** (append to `test_guided_ip_adapter.py`)

```python
def test_sd_scales_are_one_adapter_with_per_image_scales():
    from guided.ip_adapter import ip_adapter_scales

    stack = resolve_ip_reference_stack(REFS, "sd15", _ready)
    assert ip_adapter_scales(stack) == [[1.2, 0.8]]


def test_flux_scales_are_one_scalar_per_instance():
    from guided.ip_adapter import ip_adapter_scales

    stack = resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-dev")
    assert ip_adapter_scales(stack) == [1.2, 0.8]


class _FakeIPPipeline:
    """Records the diffusers IP-Adapter mixin calls in order."""

    dtype = "fp16"

    def __init__(self):
        self.events = []
        self.image_encoder = None

    def register_modules(self, **modules):
        self.events.append(("register", sorted(modules)))
        self.image_encoder = modules.get("image_encoder")

    def load_ip_adapter(self, path, **kwargs):
        self.events.append(("load", kwargs))

    def set_ip_adapter_scale(self, scale):
        self.events.append(("scale", scale))

    def unload_ip_adapter(self):
        self.events.append(("unload",))


def _torch_available():
    try:
        import torch  # noqa: F401

        return True
    except Exception:
        return False


@pytest.mark.skipif(not _torch_available(), reason="requires torch")
def test_mask_tensor_shape_matches_the_attention_contract(tmp_path):
    from PIL import Image

    from guided.ip_adapter import ip_adapter_mask_tensor

    masks = [Image.new("L", (64, 64), 255), Image.new("L", (64, 64), 0)]
    tensors = ip_adapter_mask_tensor(masks, height=128, width=128)
    assert len(tensors) == 1  # one entry per adapter
    assert tuple(tensors[0].shape) == (1, 2, 128, 128)


def test_ip_adapter_applied_loads_scales_and_always_unloads(monkeypatch):
    from guided import ip_adapter as ip_mod

    monkeypatch.setattr(ip_mod, "_load_image_encoder",
                        lambda encoder_dir, dtype, device: {"encoder": encoder_dir})
    stack = resolve_ip_reference_stack(REFS, "sd15", _ready)
    pipe = _FakeIPPipeline()
    with ip_mod.ip_adapter_applied(pipe, stack, "adapter-dir", "encoder-dir", "cpu"):
        pass
    kinds = [event[0] for event in pipe.events]
    assert kinds == ["register", "load", "scale", "unload"]
    load_kwargs = pipe.events[1][1]
    assert load_kwargs["weight_name"] == ["ip-adapter_sd15.safetensors"]
    assert load_kwargs["subfolder"] == "models"
    assert load_kwargs["image_encoder_folder"] is None
    assert pipe.events[2][1] == [[1.2, 0.8]]


def test_ip_adapter_applied_unloads_even_when_the_body_raises(monkeypatch):
    from guided import ip_adapter as ip_mod

    monkeypatch.setattr(ip_mod, "_load_image_encoder",
                        lambda encoder_dir, dtype, device: object())
    stack = resolve_ip_reference_stack(REFS, "flux", _ready, model_id="flux-dev")
    pipe = _FakeIPPipeline()
    with pytest.raises(RuntimeError):
        with ip_mod.ip_adapter_applied(pipe, stack, "a", "e", "cpu"):
            raise RuntimeError("boom")
    assert ("unload",) in pipe.events
    load_kwargs = [event for event in pipe.events if event[0] == "load"][0][1]
    assert load_kwargs["weight_name"] == ["ip_adapter.safetensors"] * 2
    assert "image_encoder_folder" not in load_kwargs
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_ip_adapter.py -v; echo "EXIT:$?"`
Expected: FAIL with `ImportError: ip_adapter_scales`

- [ ] **Step 3: Append the apply half to `guided/ip_adapter.py`**

```python
def ip_adapter_scales(stack: ResolvedIPAdapterStack) -> List[Any]:
    """Layer strengths -> the exact shape set_ip_adapter_scale expects.

    SD/SDXL: ONE adapter with a per-image scale list (list-of-lists - the
    attention processor zips scale[i] per masked image). FLUX: one scalar
    per adapter instance.
    """
    scales = [float(ref.get("strength", 1.0)) for ref in stack.references]
    if stack.loader == LOADER_FLUX:
        return scales
    return [scales]


def ip_adapter_mask_tensor(mask_images: List[Any], height: int, width: int) -> List[Any]:
    """Rasterized PIL masks -> [tensor(1, N, H, W)] for ip_adapter_masks.

    IPAdapterMaskProcessor.preprocess returns (N, 1, H, W); diffusers'
    masking contract wants one (1, num_images, H, W) tensor per adapter.
    """
    from diffusers.image_processor import IPAdapterMaskProcessor

    masks = IPAdapterMaskProcessor().preprocess(mask_images, height=height, width=width)
    return [masks.reshape(1, masks.shape[0], masks.shape[2], masks.shape[3])]


def _load_image_encoder(encoder_dir: str, torch_dtype: Any, device: str) -> Any:
    """CLIPVisionModelWithProjection from an installed encoder record dir.

    Module-level seam so unit tests can stub the heavy load. Both the ViT-H
    (h94) and CLIP ViT-L (openai) records load through this class.
    """
    from transformers import CLIPVisionModelWithProjection

    return CLIPVisionModelWithProjection.from_pretrained(
        encoder_dir, torch_dtype=torch_dtype
    ).to(device)


@contextmanager
def ip_adapter_applied(pipeline: Any, stack: ResolvedIPAdapterStack,
                       adapter_dir: str, encoder_dir: str, device: str):
    """Load adapter + encoder for ONE generation; ALWAYS restore afterward.

    The encoder registers on the pipeline BEFORE load_ip_adapter so diffusers
    skips its own hub-download path entirely (installed records are the only
    weight source) and derives the feature extractor from the real encoder
    config. unload_ip_adapter restores the original attention processors on
    the SHARED unet/transformer - without it the cached base pipeline would
    keep IP cross-attention wired on the next unguided job.
    """
    encoder = _load_image_encoder(encoder_dir, getattr(pipeline, "dtype", None), device)
    weights = [stack.weight_name] * stack.instances
    try:
        pipeline.register_modules(image_encoder=encoder)
        if stack.loader == LOADER_FLUX:
            pipeline.load_ip_adapter(
                adapter_dir,
                weight_name=weights,
                subfolder=stack.adapter_subfolder,
            )
        else:
            pipeline.load_ip_adapter(
                adapter_dir,
                subfolder=stack.adapter_subfolder,
                weight_name=weights,
                image_encoder_folder=None,
            )
        pipeline.set_ip_adapter_scale(ip_adapter_scales(stack))
        yield
    finally:
        pipeline.unload_ip_adapter()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_ip_adapter.py -v; echo "EXIT:$?"`
Expected: PASS (all resolution + apply tests)

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/guided/ip_adapter.py backend/tests/test_guided_ip_adapter.py && git branch --show-current && git commit -m "feat(guided): IP-Adapter apply half - scales, masks, always-restore (#34 PR4)"
```

---

### Task 5: generalize the fit gate to guided stacks

**Files:**
- Modify: `backend/guided/fit.py`
- Modify: `backend/tests/test_guided_fit.py`

**Interfaces:**
- Produces: `installed_weight_bytes(model_dir) -> int` (rename of `controlnet_weight_bytes`), `guided_fit_refusal(base_plan, family, profile, cn_model_dirs=(), ip_model_dirs=()) -> Optional[str]` (replaces `controlnet_fit_refusal`; same refusal rails; message names what is in the stack).
- Consumes: `GUIDED_PASS_OVERHEAD_BYTES` (unchanged).

- [ ] **Step 1: Update the tests**

In `backend/tests/test_guided_fit.py`:
1. Update the import line to `from guided.fit import guided_fit_refusal, installed_weight_bytes`.
2. Mechanical renames in the existing tests: `controlnet_weight_bytes(...)` -> `installed_weight_bytes(...)`; every `controlnet_fit_refusal(plan, dirs, family, profile)` -> `guided_fit_refusal(plan, family, profile, cn_model_dirs=dirs)` (same order of the remaining args). Rename `test_controlnet_weight_bytes_reads_exact_header_bytes` -> `test_installed_weight_bytes_reads_exact_header_bytes`.
3. In `test_over_budget_stack_refuses_with_basis_and_numbers`, add `assert "1 ControlNet model" in message` (the message now names what is in the stack).
4. Append (the file's `_Plan`, `_Profile`, `_estimate`, `_write_header_only_safetensors` helpers already exist):

```python
def _ip_dir(tmp_path, name, param_count):
    model_dir = tmp_path / name
    model_dir.mkdir(parents=True)
    _write_header_only_safetensors(
        str(model_dir / "ip_adapter.safetensors"), param_count)
    return str(model_dir)


def test_ip_adapter_dirs_count_toward_the_budget(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    # Two adapter INSTANCES (the FLUX shape: same dir listed twice) plus the
    # encoder - each claiming ~2 GiB of F16 params -> 6 GiB extra.
    adapter = _ip_dir(tmp_path, "ip-adapter-flux", param_count=_GIB)
    encoder = _ip_dir(tmp_path, "ip-adapter-encoder-clip-vit-l", param_count=_GIB)
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=1 * _GIB)
    message = guided_fit_refusal(plan, "flux", profile,
                                 ip_model_dirs=[adapter, adapter, encoder])
    assert message is not None
    assert "IP-Adapter" in message
    assert "ControlNet" not in message
    assert "GB VRAM" in message


def test_mixed_stack_message_names_both_components(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    cn = _cn_dir(tmp_path, "cn", param_count=_GIB)
    adapter = _ip_dir(tmp_path, "ip-adapter-sd15", param_count=_GIB)
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=1 * _GIB)
    message = guided_fit_refusal(plan, "sd15", profile,
                                 cn_model_dirs=[cn], ip_model_dirs=[adapter])
    assert message is not None
    assert "1 ControlNet model" in message
    assert "IP-Adapter" in message


def test_empty_ip_dirs_change_nothing(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=4.0, weights_gib=2.0))
    dirs = [_cn_dir(tmp_path, "cn", param_count=1000)]
    assert guided_fit_refusal(plan, "sd15", _Profile(), cn_model_dirs=dirs) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_fit.py -v; echo "EXIT:$?"`
Expected: FAIL with `ImportError: guided_fit_refusal`

- [ ] **Step 3: Implement in `guided/fit.py`**

Rename `controlnet_weight_bytes` -> `installed_weight_bytes` (same body; docstring: "Exact bytes for every safetensors file under an installed record dir."). Replace `controlnet_fit_refusal` with:

```python
def guided_fit_refusal(
    base_plan,
    family: Optional[str],
    profile,
    cn_model_dirs: List[str] = (),
    ip_model_dirs: List[str] = (),
) -> Optional[str]:
    """None when the guided stack fits (or the gate has nothing truthful to add).

    ip_model_dirs lists each resident copy: a FLUX adapter loaded once per
    reference appears once per instance, plus the encoder dir once.
    """
    if base_plan is None or base_plan.refusal or base_plan.vram_plan is None:
        return None  # base-model problems surface through their own channels
    if not profile.gpu_available:
        return None  # cpu-only generation keeps today's behavior
    cn_bytes = sum(installed_weight_bytes(model_dir) for model_dir in cn_model_dirs)
    ip_bytes = sum(installed_weight_bytes(model_dir) for model_dir in ip_model_dirs)
    extra = cn_bytes + ip_bytes
    if extra == 0:
        return None  # nothing measurable - never refuse on a guess

    estimate = base_plan.vram_plan
    overhead = GUIDED_PASS_OVERHEAD_BYTES.get(
        family or "", GUIDED_PASS_OVERHEAD_BYTES["default"])
    total = estimate.total_bytes + extra + overhead
    if total <= profile.vram_free_bytes:
        return None
    weights = estimate.weight_bytes + extra
    if (weights <= profile.system_ram_available_bytes
            and (total - weights) <= profile.vram_free_bytes):
        return None  # fits-with-offload: the loader's offload rung handles it

    parts = []
    if cn_bytes:
        count = len(cn_model_dirs)
        parts.append(f"{count} ControlNet model{'s' if count != 1 else ''}")
    if ip_bytes:
        parts.append("the IP-Adapter reference stack")
    stack = " plus ".join(parts)
    return (
        f"This guided stack does not fit on this GPU: the checkpoint plus "
        f"{stack} needs ~{total / _GIB:.1f} GB VRAM but "
        f"{profile.vram_free_bytes / _GIB:.1f} GB is free ({estimate.basis} basis). "
        "Close other GPU apps, drop a layer, or switch to a smaller checkpoint."
    )
```

Update the module docstring ("ControlNet stacks" -> "guided stacks (ControlNet + IP-Adapter)"). Grep for stale imports: `grep -rn "controlnet_fit_refusal\|controlnet_weight_bytes" backend/ --include="*.py"` - `main.py` updates in Task 7; fix any test imports now.

- [ ] **Step 4: Run to verify pass**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_fit.py -v; echo "EXIT:$?"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/guided/fit.py backend/tests/test_guided_fit.py && git branch --show-current && git commit -m "feat(guided): fit gate covers IP-Adapter stacks - guided_fit_refusal (#34 PR4)"
```

---

### Task 6: `direct_generator` executes the IP-Adapter plan

**Files:**
- Modify: `backend/utils/direct_generator.py`
- Test: `backend/tests/test_direct_generator_guided.py` (extend)

**Interfaces:**
- Consumes: Tasks 2-4 (`pass_plan.ip_references`, `resolve_ip_reference_stack`, `ip_adapter_applied`, `ip_adapter_mask_tensor`, `LOADER_FLUX`).
- Produces: `guided_report["references"]` entries `{layer_id, record_id, masked, strength}`; report notices include `stack.notices`.

- [ ] **Step 1: Write the failing tests** (extend the existing harness)

`_FakePipeline.__call__` gains `ip_adapter_image=None, cross_attention_kwargs=None` params and records both. `_generator` gains a fake `ip_adapter_applied` + `resolve encoder loading`:

```python
    applied_ip = []

    class _FakeIPApplied:
        def __init__(self, pipeline, stack, adapter_dir, encoder_dir, device):
            applied_ip.append({"stack": stack, "adapter_dir": adapter_dir,
                               "encoder_dir": encoder_dir, "device": device,
                               "released": False})
            self._entry = applied_ip[-1]

        def __enter__(self):
            return None

        def __exit__(self, *exc):
            self._entry["released"] = True
            return False

    monkeypatch.setattr(dg, "ip_adapter_applied",
                        lambda pipeline, stack, adapter_dir, encoder_dir, device:
                            _FakeIPApplied(pipeline, stack, adapter_dir, encoder_dir, device))
    return gen, loaded, attached, derived, applied_ip
```

(Update every existing `gen, loaded, attached, derived = _generator(...)` unpack to the 5-tuple.)

New tests (record dirs must exist on disk - the generator checks; create them under `tmp_path/ip-adapter/<id>` with a dummy file):

```python
def _ip_dirs(tmp_path, adapter_id, encoder_id, encoder_subpath=""):
    import os

    adapter = tmp_path / "ip-adapter" / adapter_id
    adapter.mkdir(parents=True)
    encoder_root = tmp_path / "ip-adapter" / encoder_id
    encoder = encoder_root / encoder_subpath if encoder_subpath else encoder_root
    encoder.mkdir(parents=True)
    return str(adapter), str(encoder)


def _two_refs(tmp_path, with_masks=True):
    base = _base_image(tmp_path)
    mask = MASK if with_masks else MASK
    return [
        {"layer_id": "r1", "layer_name": "Face", "source_path": base,
         "strength": 1.2, "mask": dict(MASK)},
        {"layer_id": "r2", "layer_name": "Style", "source_path": base,
         "strength": 0.8, "mask": dict(MASK)},
    ]


def test_sd15_multi_reference_threads_images_masks_and_scales(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _, applied_ip = _generator(tmp_path, calls, monkeypatch, family="sd15")
    _ip_dirs(tmp_path, "ip-adapter-sd15", "ip-adapter-encoder-vit-h",
             encoder_subpath="models/image_encoder")
    guided = {"controlnet": [], "denoising_strength": 0.75, "inpaint": None,
              "reference_images": _two_refs(tmp_path)}
    result = _run(gen, tmp_path, guided)

    # One adapter, a LIST of images, and a (1, 2, H, W) mask tensor.
    ip_images = calls[0]["ip_adapter_image"]
    assert isinstance(ip_images, list) and len(ip_images) == 1
    assert len(ip_images[0]) == 2
    masks = calls[0]["cross_attention_kwargs"]["ip_adapter_masks"]
    assert len(masks) == 1
    assert tuple(masks[0].shape) == (1, 2, 8, 8)
    assert applied_ip[0]["released"] is True
    stack = applied_ip[0]["stack"]
    assert stack.adapter_record_id == "ip-adapter-sd15"
    report = result["guided"]
    assert [entry["layer_id"] for entry in report["references"]] == ["r1", "r2"]
    assert report["references"][0]["masked"] is True
    assert report["references"][0]["strength"] == 1.2


def test_flux_multi_reference_is_global_with_notice(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _, applied_ip = _generator(tmp_path, calls, monkeypatch, family="flux")
    _ip_dirs(tmp_path, "ip-adapter-flux", "ip-adapter-encoder-clip-vit-l")
    guided = {"controlnet": [], "denoising_strength": 0.75, "inpaint": None,
              "reference_images": _two_refs(tmp_path)}
    result = _run(gen, tmp_path, guided)

    # One image per adapter instance; no masks on FLUX.
    ip_images = calls[0]["ip_adapter_image"]
    assert len(ip_images) == 2
    assert calls[0]["cross_attention_kwargs"] is None
    from guided.ip_adapter import NOTICE_REFERENCE_MASKS_GLOBAL

    assert NOTICE_REFERENCE_MASKS_GLOBAL in result["guided"]["notices"]
    assert result["guided"]["references"][0]["masked"] is False


def test_multi_reference_composes_with_controlnet(monkeypatch, tmp_path):
    calls = []
    gen, _, attached, derived, applied_ip = _generator(
        tmp_path, calls, monkeypatch, family="sd15")
    (tmp_path / "controlnet" / "controlnet-canny-sd15").mkdir(parents=True)
    _ip_dirs(tmp_path, "ip-adapter-sd15", "ip-adapter-encoder-vit-h",
             encoder_subpath="models/image_encoder")
    guided = {"controlnet": [_cn_layer(tmp_path)], "denoising_strength": 0.75,
              "inpaint": None, "reference_images": _two_refs(tmp_path)}
    result = _run(gen, tmp_path, guided)
    assert derived[0]["kind"] == "none"  # multi-ref base pass is txt2img
    assert calls[0]["ip_adapter_image"] is not None
    assert applied_ip[0]["released"] is True
    assert len(result["guided"]["controlnet"]) == 1
    assert len(result["guided"]["references"]) == 2


def test_empty_reference_mask_fails_loudly_on_masked_families(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _, _ = _generator(tmp_path, calls, monkeypatch, family="sd15")
    _ip_dirs(tmp_path, "ip-adapter-sd15", "ip-adapter-encoder-vit-h",
             encoder_subpath="models/image_encoder")
    refs = _two_refs(tmp_path)
    refs[1]["mask"] = {"type": "rectangle", "points": [],
                       "bounds": {"x": 0, "y": 0, "width": 0, "height": 0}}
    guided = {"controlnet": [], "denoising_strength": 0.75, "inpaint": None,
              "reference_images": refs}
    from guided.passes import GuidedValidationError

    with pytest.raises(GuidedValidationError) as exc:
        _run(gen, tmp_path, guided)
    assert "Style" in str(exc.value)
    assert "mask" in str(exc.value)


def test_missing_adapter_dir_fails_with_reinstall_message(monkeypatch, tmp_path):
    calls = []
    gen, _, _, _, _ = _generator(tmp_path, calls, monkeypatch, family="sd15")
    guided = {"controlnet": [], "denoising_strength": 0.75, "inpaint": None,
              "reference_images": _two_refs(tmp_path)}
    from guided.passes import GuidedValidationError

    with pytest.raises(GuidedValidationError) as exc:
        _run(gen, tmp_path, guided)
    assert "ip-adapter-sd15" in str(exc.value)
    assert "reinstall" in str(exc.value)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio/backend && bash -c 'timeout 120 ./venv/Scripts/python.exe -m pytest tests/test_direct_generator_guided.py -v; echo "EXIT:$?"'`
Expected: FAIL (ip kwargs never threaded; unpack errors fixed first)

- [ ] **Step 3: Wire the generator**

Add the import (alongside the existing guided imports in `direct_generator.py`):

```python
from guided.ip_adapter import (
    LOADER_FLUX as IP_LOADER_FLUX,
    ip_adapter_applied,
    ip_adapter_mask_tensor,
    resolve_ip_reference_stack,
)
```

In `_generate_sync`, immediately after the ControlNet resolution block (after `control_images = [...]`):

```python
        # #34 PR4: resolve 2+ reference layers through the IP-Adapter seam
        # (same GuidedValidationError contract the endpoint 422s through),
        # and prepare images + masks on CPU before any weights move.
        ip_stack = None
        ip_adapter_dir = ""
        ip_encoder_dir = ""
        ip_images: List[Any] = []
        ip_masks: List[Any] = []
        if pass_plan.ip_references:
            base_record = _resolve_record(model_name) or {}
            ip_stack = resolve_ip_reference_stack(
                pass_plan.ip_references, base_record.get("base_architecture"),
                _resolve_record, model_id=model_name)
            ip_adapter_dir = os.path.join(
                self.models_dir, "ip-adapter", ip_stack.adapter_record_id)
            encoder_root = os.path.join(
                self.models_dir, "ip-adapter", ip_stack.encoder_record_id)
            ip_encoder_dir = (
                os.path.join(encoder_root, ip_stack.encoder_subpath)
                if ip_stack.encoder_subpath else encoder_root)
            for record_id, model_dir in (
                    (ip_stack.adapter_record_id, ip_adapter_dir),
                    (ip_stack.encoder_record_id, ip_encoder_dir)):
                if not os.path.isdir(model_dir):
                    raise GuidedValidationError(
                        f"The IP-Adapter model '{record_id}' looks incomplete "
                        "on disk - reinstall it from the Foundry."
                    )
            for ref in ip_stack.references:
                ip_images.append(Image.open(ref.get("source_path")).convert("RGB"))
                if ip_stack.masked:
                    mask_image = rasterize_mask(ref.get("mask") or {}, width, height)
                    if mask_coverage(mask_image) == 0.0:
                        name = ref.get("layer_name") or ref.get("layer_id") or "reference"
                        raise GuidedValidationError(
                            f"The mask on reference layer '{name}' is empty - "
                            "draw a mask region on the canvas first."
                        )
                    ip_masks.append(mask_image)
```

After the ControlNet `call_kwargs` block (`call_kwargs["control_mode"] = modes` area), add:

```python
        if ip_stack:
            if ip_stack.loader == IP_LOADER_FLUX:
                # One image per adapter instance; masks are not supported on
                # FLUX (the stack carries the explicit notice).
                call_kwargs["ip_adapter_image"] = ip_images
            else:
                # ONE adapter with a list of images + per-image masks.
                call_kwargs["ip_adapter_image"] = [ip_images]
                call_kwargs["cross_attention_kwargs"] = {
                    "ip_adapter_masks": ip_adapter_mask_tensor(ip_masks, height, width)
                }
```

Inside the `ExitStack` block, right after `run_pipeline` is chosen (after the existing `elif`/`else` chain):

```python
            if ip_stack:
                stack.enter_context(ip_adapter_applied(
                    run_pipeline, ip_stack, ip_adapter_dir, ip_encoder_dir,
                    self.device))
```

After `call_kwargs, dropped_params = filter_call_kwargs(...)`, add the honesty backstop:

```python
            if ip_stack and "ip_adapter_image" in dropped_params:
                # The registry is the primary gate; this backstop keeps a
                # signature drift from silently degrading to unguided output.
                raise GuidedValidationError(
                    "This pipeline cannot accept IP-Adapter reference images - "
                    "hide the extra reference layers or switch checkpoints."
                )
```

Update the `guided_report` condition and body:

```python
            if pass_plan.kind != "none" or cn_stack or ip_stack:
                guided_report = {
                    "pass": pass_plan.kind,
                    "notices": list(pass_plan.notices) + (ip_stack.notices if ip_stack else []),
                    "dropped_params": dropped_params,
                    "controlnet": [
                        {"layer_id": item.layer.get("layer_id"),
                         "preprocessor": item.layer.get("preprocessor"),
                         "record_id": item.record_id,
                         "control_mode": item.control_mode}
                        for item in cn_stack
                    ],
                    "references": [
                        {"layer_id": ref.get("layer_id"),
                         "record_id": ip_stack.adapter_record_id,
                         "masked": ip_stack.masked,
                         "strength": float(ref.get("strength", 1.0))}
                        for ref in (ip_stack.references if ip_stack else [])
                    ],
                }
```

- [ ] **Step 4: Run the generator suites**

Run: `cd /c/vision-studio/backend && bash -c 'timeout 300 ./venv/Scripts/python.exe -m pytest tests/test_direct_generator_guided.py tests/test_direct_generator.py tests/test_direct_generator_loras.py -v; echo "EXIT:$?"'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/utils/direct_generator.py backend/tests/test_direct_generator_guided.py && git branch --show-current && git commit -m "feat(guided): generator executes masked multi-reference IP-Adapter passes (#34 PR4)"
```

---

### Task 7: endpoint pre-flight + fit gate wiring

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_guided_request_api.py` (extend)

**Interfaces:**
- Consumes: `resolve_ip_reference_stack`, `guided_fit_refusal` (Task 5 signature).
- Produces: 422s for multi-ref family/checkpoint/record problems and over-budget guided stacks BEFORE a job exists.

- [ ] **Step 1: Write the failing tests** (extend `test_guided_request_api.py`; `_FakeRegistry.get_record`'s prefix tuple gains `"ip-adapter-"`)

```python
def _ref_request(tmp_path, count=2, model="sd-1-5"):
    from PIL import Image

    refs = []
    for index in range(count):
        source = tmp_path / f"ref-{index}.png"
        Image.new("RGB", (8, 8)).save(source)
        refs.append({
            "layer_id": f"r{index}", "layer_name": f"Ref {index}",
            "source_path": str(source), "mask": MASK, "strength": 1.0,
        })
    return {"prompt": "a castle", "model": model, "reference_images": refs}


def test_multi_reference_on_sd35_declines_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="sd35"))
    response = client.post("/api/generate/image", json=_ref_request(tmp_path, model="sd3.5-large"))
    assert response.status_code == 422
    assert "single image" in response.json()["detail"]


def test_multi_reference_on_flux_schnell_declines_422(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="flux"))
    response = client.post("/api/generate/image", json=_ref_request(tmp_path, model="flux-schnell"))
    assert response.status_code == 422
    assert "distilled" in response.json()["detail"]


def test_multi_reference_missing_adapter_names_the_record(monkeypatch, tmp_path):
    registry = _FakeRegistry(family="sd15",
                             statuses={"ip-adapter-sd15": "not_found"})
    client = _client(monkeypatch, registry)
    response = client.post("/api/generate/image", json=_ref_request(tmp_path))
    assert response.status_code == 422
    assert "ip-adapter-sd15" in response.json()["detail"]


def test_multi_reference_ready_enqueues(monkeypatch, tmp_path):
    client = _client(monkeypatch, _FakeRegistry(family="sd15"))
    response = client.post("/api/generate/image", json=_ref_request(tmp_path))
    assert response.status_code == 200
    assert response.json()["status"] == "pending"


def test_multi_reference_missing_source_file_422(monkeypatch, tmp_path):
    body = _ref_request(tmp_path)
    body["reference_images"][1]["source_path"] = str(tmp_path / "gone.png")
    client = _client(monkeypatch, _FakeRegistry(family="sd15"))
    response = client.post("/api/generate/image", json=body)
    assert response.status_code == 422
    assert "gone.png" in response.json()["detail"]
    assert str(tmp_path) not in response.json()["detail"]


def test_multi_reference_fit_refusal_422(monkeypatch, tmp_path):
    import main as main_module

    client = _client(monkeypatch, _FakeRegistry(family="sd15"))
    monkeypatch.setattr(main_module, "guided_fit_refusal",
                        lambda *a, **k: "too big (measured basis)")
    response = client.post("/api/generate/image", json=_ref_request(tmp_path))
    assert response.status_code == 422
    assert "too big" in response.json()["detail"]
```

(Follow the file's existing monkeypatching of `probe_hardware`/`resolve_model_runtime` for the fit test - mirror how the PR3 fit tests stub them so no real probe runs.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_request_api.py -v; echo "EXIT:$?"`
Expected: new tests FAIL (multi-ref currently 422s with the retired PR1 message / fit gate never fires without CN)

- [ ] **Step 3: Implement in `main.py`**

Update imports: `from guided.fit import guided_fit_refusal` (replacing `controlnet_fit_refusal`); add `from guided.ip_adapter import resolve_ip_reference_stack`.

Restructure the pre-flight tail (currently `if pass_plan.controlnet:` owns the fit gate). Replace from `if pass_plan.controlnet:` through the end of the fit-refusal block with:

```python
        cn_stack = []
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
                cn_stack = resolve_controlnet_stack(
                    pass_plan.controlnet,
                    record.get("base_architecture"),
                    model_registry.get_record,
                    model_id=gen_request.model,
                    kind=pass_plan.kind,
                )
            except GuidedValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))

        # #34 PR4: 2+ reference layers resolve (or decline) BEFORE a job exists.
        ip_stack = None
        if pass_plan.ip_references:
            for ref in pass_plan.ip_references:
                if not os.path.isfile(ref.get("source_path") or ""):
                    name = os.path.basename(ref.get("source_path") or "")
                    raise HTTPException(
                        status_code=422,
                        detail=f"Reference source image '{name}' was not found on disk.",
                    )
            record = model_registry.get_record(gen_request.model) or {}
            try:
                ip_stack = resolve_ip_reference_stack(
                    pass_plan.ip_references,
                    record.get("base_architecture"),
                    model_registry.get_record,
                    model_id=gen_request.model,
                )
            except GuidedValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))

        # #34 PR3/PR4: refuse over-budget guided stacks up front with the
        # labeled basis instead of letting the job OOM minutes into a run.
        if cn_stack or ip_stack:
            record = model_registry.get_record(gen_request.model) or {}
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
                ip_dirs = []
                if ip_stack:
                    adapter_dir = os.path.join(
                        MODELS_DIR, "ip-adapter", ip_stack.adapter_record_id)
                    ip_dirs = [adapter_dir] * ip_stack.instances
                    ip_dirs.append(os.path.join(
                        MODELS_DIR, "ip-adapter", ip_stack.encoder_record_id))
                refusal = guided_fit_refusal(
                    base_plan, record.get("base_architecture"), profile,
                    cn_model_dirs=cn_dirs, ip_model_dirs=ip_dirs)
                if refusal:
                    raise HTTPException(status_code=422, detail=refusal)
```

Also update the `ReferenceImageLayerPayload` docstring to `"""#34: reference layers - one = img2img init; 2+ = IP-Adapter multi-reference (real since PR4)."""`.

- [ ] **Step 4: Run the API + full guided suites**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_request_api.py tests/test_guided_request.py -v; echo "EXIT:$?"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/main.py backend/tests/test_guided_request_api.py && git branch --show-current && git commit -m "feat(guided): endpoint pre-flights multi-reference + guided fit gate (#34 PR4)"
```

---

### Task 8: frontend mirror + strength threading

**Files:**
- Create: `src/features/generation/referenceSupport.ts`
- Modify: `src/types/generation.ts` (`GenerationReferenceImageLayerPayload`)
- Modify: `src/features/generation/resolveCanvasControlLayers.ts`
- Test: `src/features/generation/referenceSupport.test.ts` (new), `src/features/generation/resolveCanvasControlLayers.test.ts` (extend)

**Interfaces:**
- Produces: `REFERENCE_ADAPTERS`, `REFERENCE_CHECKPOINT_DECLINES`, `MSG_SD35_SINGLE_IMAGE`, `MSG_INPAINT_PLUS_REFERENCE`, `NOTICE_REFERENCE_MASKS_GLOBAL`, `requiredReferenceRecords(baseArchitecture)`, `resolveReferencePreflight(layers, baseArchitecture, availableModels, options) -> { errors, missingRecordIds, notices }`; payload type gains `strength?: number`.

- [ ] **Step 1: Write the failing tests**

`src/features/generation/referenceSupport.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  MSG_SD35_SINGLE_IMAGE,
  NOTICE_REFERENCE_MASKS_GLOBAL,
  requiredReferenceRecords,
  resolveReferencePreflight,
} from './referenceSupport';
import type { GenerationReferenceImageLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

const MASK = { type: 'rectangle', points: [{ x: 0, y: 0 }], bounds: { x: 0, y: 0, width: 8, height: 8 } };

function refLayer(id: string): GenerationReferenceImageLayerPayload {
  return { layer_id: id, layer_name: `Ref ${id}`, source_path: `${id}.png`, mask: MASK, strength: 1 };
}

function record(id: string, status = 'ready'): ModelRecord {
  return {
    id, name: id, artifact_type: 'ip-adapter', capability: 'image',
    base_architecture: 'unknown', size: '1 GB', status, tier: 'verified',
    quality: 'balanced', runtime: 'local', hardware_class: 'creator',
    vram: '1 GB', description: '', source: 'huggingface',
  } as ModelRecord;
}

const READY = [record('ip-adapter-sd15'), record('ip-adapter-encoder-vit-h'),
  record('ip-adapter-flux'), record('ip-adapter-encoder-clip-vit-l')];

describe('requiredReferenceRecords', () => {
  it('lists adapter + encoder per family and nothing for unsupported ones', () => {
    expect(requiredReferenceRecords('sd15')).toEqual(['ip-adapter-sd15', 'ip-adapter-encoder-vit-h']);
    expect(requiredReferenceRecords('sdxl')).toEqual(['ip-adapter-sdxl', 'ip-adapter-encoder-vit-h']);
    expect(requiredReferenceRecords('flux')).toEqual(['ip-adapter-flux', 'ip-adapter-encoder-clip-vit-l']);
    expect(requiredReferenceRecords('sd35')).toEqual([]);
    expect(requiredReferenceRecords(null)).toEqual([]);
  });
});

describe('resolveReferencePreflight', () => {
  it('stays silent for zero or one reference', () => {
    expect(resolveReferencePreflight([], 'sd15', READY, {}).errors).toEqual([]);
    expect(resolveReferencePreflight([refLayer('a')], 'sd15', READY, {}).errors).toEqual([]);
  });

  it('declines multi-reference on sd35 with the backend message', () => {
    const result = resolveReferencePreflight([refLayer('a'), refLayer('b')], 'sd35', READY, {});
    expect(result.errors).toEqual([MSG_SD35_SINGLE_IMAGE]);
  });

  it('declines flux-schnell by checkpoint id', () => {
    const result = resolveReferencePreflight(
      [refLayer('a'), refLayer('b')], 'flux', READY, { modelId: 'flux-schnell' });
    expect(result.errors[0]).toContain('distilled');
  });

  it('reports missing records with a Foundry message', () => {
    const models = [record('ip-adapter-sd15', 'not_found'), record('ip-adapter-encoder-vit-h')];
    const result = resolveReferencePreflight([refLayer('a'), refLayer('b')], 'sd15', models, {});
    expect(result.missingRecordIds).toContain('ip-adapter-sd15');
    expect(result.errors[0]).toContain('Foundry');
  });

  it('carries the flux global-application notice without blocking', () => {
    const result = resolveReferencePreflight(
      [refLayer('a'), refLayer('b')], 'flux', READY, { modelId: 'flux-dev' });
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([NOTICE_REFERENCE_MASKS_GLOBAL]);
  });

  it('mirrors the inpaint-plus-reference decline', () => {
    const result = resolveReferencePreflight([refLayer('a')], 'sd15', READY, { hasInpaint: true });
    expect(result.errors[0]).toContain('inpaint mask or a reference image');
  });

  it('stays silent when the family is unknown (backend is authoritative)', () => {
    expect(resolveReferencePreflight([refLayer('a'), refLayer('b')], null, READY, {}).errors).toEqual([]);
  });
});
```

Extend `resolveCanvasControlLayers.test.ts` - in the existing reference-layer expectation, add `strength` (find the test asserting `resolved.referenceImages` equality and add `strength: <the layer's weight, default 1>` to the expected object; add one focused test):

```typescript
  it('threads layer weight into reference strength', () => {
    // Build a scene whose reference layer has weight 1.4 using this file's
    // existing scene/layer builders, then:
    expect(resolved.referenceImages[0].strength).toBe(1.4);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio && npx vitest run src/features/generation/referenceSupport.test.ts src/features/generation/resolveCanvasControlLayers.test.ts 2>&1 | tail -20; echo "EXIT:${PIPESTATUS[0]}"`
Expected: FAIL (module missing; strength missing)

- [ ] **Step 3: Implement**

`src/types/generation.ts` - extend the payload:

```typescript
export interface GenerationReferenceImageLayerPayload {
  layer_id: string;
  layer_name: string;
  source_path: string;
  mask: GenerationMaskPayload;
  /** #34 PR4: IP-Adapter scale for this reference (threaded from layer.weight). */
  strength?: number;
}
```

`src/features/generation/resolveCanvasControlLayers.ts` - the reference push gains the field:

```typescript
    referenceImageLayers.push({
      layer_id: layer.id,
      layer_name: layer.name,
      source_path: resolvedSourcePath,
      mask,
      strength: layer.weight ?? 1,
    });
```

`src/features/generation/referenceSupport.ts` (new, complete):

```typescript
import type { GenerationReferenceImageLayerPayload } from '@/types/generation';
import type { ModelRecord } from '@/types/model';

/**
 * Frontend mirror of backend/guided/ip_adapter.py + guided/passes.py
 * (#34 PR4). The backend is the source of truth; keep every map and
 * message below in sync with it verbatim.
 */

export const REFERENCE_ADAPTERS: Record<
  string,
  { adapterRecordId: string; encoderRecordId: string; masked: boolean }
> = {
  sd15: { adapterRecordId: 'ip-adapter-sd15', encoderRecordId: 'ip-adapter-encoder-vit-h', masked: true },
  sdxl: { adapterRecordId: 'ip-adapter-sdxl', encoderRecordId: 'ip-adapter-encoder-vit-h', masked: true },
  flux: { adapterRecordId: 'ip-adapter-flux', encoderRecordId: 'ip-adapter-encoder-clip-vit-l', masked: false },
};

const FAMILY_LABELS: Record<string, string> = {
  sd15: 'SD 1.5',
  sdxl: 'SDXL',
  flux: 'FLUX',
  sd35: 'SD 3.5',
};

/** Known-incompatible catalog checkpoints inside supported families. */
export const REFERENCE_CHECKPOINT_DECLINES: Record<string, string> = {
  'flux-schnell':
    'FLUX.1 [schnell] is a distilled checkpoint the FLUX IP-Adapter does not support - switch to FLUX.1 [dev].',
};

export const MSG_SD35_SINGLE_IMAGE =
  'The SD 3.5 IP-Adapter accepts a single image, so multiple reference layers cannot run on SD 3.5 - keep one visible reference image layer or switch to SD 1.5, SDXL, or FLUX.1 [dev].';

export const MSG_INPAINT_PLUS_REFERENCE =
  'Use either an inpaint mask or a reference image layer for a single generation - combining them is not supported yet (#34).';

export const NOTICE_REFERENCE_MASKS_GLOBAL =
  'Reference masks are not supported on FLUX - every reference image was applied to the whole generation.';

export interface ReferencePreflight {
  errors: string[];
  missingRecordIds: string[];
  notices: string[];
}

const EMPTY: ReferencePreflight = { errors: [], missingRecordIds: [], notices: [] };

/** Adapter + encoder records multi-reference needs on a family. */
export function requiredReferenceRecords(baseArchitecture: string | null): string[] {
  const spec = baseArchitecture ? REFERENCE_ADAPTERS[baseArchitecture] : undefined;
  return spec ? [spec.adapterRecordId, spec.encoderRecordId] : [];
}

/**
 * Best-effort client mirror of the backend multi-reference 422 pre-flight.
 * A null family (models list not loaded) stays silent - the backend check
 * is authoritative.
 */
export function resolveReferencePreflight(
  layers: GenerationReferenceImageLayerPayload[],
  baseArchitecture: string | null,
  availableModels: ModelRecord[],
  options: { modelId?: string | null; hasInpaint?: boolean } = {},
): ReferencePreflight {
  if (options.hasInpaint && layers.length > 0) {
    return { errors: [MSG_INPAINT_PLUS_REFERENCE], missingRecordIds: [], notices: [] };
  }
  if (layers.length < 2 || !baseArchitecture) {
    return EMPTY;
  }
  if (baseArchitecture === 'sd35') {
    return { errors: [MSG_SD35_SINGLE_IMAGE], missingRecordIds: [], notices: [] };
  }
  const spec = REFERENCE_ADAPTERS[baseArchitecture];
  if (!spec) {
    const label = FAMILY_LABELS[baseArchitecture] ?? baseArchitecture;
    return {
      errors: [
        `Multiple reference images are not supported on ${label} - keep one visible ` +
          'reference image layer or switch to an SD 1.5, SDXL, or FLUX.1 [dev] checkpoint.',
      ],
      missingRecordIds: [],
      notices: [],
    };
  }
  const decline = REFERENCE_CHECKPOINT_DECLINES[options.modelId ?? ''];
  if (decline) {
    return { errors: [decline], missingRecordIds: [], notices: [] };
  }

  const errors: string[] = [];
  const missing: string[] = [];
  for (const recordId of [spec.adapterRecordId, spec.encoderRecordId]) {
    const record = availableModels.find((model) => model.id === recordId);
    if (record?.status !== 'ready') {
      errors.push(`Reference layers need '${recordId}' - install it from the Foundry first.`);
      missing.push(recordId);
    }
  }
  return {
    errors,
    missingRecordIds: missing,
    notices: spec.masked ? [] : [NOTICE_REFERENCE_MASKS_GLOBAL],
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /c/vision-studio && npx vitest run src/features/generation/ 2>&1 | tail -8; echo "EXIT:${PIPESTATUS[0]}"`
Expected: PASS

- [ ] **Step 5: Commit** (pre-commit runs the full suite + typecheck)

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add src/features/generation/referenceSupport.ts src/features/generation/referenceSupport.test.ts src/features/generation/resolveCanvasControlLayers.ts src/features/generation/resolveCanvasControlLayers.test.ts src/types/generation.ts && git branch --show-current && git commit -m "feat(guided): frontend reference preflight mirror + strength threading (#34 PR4)"
```

---

### Task 9: GeneratePanel wiring + layer properties + result notices strip

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/components/canvas/CanvasControlLayerProperties.tsx`
- Modify: `src/store/slices/generationSlice.ts` + `src/store/appStore.types.ts`
- Test: `src/pages/GeneratePanel.test.tsx`, `src/components/canvas/CanvasControlLayerProperties.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 8's `resolveReferencePreflight`, `requiredReferenceRecords`, `REFERENCE_ADAPTERS`, `MSG_SD35_SINGLE_IMAGE`, `NOTICE_REFERENCE_MASKS_GLOBAL`.
- Produces: store `lastGuidedNotices: string[]` + `setLastGuidedNotices`; corrected `guidedKind` (2+ refs -> `'none'`); reference-layer weight slider + `data-testid="reference-record-status"`; footer/pass-notices strip `data-testid="guided-notices"`.

- [ ] **Step 1: Write the failing tests**

`GeneratePanel.test.tsx` additions (reuse the file's existing render/seed helpers):

```typescript
  it('treats two references as an IP-Adapter pass, not img2img (kind none)', () => {
    // Seed sd35 checkpoint + two visible reference layers via the existing
    // store helpers; the CN preflight must NOT fire the sd35 img2img decline
    // (kind none) while the reference preflight fires MSG_SD35_SINGLE_IMAGE.
    // Assert the footer shows the SD 3.5 single-image message.
  });

  it('blocks generate when multi-reference records are missing, with Foundry link', () => {
    // sd15 checkpoint, two reference layers, ip-adapter-sd15 not ready ->
    // footer shows "install it from the Foundry" and the Manage in Foundry
    // link renders (missingRecordIds non-empty).
  });

  it('surfaces guided notices from a completed job result', async () => {
    // Drive pollJobStatus's completed branch via the mocked
    // window.electron.generation.getStatus returning
    // { status: 'completed', result: { guided: { notices: ['Reference masks are not supported on FLUX - every reference image was applied to the whole generation.'] } } }
    // Assert screen.getByTestId('guided-notices') shows the notice text.
  });
```

(Write these as REAL tests following the file's established seeding patterns - `buildRecord`, store seeding via real actions per the e2e-seeding rule, and the existing generation-mock plumbing. No stubs-in-place-of-assertions.)

`CanvasControlLayerProperties.test.tsx` additions:

```typescript
  it('shows the weight slider for reference layers', () => {
    // layer.type = 'reference-image' -> the range input labeled
    // 'Control layer weight' is present and drives onUpdate({ weight }).
  });

  it('shows installed state for reference layers on a masked family', () => {
    // sd15 checkpoint + both records ready -> testid 'reference-record-status'
    // says the models are installed and mentions masked referencing.
  });

  it('links to the Foundry when reference records are missing', () => {
    // ip-adapter-encoder-vit-h not ready -> missing text + Manage in Foundry
    // button that calls setActiveTab('foundry').
  });

  it('tells the truth on sd35 (single reference only)', () => {
    // sd3.5-large selected -> the status box carries MSG_SD35_SINGLE_IMAGE.
  });

  it('notes global application on flux', () => {
    // flux-dev selected, records ready -> the box mentions masks are not
    // supported on FLUX.
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /c/vision-studio && npx vitest run src/pages/GeneratePanel.test.tsx src/components/canvas/CanvasControlLayerProperties.test.tsx 2>&1 | tail -10; echo "EXIT:${PIPESTATUS[0]}"`
Expected: FAIL

- [ ] **Step 3: Implement the store field**

`src/store/appStore.types.ts` (next to `lastAppliedAcceleration`):

```typescript
  /** #34 PR4: guided-pass notices from the most recent completed job. */
  lastGuidedNotices: string[];
  setLastGuidedNotices: (notices: string[]) => void;
```

`src/store/slices/generationSlice.ts` - add to the slice state/actions (session-only; do NOT add to any persist partialize):

```typescript
  lastGuidedNotices: [],
  setLastGuidedNotices: (notices) => set({ lastGuidedNotices: notices }),
```

- [ ] **Step 4: Implement GeneratePanel**

1. `guidedKind` (2+ references are IP-Adapter on a txt2img base - mirror `passes.py`):

```typescript
  const guidedKind = resolvedCanvasControlLayers.inpaint
    ? ('inpaint' as const)
    : resolvedCanvasControlLayers.referenceImages.length === 1
      ? ('img2img' as const)
      : ('none' as const);
```

2. Reference preflight memo (after `controlNetPreflight`):

```typescript
  const referencePreflight = useMemo(
    () =>
      imageConfig.generationType === 'image'
        ? resolveReferencePreflight(
            resolvedCanvasControlLayers.referenceImages,
            selectedImageBaseArch,
            availableModels,
            { modelId: imageConfig.model, hasInpaint: Boolean(resolvedCanvasControlLayers.inpaint) },
          )
        : { errors: [], missingRecordIds: [], notices: [] },
    [availableModels, imageConfig.generationType, imageConfig.model, resolvedCanvasControlLayers.inpaint, resolvedCanvasControlLayers.referenceImages, selectedImageBaseArch],
  );
```

3. Click-time guard (right after the `controlNetPreflight.errors` throw):

```typescript
        if (referencePreflight.errors.length > 0) {
          throw new Error(referencePreflight.errors[0]);
        }
```

4. Footer chain - insert after the controlNetPreflight branch:

```typescript
          : imageConfig.generationType === 'image' && referencePreflight.errors.length > 0
            ? referencePreflight.errors[0]
```

and extend the footer's Foundry-link condition to `controlNetPreflight.missingRecordIds.length > 0 || referencePreflight.missingRecordIds.length > 0`.

5. Notices: on generate click (where `updateGenStatus({ isGenerating: true, ... })` runs) add `useAppStore.getState().setLastGuidedNotices([]);`. In `pollJobStatus`'s completed branch (next to `setLastAppliedAcceleration`):

```typescript
          // #34 PR4: surface guided-pass notices (e.g. FLUX global references).
          const guidedNotices = (status.result?.guided as { notices?: string[] } | undefined)?.notices ?? [];
          useAppStore.getState().setLastGuidedNotices(guidedNotices);
```

6. Render the strip near the footer warning block:

```tsx
          {lastGuidedNotices.length > 0 && (
            <div
              data-testid="guided-notices"
              className="recessed-well mt-2 px-3 py-2"
            >
              <span className="mono-label text-text-muted">Pass Notices</span>
              <ul className="mt-1 space-y-1">
                {lastGuidedNotices.map((notice) => (
                  <li key={notice} className="type-caption text-text-body">
                    {notice}
                  </li>
                ))}
              </ul>
            </div>
          )}
```

(with `const lastGuidedNotices = useAppStore((s) => s.lastGuidedNotices);` added to the store reads; keep DESIGN.md rails - `.mono-label`, `.recessed-well`, no new tokens.)

- [ ] **Step 5: Implement CanvasControlLayerProperties**

1. Imports gain `requiredReferenceRecords`, `REFERENCE_ADAPTERS`, `MSG_SD35_SINGLE_IMAGE`, `NOTICE_REFERENCE_MASKS_GLOBAL` from `@/features/generation/referenceSupport`.
2. Weight slider: hoist the existing Weight `<label>` block out of `supportsControlNetSettings` into a `supportsWeight = layer.type === 'controlnet' || layer.type === 'reference-image'` condition (same slider, same aria-label; add a caption under it for reference layers: `Reference strength - how strongly this image steers the IP-Adapter pass.`).
3. Reference status box, rendered when `layer.type === 'reference-image' && baseArchitecture`:

```tsx
          {layer.type === 'reference-image' && baseArchitecture ? (
            <div
              className={cn(
                'rounded-xl border px-3 py-3',
                referenceRecords.length > 0 && missingReferenceRecords.length === 0
                  ? 'border-border bg-void'
                  : 'border-status-warning-border bg-status-warning-muted',
              )}
              data-testid="reference-record-status"
            >
              {baseArchitecture === 'sd35' ? (
                <p className="type-caption text-text-body">{MSG_SD35_SINGLE_IMAGE}</p>
              ) : referenceRecords.length === 0 ? (
                <p className="type-caption text-text-body">
                  Multiple reference images are not supported on this checkpoint - a single
                  reference runs img2img.
                </p>
              ) : missingReferenceRecords.length === 0 ? (
                <p className="type-caption text-text-body">
                  {REFERENCE_ADAPTERS[baseArchitecture]?.masked
                    ? 'Models installed - two or more visible references run masked IP-Adapter passes; a single reference runs img2img.'
                    : `Models installed - two or more visible references run IP-Adapter passes. ${NOTICE_REFERENCE_MASKS_GLOBAL}`}
                </p>
              ) : (
                <>
                  <p className="type-caption text-text-body">
                    Multi-reference passes need{' '}
                    {missingReferenceRecords.map((id) => `'${id}'`).join(' and ')} on the
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

with the derivations near the existing `requiredRecords`:

```typescript
  const referenceRecords =
    layer.type === 'reference-image' ? requiredReferenceRecords(baseArchitecture) : [];
  const missingReferenceRecords = referenceRecords.filter(
    (recordId) => availableModels.find((model) => model.id === recordId)?.status !== 'ready',
  );
```

- [ ] **Step 6: Run to verify pass**

Run: `cd /c/vision-studio && npx vitest run src/pages/GeneratePanel.test.tsx src/components/canvas/CanvasControlLayerProperties.test.tsx src/store 2>&1 | tail -8; echo "EXIT:${PIPESTATUS[0]}"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add src/pages/GeneratePanel.tsx src/pages/GeneratePanel.test.tsx src/components/canvas/CanvasControlLayerProperties.tsx src/components/canvas/CanvasControlLayerProperties.test.tsx src/store/slices/generationSlice.ts src/store/appStore.types.ts && git branch --show-current && git commit -m "feat(guided): reference preflight UI, layer strength, pass-notices strip (#34 PR4)"
```

---

### Task 10: smokes + full gates + PR (PAUSE)

**Files:**
- Create: `backend/tests/test_guided_smoke_ipadapter_local.py`
- No other source changes.

- [ ] **Step 1: Write the env-gated smokes** (self-skip until weights are installed via the Foundry consent flow, mirroring the PR3 smoke file's `VS_REAL_SMOKE` pattern)

```python
"""#34 PR4 acceptance smokes: masked multi-reference measurably steers output.
Runs ONLY with VS_REAL_SMOKE=1, the full backend, and the per-family adapter +
encoder records installed. Maintainer gate before merging PR4.
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


def _solid_reference(tmp_path, name, color, size=512):
    from PIL import Image

    path = str(tmp_path / f"{name}.png")
    Image.new("RGB", (size, size), color).save(path)
    return path


def _half_mask(x, size=512):
    half = size // 2
    return {"type": "rectangle", "points": [{"x": x, "y": 0}],
            "bounds": {"x": x, "y": 0, "width": half, "height": size}}


def _ip_smoke(tmp_path, model_name, adapter_id, encoder_id, size=512, steps=12):
    import numpy as np
    from PIL import Image

    from utils.direct_generator import DirectGenerator

    for record_id in (adapter_id, encoder_id):
        if not os.path.isdir(os.path.join(MODELS_DIR, "ip-adapter", record_id)):
            pytest.skip(f"install {record_id} from the Foundry to run this smoke")

    refs = [
        {"layer_id": "r1", "layer_name": "Red", "strength": 1.0,
         "source_path": _solid_reference(tmp_path, "red", (220, 30, 30), size),
         "mask": _half_mask(0, size)},
        {"layer_id": "r2", "layer_name": "Green", "strength": 1.0,
         "source_path": _solid_reference(tmp_path, "green", (30, 200, 30), size),
         "mask": _half_mask(size // 2, size)},
    ]
    guided = {"controlnet": [], "reference_images": refs, "inpaint": None,
              "denoising_strength": 0.75}

    def run(out_name, guided_payload):
        out_dir = tmp_path / out_name
        out_dir.mkdir()
        gen = DirectGenerator(models_dir=MODELS_DIR, output_dir=str(out_dir))
        result = gen._generate_sync(
            "an abstract painting", "", size, size, steps, 7.5, 7, model_name,
            "euler", lambda *a: None, str(out_dir), None, None, guided_payload,
        )
        return np.asarray(Image.open(out_dir / "generated.png"), dtype=np.int32), result

    guided_image, result = run("guided", guided)
    plain_image, _ = run("plain", None)
    assert result["guided"]["references"][0]["record_id"] == adapter_id
    diff = np.abs(guided_image - plain_image).mean()
    assert diff > 10, "the reference layers did not change the output - IP-Adapter is not real"
    return guided_image, result


def test_sd15_masked_references_steer_their_regions(tmp_path):
    guided_image, result = _ip_smoke(
        tmp_path, "sd-1-5", "ip-adapter-sd15", "ip-adapter-encoder-vit-h")
    assert result["guided"]["references"][0]["masked"] is True
    # Masked steering: the red-referenced left half must skew redder than the
    # green-referenced right half (region-level, seed-stable direction check).
    left = guided_image[:, :256, :]
    right = guided_image[:, 256:, :]
    left_redness = left[:, :, 0].mean() - left[:, :, 1].mean()
    right_redness = right[:, :, 0].mean() - right[:, :, 1].mean()
    assert left_redness > right_redness, "masked references did not steer their regions"


def test_sdxl_masked_references_steer_their_regions(tmp_path):
    guided_image, result = _ip_smoke(
        tmp_path, "sdxl-base", "ip-adapter-sdxl", "ip-adapter-encoder-vit-h",
        size=1024, steps=8)
    assert result["guided"]["references"][0]["masked"] is True


def test_flux_references_apply_globally_with_notice(tmp_path):
    from guided.ip_adapter import NOTICE_REFERENCE_MASKS_GLOBAL

    guided_image, result = _ip_smoke(
        tmp_path, "flux-dev", "ip-adapter-flux", "ip-adapter-encoder-clip-vit-l",
        size=512, steps=4)
    assert result["guided"]["references"][0]["masked"] is False
    assert NOTICE_REFERENCE_MASKS_GLOBAL in result["guided"]["notices"]
```

- [ ] **Step 2: Confirm the smokes self-skip and commit them**

Run: `cd /c/vision-studio/backend && ./venv/Scripts/python.exe -m pytest tests/test_guided_smoke_ipadapter_local.py -v; echo "EXIT:$?"`
Expected: all SKIPPED (no VS_REAL_SMOKE)

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git add backend/tests/test_guided_smoke_ipadapter_local.py && git branch --show-current && git commit -m "test(guided): env-gated IP-Adapter per-family smokes (#34 PR4)"
```

- [ ] **Step 3: Full local gates**

Run (backend): `cd /c/vision-studio/backend && bash -c 'timeout 600 ./venv/Scripts/python.exe -m pytest tests/ -q 2>&1 | tail -3; echo "EXIT:${PIPESTATUS[0]}"'`
Run (frontend): `cd /c/vision-studio && npm run typecheck && npx vitest run 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Run (playwright config sanity): `npx playwright test --list 2>&1 | tail -3`
Expected: all green.

- [ ] **Step 4: Push + PR + CI**

Write the PR body to the scratchpad (summary of every task, honest caveats: smokes self-skip until weights installed - `ip-adapter-sd15` + `ip-adapter-encoder-vit-h` (~2.5 GB total) is the cheapest maintainer gate; SD 3.5 multi-reference declines because diffusers 0.37.1 ships a single-image SD3 IP-Adapter - a deliberate, documented spec deviation; the CLIP ViT-L record carries `license: null` because the upstream repo declares none). Then:

```bash
export PATH="/c/Program Files/nodejs:$PATH" && cd /c/vision-studio && git push -u origin feat/guided-passes-pr4-ip-adapter && gh pr create --title "Guided passes PR4: IP-Adapter masked multi-reference (#34)" --body-file <scratchpad>/pr4-body.md
```

Then `gh pr checks <N> --watch` (background) until all four checks pass.

- [ ] **Step 5: PAUSE - do not merge without the user's go-ahead (per release process).**

---

## Self-Review (executed while writing)

- **Spec coverage:** PR row 4 - two masked references each influence their region on SD1.5/SDXL (Task 6 + smoke); FLUX applies globally with the explicit notice surfaced in the UI (Tasks 3/6/9); adapter + encoder weights consent-gated (Task 1). Spec section 2 `ip_adapter.py` (Tasks 3-4); section 3 records + fit (Tasks 1/5/7); section 4 install/compat state on reference layers + preflight honesty (Tasks 8-9); section 5 degrade-with-notice + fail-loud (Tasks 2/6). Deviation from the spec's "all families": SD 3.5 declines because diffusers 0.37.1 ships a single-adapter single-image SD3 IP-Adapter (venv-verified) - honesty rails forbid pretending; follows the PR3 sd3.5-medium decline precedent and is called out in the PR body.
- **Placeholder scan:** Task 9 Step 1 test bodies are outlined rather than fully coded because they must reuse that file's established seeding helpers verbatim (E2E-seeding rule: real store actions, no hand-rolled setState literals) - the implementer writes them against the impl in the same task; every assertion target is named exactly. All other steps carry complete code.
- **Type consistency:** `ResolvedIPAdapterStack` fields used in Tasks 4/6/7 match Task 3's dataclass; `guided_fit_refusal(base_plan, family, profile, cn_model_dirs=, ip_model_dirs=)` consistent across Tasks 5/7; `resolveReferencePreflight(layers, baseArchitecture, availableModels, {modelId, hasInpaint})` consistent across Tasks 8/9; `strength` field name matches the backend payload.
