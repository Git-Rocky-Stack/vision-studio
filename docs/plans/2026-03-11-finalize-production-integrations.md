# Finalize Production Integrations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish all currently stubbed and partial production features in Vision Studio so generation, editing, model downloads, export flows, notifications, and theme behavior are fully implemented.

**Architecture:** Extend the existing FastAPI backend, Electron IPC layer, and persisted renderer store instead of adding a new service tier. Use job-based backend execution for generation and derived-image operations, Electron for guarded filesystem access and notifications, and renderer updates only after backend and IPC contracts are real.

**Tech Stack:** FastAPI, Python async utilities, Pillow, diffusers/torch integrations, Electron IPC, React, Zustand, Vitest

---

### Task 1: Backfill Backend Test Harness For Missing Integrations

**Files:**
- Modify: `backend/utils/model_manager.py`
- Create: `backend/tests/test_model_manager.py`
- Create: `backend/tests/test_prompt_service.py`
- Create: `backend/tests/test_image_ops.py`
- Create: `backend/tests/test_comfy_workflows.py`

**Step 1: Write the failing tests**

- Add tests for:
  - CivitAI authenticated download request building
  - prompt enhancement output shape
  - crop/upscale helper output paths
  - ComfyUI workflow/model selection

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_model_manager.py backend/tests/test_prompt_service.py backend/tests/test_image_ops.py backend/tests/test_comfy_workflows.py -v`

Expected: FAIL for missing helpers and unsupported paths.

**Step 3: Write minimal implementation**

- Add the smallest helper modules and stubs needed to satisfy imports and explicit failure conditions.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_model_manager.py backend/tests/test_prompt_service.py backend/tests/test_image_ops.py backend/tests/test_comfy_workflows.py -v`

Expected: PASS

### Task 2: Implement Production Prompt Enhancement Service

**Files:**
- Create: `backend/utils/prompt_service.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_prompt_service.py`

**Step 1: Write the failing test**

- Add tests for `enhance_prompt(prompt, mode)` covering `clarify`, `cinematic`, `concise`, and `variations`.

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_prompt_service.py -v`

Expected: FAIL because service and endpoint do not exist.

**Step 3: Write minimal implementation**

- Implement deterministic prompt transforms.
- Add `/api/prompts/enhance` endpoint returning structured results.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_prompt_service.py -v`

Expected: PASS

### Task 3: Implement Real CivitAI Downloads

**Files:**
- Modify: `backend/utils/model_manager.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_model_manager.py`

**Step 1: Write the failing test**

- Add tests for:
  - header injection when `CIVITAI_API_TOKEN` exists
  - chunked download progress updates
  - temp-file cleanup on failure

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_model_manager.py -v`

Expected: FAIL because `_download_from_civitai()` is not implemented.

**Step 3: Write minimal implementation**

- Implement streamed CivitAI downloads with optional auth and atomic writes.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_model_manager.py -v`

Expected: PASS

### Task 4: Implement ComfyUI Workflow Execution

**Files:**
- Modify: `backend/utils/comfy_client.py`
- Modify: `backend/main.py`
- Create: `backend/utils/comfy_workflows.py`
- Test: `backend/tests/test_comfy_workflows.py`

**Step 1: Write the failing test**

- Add tests for:
  - workflow selection by model
  - prompt/seed/size injection
  - output artifact extraction from ComfyUI history

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_comfy_workflows.py -v`

Expected: FAIL because the workflow builder and execution parser do not exist.

**Step 3: Write minimal implementation**

- Add workflow builder helpers.
- Add result waiting/history parsing methods to `ComfyUIClient`.
- Replace placeholder `generate_with_comfyui()`.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_comfy_workflows.py -v`

Expected: PASS

### Task 5: Implement Real Video Generation Service

**Files:**
- Create: `backend/utils/direct_video_generator.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_video_service.py`

**Step 1: Write the failing test**

- Add tests for:
  - output path packaging
  - frame count metadata
  - unsupported configuration error behavior

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_video_service.py -v`

Expected: FAIL because no real service exists.

**Step 3: Write minimal implementation**

- Implement video generation entry point with explicit capability checks and mp4 output packaging.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_video_service.py -v`

