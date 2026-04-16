# Phase 3 Viewer Review Implementation Plan

**Goal:** Replace the temporary Viewer alias with a real output review surface for recent assets and batch results.

**Architecture:** Add a reusable `WorkbenchViewer` component that derives recent reviewable outputs from `assetLibrary` and `batchResults`. `WorkspaceLayout` will use it for Generate, Quick, and Edit Viewer tabs while Canvas and Workflow remain unchanged. Viewer actions should use existing Zustand actions: `setCurrentImage`, `setActivePanel`, `comparisonImages`, and `setComparisonImages`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Vitest, Testing Library, Playwright smoke checks.

---

## Task 1: Workbench Viewer Component

**Files:**

- Create: `src/components/layout/WorkbenchViewer.tsx`
- Create: `src/components/layout/WorkbenchViewer.test.tsx`

**Step 1: Write failing component tests**

Add tests for:

- Empty state text: `Outputs will appear here.`
- Latest asset becomes the active preview.
- A batch result thumbnail can be selected.
- `Send to Edit` calls `setCurrentImage` and moves to the Edit panel.
- `Pin Compare` adds the active image to `comparisonImages`.

**Step 2: Run and verify failure**

```powershell
npx vitest run src/components/layout/WorkbenchViewer.test.tsx --project component
```

Expected: FAIL because `WorkbenchViewer` does not exist.

**Step 3: Implement `WorkbenchViewer`**

Rules:

- Use existing store slices only.
- Sort review items newest first.
- Prefer asset metadata when present: name, prompt, model, seed.
- Preserve batch result metadata: prompt, seed, generation time.
- Keep the active preview unframed as the main workbench surface.
- Render thumbnails in a stable bottom rail.
- Do not introduce legacy primary-red shell chrome.

**Step 4: Run component tests**

```powershell
npx vitest run src/components/layout/WorkbenchViewer.test.tsx --project component
```

Expected: PASS.

## Task 2: Wire Viewer Into Workbench

**Files:**

- Modify: `src/components/layout/WorkspaceLayout.tsx`
- Modify: `src/components/layout/WorkspaceLayout.test.tsx`

**Step 1: Write failing layout test**

Extend `WorkspaceLayout.test.tsx` so the Generate Viewer tab renders the real viewer empty state instead of the Canvas stage.

**Step 2: Run and verify failure**

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: FAIL because Viewer still aliases Canvas.

**Step 3: Wire `WorkbenchViewer`**

Import `WorkbenchViewer` in `WorkspaceLayout` and pass it as the `viewer` slot for Generate, Quick, and Edit shells.

**Step 4: Run layout tests**

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

## Task 3: Verification

**Files:** no planned source changes.

**Step 1: Run focused tests**

```powershell
npx vitest run src/components/layout/WorkbenchViewer.test.tsx src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 2: Run full checks**

```powershell
npm run typecheck
npm run test
npm run build
git diff --check
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

**Step 3: Browser smoke**

Start Vite and use Playwright with mocked Electron APIs. Seed `assetLibrary` and `batchResults`, then check:

- Generate Viewer tab shows the latest asset preview and metadata.
- Batch thumbnail selection updates the preview.
- `Pin Compare` updates `comparisonImages`.
- `Send to Edit` moves to Edit with the chosen image.
- No browser console errors or page errors.

Remove temporary screenshots and Vite logs afterward.

**Step 4: Restore generated files**

If build changes generated Electron output:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Step 5: Commit**

```powershell
git add docs/plans/2026-04-16-phase-3-viewer-review.md src
git commit -m "feat(workbench): add viewer review surface"
```
