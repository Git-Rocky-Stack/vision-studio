# Workflow Real Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `WorkflowWorkbench` validate and execute the supported text-to-image workflow subset through the existing Electron generation pipeline, then hand successful outputs into the shared Viewer and asset flow.

**Architecture:** Keep execution in the renderer for this first slice. Add a small workflow-execution feature layer that validates the graph, resolves one real image request from workflow graph plus current app context, and runs the job through the same store and IPC path already used by `GeneratePanel` and `QuickGeneratePanel`. Persist only authored workflow data; keep runtime validation and active-run state transient in the store.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron renderer IPC

---

### Task 1: Workflow Runtime State And Validation Foundation

**Files:**
- Modify: `src/types/workflow.ts`
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/workflowSlice.ts`
- Modify: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`
- Create: `src/features/workflow/validateWorkflowExecution.ts`
- Create: `src/features/workflow/validateWorkflowExecution.test.ts`

**Step 1: Write the failing tests**

Add store and validator coverage for:

```ts
it('tracks transient workflow runtime state outside persisted workflow records', () => {
  const state = useAppStore.getState();

  state.setWorkflowRuntimeState('image-generation-baseline', {
    issues: [{ severity: 'error', code: 'missing-prompt', message: 'Prompt is required.' }],
    activeJobId: 'job-1',
  });

  expect(useAppStore.getState().workflowRuntimeById['image-generation-baseline']?.activeJobId).toBe('job-1');

  const persisted = (useAppStore as any).persist?.getOptions?.()?.partialize?.(useAppStore.getState());
  expect(persisted).not.toHaveProperty('workflowRuntimeById');
});

it('reports unsupported node classes as execution errors', () => {
  const workflow = makeWorkflow({
    nodes: {
      custom: { id: 'custom', classType: 'UpscaleModelLoader', label: 'Upscale', inputs: {}, position: { x: 0, y: 0 } },
    },
  });

  const result = validateWorkflowExecution(workflow, makeWorkflowExecutionContext());
  expect(result.issues).toContainEqual(
    expect.objectContaining({ severity: 'error', code: 'unsupported-node', nodeId: 'custom' })
  );
});

it('reports missing prompt and model wiring as execution errors', () => {
  const workflow = makeWorkflowWithoutSamplerLinks();
  const result = validateWorkflowExecution(workflow, makeWorkflowExecutionContext());

  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining(['missing-prompt', 'missing-model'])
  );
});
```

**Step 2: Run tests to verify they fail**

Run:

```powershell
npm run test -- src/store/appStore.test.ts src/features/workflow/validateWorkflowExecution.test.ts
```

Expected: FAIL because workflow runtime state and execution validation do not exist yet.

**Step 3: Write the minimal implementation**

Add execution types in `src/types/workflow.ts`:

```ts
export interface WorkflowExecutionIssue {
  severity: 'error' | 'warning';
  code:
    | 'unsupported-node'
    | 'missing-prompt'
    | 'missing-model'
    | 'invalid-sampler-value'
    | 'backend-unavailable';
  message: string;
  nodeId?: string;
}

export interface WorkflowExecutionSummary {
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed?: number;
}

export interface WorkflowRuntimeState {
  issues: WorkflowExecutionIssue[];
  activeJobId: string | null;
  lastRunId: string | null;
  lastFailureMessage: string | null;
  lastResolvedRequest: WorkflowExecutionSummary | null;
}
```

Add transient state and actions in the store:

```ts
workflowRuntimeById: Record<string, WorkflowRuntimeState>;
setWorkflowRuntimeState: (workflowId: string, patch: Partial<WorkflowRuntimeState>) => void;
resetWorkflowRuntimeState: (workflowId: string) => void;
setWorkflowStatus: (workflowId: string, status: WorkflowRecord['status']) => void;
```

Implement `validateWorkflowExecution()` so it:

- reuses `validateWorkflowGraphForComfyExport()` for graph integrity
- checks the supported class-type whitelist
- ensures exactly one `KSampler`
- ensures prompt and model links can be resolved
- returns `{ issues, summary: null }` for now

Keep `workflowRuntimeById` out of `persist.partialize()`.

**Step 4: Run tests to verify they pass**

Run:

```powershell
npm run test -- src/store/appStore.test.ts src/features/workflow/validateWorkflowExecution.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/types/workflow.ts src/store/appStore.types.ts src/store/slices/workflowSlice.ts src/store/appStore.ts src/store/appStore.test.ts src/features/workflow/validateWorkflowExecution.ts src/features/workflow/validateWorkflowExecution.test.ts
git commit -m "feat(workflow): add execution runtime state"
```

### Task 2: Resolve A Real Workflow Generation Request

