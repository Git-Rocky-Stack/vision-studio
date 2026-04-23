# Script To Storyboard And Elements Implementation Plan

> **For Codex:** Execute this plan milestone-by-milestone. Keep the first pass storyboard-first and compatibility-safe.

**Goal:** Add project-scoped Elements and a reviewed script-to-storyboard import flow that turns pasted text into scenes, beat candidates, and reusable continuity objects.

**Architecture:** Introduce additive `Element` and `ImportDraft` domain models, normalize them through the store, parse raw text into reviewable draft state, then commit approved draft content into the existing project and storyboard model through compatibility adapters.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, existing Vision Studio storyboard and media/reference infrastructure

---

### Task 1: Add Element And ImportDraft Domain Foundations

**Files:**
- Modify: `src/types/project.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/slices/projectSlice.ts`
- Modify: `src/store/appStore.test.ts`

**Goal:**

Add additive project and scene state for Elements and import drafts without breaking older saved projects or current character flows.

**Required behavior:**

- add `Element`
- add `SceneShotBeat`
- add `ImportDraft`
- add `elements` to projects
- add `elementIds` and optional beat metadata to scenes
- normalize persisted projects that predate these fields
- keep `characters` and `characterRefs` intact

**Implementation notes:**

- Keep this migration additive.
- Do not remove or rename `CharacterRef` in this milestone.
- Preserve the current project creation and scene duplication behavior.

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/types/project.ts src/store/appStore.types.ts src/store/appStore.ts src/store/slices/projectSlice.ts src/store/appStore.test.ts
git commit -m "feat(storyboard): add elements domain state"
```

### Task 2: Build Script Parsing And Draft Extraction

**Files:**
- Create: `src/features/storyboard/parseScriptImport.ts`
- Create: `src/features/storyboard/parseScriptImport.test.ts`
- Create: `src/features/storyboard/mergeElementDrafts.ts`
- Create: `src/features/storyboard/mergeElementDrafts.test.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/projectSlice.ts`

**Goal:**

Turn pasted script or outline text into a stable `ImportDraft` with scene, beat, and Element candidates.

**Required behavior:**

- parse raw text into ordered scene drafts
- extract basic shot or beat lines where available
- extract candidate Elements with provisional types
- merge or collapse obvious duplicates
- surface parsing issues instead of silently failing

**Implementation notes:**

- Keep the first pass deterministic and review-friendly.
- Prefer explicit heuristics over brittle fake intelligence.
- The parser should produce a usable draft even when the source text is messy.

**Verification:**

```powershell
npm run test -- src/features/storyboard/parseScriptImport.test.ts src/features/storyboard/mergeElementDrafts.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/features/storyboard/parseScriptImport.ts src/features/storyboard/parseScriptImport.test.ts src/features/storyboard/mergeElementDrafts.ts src/features/storyboard/mergeElementDrafts.test.ts src/store/appStore.types.ts src/store/slices/projectSlice.ts
git commit -m "feat(storyboard): parse script imports into drafts"
```

### Task 3: Add Storyboard Import Review Flow

**Files:**
- Modify: `src/pages/StoryboardPanel.tsx`
- Create: `src/components/storyboard/ScriptImportDialog.tsx`
- Create: `src/components/storyboard/ScriptImportDialog.test.tsx`
- Create: `src/components/storyboard/ImportDraftReview.tsx`
- Create: `src/components/storyboard/ImportDraftReview.test.tsx`

**Goal:**

Let the user review and edit a script import draft before any project mutation occurs.

**Required behavior:**

- add an explicit storyboard import entry point
- accept pasted text
- generate and display a reviewable draft
- rename or remove scene drafts before commit
- merge or discard Element candidates
- confirm the draft in one explicit action

**Implementation notes:**

- The draft must stay separate from live project state until approval.
- Keep the UI lightweight and fast to scan.
- Be explicit when the parser found weak or incomplete results.

**Verification:**

```powershell
npm run test -- src/components/storyboard/ScriptImportDialog.test.tsx src/components/storyboard/ImportDraftReview.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/pages/StoryboardPanel.tsx src/components/storyboard/ScriptImportDialog.tsx src/components/storyboard/ScriptImportDialog.test.tsx src/components/storyboard/ImportDraftReview.tsx src/components/storyboard/ImportDraftReview.test.tsx
git commit -m "feat(storyboard): add script import review flow"
```

### Task 4: Commit Approved Drafts Into Storyboard And Elements

**Files:**
- Modify: `src/store/slices/projectSlice.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/appStore.test.ts`
- Modify: `src/pages/StoryboardPanel.tsx`

**Goal:**

Commit approved import drafts into the existing project model safely.

**Required behavior:**

- create scenes from approved draft order
- create or merge Elements into the active project
- link scenes to Element ids
- preserve prompt seeds, notes, and beat metadata
- leave existing unrelated scenes untouched unless the user explicitly replaces them

**Implementation notes:**

- Treat approval as one grouped operation.
- Preserve current scene ordering semantics.
- Keep the initial flow append-safe unless the UI explicitly supports replacement.

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts
npm run typecheck
```

