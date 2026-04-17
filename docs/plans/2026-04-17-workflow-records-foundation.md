# Workflow Records Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Back the Workflow workbench with minimal workflow records and active workflow state instead of static component constants.

**Architecture:** Add workflow record types and a small default workflow library to the app store. `WorkflowWorkbench` reads the active workflow from Zustand, lists saved workflows in its library, and switches the active workflow when a library item is selected. This is state foundation only: no node graph, execution queue, persistence editor, or backend workflow submission.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Testing Library.

---

### Task 1: Store Workflow Records

**Files:**
- Modify: `src/store/appStore.test.ts`
- Modify: `src/store/appStore.ts`

**Step 1: Write failing store tests**

Add tests that prove:

- the store has default workflow records
- the active workflow defaults to `image-generation-baseline`
- `setActiveWorkflow` changes the selected workflow
- `createWorkflow` appends and selects a new draft workflow

**Step 2: Run the store test and verify failure**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL because workflow state and actions do not exist.

**Step 3: Implement minimal workflow state**

Add exported types in `appStore.ts`:

```ts
export type WorkflowStepState = 'ready' | 'pending' | 'complete';

export interface WorkflowStepRecord {
  id: string;
  label: string;
  detail: string;
  state: WorkflowStepState;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  status: 'draft' | 'ready' | 'running' | 'complete';
  profile: string;
  summary: string;
  settings: {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
  };
  inputs: string[];
  steps: WorkflowStepRecord[];
  runOutputSummary: string | null;
}
```

Add:

```ts
export const DEFAULT_WORKFLOWS: WorkflowRecord[] = [...]
```

Extend state:

```ts
workflowRecords: WorkflowRecord[];
activeWorkflowId: string;
setActiveWorkflow: (workflowId: string) => void;
createWorkflow: (name: string) => WorkflowRecord;
```

Do not persist workflows in this first slice.

**Step 4: Run the store test and verify pass**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS.

### Task 2: Bind Workflow Workbench To Store

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.test.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`

**Step 1: Write failing component tests**

Add tests that prove:

- the workbench renders the active workflow record
- selecting another library workflow updates `activeWorkflowId`

**Step 2: Run the component test and verify failure**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: FAIL because the component still uses static workflow data.

**Step 3: Connect component to store**

Use `useAppStore()` to read:

- `workflowRecords`
- `activeWorkflowId`
- `setActiveWorkflow`

Render the active workflow metadata, settings, inputs, steps, library records, and output summary from state.

**Step 4: Run component tests and verify pass**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: PASS.

### Task 3: Layout Regression

**Files:**
- Modify only if needed: `src/components/layout/WorkspaceLayout.test.tsx`
- Modify only if needed: `src/components/layout/WorkbenchChromeCarbon.test.tsx`

**Step 1: Run layout and chrome tests**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
```

Expected: PASS. If tests fail because visible workflow text changed, update assertions to match state-backed copy.

### Task 4: Verification, Commit, Push

**Files:** no planned source changes.

**Step 1: Run focused checks**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
npm run typecheck
git diff --check
```

Expected: PASS, with only known line-ending warnings from `git diff --check`.

**Step 2: Commit**

```powershell
git add docs/plans/2026-04-17-workflow-records-foundation.md src/store/appStore.ts src/store/appStore.test.ts src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx
git commit -m "feat(workflow): add workflow records foundation"
```

**Step 3: Push**

```powershell
git push origin main
```