**Files:**
- Create: `src/features/workflow/resolveWorkflowGenerationRequest.ts`
- Create: `src/features/workflow/resolveWorkflowGenerationRequest.test.ts`
- Modify: `src/features/workflow/validateWorkflowExecution.ts`

**Step 1: Write the failing tests**

Add request-resolution tests for precedence and numeric coercion:

```ts
it('prefers graph prompt and model literals over app-context fallbacks', () => {
  const result = resolveWorkflowGenerationRequest(workflow, {
    activeScenePrompt: 'scene prompt',
    activeSceneNegativePrompt: 'scene negative',
    generationDraft: { prompt: 'draft prompt', negativePrompt: 'draft negative', model: 'draft-model', width: 512, height: 512, steps: 20, cfgScale: 6, scheduler: 'Euler a', seed: 99, generationType: 'image' },
    availableModels: [],
  });

  expect(result.request).toMatchObject({
    prompt: '',
    negative_prompt: 'scene negative',
    model: 'flux-dev.safetensors',
    width: 1024,
    height: 1024,
    steps: 25,
    cfg_scale: 7.5,
    seed: 1,
  });
});

it('falls back to scene or draft context when graph literals are empty', () => {
  const workflow = makeWorkflowWithEmptyPromptAndModel();
  const result = resolveWorkflowGenerationRequest(workflow, makeWorkflowExecutionContext({
    activeScenePrompt: 'fallback scene prompt',
    activeSceneNegativePrompt: 'fallback negative',
    generationDraft: { prompt: 'draft prompt', negativePrompt: 'draft negative', model: 'draft-model', width: 768, height: 768, steps: 18, cfgScale: 5.5, scheduler: 'Euler a', seed: 12, generationType: 'image' },
  }));

  expect(result.request?.prompt).toBe('fallback scene prompt');
  expect(result.request?.model).toBe('draft-model');
});

it('returns validation errors for invalid sampler values', () => {
  const workflow = makeWorkflowWithSamplerValues({ steps: 'abc', cfg: -1 });
  const result = resolveWorkflowGenerationRequest(workflow, makeWorkflowExecutionContext());

  expect(result.issues.map((issue) => issue.code)).toContain('invalid-sampler-value');
});
```

**Step 2: Run tests to verify they fail**

Run:

```powershell
npm run test -- src/features/workflow/resolveWorkflowGenerationRequest.test.ts
```

Expected: FAIL because request resolution does not exist yet.

**Step 3: Write the minimal implementation**

Create a resolver shaped like:

```ts
export function resolveWorkflowGenerationRequest(
  workflow: WorkflowRecord,
  context: WorkflowExecutionContext
): { request: WorkflowGenerationRequest | null; summary: WorkflowExecutionSummary | null; issues: WorkflowExecutionIssue[] } {
  const promptNode = findPromptNode(workflow.graph);
  const modelNode = findModelNode(workflow.graph);
  const samplerNode = findSamplerNode(workflow.graph);

  const prompt = readPrompt(promptNode, context);
  const negativePrompt = context.activeSceneNegativePrompt ?? context.generationDraft?.negativePrompt ?? '';
  const model = readModel(modelNode, context);
  const steps = readNumberInput(samplerNode, 'steps', workflow.settings.steps);
  const cfgScale = readNumberInput(samplerNode, 'cfg', workflow.settings.cfgScale);
  const seed = readOptionalSeed(samplerNode, context.generationDraft?.seed);

  ...
}
```

Resolution rules:

- prompt: graph literal, then active scene, then generation draft
- negative prompt: active scene, then generation draft, else empty string
- model: graph literal, then generation draft
- width and height: `workflow.settings`
- steps and cfg: sampler literals, then `workflow.settings`
- seed: sampler literal, then draft seed, otherwise omit when the value is `-1`

Update `validateWorkflowExecution()` to call the resolver and include the resolved summary when no blocking errors exist.

**Step 4: Run tests to verify they pass**

Run:

```powershell
npm run test -- src/features/workflow/resolveWorkflowGenerationRequest.test.ts src/features/workflow/validateWorkflowExecution.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/features/workflow/resolveWorkflowGenerationRequest.ts src/features/workflow/resolveWorkflowGenerationRequest.test.ts src/features/workflow/validateWorkflowExecution.ts
git commit -m "feat(workflow): resolve executable image requests"
```

### Task 3: Add The Real Renderer-Side Workflow Runner

**Files:**
- Create: `src/features/workflow/runWorkflowExecution.ts`
- Create: `src/features/workflow/runWorkflowExecution.test.ts`
- Modify: `src/store/slices/workflowSlice.ts`
- Modify: `src/store/appStore.types.ts`

**Step 1: Write the failing tests**

Add runner tests with mocked Electron APIs:

