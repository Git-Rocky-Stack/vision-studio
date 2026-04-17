# Workflow Metadata Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add description, tags, and notes to workflow records and render them in the Workflow workbench.

**Architecture:** Extend `WorkflowRecord` with lightweight metadata fields. Seed defaults in `DEFAULT_WORKFLOWS`, keep draft workflow metadata empty, and render the active workflow metadata in the existing left workbench dock without adding editing or persistence behavior.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Testing Library.

---

### Task 1: Store Metadata

**Files:**
- Modify: `src/store/appStore.test.ts`
- Modify: `src/store/appStore.ts`

**Step 1: Write failing store tests**

Add tests proving:

- default workflow records include `description`, `tags`, and `notes`
- newly created draft workflows use empty metadata

**Step 2: Run the store test and verify failure**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL because `WorkflowRecord` does not yet include these metadata fields.

**Step 3: Implement minimal store metadata**

Add to `WorkflowRecord`:

```ts
description: string;
tags: string[];
notes: string;
```

Seed `DEFAULT_WORKFLOWS` with meaningful values. Update `cloneWorkflow` to copy `tags`. Update `createDraftWorkflow` so new drafts have empty metadata.

**Step 4: Run the store test and verify pass**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS.

### Task 2: Render Metadata

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.test.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`

**Step 1: Write failing component tests**

Add tests proving:

- the active workflow metadata renders in the left dock
- selecting `Storyboard frame` updates the rendered metadata

**Step 2: Run the component test and verify failure**

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: FAIL because the workbench does not render the new metadata yet.

**Step 3: Render active workflow metadata**

Render `description`, `tags`, and `notes` under the profile block. Use compact fallback copy for empty metadata.

**Step 4: Run the component test and verify pass**

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: PASS.

### Task 3: Verification, Commit, Push

**Files:** no planned source changes.

**Step 1: Run focused checks**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
npm run typecheck
git diff --check
```

Expected: PASS, with only known Windows line-ending warnings from `git diff --check`.

**Step 2: Commit**

```powershell
git add docs/plans/2026-04-17-workflow-metadata-design.md docs/plans/2026-04-17-workflow-metadata.md src/store/appStore.ts src/store/appStore.test.ts src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(workflow): add workflow metadata"
```

**Step 3: Push**

```powershell
git push origin main
```

