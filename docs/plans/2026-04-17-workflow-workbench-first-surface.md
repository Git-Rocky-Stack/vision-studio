# Workflow Workbench First Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Workflow placeholder with the first usable workflow workbench surface.

**Architecture:** Add a focused `WorkflowWorkbench` component that renders workflow metadata, an ordered run plan, library presets, and run output context inside the existing center Workflow mini-tab. Wire Generate, Quick, and Edit to this component through `WorkspaceLayout` while keeping the current app store, workbench shell, generation pipeline, and right dock layout unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand only where already used, Vitest, Testing Library.

---

### Task 1: Update The Layout Design Note

**Files:**
- Modify: `docs/plans/2026-04-17-invoke-exact-layout-template-design.md`

**Step 1: Remove the stale Workflow non-goal**

Delete the old non-goal that blocked node workflow editor work from `## Non-Goals`.

**Step 2: Clarify the Workflow section**

Change the Workflow section so it says Workflow can move beyond the placeholder, but execution, persistence, and graph editing remain incremental.

**Step 3: Verify the stale blocker is gone**

Run:

```powershell
rg -n "node workflow editor in this pass" docs/plans
```

Expected: no matches.

**Step 4: Commit**

```powershell
git add docs/plans/2026-04-17-invoke-exact-layout-template-design.md
git commit -m "docs(workflow): unblock workflow workbench surface"
```

### Task 2: Workflow Workbench Component

**Files:**
- Create: `src/components/workflow/WorkflowWorkbench.test.tsx`
- Create: `src/components/workflow/WorkflowWorkbench.tsx`

**Step 1: Write the failing component tests**

Create tests that prove the new surface is usable and no longer placeholder copy:

```tsx
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkflowWorkbench } from './WorkflowWorkbench';

const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');

describe('WorkflowWorkbench', () => {
  afterEach(cleanup);

  it('renders workflow metadata instead of placeholder copy', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.getByText('Image generation baseline')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Node workflows are coming to this workbench.')).not.toBeInTheDocument();
  });

  it('renders an ordered linear run plan', () => {
    render(<WorkflowWorkbench />);

    const runPlan = screen.getByRole('list', { name: 'Workflow run plan' });
    const steps = within(runPlan).getAllByRole('listitem');

    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent('Prompt');
    expect(steps[1]).toHaveTextContent('Model');
    expect(steps[2]).toHaveTextContent('Generate');
    expect(steps[3]).toHaveTextContent('Review');
    expect(steps[4]).toHaveTextContent('Save');
  });

  it('renders library presets and run output context', () => {
    render(<WorkflowWorkbench />);

    expect(screen.getByRole('heading', { name: 'Workflow Library' })).toBeInTheDocument();
    expect(screen.getByText('Text to image')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Run Output' })).toBeInTheDocument();
    expect(screen.getByText('No run output yet.')).toBeInTheDocument();
  });

  it('uses Carbon Pro accent tokens instead of legacy primary red chrome', () => {
    const { container } = render(<WorkflowWorkbench />);

    expect(screen.getByText('Draft')).toHaveClass('border-accent-primary-border');
    expect(container.querySelector(legacyPrimarySelector)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run the new test and verify failure**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: FAIL because `WorkflowWorkbench` does not exist.

**Step 3: Implement the minimal component**

Create `WorkflowWorkbench.tsx` with static seed data:

```tsx
const workflowSteps = [
  { label: 'Prompt', detail: 'Collect prompt, negative prompt, and references.' },
  { label: 'Model', detail: 'Use the selected generation profile.' },
  { label: 'Generate', detail: 'Queue the image generation run.' },
  { label: 'Review', detail: 'Send output to Viewer for comparison.' },
  { label: 'Save', detail: 'Capture accepted output to Boards and Gallery.' },
];

const workflowPresets = ['Text to image', 'Storyboard frame', 'Edit refinement'];