Expected: PASS

### Task 6: Implement Derived Image Operations

**Files:**
- Create: `backend/utils/image_ops.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_image_ops.py`

**Step 1: Write the failing test**

- Add tests for:
  - crop
  - rotate/flip
  - upscale output creation

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_image_ops.py -v`

Expected: FAIL because helper functions and endpoints do not exist.

**Step 3: Write minimal implementation**

- Implement image operation helpers using Pillow.
- Add backend endpoints for crop and upscale jobs or direct operations.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_image_ops.py -v`

Expected: PASS

### Task 7: Add Electron IPC For Prompt, Image Ops, Theme, Notifications, And Batch File Actions

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Create: `electron/services/notifications.ts`
- Create: `electron/services/theme.ts`
- Test: `electron/services/assets.test.ts`
- Create: `electron/services/theme.test.ts`

**Step 1: Write the failing test**

- Add tests for:
  - theme resolution
  - batch export path validation
  - notification payload mapping where pure helpers exist

**Step 2: Run test to verify it fails**

Run: `npm test -- electron/services/theme.test.ts electron/services/assets.test.ts`

Expected: FAIL because helper files and IPC surface do not exist.

**Step 3: Write minimal implementation**

- Add IPC contracts for prompt enhancement and image operations.
- Add theme application helper.
- Add notification helper.
- Add batch export/delete utilities using managed root validation.

**Step 4: Run test to verify it passes**

Run: `npm test -- electron/services/theme.test.ts electron/services/assets.test.ts`

Expected: PASS

### Task 8: Replace Generate Panel And Preview Modal Placeholders

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/components/shared/ImagePreviewModal.tsx`
- Modify: `src/store/appStore.ts`

**Step 1: Write the failing test**

- Add tests for any extracted helper functions used by prompt enhancement and regenerate state hydration.

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL for missing helpers or mismatched contracts.

**Step 3: Write minimal implementation**

- Wire prompt enhancement.
- Rehydrate generate state from preview modal regenerate.
- Implement export/delete/upscale in preview modal.

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS

### Task 9: Replace Batch Results Placeholder Actions

**Files:**
- Modify: `src/components/batch/ResultsGrid.tsx`
- Modify: `src/pages/BatchPanel.tsx`
- Modify: `src/store/appStore.ts`

**Step 1: Write the failing test**

- Add tests for any extracted batch action helpers if created.

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL for missing helper behavior.

**Step 3: Write minimal implementation**

- Implement single export, export-all, and delete flows.
- Keep asset library and batch results in sync.

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS

### Task 10: Complete Edit Panel Apply Flow And Layer Thumbnails

**Files:**
- Modify: `src/components/edit/EditPropertiesPanel.tsx`
- Modify: `src/components/edit/LayerPanel.tsx`
- Modify: `src/components/edit/EditCanvas.tsx`
- Modify: `src/store/appStore.ts`

**Step 1: Write the failing test**

- Add tests for any new pure layer-thumbnail or crop helper logic.

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL for missing helper behavior.

**Step 3: Write minimal implementation**

- Apply crop to create derived assets.
- Render real layer thumbnails based on layer data/current image.

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS

### Task 11: Complete Theme Application And Notifications In Renderer

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/SettingsPanel.tsx`

**Step 1: Write the failing test**

- Add tests for extracted theme helpers if needed.

**Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL for missing theme helper behavior.

**Step 3: Write minimal implementation**

- Apply theme on startup and when settings change.
- Trigger notifications on terminal job/model events.

**Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS

### Task 12: Verification And Review

**Files:**
- Review all modified files

**Step 1: Run targeted tests**

Run the new Python and Vitest suites for the changed areas.

**Step 2: Run full verification**

Run:

- `pytest backend/tests -v`
- `npm test`
- `npm run build`

Expected: PASS

**Step 3: Request code review**

- Dispatch the code-review subagent on the final diff.

**Step 4: Fix findings and re-run verification**

- Address all important findings before finalizing.
