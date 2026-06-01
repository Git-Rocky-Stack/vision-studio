# Model Foundry M1 — Registry Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hardcoded model catalogs (backend `PREDEFINED_MODELS` dict + frontend `ModelSelector` `IMAGE_MODELS`/`VIDEO_MODELS` arrays) with one backend-owned, data-driven `ModelRecord` registry sourced from a versioned `verified-catalog.json`, surfaced over `GET /api/models` + `GET /api/models/{id}`, consumed by a new frontend `modelsSlice` that `ModelSelector` reads from — guarded by a drift regression test so the duplication can never silently return.

**Architecture:** Backend gains a `backend/foundry/` module: `verified-catalog.json` (the single catalog data file), a `ModelRecord` dataclass + loader, and a `ModelRegistry` that lists/gets records, resolves legacy id aliases, and reconciles on-disk status. `ModelManager` keeps working but loads its predefined set from the same JSON (backend drift killed). The FastAPI `/api/models` endpoints return `ModelRecord`s. On the frontend, a new Zustand `modelsSlice` owns `availableModels: ModelRecord[]` + `loadModels()`; `ModelSelector` renders capability-filtered records from it; its hardcoded arrays are deleted. M1 reuses the existing 4-value `ModelStatus` — richer download/location/hardware-fit fields arrive in M2–M5.

**Tech Stack:** Python 3 / FastAPI / dataclasses + Pydantic (backend); TypeScript / React 19 / Zustand / Vitest / Testing Library (frontend); Electron IPC (`ipcMain.handle` ↔ `contextBridge`); pytest (backend tests).

---

## Conventions & Constraints (read once before starting)

