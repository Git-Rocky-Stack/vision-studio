# Workflow Run History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add recent run history to workflow records and show it in the Workflow workbench.

**Architecture:** Extend each `WorkflowRecord` with a small `runHistory` array and add a store action that records a run against an existing workflow. `WorkflowWorkbench` renders recent runs in the existing Run Output panel, falling back to the current empty state when no runs exist.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Testing Library.

---

### Task 1: Store Run History

**Files:**
- Modify: `src/store/appStore.test.ts`
- Modify: `src/store/appStore.ts`

**Step 1: Write failing store tests**

Add tests proving `recordWorkflowRun`:

- adds a run to the target workflow
- updates `runOutputSummary`
- caps history at 10 entries
- ignores unknown workflow ids

**Step 2: Run the store test and verify failure**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL because `runHistory` and `recordWorkflowRun` do not exist.

**Step 3: Implement minimal state and action**

Add:

```ts
export interface WorkflowRunRecord {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  summary: string;
  createdAt: string;
  outputAssetId?: string;
}
```

Add `runHistory: WorkflowRunRecord[]` to `WorkflowRecord`.

Add action:

```ts
recordWorkflowRun: (workflowId: string, run: Omit<WorkflowRunRecord, 'id' | 'createdAt'> & Partial<Pick<WorkflowRunRecord, 'id' | 'createdAt'>>) => void;
```

Implementation should prepend the run, generate missing `id` and `createdAt`, update `runOutputSummary`, and cap history at 10.

**Step 4: Run the store test and verify pass**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS.

### Task 2: Render Run History

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.test.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`

**Step 1: Write failing component test**

Add a test that records a completed run for the active workflow and expects:

- the run summary in the Run Output panel
- the status label `Complete`

**Step 2: Run the component test and verify failure**

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: FAIL because the component only renders a summary/empty text.

**Step 3: Render recent runs**

In `WorkflowWorkbench`, render `activeWorkflow.runHistory` as a compact list when present. Keep the empty state when the list is empty.

**Step 4: Run component test and verify pass**

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
git add docs/plans/2026-04-17-workflow-run-history.md src/store/appStore.ts src/store/appStore.test.ts src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(workflow): track workflow run history"
```

**Step 3: Push**

```powershell
git push origin main
```