export function WorkflowWorkbench() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(260px,320px)] bg-void">
      ...
    </div>
  );
}
```

Implementation requirements:

- root fills the workbench tab and uses `bg-void`
- left panel has heading `Workflow`, name `Image generation baseline`, status chip `Draft`, and profile text
- center panel uses `role="list"` with `aria-label="Workflow run plan"`
- each step uses `role="listitem"`
- right panel contains `Workflow Library` and `Run Output`
- use `rounded-md`, not larger radii
- do not use `font-display`, `font-mono`, `text-micro`, old red classes, emoji, glyph arrows, or marketing copy

**Step 4: Run the test and verify pass**

Run:

```powershell
npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(workflow): add workbench surface"
```

### Task 3: Wire Workflow Into Core Modes

**Files:**
- Modify: `src/components/layout/WorkspaceLayout.test.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Update the failing layout test**

Change the workflow assertion:

```tsx
it('renders the Workflow workbench when the workbench view is workflow', () => {
  renderWorkspace('edit', { activeWorkbenchView: 'workflow' });

  expect(screen.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('heading', { name: 'Workflow' })).toBeInTheDocument();
  expect(screen.getByText('Image generation baseline')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Workflow run plan' })).toBeInTheDocument();
  expect(screen.queryByText('Node workflows are coming to this workbench.')).not.toBeInTheDocument();
});
```

**Step 2: Run the layout test and verify failure**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: FAIL because `WorkspaceLayout` still renders `WorkflowPlaceholder`.

**Step 3: Wire `WorkflowWorkbench`**

In `WorkspaceLayout.tsx`:

```ts
import { WorkflowWorkbench } from '@/components/workflow/WorkflowWorkbench';
```

Replace each `workflow={<WorkflowPlaceholder />}` with:

```tsx
workflow={<WorkflowWorkbench />}
```

Remove the `WorkflowPlaceholder` import if it is no longer used.

**Step 4: Run the layout test and verify pass**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkspaceLayout.tsx src/components/layout/WorkspaceLayout.test.tsx
git commit -m "feat(workflow): show workbench in core modes"
```

### Task 4: Carbon Chrome Regression

**Files:**
- Modify: `src/components/layout/WorkbenchChromeCarbon.test.tsx`

**Step 1: Update the regression test import**

Replace `WorkflowPlaceholder` with `WorkflowWorkbench` in the test.

**Step 2: Update the regression assertion**

Assert the Workflow workbench uses accent tokens and no old red classes:

```tsx
it('keeps the Workflow workbench on Carbon Pro accent tokens', () => {
  const { container } = render(<WorkflowWorkbench />);

  expect(screen.getByText('Draft')).toHaveClass('border-accent-primary-border');
  expect(container.querySelector(legacyPrimarySelector)).toBeNull();
});
```

**Step 3: Run the regression test**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/components/layout/WorkbenchChromeCarbon.test.tsx
git commit -m "test(workflow): guard workflow workbench chrome"
```

### Task 5: Placeholder Cleanup

**Files:**
- Delete: `src/components/workflow/WorkflowPlaceholder.tsx`
- Delete: `src/components/workflow/WorkflowPlaceholder.test.tsx`

**Step 1: Verify no source imports remain**

Run:

```powershell
rg -n "WorkflowPlaceholder" src
```

Expected: references only in the placeholder files, or no references.

**Step 2: Delete the stale placeholder files**

Delete:

```text
src/components/workflow/WorkflowPlaceholder.tsx
src/components/workflow/WorkflowPlaceholder.test.tsx
```

**Step 3: Run workflow and layout tests**

Run:

```powershell
npx vitest run src/components/workflow src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/components/workflow src/components/layout/WorkspaceLayout.tsx src/components/layout/WorkspaceLayout.test.tsx
git commit -m "refactor(workflow): remove stale placeholder"
```

### Task 6: Focused Verification

**Files:** no planned source changes.

**Step 1: Run focused tests**

Run:

```powershell
npx vitest run src/components/workflow src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
```

Expected: PASS.

**Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

**Step 3: Run glyph policy**

Run:

```powershell
npx vitest run src/styles/ui-glyphs.test.ts --project unit
```

Expected: PASS.

**Step 4: Run diff check**

Run:

```powershell
git diff --check
```

Expected: PASS.

**Step 5: Final commit if earlier commits were skipped**

If the tasks were executed as a single batch:

```powershell
git add docs/plans/2026-04-17-invoke-exact-layout-template-design.md docs/plans/2026-04-17-workflow-workbench-first-surface.md src/components/workflow src/components/layout
git commit -m "feat(workflow): replace placeholder with workbench surface"
```