```ts
it('queues a real workflow job and records a completed run', async () => {
  const electron = makeElectronGenerationMock({
    submit: { success: true, jobId: 'job-1' },
    statuses: [
      { job_id: 'job-1', status: 'processing', type: 'image', created_at: '2026-04-22T20:00:00.000Z', progress: 40, params: {} },
      { job_id: 'job-1', status: 'completed', type: 'image', created_at: '2026-04-22T20:00:00.000Z', completed_at: '2026-04-22T20:00:05.000Z', progress: 100, result: { images: ['/outputs/job-1/image-1.png'], seed: 1 }, params: {} },
    ],
  });

  await runWorkflowExecution({ workflowId: 'image-generation-baseline', electron, store: useAppStore });

  const state = useAppStore.getState();
  expect(state.workflowRecords[0].runHistory[0]).toMatchObject({ status: 'complete' });
  expect(state.activeViewerItemId).toBe('job-1::/outputs/job-1/image-1.png');
  expect(state.centerView).toBe('viewer');
});

it('records a failed run when submit throws', async () => {
  const electron = makeElectronGenerationMock({ submitError: new Error('Backend offline') });

  await runWorkflowExecution({ workflowId: 'image-generation-baseline', electron, store: useAppStore });

  const runtime = useAppStore.getState().workflowRuntimeById['image-generation-baseline'];
  expect(runtime?.lastFailureMessage).toBe('Backend offline');
  expect(useAppStore.getState().workflowRecords[0].runHistory[0]?.status).toBe('failed');
});
```

**Step 2: Run tests to verify they fail**

Run:

```powershell
npm run test -- src/features/workflow/runWorkflowExecution.test.ts
```

Expected: FAIL because the runner does not exist yet.

**Step 3: Write the minimal implementation**

Create a runner shaped like:

```ts
export async function runWorkflowExecution({
  workflowId,
  electron = window.electron,
  store = useAppStore,
}: RunWorkflowExecutionOptions) {
  const state = store.getState();
  const workflow = state.workflowRecords.find((entry) => entry.id === workflowId);
  if (!workflow) return;

  const validation = validateWorkflowExecution(workflow, buildWorkflowExecutionContext(state));
  if (validation.issues.some((issue) => issue.severity === 'error')) {
    state.setWorkflowRuntimeState(workflowId, { issues: validation.issues });
    return;
  }

  state.setWorkflowStatus(workflowId, 'running');
  state.recordWorkflowRun(workflowId, { id: `run-${crypto.randomUUID()}`, status: 'queued', summary: 'Queued workflow run.' });

  ...
}
```

Runner behavior:

- resolve output root using `window.electron.settings.get()` and `window.electron.app.getPath('userData')`
- submit `generateImage()` with the resolved request
- register the job via `addJob()` with `workflowId` and `source: 'workflow'` in `params`
- poll `getStatus()` until terminal state
- on success:
  - `updateJob()`
  - `syncAssetsFromJobStatus()`
  - derive the asset id as `${job_id}::${outputPath}`
  - `setActiveViewerItemId(assetId)`
  - `setCenterView('viewer')`
  - `recordWorkflowRun()` with status `complete`
  - `setWorkflowStatus(workflowId, 'complete')`
- on failure:
  - `updateJob()` if the job exists
  - `recordWorkflowRun()` with status `failed`
  - set runtime failure message
  - move workflow status back to `ready`

Keep polling in the runner rather than introducing a second global generation listener.

**Step 4: Run tests to verify they pass**

Run:

```powershell
npm run test -- src/features/workflow/runWorkflowExecution.test.ts src/store/appStore.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/features/workflow/runWorkflowExecution.ts src/features/workflow/runWorkflowExecution.test.ts src/store/slices/workflowSlice.ts src/store/appStore.types.ts
git commit -m "feat(workflow): run workflows through generation pipeline"
```