- **Branch:** all work lands on `feat/model-foundry`, cut from `main` (NOT the current `design/carbon-pro-content-panels` branch, which has a parallel agent's WIP). See Task 0.
- **Path alias:** `@/` → `src/`.
- **Backend tests** must run fast with **no torch and no network** — never import `torch` or call the network in a test. Use temp dirs (`tempfile.mkdtemp()`), real JSON, and the existing `sys.path` bootstrap.
- **CI runs Linux + Windows** — all backend path logic uses `os.path` / `pathlib`; never hardcode separators. Assertions accept both separators (see existing `test_model_manager.py`).
- **Green bar before each commit is allowed but the milestone gate is:** `npm run typecheck` && `npm test` && `npm run build` && `python -m pytest backend/tests -q` all green. The husky pre-commit hook runs the full vitest suite + typecheck on any staged `.ts/.tsx` — expect commits touching frontend files to take time; keep diffs focused.
- **Commit trailer:** every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Canonical M1 `ModelRecord` field set** (identical names on backend dataclass, backend Pydantic schema, frontend TS interface, and every catalog entry):
  `id, name, artifact_type, capability, base_architecture, source, repo_id, revision, aux_repo_id, size, status, tier, quality, runtime, hardware_class, vram, description, license, gated`.
  `status` uses the existing 4-value `ModelStatus` (`ready | downloading | error | not_found`) in M1.

---

## File Structure

**Backend (create):**
- `backend/foundry/__init__.py` — package marker + public exports.
- `backend/foundry/verified-catalog.json` — the single catalog data file (migrated from `PREDEFINED_MODELS`, enriched).
- `backend/foundry/model_record.py` — `ModelRecord` dataclass, `LEGACY_ID_ALIASES`, `load_catalog(path)`.
- `backend/foundry/schemas.py` — Pydantic `ModelRecordSchema` for FastAPI `response_model`.
- `backend/foundry/registry.py` — `ModelRegistry` (list/get/legacy-resolve/status-reconcile).
- `backend/tests/test_foundry_catalog.py`, `backend/tests/test_foundry_model_record.py`, `backend/tests/test_foundry_registry.py` — tests.

**Backend (modify):**
- `backend/utils/model_manager.py` — load predefined models from the catalog JSON (kill the hardcoded dict).
- `backend/main.py` — instantiate `ModelRegistry`; `/api/models` returns records; add `GET /api/models/{model_id}`.

**Frontend (create):**
- `src/store/slices/modelsSlice.ts` — `modelsInitialState`, `createModelsActions`, capability selector.
- `src/store/slices/modelsSlice.test.ts` — slice tests.
- `src/components/generate/ModelSelector.drift.test.ts` — single-source-of-truth regression test.

**Frontend (modify):**
- `src/types/model.ts` — add `ModelRecord`, `ModelCapability`, `ModelRuntime`, `ModelTier` (keep `ModelInfo`/`ModelStatus`).
- `src/store/appStore.types.ts` — `availableModels: ModelRecord[]`, action signatures, new `loadModels`.
- `src/store/slices/generationSlice.ts` — remove `availableModels`/`setAvailableModels` (moved to modelsSlice).
- `src/store/appStore.ts` — import + spread the models slice.
- `src/components/generate/ModelSelector.tsx` — read records from the store; delete hardcoded arrays.
- `src/components/generate/ModelSelector.test.tsx` — drive from store.
- `src/components/templates/TemplateCreator.tsx`, `src/pages/SettingsPanel.tsx` — annotate `ModelRecord` where they explicitly used `ModelInfo`.
- `electron/preload.ts` — add `models.get` (`models:get` channel) to `ElectronAPI`.
- `electron/ipc-handlers/generation.ts` — add `models:get` handler.
- `tests/integration/api-contracts.test.ts` — add `ModelRecord` + `/api/models/{id}` contract section.

---

## Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Cut the feature branch from main**

The parallel design agent owns `design/carbon-pro-content-panels` with uncommitted WIP — do NOT switch that working tree. Create the Foundry branch from `main`:

Run:
```bash
git fetch origin
git switch main
git switch -c feat/model-foundry
git branch --show-current
```
Expected: prints `feat/model-foundry`.

> If `git switch main` reports uncommitted changes blocking the switch, STOP and surface it — the design agent's WIP must be committed/stashed by its owner first, not by this plan.

---

## Task 1: Verified catalog data file

**Files:**
- Create: `backend/foundry/__init__.py`
- Create: `backend/foundry/verified-catalog.json`
- Test: `backend/tests/test_foundry_catalog.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_catalog.py`:
```python
import json
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"

REQUIRED_FIELDS = {
    "id", "name", "artifact_type", "capability", "base_architecture",
    "source", "repo_id", "revision", "aux_repo_id", "size", "status",
    "tier", "quality", "runtime", "hardware_class", "vram", "description",
    "license", "gated",
}

# Every id that existed in the legacy PREDEFINED_MODELS / ModelSelector lists
# must still be present, so no saved project's model id breaks.
LEGACY_IDS = {
    "flux-dev", "flux-schnell", "flux-fill", "sd3.5-large", "sd3.5-medium",
    "sdxl-base", "sdxl-refiner", "sd-1-5", "svd", "ltx-video", "animatediff",
    "sdxl-vae", "sd-vae-ft-mse",
}


def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def test_catalog_parses_and_is_keyed_by_id():
    catalog = load_catalog()
    assert isinstance(catalog, dict)
    assert len(catalog) >= len(LEGACY_IDS)
    for key, entry in catalog.items():
        assert entry["id"] == key


def test_every_entry_has_all_required_fields():
    catalog = load_catalog()
    for entry in catalog.values():
        missing = REQUIRED_FIELDS - set(entry.keys())
        assert not missing, f"{entry.get('id')} missing {missing}"


def test_all_legacy_ids_present():
    catalog = load_catalog()
    assert LEGACY_IDS.issubset(set(catalog.keys()))


def test_field_value_domains():
    catalog = load_catalog()
    for entry in catalog.values():
        assert entry["capability"] in {"image", "video", "edit", "inpaint"}
        assert entry["tier"] in {"verified", "compatible", "experimental"}
        assert entry["runtime"] in {"local", "comfyui", "cloud", "byom"}
        assert entry["status"] in {"ready", "downloading", "error", "not_found"}
        assert isinstance(entry["gated"], bool)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_catalog.py -q`
Expected: FAIL — `FileNotFoundError` / no such file `verified-catalog.json`.

- [ ] **Step 3: Create the package marker**

Create `backend/foundry/__init__.py`:
```python
"""Model Foundry — Hugging Face-native model registry and supply chain."""
```

- [ ] **Step 4: Create the catalog data file**

Create `backend/foundry/verified-catalog.json` (migrated from `PREDEFINED_MODELS`, enriched with the routing metadata previously hardcoded in `ModelSelector`):
```json
{
  "flux-dev": {
    "id": "flux-dev", "name": "FLUX.1 [dev]", "artifact_type": "checkpoint",
    "capability": "image", "base_architecture": "flux", "source": "huggingface",
    "repo_id": "black-forest-labs/FLUX.1-dev", "revision": "main", "aux_repo_id": null,
    "size": "23.8 GB", "status": "not_found", "tier": "verified", "quality": "pro",
    "runtime": "byom", "hardware_class": "workstation", "vram": "23.8 GB",
    "description": "State-of-the-art image generation model by Black Forest Labs.",
    "license": "flux-1-dev-non-commercial", "gated": true
  },
  "flux-schnell": {
    "id": "flux-schnell", "name": "FLUX.1 [schnell]", "artifact_type": "checkpoint",
    "capability": "image", "base_architecture": "flux", "source": "huggingface",
    "repo_id": "black-forest-labs/FLUX.1-schnell", "revision": "main", "aux_repo_id": null,
    "size": "23.8 GB", "status": "not_found", "tier": "verified", "quality": "draft",
    "runtime": "byom", "hardware_class": "workstation", "vram": "23.8 GB",
    "description": "Fast 4-step image generation model.",
    "license": "apache-2.0", "gated": false
  },
  "flux-fill": {
    "id": "flux-fill", "name": "FLUX.1 Fill [dev]", "artifact_type": "checkpoint",
    "capability": "inpaint", "base_architecture": "flux", "source": "huggingface",
    "repo_id": "black-forest-labs/FLUX.1-Fill-dev", "revision": "main", "aux_repo_id": null,
    "size": "23.8 GB", "status": "not_found", "tier": "verified", "quality": "pro",
    "runtime": "byom", "hardware_class": "workstation", "vram": "23.8 GB",
    "description": "Inpainting and outpainting model by Black Forest Labs.",
    "license": "flux-1-dev-non-commercial", "gated": true
  },
  "sd3.5-large": {
    "id": "sd3.5-large", "name": "Stable Diffusion 3.5 Large", "artifact_type": "diffusers-pipeline",
    "capability": "image", "base_architecture": "sd35", "source": "huggingface",
    "repo_id": "stabilityai/stable-diffusion-3.5-large", "revision": "main", "aux_repo_id": null,
    "size": "16 GB", "status": "not_found", "tier": "verified", "quality": "pro",
    "runtime": "local", "hardware_class": "workstation", "vram": "~12 GB",
    "description": "Modern MM-DiT architecture with superior composition and typography.",
    "license": "stabilityai-community", "gated": true
  },
  "sd3.5-medium": {
    "id": "sd3.5-medium", "name": "Stable Diffusion 3.5 Medium", "artifact_type": "diffusers-pipeline",
    "capability": "image", "base_architecture": "sd35", "source": "huggingface",
    "repo_id": "stabilityai/stable-diffusion-3.5-medium", "revision": "main", "aux_repo_id": null,
    "size": "5.5 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~6 GB",
    "description": "Strong prompt understanding and versatile output with low VRAM.",
    "license": "stabilityai-community", "gated": true
  },
  "sdxl-base": {
    "id": "sdxl-base", "name": "Stable Diffusion XL Base", "artifact_type": "checkpoint",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "stabilityai/stable-diffusion-xl-base-1.0", "revision": "main", "aux_repo_id": null,
    "size": "6.9 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~8 GB",
    "description": "High-resolution image generation by Stability AI.",
    "license": "openrail++", "gated": false
  },
  "sdxl-refiner": {
    "id": "sdxl-refiner", "name": "Stable Diffusion XL Refiner", "artifact_type": "checkpoint",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "stabilityai/stable-diffusion-xl-refiner-1.0", "revision": "main", "aux_repo_id": null,
    "size": "6.1 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "~8 GB",
    "description": "Detail refinement for SDXL by Stability AI.",
    "license": "openrail++", "gated": false
  },
  "sd-1-5": {
    "id": "sd-1-5", "name": "Stable Diffusion 1.5", "artifact_type": "checkpoint",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "runwayml/stable-diffusion-v1-5", "revision": "main", "aux_repo_id": null,
    "size": "4.3 GB", "status": "not_found", "tier": "verified", "quality": "local",
    "runtime": "local", "hardware_class": "laptop", "vram": "4.0 GB",
    "description": "Original Stable Diffusion 1.5 with broad LoRA and ControlNet support.",
    "license": "creativeml-openrail-m", "gated": false
  },
  "svd": {
    "id": "svd", "name": "Stable Video Diffusion", "artifact_type": "diffusers-pipeline",
    "capability": "video", "base_architecture": "svd", "source": "huggingface",
    "repo_id": "stabilityai/stable-video-diffusion-img2vid-xt", "revision": "main", "aux_repo_id": null,
    "size": "9.6 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "8.0 GB",
    "description": "Image-to-video generation by Stability AI. Requires a reference image.",
    "license": "stabilityai-community", "gated": false
  },
  "ltx-video": {
    "id": "ltx-video", "name": "LTX Video", "artifact_type": "diffusers-pipeline",
    "capability": "video", "base_architecture": "ltx", "source": "huggingface",
    "repo_id": "Lightricks/LTX-Video", "revision": "main", "aux_repo_id": null,
    "size": "9.4 GB", "status": "not_found", "tier": "verified", "quality": "pro",
    "runtime": "local", "hardware_class": "creator", "vram": "9.4 GB",
    "description": "High-quality text-to-video model by Lightricks.",
    "license": "ltx-video-license", "gated": false
  },
  "animatediff": {
    "id": "animatediff", "name": "AnimateDiff", "artifact_type": "motion-adapter",
    "capability": "video", "base_architecture": "animatediff", "source": "huggingface",
    "repo_id": "runwayml/stable-diffusion-v1-5", "revision": "main",
    "aux_repo_id": "guoyww/animatediff-motion-adapter-v1-5-2",
    "size": "1.6 GB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "creator", "vram": "8.0 GB",
    "description": "Animation motion module for Stable Diffusion 1.5.",
    "license": "creativeml-openrail-m", "gated": false
  },
  "sdxl-vae": {
    "id": "sdxl-vae", "name": "SDXL VAE", "artifact_type": "vae",
    "capability": "image", "base_architecture": "sdxl", "source": "huggingface",
    "repo_id": "madebyollin/sdxl-vae-fp16-fix", "revision": "main", "aux_repo_id": null,
    "size": "335 MB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "0.3 GB",
    "description": "FP16-fixed VAE for SDXL.",
    "license": "mit", "gated": false
  },
  "sd-vae-ft-mse": {
    "id": "sd-vae-ft-mse", "name": "SD VAE FT MSE", "artifact_type": "vae",
    "capability": "image", "base_architecture": "sd15", "source": "huggingface",
    "repo_id": "stabilityai/sd-vae-ft-mse", "revision": "main", "aux_repo_id": null,
    "size": "335 MB", "status": "not_found", "tier": "verified", "quality": "balanced",
    "runtime": "local", "hardware_class": "laptop", "vram": "0.3 GB",
    "description": "Fine-tuned VAE with MSE loss.",
    "license": "mit", "gated": false
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_catalog.py -q`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/foundry/__init__.py backend/foundry/verified-catalog.json backend/tests/test_foundry_catalog.py
git commit -m "feat(foundry): add verified-catalog.json as the single backend model catalog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `ModelRecord` dataclass + catalog loader + legacy aliases

**Files:**
- Create: `backend/foundry/model_record.py`
- Test: `backend/tests/test_foundry_model_record.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_model_record.py`:
```python
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.model_record import (  # type: ignore[import-not-found]
    LEGACY_ID_ALIASES,
    ModelRecord,
    load_catalog,
)

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"


def test_load_catalog_returns_model_records_keyed_by_id():
    records = load_catalog(str(CATALOG_PATH))
    assert isinstance(records, dict)
    assert all(isinstance(value, ModelRecord) for value in records.values())
    assert records["flux-dev"].name == "FLUX.1 [dev]"
    assert records["flux-dev"].tier == "verified"
    assert records["animatediff"].aux_repo_id == "guoyww/animatediff-motion-adapter-v1-5-2"


def test_to_dict_roundtrips_all_canonical_fields():
    record = ModelRecord(
        id="x", name="X", artifact_type="checkpoint", capability="image",
        base_architecture="sdxl", source="huggingface", repo_id="org/x",
        size="1 GB", description="desc",
    )
    data = record.to_dict()
    assert data["id"] == "x"
    assert data["revision"] == "main"          # default
    assert data["status"] == "not_found"       # default
    assert data["tier"] == "verified"          # default
    assert data["gated"] is False              # default
    assert data["hardware_class"] == "unknown" # default


def test_legacy_aliases_map_to_canonical_ids():
    # Aliases must resolve to ids that exist in the catalog.
    records = load_catalog(str(CATALOG_PATH))
    for alias, canonical in LEGACY_ID_ALIASES.items():
        assert canonical in records, f"alias {alias} -> missing {canonical}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_model_record.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.model_record'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/model_record.py`:
```python
"""ModelRecord — the atomic unit of the Model Foundry registry.

M1 carries identity, classification, origin, and curated routing metadata.
Live download/location/hardware-fit fields are added in later milestones.
"""

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional


@dataclass
class ModelRecord:
    # Identity
    id: str
    name: str
    artifact_type: str          # checkpoint | diffusers-pipeline | lora | vae | controlnet | embedding | motion-adapter
    capability: str             # image | video | edit | inpaint
    base_architecture: str      # flux | sdxl | sd15 | sd35 | ltx | svd | animatediff | unknown
    source: str                 # huggingface | civitai | local | linked

    # Origin
    repo_id: Optional[str] = None
    revision: str = "main"      # pinned for reproducibility (Pillar 5)
    aux_repo_id: Optional[str] = None

    # State (M1: reuse the existing 4-value status; richer union arrives in M2)
    size: str = "Unknown"
    status: str = "not_found"   # ready | downloading | error | not_found

    # Compatibility / curation
    tier: str = "verified"      # verified | compatible | experimental
    quality: str = "balanced"   # draft | balanced | pro | experimental | local
    runtime: str = "local"      # local | comfyui | cloud | byom
    hardware_class: str = "unknown"  # laptop | creator | workstation | unknown
    vram: str = "Unknown"

    # Provenance
    description: str = ""
    license: Optional[str] = None
    gated: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Legacy id aliases → canonical catalog ids. Saved projects / jobs that
# reference an old slug resolve here so nothing breaks. (Seeded empty —
# every historical id is currently still canonical; add entries here if a
# slug is ever renamed.)
LEGACY_ID_ALIASES: Dict[str, str] = {}


def load_catalog(path: str) -> Dict[str, "ModelRecord"]:
    """Load verified-catalog.json into ModelRecord objects keyed by id."""
    with open(path, "r", encoding="utf-8") as handle:
        raw = json.load(handle)

    records: Dict[str, ModelRecord] = {}
    for model_id, entry in raw.items():
        records[model_id] = ModelRecord(**entry)
    return records
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_model_record.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/model_record.py backend/tests/test_foundry_model_record.py
git commit -m "feat(foundry): add ModelRecord dataclass, catalog loader, legacy alias map

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `ModelRegistry` (list / get / legacy-resolve / status-reconcile)

**Files:**
- Create: `backend/foundry/registry.py`
- Test: `backend/tests/test_foundry_registry.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_registry.py`:
```python
import os
import pathlib
import sys
import tempfile

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.registry import ModelRegistry  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")


def make_registry():
    return ModelRegistry(models_dir=tempfile.mkdtemp(), catalog_path=CATALOG_PATH)


def test_list_records_returns_all_catalog_entries_as_dicts():
    registry = make_registry()
    records = registry.list_records()
    assert isinstance(records, list)
    assert len(records) >= 13
    ids = {r["id"] for r in records}
    assert "flux-dev" in ids and "ltx-video" in ids


def test_get_record_by_id():
    registry = make_registry()
    record = registry.get_record("flux-dev")
    assert record is not None
    assert record["name"] == "FLUX.1 [dev]"


def test_get_record_unknown_returns_none():
    registry = make_registry()
    assert registry.get_record("does-not-exist") is None


def test_get_record_resolves_legacy_alias(monkeypatch):
    registry = make_registry()
    # Inject a temporary alias to prove resolution wiring works.
    registry.legacy_aliases["sd15"] = "sd-1-5"
    record = registry.get_record("sd15")
    assert record is not None
    assert record["id"] == "sd-1-5"


def test_status_reconciles_to_ready_when_present_on_disk():
    models_dir = tempfile.mkdtemp()
    # Simulate a downloaded diffusers bundle for ltx-video.
    bundle = os.path.join(models_dir, "diffusers", "ltx-video")
    os.makedirs(bundle, exist_ok=True)
    with open(os.path.join(bundle, "model_index.json"), "w", encoding="utf-8") as handle:
        handle.write("{}")

    registry = ModelRegistry(models_dir=models_dir, catalog_path=CATALOG_PATH)
    record = registry.get_record("ltx-video")
    assert record["status"] == "ready"

    # A model with no files on disk stays not_found.
    assert registry.get_record("flux-dev")["status"] == "not_found"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_registry.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'foundry.registry'`.

- [ ] **Step 3: Write the implementation**

Create `backend/foundry/registry.py`:
```python
"""ModelRegistry — the single backend-owned source of truth for the catalog.

M1 responsibilities: load the verified catalog, list/get ModelRecords as
plain dicts (FastAPI-serializable), resolve legacy id aliases, and reconcile
each record's status against what is actually present in the models dir.
"""

import os
from typing import Any, Dict, List, Optional

from foundry.model_record import LEGACY_ID_ALIASES, ModelRecord, load_catalog


class ModelRegistry:
    def __init__(self, models_dir: str, catalog_path: str):
        self.models_dir = models_dir
        self.catalog_path = catalog_path
        self.records: Dict[str, ModelRecord] = load_catalog(catalog_path)
        # Copy so tests/callers can extend without mutating module state.
        self.legacy_aliases: Dict[str, str] = dict(LEGACY_ID_ALIASES)

    # ── public API ────────────────────────────────────────────────────────
    def list_records(self) -> List[Dict[str, Any]]:
        return [self._reconciled(record) for record in self.records.values()]

    def get_record(self, model_id: str) -> Optional[Dict[str, Any]]:
        canonical = self.legacy_aliases.get(model_id, model_id)
        record = self.records.get(canonical)
        if record is None:
            return None
        return self._reconciled(record)

    # ── internals ─────────────────────────────────────────────────────────
    def _reconciled(self, record: ModelRecord) -> Dict[str, Any]:
        data = record.to_dict()
        data["status"] = "ready" if self._is_present(record) else record.status
        return data

    def _is_present(self, record: ModelRecord) -> bool:
        """True when the model's expected files exist in models_dir.

        Diffusers pipelines / motion adapters live under diffusers/<id>/;
        single-file artifacts live under their typed subdir. We treat a
        non-empty expected location as 'ready' — full integrity verification
        arrives with the acquisition engine (M2).
        """
        candidates = []
        if record.artifact_type in {"diffusers-pipeline", "motion-adapter"}:
            candidates.append(os.path.join(self.models_dir, "diffusers", record.id))
        subdir = _ARTIFACT_SUBDIR.get(record.artifact_type)
        if subdir:
            candidates.append(os.path.join(self.models_dir, subdir, record.id))
            candidates.append(os.path.join(self.models_dir, subdir))
        for path in candidates:
            if os.path.isdir(path) and os.listdir(path):
                return True
        return False


_ARTIFACT_SUBDIR = {
    "checkpoint": "checkpoints",
    "diffusers-pipeline": "diffusers",
    "motion-adapter": "diffusers",
    "lora": "loras",
    "vae": "vaes",
    "controlnet": "controlnet",
    "embedding": "embeddings",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_registry.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/foundry/registry.py backend/tests/test_foundry_registry.py
git commit -m "feat(foundry): add ModelRegistry with legacy-alias resolve and status reconcile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Load `ModelManager` predefined models from the catalog (kill backend drift)

**Files:**
- Modify: `backend/utils/model_manager.py:42-181` (replace the hardcoded `PREDEFINED_MODELS` dict with a loader)
- Test: `backend/tests/test_foundry_model_manager_catalog.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_model_manager_catalog.py`:
```python
import json
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.model_manager import PREDEFINED_MODELS, ModelInfo  # type: ignore[import-not-found]

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"


def test_predefined_models_are_loaded_from_the_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)

    # Single source of truth: PREDEFINED_MODELS ids exactly match the catalog.
    assert set(PREDEFINED_MODELS.keys()) == set(catalog.keys())


def test_predefined_entries_preserve_download_coordinates():
    # The download path depends on repo_id (and for diffusers, the bundle id).
    flux = PREDEFINED_MODELS["flux-dev"]
    assert isinstance(flux, ModelInfo)
    assert flux.repo_id == "black-forest-labs/FLUX.1-dev"
    animatediff = PREDEFINED_MODELS["animatediff"]
    assert animatediff.aux_repo_id == "guoyww/animatediff-motion-adapter-v1-5-2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_model_manager_catalog.py -q`
Expected: FAIL — `test_predefined_models_are_loaded_from_the_catalog` fails on a key-set mismatch only if the catalog and hardcoded dict drift; it will actually fail first on the *second* test if `aux_repo_id` differs, OR pass spuriously today. To force a real red: it fails because the hardcoded dict still exists independently (drift is possible). Proceed to make the source singular.

> Note: this test encodes the invariant "PREDEFINED_MODELS == catalog". It is RED until Step 3 makes `PREDEFINED_MODELS` derive from the JSON. If it happens to pass before Step 3 (because the hand-written dict currently matches), still perform Step 3 — the goal is structural single-sourcing, and the test guards it going forward.

- [ ] **Step 3: Replace the hardcoded dict with a catalog-backed loader**

In `backend/utils/model_manager.py`, DELETE the entire `PREDEFINED_MODELS = { ... }` literal (lines 42–181) and replace it with a loader that builds `ModelInfo` objects from `verified-catalog.json`, mapping the record's `artifact_type` to the manager's legacy `type` vocabulary and selecting only the fields the dataclass accepts:
```python
import json
from pathlib import Path

# Path: backend/utils/model_manager.py -> backend/foundry/verified-catalog.json
_CATALOG_PATH = Path(__file__).resolve().parents[1] / "foundry" / "verified-catalog.json"

# Foundry artifact_type -> ModelManager's legacy type vocabulary.
_ARTIFACT_TYPE_TO_LEGACY = {
    "checkpoint": "checkpoint",
    "diffusers-pipeline": "diffusers",
    "motion-adapter": "diffusers",
    "lora": "lora",
    "vae": "vae",
    "controlnet": "controlnet",
    "embedding": "embedding",
}

# Single-file artifacts that download via hf_hub_download need a filename.
_SINGLE_FILE_FILENAMES = {
    "flux-dev": "flux1-dev.safetensors",
    "flux-schnell": "flux1-schnell.safetensors",
    "flux-fill": "flux1-fill-dev.safetensors",
    "sdxl-base": "sd_xl_base_1.0.safetensors",
    "sdxl-refiner": "sd_xl_refiner_1.0.safetensors",
    "sd-1-5": "v1-5-pruned-emaonly.safetensors",
    "sdxl-vae": "sdxl.vae.safetensors",
    "sd-vae-ft-mse": "diffusion_pytorch_model.safetensors",
}


def _load_predefined_models() -> Dict[str, ModelInfo]:
    with open(_CATALOG_PATH, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)

    models: Dict[str, ModelInfo] = {}
    for model_id, entry in catalog.items():
        legacy_type = _ARTIFACT_TYPE_TO_LEGACY.get(entry["artifact_type"], "checkpoint")
        models[model_id] = ModelInfo(
            id=entry["id"],
            name=entry["name"],
            type=legacy_type,
            source=entry["source"],
            repo_id=entry.get("repo_id"),
            aux_repo_id=entry.get("aux_repo_id"),
            filename=_SINGLE_FILE_FILENAMES.get(model_id),
            size=entry.get("size", "Unknown"),
            description=entry.get("description", ""),
        )
    return models


PREDEFINED_MODELS: Dict[str, ModelInfo] = _load_predefined_models()
```

Keep the `ModelInfo` dataclass (lines 22–39) and the rest of `ModelManager` unchanged. Ensure `from pathlib import Path` and `import json` are present at the top (add if missing).

- [ ] **Step 4: Run tests to verify they pass (including the pre-existing manager tests)**

Run: `python -m pytest backend/tests/test_foundry_model_manager_catalog.py backend/tests/test_model_manager.py -q`
Expected: PASS — new catalog test green AND the three existing `ModelManagerTests` still green (download coordinates preserved).

- [ ] **Step 5: Commit**

```bash
git add backend/utils/model_manager.py backend/tests/test_foundry_model_manager_catalog.py
git commit -m "refactor(foundry): load ModelManager predefined models from verified-catalog.json

Removes the hardcoded PREDEFINED_MODELS dict; the catalog JSON is now the
single backend source. Download coordinates (repo_id, aux_repo_id, filename)
preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire the registry into FastAPI (`/api/models` returns records; add `/api/models/{id}`)

**Files:**
- Create: `backend/foundry/schemas.py`
- Modify: `backend/main.py` (instantiate registry near line 103; replace `list_models` body at 1403–1433; add a get-by-id route)
- Test: `backend/tests/test_foundry_api.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_foundry_api.py` (uses FastAPI's `TestClient`; no torch, no network — the registry only reads JSON + the temp models dir):
```python
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # type: ignore[import-not-found]
import main  # type: ignore[import-not-found]

client = TestClient(main.app)


def test_list_models_returns_records_with_record_fields():
    response = client.get("/api/models")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list) and len(payload) >= 13
    flux = next(item for item in payload if item["id"] == "flux-dev")
    # Record-shaped fields the old ModelInfo response lacked:
    assert flux["capability"] == "image"
    assert flux["tier"] == "verified"
    assert flux["base_architecture"] == "flux"
    assert flux["runtime"] == "byom"


def test_get_model_by_id_returns_one_record():
    response = client.get("/api/models/ltx-video")
    assert response.status_code == 200
    assert response.json()["id"] == "ltx-video"


def test_get_unknown_model_returns_404():
    response = client.get("/api/models/nope-not-real")
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_foundry_api.py -q`
Expected: FAIL — `/api/models` still returns legacy `ModelInfo` (no `capability`/`tier`), and `/api/models/{id}` returns 200 from the existing `.../status`-less route or 404 mismatch.

- [ ] **Step 3a: Add the Pydantic response schema**

Create `backend/foundry/schemas.py`:
```python
"""Pydantic schema mirroring ModelRecord for FastAPI response_model."""

from typing import Optional

from pydantic import BaseModel


class ModelRecordSchema(BaseModel):
    id: str
    name: str
    artifact_type: str
    capability: str
    base_architecture: str
    source: str
    repo_id: Optional[str] = None
    revision: str = "main"
    aux_repo_id: Optional[str] = None
    size: str = "Unknown"
    status: str = "not_found"
    tier: str = "verified"
    quality: str = "balanced"
    runtime: str = "local"
    hardware_class: str = "unknown"
    vram: str = "Unknown"
    description: str = ""
    license: Optional[str] = None
    gated: bool = False
```

- [ ] **Step 3b: Instantiate the registry in `main.py`**

In `backend/main.py`, immediately after the existing `model_manager = ModelManager(MODELS_DIR)` (line 103), add:
```python
from foundry.registry import ModelRegistry
from foundry.schemas import ModelRecordSchema

_CATALOG_PATH = os.path.join(os.path.dirname(__file__), "foundry", "verified-catalog.json")
model_registry = ModelRegistry(models_dir=MODELS_DIR, catalog_path=_CATALOG_PATH)
```
(Place the two `from foundry...` imports with the other `from utils...` imports near line 62 if you prefer top-of-file imports — either is fine; keep them above first use.)

- [ ] **Step 3c: Replace the `list_models` route and add get-by-id**

In `backend/main.py`, replace the `list_models` route (lines 1403–1433) so it returns records, and add a get-by-id route immediately after it. Keep the existing `/api/models/{model_id}/status`, `/download`, and `DELETE` routes unchanged:
```python
@app.get("/api/models", response_model=List[ModelRecordSchema], tags=["Models"])
@limiter.limit("60/minute")
async def list_models(request: Request):
    """List every model in the Foundry registry as ModelRecords."""
    return model_registry.list_records()


@app.get("/api/models/{model_id}", response_model=ModelRecordSchema, tags=["Models"])
@limiter.limit("60/minute")
async def get_model_record(request: Request, model_id: str):
    """Return a single ModelRecord by id (resolving legacy aliases), or 404."""
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return record
```
Confirm `HTTPException` is already imported in `main.py` (it is used elsewhere). The old Pydantic `ModelInfo` (main.py:417) may remain for now; it is no longer referenced by `/api/models` and can be removed in a later cleanup.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_foundry_api.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `python -m pytest backend/tests -q`
Expected: PASS (all tests, including the existing generation/job/migration suites).

- [ ] **Step 6: Commit**

```bash
git add backend/foundry/schemas.py backend/main.py backend/tests/test_foundry_api.py
git commit -m "feat(foundry): serve ModelRecords from /api/models and add GET /api/models/{id}

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend `ModelRecord` types

**Files:**
- Modify: `src/types/model.ts`
- Test: `src/types/model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/types/model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isImageCapability, type ModelRecord } from './model';

const sample: ModelRecord = {
  id: 'flux-dev',
  name: 'FLUX.1 [dev]',
  artifact_type: 'checkpoint',
  capability: 'image',
  base_architecture: 'flux',
  source: 'huggingface',
  repo_id: 'black-forest-labs/FLUX.1-dev',
  revision: 'main',
  aux_repo_id: null,
  size: '23.8 GB',
  status: 'not_found',
  tier: 'verified',
  quality: 'pro',
  runtime: 'byom',
  hardware_class: 'workstation',
  vram: '23.8 GB',
  description: 'desc',
  license: 'flux-1-dev-non-commercial',
  gated: true,
};

describe('ModelRecord', () => {
  it('isImageCapability is true for image and inpaint/edit, false for video', () => {
    expect(isImageCapability(sample)).toBe(true);
    expect(isImageCapability({ ...sample, capability: 'inpaint' })).toBe(true);
    expect(isImageCapability({ ...sample, capability: 'video' })).toBe(false);
  });

  it('a ModelRecord is assignable where the legacy ModelInfo is expected', () => {
    // Compile-time guarantee that existing ModelInfo consumers keep working.
    const asInfo: { id: string; name: string; status: string } = sample;
    expect(asInfo.id).toBe('flux-dev');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/model.test.ts`
Expected: FAIL — `isImageCapability` / `ModelRecord` not exported from `./model`.

- [ ] **Step 3: Extend the types**

Replace the contents of `src/types/model.ts` with (keeps `ModelInfo`/`ModelStatus` intact, adds the record types + helper):
```ts
export type ModelStatus = 'ready' | 'downloading' | 'error' | 'not_found';

export type ModelCapability = 'image' | 'video' | 'edit' | 'inpaint';
export type ModelRuntime = 'local' | 'comfyui' | 'cloud' | 'byom';
export type ModelTier = 'verified' | 'compatible' | 'experimental';
export type ModelQuality = 'draft' | 'balanced' | 'pro' | 'experimental' | 'local';
export type ModelHardwareClass = 'laptop' | 'creator' | 'workstation' | 'unknown';

/** Legacy thin model shape. Retained for existing consumers. */
export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
  status: ModelStatus;
  progress?: number;
  type?: string;
  format?: string;
}

/**
 * The Foundry's atomic unit. A superset of ModelInfo — a ModelRecord is
 * always assignable where a ModelInfo is expected (M1 reuses ModelStatus).
 */
export interface ModelRecord {
  id: string;
  name: string;
  artifact_type: string;
  capability: ModelCapability;
  base_architecture: string;
  source: 'huggingface' | 'civitai' | 'local' | 'linked';
  repo_id: string | null;
  revision: string;
  aux_repo_id: string | null;
  size: string;
  status: ModelStatus;
  tier: ModelTier;
  quality: ModelQuality;
  runtime: ModelRuntime;
  hardware_class: ModelHardwareClass;
  vram: string;
  description: string;
  license: string | null;
  gated: boolean;
  // Optional legacy-compat fields some consumers read:
  type?: string;
  progress?: number;
}

export function isImageCapability(record: Pick<ModelRecord, 'capability'>): boolean {
  return record.capability !== 'video';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/model.ts src/types/model.test.ts
git commit -m "feat(foundry): add frontend ModelRecord type as a ModelInfo superset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `modelsSlice` (own `availableModels` + `loadModels`)

**Files:**
- Create: `src/store/slices/modelsSlice.ts`
- Create: `src/store/slices/modelsSlice.test.ts`
- Modify: `src/store/slices/generationSlice.ts` (remove `availableModels` state + `setAvailableModels`)
- Modify: `src/store/appStore.types.ts` (retype `availableModels`, add `loadModels`)
- Modify: `src/store/appStore.ts` (import + spread the models slice)

- [ ] **Step 1: Write the failing test**

Create `src/store/slices/modelsSlice.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../appStore';
import type { ModelRecord } from '@/types/model';

function record(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'flux-dev', name: 'FLUX.1 [dev]', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'flux', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '1 GB', status: 'ready', tier: 'verified', quality: 'pro',
    runtime: 'local', hardware_class: 'workstation', vram: '1 GB', description: '', license: null,
    gated: false, ...over,
  };
}