**Commit:**

```powershell
git add src/store/slices/projectSlice.ts src/store/appStore.types.ts src/store/appStore.test.ts src/pages/StoryboardPanel.tsx
git commit -m "feat(storyboard): commit reviewed imports into projects"
```

### Task 5: Add Elements Panel And Scene Element Chips

**Files:**
- Create: `src/components/storyboard/ElementLibrary.tsx`
- Create: `src/components/storyboard/ElementLibrary.test.tsx`
- Modify: `src/components/storyboard/SceneCard.tsx`
- Modify: `src/components/storyboard/SceneCard.test.tsx`
- Modify: `src/pages/StoryboardPanel.tsx`
- Modify: `src/components/storyboard/CharacterLibrary.tsx`

**Goal:**

Make Elements visible and usable in the storyboard UI without breaking current character-oriented surfaces.

**Required behavior:**

- add a project-scoped Elements panel
- show Element type and usage count
- show linked Element chips on scene cards
- keep CharacterLibrary functional during the migration
- make it obvious which Elements are shared across scenes

**Implementation notes:**

- The first pass should complement CharacterLibrary, not replace it.
- Keep scene cards readable and avoid chip overload.
- Favor clear continuity signals over heavy metadata blocks.

**Verification:**

```powershell
npm run test -- src/components/storyboard/ElementLibrary.test.tsx src/components/storyboard/SceneCard.test.tsx
npm run typecheck
```

**Commit:**

```powershell
git add src/components/storyboard/ElementLibrary.tsx src/components/storyboard/ElementLibrary.test.tsx src/components/storyboard/SceneCard.tsx src/components/storyboard/SceneCard.test.tsx src/pages/StoryboardPanel.tsx src/components/storyboard/CharacterLibrary.tsx
git commit -m "feat(storyboard): add elements panel"
```

### Task 6: Wire Elements Into References And Final Integration Cleanup

**Files:**
- Modify: `src/components/reference/ReferenceMediaPanel.tsx`
- Modify: `src/store/slices/mediaTimelineSlice.ts`
- Modify: `src/store/appStore.test.ts`
- Modify as needed based on verification

**Goal:**

Connect approved Elements to reference-set workflows and leave the tree clean after full validation.

**Required behavior:**

- allow Elements to link to existing project or scene reference sets
- keep reference media and Elements as separate but connected layers
- preserve current reference-media behavior for projects without Elements
- clean up compatibility drift uncovered by tests

**Implementation notes:**

- Do not collapse `ReferenceSet` into `Element`.
- Keep this pass integration-focused, not a second architecture rewrite.

**Verification:**

```powershell
npm run test -- src/store/appStore.test.ts src/components/storyboard/ScriptImportDialog.test.tsx src/components/storyboard/ImportDraftReview.test.tsx src/components/storyboard/ElementLibrary.test.tsx src/components/storyboard/SceneCard.test.tsx
npm run typecheck
npm run build
```

After `npm run build`, restore generated Electron bundles if they are not part of the intended diff:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Commit:**

```powershell
git add -A
git commit -m "feat(storyboard): add script-to-storyboard elements workflow"
```

## Rollout Guidance

Execute in order:

1. domain and normalization
2. parser and extraction
3. import review
4. approved commit flow
5. storyboard Elements UI
6. reference integration and final validation

Do not expand this milestone into automatic timeline clip creation until the storyboard import and Elements continuity workflow is real and stable.