### Task 4: Wire Validate And Run Controls Into WorkflowWorkbench

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.test.tsx`

**Step 1: Write the failing component tests**

Extend the workbench tests for execution controls:

```tsx
it('shows validation issues after clicking Validate', async () => {
  const user = userEvent.setup();
  vi.mock('@/features/workflow/validateWorkflowExecution', () => ({
    validateWorkflowExecution: () => ({
      issues: [{ severity: 'error', code: 'missing-prompt', message: 'Prompt is required.' }],
      summary: null,
    }),
  }));

  render(<WorkflowWorkbench />);
  await user.click(screen.getByRole('button', { name: 'Validate' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Prompt is required.');
});

it('disables Run Workflow while the active workflow has blocking errors', async () => {
  render(<WorkflowWorkbench />);
  useAppStore.getState().setWorkflowRuntimeState('image-generation-baseline', {
    issues: [{ severity: 'error', code: 'missing-prompt', message: 'Prompt is required.' }],
  });

  expect(screen.getByRole('button', { name: 'Run Workflow' })).toBeDisabled();
});

it('invokes the runner when Run Workflow is clicked', async () => {
  const user = userEvent.setup();
  const runWorkflowExecution = vi.fn().mockResolvedValue(undefined);
  vi.mock('@/features/workflow/runWorkflowExecution', () => ({ runWorkflowExecution }));

  render(<WorkflowWorkbench />);
  await user.click(screen.getByRole('button', { name: 'Run Workflow' }));

  expect(runWorkflowExecution).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'image-generation-baseline' }));
});
```

**Step 2: Run tests to verify they fail**

Run:

```powershell
npm run test -- src/components/workflow/WorkflowWorkbench.test.tsx
```

Expected: FAIL because the workbench has no validate/run controls or runtime issue rendering.

**Step 3: Write the minimal implementation**

Update `WorkflowWorkbench.tsx` to:

- read `workflowRuntimeById`, `setWorkflowRuntimeState`, and `systemInfo` from the store
- add toolbar buttons:

```tsx
<button type="button" onClick={handleValidate}>Validate</button>
<button
  type="button"
  onClick={handleRunWorkflow}
  disabled={hasBlockingIssues || isRunning || !systemInfo.backendConnected}
>
  {isRunning ? 'Running workflow…' : 'Run Workflow'}
</button>
```

- render a validation panel in the left rail:

```tsx
{runtime.issues.length > 0 ? (
  <div role="alert" className="rounded-md border border-error/40 bg-error/10 p-3">
    ...
  </div>
) : null}
```

- render the resolved execution summary when `runtime.lastResolvedRequest` exists
- surface the latest failure message from runtime state
- show the current run state in the top toolbar and right-rail run output

Keep the UI inside the existing workbench layout. Do not add a second workflow page or separate queue screen.

**Step 4: Run tests to verify they pass**

Run:

```powershell
npm run test -- src/components/workflow/WorkflowWorkbench.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(workflow): add validate and run controls"
```

### Task 5: Add An Integration-Style Workbench Execution Test And Final Verification

**Files:**
- Create: `src/components/workflow/WorkflowWorkbench.execution.test.tsx`
- Modify: `src/components/workflow/WorkflowWorkbench.tsx` if the integration test exposes small gaps

**Step 1: Write the failing integration-style test**

Create a renderer test that mounts the real workbench with mocked Electron APIs and proves the whole happy path:

```tsx
it('validates, runs, and routes the completed workflow result into Viewer', async () => {
  const user = userEvent.setup();
  mockElectronGenerationSuccess({
    jobId: 'job-1',
    outputPath: '/outputs/job-1/image-1.png',
  });

  render(<WorkflowWorkbench />);

  await user.click(screen.getByRole('button', { name: 'Validate' }));
  expect(screen.getByText('flux-dev.safetensors')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Run Workflow' }));

  await waitFor(() => {
    expect(useAppStore.getState().centerView).toBe('viewer');
    expect(useAppStore.getState().activeViewerItemId).toBe('job-1::/outputs/job-1/image-1.png');
  });

  expect(screen.getByText(/Generated 1 image/i)).toBeInTheDocument();
});
```

**Step 2: Run the focused workflow suite and verify failure**

Run:

```powershell
npm run test -- src/features/workflow/validateWorkflowExecution.test.ts src/features/workflow/resolveWorkflowGenerationRequest.test.ts src/features/workflow/runWorkflowExecution.test.ts src/components/workflow/WorkflowWorkbench.test.tsx src/components/workflow/WorkflowWorkbench.execution.test.tsx src/store/appStore.test.ts
```

Expected: FAIL until the last integration gaps are closed.

**Step 3: Fix the remaining integration gaps**

Only make the minimum changes required by the integration test. Typical fixes here should be limited to:

- awaiting the runner promise correctly in `WorkflowWorkbench`
- refreshing runtime state after `Validate`
- ensuring success summary text is rendered from real run history
- ensuring Viewer handoff happens after asset sync

**Step 4: Run final verification**

Run:

```powershell
npm run test -- src/features/workflow/validateWorkflowExecution.test.ts src/features/workflow/resolveWorkflowGenerationRequest.test.ts src/features/workflow/runWorkflowExecution.test.ts src/components/workflow/WorkflowWorkbench.test.tsx src/components/workflow/WorkflowWorkbench.execution.test.tsx src/store/appStore.test.ts
npm run typecheck
npm run build
```

Expected:

- all focused workflow tests PASS
- `npm run typecheck` PASS
- `npm run build` PASS

If `npm run build` rewrites generated Electron bundles, clean them before the final status check:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowWorkbench.execution.test.tsx src/components/workflow/WorkflowWorkbench.tsx
git commit -m "test(workflow): cover real workbench execution flow"
```