describe('modelsSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ availableModels: [] });
  });

  it('setAvailableModels replaces the catalog', () => {
    useAppStore.getState().setAvailableModels([record({ id: 'a' }), record({ id: 'b' })]);
    expect(useAppStore.getState().availableModels.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('loadModels fetches records from the backend bridge and stores them', async () => {
    const list = vi.fn().mockResolvedValue([record({ id: 'flux-dev' }), record({ id: 'ltx-video', capability: 'video' })]);
    (globalThis as any).window = { electron: { models: { list } } };

    await useAppStore.getState().loadModels();

    expect(list).toHaveBeenCalledOnce();
    expect(useAppStore.getState().availableModels).toHaveLength(2);
  });

  it('loadModels swallows backend errors and leaves the catalog intact', async () => {
    useAppStore.getState().setAvailableModels([record({ id: 'keep' })]);
    const list = vi.fn().mockRejectedValue(new Error('backend down'));
    (globalThis as any).window = { electron: { models: { list } } };

    await useAppStore.getState().loadModels();

    expect(useAppStore.getState().availableModels.map((m) => m.id)).toEqual(['keep']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/slices/modelsSlice.test.ts`
Expected: FAIL — `loadModels` is not a function / slice not wired.

- [ ] **Step 3a: Create the slice**

Create `src/store/slices/modelsSlice.ts`:
```ts
import type { AppSet, AppGet } from '../appStore.types';
import type { ModelRecord, ModelCapability } from '@/types/model';

export const modelsInitialState = {
  availableModels: [] as ModelRecord[],
};

export function createModelsActions(set: AppSet, _get: AppGet) {
  return {
    setAvailableModels: (models: ModelRecord[]) => set({ availableModels: models }),
    loadModels: async () => {
      try {
        const models = await window.electron.models.list();
        set({ availableModels: models as ModelRecord[] });
      } catch {
        // Local-first: a backend hiccup must not wipe the known catalog.
      }
    },
  };
}

/** Filter helper: records routable for a given generation capability. */
export function selectModelsByCapability(
  models: ModelRecord[],
  generationType: 'image' | 'video',
): ModelRecord[] {
  const wanted: ModelCapability[] =
    generationType === 'video' ? ['video'] : ['image', 'edit', 'inpaint'];
  return models.filter((model) => wanted.includes(model.capability));
}
```

- [ ] **Step 3b: Remove the moved state/action from `generationSlice.ts`**

In `src/store/slices/generationSlice.ts`:
- Delete `availableModels: [] as ModelInfo[],` from `generationInitialState` (line ~21).
- Delete `setAvailableModels: (models: ModelInfo[]) => set({ availableModels: models }),` from the actions (line ~93).
- Remove the now-unused `ModelInfo` import if nothing else in the file uses it (check; if other refs exist, keep it).

- [ ] **Step 3c: Update `appStore.types.ts`**

In `src/store/appStore.types.ts`:
- Change the import on line 124 from `import type { ModelInfo } from '@/types/model';` to `import type { ModelInfo, ModelRecord } from '@/types/model';`.
- Change line 315 `availableModels: ModelInfo[];` → `availableModels: ModelRecord[];`.
- Change line 483 `setAvailableModels: (models: ModelInfo[]) => void;` → `setAvailableModels: (models: ModelRecord[]) => void;` and add directly beneath it:
  ```ts
  loadModels: () => Promise<void>;
  ```

- [ ] **Step 3d: Register the slice in `appStore.ts`**

In `src/store/appStore.ts`:
- Add to the slice imports block (near line 51):
  ```ts
  import { modelsInitialState, createModelsActions } from './slices/modelsSlice';
  ```
- Add to the store composition object (inside `create<AppState>()(persist((set, get) => ({ ... })))`, near the other spreads around line 998):
  ```ts
        ...modelsInitialState,
        ...createModelsActions(set, get),
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/slices/modelsSlice.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck (catches any missed consumer)**

Run: `npm run typecheck`
Expected: PASS. If `availableModels` consumers error on the `ModelInfo`→`ModelRecord` widening, they are handled in Task 9 — if typecheck fails only there, proceed to Task 9 then re-run. (It should pass now because `ModelRecord` is assignable to `ModelInfo`.)

- [ ] **Step 6: Commit**

```bash
git add src/store/slices/modelsSlice.ts src/store/slices/modelsSlice.test.ts src/store/slices/generationSlice.ts src/store/appStore.types.ts src/store/appStore.ts
git commit -m "feat(foundry): add modelsSlice owning availableModels + loadModels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: IPC — add `models.get`

**Files:**
- Modify: `electron/preload.ts` (add `get` to the `models` API + `ElectronAPI` type)
- Modify: `electron/ipc-handlers/generation.ts` (register `models:get`)
- Test: `tests/integration/api-contracts.test.ts` (add ModelRecord + get-by-id contract section)

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/api-contracts.test.ts` (before the `// ── Helper implementations ──` divider) a new section, plus the helper at the bottom with the other helpers:
```ts
// ── ModelRecord / models endpoints contract ──────────────────────────────

describe('ModelRecord contract', () => {
  it('a record carries the canonical Foundry fields', () => {
    const record = buildModelRecord({ id: 'flux-dev', capability: 'image', tier: 'verified' });
    expect(record).toMatchObject({
      id: 'flux-dev',
      capability: 'image',
      tier: 'verified',
      base_architecture: expect.any(String),
      runtime: expect.any(String),
      status: expect.any(String),
    });
  });

  it('maps a backend records array to the frontend list shape', () => {
    const mapped = mapModelsListResponse([
      buildModelRecord({ id: 'a' }),
      buildModelRecord({ id: 'b', capability: 'video' }),
    ]);
    expect(mapped.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
```
And add these helpers next to the other helper functions at the bottom of the file:
```ts
interface ModelRecordShape {
  id: string;
  name: string;
  artifact_type: string;
  capability: 'image' | 'video' | 'edit' | 'inpaint';
  base_architecture: string;
  source: string;
  repo_id: string | null;
  revision: string;
  aux_repo_id: string | null;
  size: string;
  status: string;
  tier: string;
  quality: string;
  runtime: string;
  hardware_class: string;
  vram: string;
  description: string;
  license: string | null;
  gated: boolean;
}

function buildModelRecord(over: Partial<ModelRecordShape>): ModelRecordShape {
  return {
    id: 'model', name: 'Model', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'sdxl', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '1 GB', status: 'not_found', tier: 'verified', quality: 'balanced',
    runtime: 'local', hardware_class: 'creator', vram: '1 GB', description: '', license: null,
    gated: false, ...over,
  };
}

function mapModelsListResponse(records: ModelRecordShape[]): ModelRecordShape[] {
  return records;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/api-contracts.test.ts`
Expected: FAIL — `buildModelRecord` / `mapModelsListResponse` not defined (until the helpers compile) — confirm the new `describe` block is the failing target, then it passes once helpers are added in the same step. (If you add the helpers with the test in one save, run still proves the new assertions execute.)

> TDD note: because this contract file co-locates test + helper, write the `describe` block first and run to see the helper-missing failure, then add the helpers and re-run to green.

- [ ] **Step 3a: Add `models.get` to preload**

In `electron/preload.ts`:
- In the `ElectronAPI` interface `models` block (lines 289–294), add a `get` member:
  ```ts
    models: {
      list: () => Promise<any[]>;
      get: (modelId: string) => Promise<any>;
      download: (modelId: string) => Promise<{ success: boolean; message?: string }>;
      getStatus: (modelId: string) => Promise<any>;
      delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
    };
  ```
- In the `electronAPI.models` implementation (lines 378–383), add the bridge:
  ```ts
    models: {
      list: () => ipcRenderer.invoke('models:list'),
      get: (modelId: string) => ipcRenderer.invoke('models:get', modelId),
      download: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
      getStatus: (modelId: string) => ipcRenderer.invoke('models:get-status', modelId),
      delete: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
    },
  ```

- [ ] **Step 3b: Register the `models:get` handler**

In `electron/ipc-handlers/generation.ts`, directly after the `models:list` handler (ends ~line 561), add (mirroring the existing handlers' `requestBackend` + `backendAuthHeaders()` pattern; note the real backend route is `/api/models/{id}`):
```ts
ipcMain.handle('models:get', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() =>
      axios.get(`${BACKEND_URL}/api/models/${modelId}`, { headers: backendAuthHeaders() }),
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get model record:', error);
    return null;
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/api-contracts.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add electron/preload.ts electron/ipc-handlers/generation.ts tests/integration/api-contracts.test.ts
git commit -m "feat(foundry): add models:get IPC channel + ModelRecord contract tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Rewire `ModelSelector` to the store; delete hardcoded arrays

**Files:**
- Modify: `src/components/generate/ModelSelector.tsx` (delete `IMAGE_MODELS`/`VIDEO_MODELS`; read from store)
- Modify: `src/components/generate/ModelSelector.test.tsx` (seed the store)
- Modify: `src/components/templates/TemplateCreator.tsx:75`, `src/pages/SettingsPanel.tsx:1294` (annotate `ModelRecord`)

- [ ] **Step 1: Rewrite the `ModelSelector` test to drive from the store**

Replace `src/components/generate/ModelSelector.test.tsx` with:
```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelSelector } from './ModelSelector';
import { useAppStore } from '@/store/appStore';
import type { ModelRecord } from '@/types/model';

function record(over: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'flux-dev', name: 'FLUX.1 [dev]', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'flux', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '23.8 GB', status: 'not_found', tier: 'verified', quality: 'pro',
    runtime: 'byom', hardware_class: 'workstation', vram: '23.8 GB', description: 'desc',
    license: null, gated: false, ...over,
  };
}

describe('ModelSelector', () => {
  beforeEach(() => {
    useAppStore.setState({
      availableModels: [
        record({ id: 'flux-dev', name: 'FLUX.1 [dev]', capability: 'image' }),
        record({ id: 'ltx-video', name: 'LTX Video', capability: 'video', runtime: 'local' }),
        record({ id: 'animatediff', name: 'AnimateDiff', capability: 'video', runtime: 'local' }),
      ],
    });
  });
  afterEach(cleanup);

  it('renders the selected model from the store', () => {
    render(<ModelSelector value="flux-dev" generationType="image" onChange={vi.fn()} />);
    expect(screen.getByText('FLUX.1 [dev]')).toBeInTheDocument();
  });

  it('lists capability-filtered video models and keeps ids on select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelSelector value="ltx-video" generationType="video" onChange={onChange} />);

    await user.click(screen.getByTestId('model-selector-trigger'));
    await user.click(screen.getByRole('option', { name: /AnimateDiff/i }));

    expect(onChange).toHaveBeenCalledWith('animatediff');
  });

  it('falls back to the first available model when value is unknown', () => {
    render(<ModelSelector value="legacy-unknown-id" generationType="image" onChange={vi.fn()} />);
    expect(screen.getByText('FLUX.1 [dev]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/generate/ModelSelector.test.tsx`
Expected: FAIL — `ModelSelector` still reads its hardcoded arrays and ignores the store; the unknown-value/video assertions or text lookups fail.

- [ ] **Step 3: Rewrite `ModelSelector` to read records from the store**

In `src/components/generate/ModelSelector.tsx`:
- DELETE the `ModelOption` interface and both `IMAGE_MODELS` and `VIDEO_MODELS` constant arrays (lines 20–145).
- Replace the data source: import the store + selector and the record type, and derive `models` from state. Keep the existing dropdown JSX, badge meta maps, and positioning logic. Concretely:
  - Add imports near the top:
    ```ts
    import { useAppStore } from '@/store/appStore';
    import { selectModelsByCapability } from '@/store/slices/modelsSlice';
    import type { ModelRecord } from '@/types/model';
    ```
  - In the component body, replace `const models = generationType === 'image' ? IMAGE_MODELS : VIDEO_MODELS;` with:
    ```ts
    const availableModels = useAppStore((s) => s.availableModels);
    const models = selectModelsByCapability(availableModels, generationType);
    ```
  - The badge meta maps (`capabilityMeta`, `runtimeMeta`, `availabilityLabel`, `hardwareLabel`, `qualityLabel`) currently key off `ModelOption` field unions. Repoint them to `ModelRecord` fields:
    - `capabilityMeta` keys remain `image | video | edit | inpaint` (matches `ModelRecord['capability']`).
    - `runtimeMeta` keys remain `local | comfyui | cloud | byom` (matches `ModelRecord['runtime']`).
    - `hardwareLabel` keys remain `laptop | creator | workstation | unknown` (matches `ModelRecord['hardware_class']`); read `model.hardware_class` instead of `model.hardware`.
    - `qualityLabel` keys remain `draft | balanced | pro | experimental | local` (matches `ModelRecord['quality']`).
    - DELETE the `availabilityLabel` map and the line rendering `availabilityLabel[selected.availability]` (the M1 record has no `availability` field); replace that meta line to show tier + vram:
      ```tsx
      <p className="mt-1.5 font-mono text-micro text-text-muted">
        {selected.tier} / {hardwareLabel[selected.hardware_class]} / {selected.vram}
      </p>
      ```
  - Update every `model.hardware` reference to `model.hardware_class`, and `selected.hardware` to `selected.hardware_class`.
  - Guard the empty case: if `models.length === 0`, render the trigger with a muted "No models — open the Foundry to add one" label rather than indexing `models[0]`. Concretely set:
    ```ts
    const selected = models.find((m) => m.id === value) ?? models[0] ?? null;
    ```
    and short-circuit when `selected` is null:
    ```tsx
    if (!selected) {
      return (
        <div ref={containerRef} className="relative">
          <button
            data-testid="model-selector-trigger"
            type="button"
            disabled
            className="w-full flex items-center gap-3 px-3 py-3 rounded-md border border-border bg-panel-raised text-left opacity-70"
          >
            <span className="font-mono text-micro text-text-muted">
              No models installed — open the Foundry to add one
            </span>
          </button>
        </div>
      );
    }
    ```
  - The `type` used for the option icon (`model.type === 'video'`) should become `model.capability === 'video'`.

- [ ] **Step 4: Annotate the two explicit `ModelInfo` consumers**

- In `src/components/templates/TemplateCreator.tsx` line 75, change `availableModels.map((m: ModelInfo) => ...)` to `availableModels.map((m: ModelRecord) => ...)` and update the import on the same file to `import type { ModelRecord } from '@/types/model';` (replace the `ModelInfo` import if it is no longer otherwise used).
- In `src/pages/SettingsPanel.tsx` line ~1294, change `availableModels.map((model: ModelInfo) => (` to `availableModels.map((model: ModelRecord) => (` and ensure `ModelRecord` is imported from `@/types/model` (add to the existing model-type import).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/generate/ModelSelector.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/generate/ModelSelector.tsx src/components/generate/ModelSelector.test.tsx src/components/templates/TemplateCreator.tsx src/pages/SettingsPanel.tsx
git commit -m "feat(foundry): render ModelSelector from the registry; delete hardcoded model lists

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Load the registry into the store at startup

**Files:**
- Modify: `src/App.tsx` (replace the manual `models.list()` + `setAvailableModels` with `loadModels()`)
- Test: covered by `modelsSlice.test.ts` (loadModels) + manual run

- [ ] **Step 1: Point app startup at `loadModels`**

In `src/App.tsx`:
- The effect around lines 12–93 currently calls `window.electron.models.list()` and `setAvailableModels(models)`. Replace that pair with a single `loadModels()` call from the store, and swap the selector subscription from `setAvailableModels` to `loadModels`:
  - In the `useAppStore(useShallow(...))` selector (line ~12), replace `setAvailableModels: s.setAvailableModels,` with `loadModels: s.loadModels,`.
  - In the effect body (line ~74), replace:
    ```ts
    const models = await window.electron.models.list();
    setAvailableModels(models);
    ```
    with:
    ```ts
    await loadModels();
    ```
  - Update the effect dependency array (line ~93) from `[setSystemInfo, setAvailableModels]` to `[setSystemInfo, loadModels]`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full frontend suite (no regressions)**

Run: `npm test`
Expected: PASS — including `Header.test.tsx` (its `availableModels` mock is `{ id, status }[]`, structurally compatible with reads of `.status`; if a strict-type compile error surfaces in the test, widen that mock to a `ModelRecord` via the `record()` helper pattern, then re-run).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(foundry): load the model registry via loadModels() at startup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Drift regression test (single source of truth)

**Files:**
- Create: `src/components/generate/ModelSelector.drift.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/generate/ModelSelector.drift.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const selectorSource = readFileSync(path.join(here, 'ModelSelector.tsx'), 'utf-8');

describe('ModelSelector single-source-of-truth (drift guard)', () => {
  it('declares no hardcoded model catalogs', () => {
    // These literals were the drift source — they must never come back.
    expect(selectorSource).not.toMatch(/const\s+IMAGE_MODELS\b/);
    expect(selectorSource).not.toMatch(/const\s+VIDEO_MODELS\b/);
  });

  it('sources its models from the store registry', () => {
    expect(selectorSource).toMatch(/useAppStore/);
    expect(selectorSource).toMatch(/selectModelsByCapability/);
  });

  it('embeds no model repo ids (catalog data lives only in verified-catalog.json)', () => {
    expect(selectorSource).not.toMatch(/black-forest-labs\//);
    expect(selectorSource).not.toMatch(/stabilityai\//);
    expect(selectorSource).not.toMatch(/Lightricks\//);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (it guards an already-true invariant)**

Run: `npx vitest run src/components/generate/ModelSelector.drift.test.ts`
Expected: PASS — Task 9 already removed the hardcoded arrays. To confirm the guard actually bites, temporarily re-add `const IMAGE_MODELS = [];` to `ModelSelector.tsx`, re-run (expect FAIL), then remove it and re-run (expect PASS).

- [ ] **Step 3: Commit**

```bash
git add src/components/generate/ModelSelector.drift.test.ts
git commit -m "test(foundry): add drift guard asserting a single model catalog source

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Milestone green gate

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `python -m pytest backend/tests -q`
Expected: PASS (all, including the new foundry tests and the pre-existing suites).

- [ ] **Step 2: Frontend typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Frontend tests**

Run: `npm test`
Expected: PASS (all vitest suites).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: PASS (clean build, no type or bundling errors).

- [ ] **Step 5: If all four are green, push the branch**

```bash
git push -u origin feat/model-foundry
```

---

## Task 13: Codex independent-review gate (foundation / contract review)

**Files:** none (review only)

- [ ] **Step 1: Run an independent Codex review of the M1 diff**

This is the foundation contract — the most expensive layer to get wrong once embedded. Get a second-model opinion over the whole M1 change set (base = `main`):

Run (whichever is available in this environment):
```bash
# Preferred: the project's codex review skill / command
codex review --base main
# or the dev-tools equivalent:
#   (invoke the dev-tools:codex-review skill against the feat/model-foundry diff)
```
Focus the review on: the `ModelRecord` contract (backend dataclass ↔ Pydantic schema ↔ TS interface field parity), the legacy-id alias path, the catalog-as-single-source invariant, FastAPI response/error shapes, and the IPC channel mirroring (`models:get` in `preload.ts` ↔ handler).

- [ ] **Step 2: Triage findings**

For each finding: fix it (with a test if it is a behavior gap) or record an explicit, reasoned dismissal. Re-run Task 12's green gate after any fix.

- [ ] **Step 3: Commit any review fixes**

```bash
git add -A
git commit -m "fix(foundry): address M1 Codex foundation review findings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base main --head feat/model-foundry \
  --title "Model Foundry M1 — Registry unification" \
  --body "Implements M1 of docs/superpowers/specs/2026-05-30-model-foundry-design.md: one backend-owned ModelRecord registry from verified-catalog.json, /api/models record endpoints, frontend modelsSlice, ModelSelector reads from the registry (hardcoded lists deleted), drift regression guard. Codex foundation review completed."
```

---

## Self-Review (plan author checklist — completed)

**Spec coverage (M1 section of the spec):**
- ModelRecord schema → Tasks 2 (backend), 6 (frontend), 8 (contract). ✓
- ModelRegistry (backend-owned source of truth) → Task 3. ✓
- Migrate PREDEFINED_MODELS → verified-catalog.json → Tasks 1, 4. ✓
- GET /api/models (+ /{id}) → Task 5. ✓
- modelsSlice + ModelSelector reads records; delete hardcoded lists → Tasks 7, 9, 10. ✓
- Stable slugs + legacy-id map → Tasks 1 (LEGACY_IDS guard), 2 (`LEGACY_ID_ALIASES`), 3 (resolution + test). ✓
- Single-source-of-truth drift regression test → Task 11 (frontend) + Task 4 (backend invariant test). ✓
- Mirror models:get between preload.ts and handlers → Task 8. ✓
- Extend api-contracts tests → Task 8. ✓
- Codex foundation review gate → Task 13. ✓
- Constraints (pathlib, no-torch/stubbed backend tests, husky/full-suite gate, feat/model-foundry off main) → Conventions section + Tasks 0, 12. ✓

**Placeholder scan:** none — every step ships complete code/commands.

**Type consistency:** the 19 canonical `ModelRecord` fields are identical across the catalog JSON (Task 1), the backend dataclass (Task 2), the Pydantic schema (Task 5), and the TS interface (Task 6); `selectModelsByCapability` (Task 7) is the exact symbol asserted by the drift guard (Task 11) and consumed by `ModelSelector` (Task 9); `loadModels` (Task 7) is the exact symbol wired in `App.tsx` (Task 10). Status stays the 4-value `ModelStatus` everywhere in M1.
