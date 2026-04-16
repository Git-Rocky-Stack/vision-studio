# Workbench Layout Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the app shell into an Invoke-benchmark creative workbench with center mini-tabs, a visible Workflow placeholder, optional mode tool rail, and a right context dock.

**Architecture:** Keep existing feature behavior intact while introducing reusable workbench shell primitives. `WorkspaceLayout` remains the app-level coordinator, but the Generate, Quick, Edit, and default canvas modes should render through a shared workbench frame with stable zones. State for the selected working-area view should live in Zustand so Canvas, Viewer, and Workflow tab state is testable and can later support real workflow/editor surfaces.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Vitest, Testing Library, Playwright smoke checks.

---

## Task 1: Workbench View State

**Files:**

- Modify: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

**Step 1: Add failing store tests**

Add tests that prove the workbench view defaults to `canvas` and can switch to
`viewer` and `workflow`.

```ts
it('defaults the workbench view to canvas', () => {
  expect(useAppStore.getState().activeWorkbenchView).toBe('canvas');
});

it('changes the active workbench view', () => {
  useAppStore.getState().setActiveWorkbenchView('workflow');
  expect(useAppStore.getState().activeWorkbenchView).toBe('workflow');
});
```

**Step 2: Run the store test and verify failure**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL because `activeWorkbenchView` and `setActiveWorkbenchView` do not
exist.

**Step 3: Add state and action**

Add:

```ts
type WorkbenchView = 'canvas' | 'viewer' | 'workflow';
```

Extend `AppState`:

```ts
activeWorkbenchView: WorkbenchView;
setActiveWorkbenchView: (view: WorkbenchView) => void;
```

Initialize:

```ts
activeWorkbenchView: 'canvas',
```

Add action:

```ts
setActiveWorkbenchView: (view) => set({ activeWorkbenchView: view }),
```

Do not persist this state in `partialize` yet; it should reset safely to Canvas
on launch.

**Step 4: Run the store test and verify pass**

```powershell
npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(workbench): add workbench view state"
```

## Task 2: Workbench Shell Components

**Files:**

- Create: `src/components/layout/WorkbenchShell.tsx`
- Create: `src/components/layout/WorkbenchShell.test.tsx`
- Optional modify: `src/components/layout/index.ts` if layout exports are centralized

**Step 1: Write failing component tests**

Create tests that render `WorkbenchShell` with:

- a tool rail
- a canvas slot
- a viewer slot
- a workflow slot
- a right dock with two tabs
- a bottom slot

Assert:

```ts
expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
expect(screen.getByRole('tab', { name: 'Viewer' })).toBeInTheDocument();
expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
expect(screen.getByTestId('workbench-tool-rail')).toBeInTheDocument();
expect(screen.getByTestId('workbench-right-dock')).toBeInTheDocument();
expect(screen.getByTestId('workbench-bottom')).toBeInTheDocument();
```

Add a second test that clicks `Workflow` and expects the workflow slot to render.

**Step 2: Run the new test and verify failure**

```powershell
npx vitest run src/components/layout/WorkbenchShell.test.tsx --project component
```

Expected: FAIL because the component does not exist.

**Step 3: Implement `WorkbenchShell`**

Required props:

```ts
type WorkbenchView = 'canvas' | 'viewer' | 'workflow';

interface WorkbenchDockTab {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

interface WorkbenchShellProps {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  canvas: React.ReactNode;
  viewer: React.ReactNode;
  workflow: React.ReactNode;
  rightDockTabs?: WorkbenchDockTab[];
  defaultDockTabId?: string;
  toolRail?: React.ReactNode;
  bottom?: React.ReactNode;
}
```

Layout requirements:

- Full-height flex row.
- Optional left tool rail with `data-testid="workbench-tool-rail"`.
- Center working area with mini-tabs at top-left.
- Mini-tabs use `role="tablist"` and `role="tab"`.
- Active center content uses `role="tabpanel"`.
- Right dock uses `data-testid="workbench-right-dock"`.
- Bottom slot uses `data-testid="workbench-bottom"`.
- Active states use `bg-accent-primary-muted`, `text-accent-primary`, and
  `border-accent-primary-border`.
- No `red-primary`, `red-aura`, `glow-red`, or red shadow classes in shell
  chrome.

**Step 4: Run component tests**

```powershell
npx vitest run src/components/layout/WorkbenchShell.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkbenchShell.tsx src/components/layout/WorkbenchShell.test.tsx
git commit -m "feat(workbench): add workbench shell"
```

## Task 3: Workflow Placeholder

**Files:**

- Create: `src/components/workflow/WorkflowPlaceholder.tsx`
- Create: `src/components/workflow/WorkflowPlaceholder.test.tsx`

**Step 1: Write failing placeholder tests**

Assert the placeholder renders:

- heading `Workflow`
- text `Node workflows are coming to this workbench.`
- chips `Planned`, `Linear UI`, `Node Canvas`
- no legacy primary-red classes

**Step 2: Run and verify failure**

```powershell
npx vitest run src/components/workflow/WorkflowPlaceholder.test.tsx --project component
```

Expected: FAIL because the component does not exist.

**Step 3: Implement placeholder**

Use professional empty-state copy only:

```tsx
export function WorkflowPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-void">
      <section className="max-w-md text-center">
        <p className="text-label text-accent-primary">Workflow</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-text-primary">
          Node workflows are coming to this workbench.
        </h2>
        <p className="mt-3 text-sm text-text-body">
          For now, keep building through Canvas and Viewer.
        </p>
        ...
      </section>
    </div>
  );
}
```

Keep styling docked and restrained. Do not use a hero, marketing language,
decorative gradient, or old red classes.

**Step 4: Run and verify pass**

```powershell
npx vitest run src/components/workflow/WorkflowPlaceholder.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/workflow/WorkflowPlaceholder.tsx src/components/workflow/WorkflowPlaceholder.test.tsx
git commit -m "feat(workflow): add workbench placeholder"
```

## Task 4: Wire Generate, Quick, And Edit Through Workbench

**Files:**

- Modify: `src/components/layout/WorkspaceLayout.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/layout/WorkspaceLayout.test.tsx`

**Step 1: Write failing layout tests**

Create or extend `WorkspaceLayout.test.tsx`.

Test Generate mode:

- renders `Canvas`, `Viewer`, and `Workflow` tabs
- renders generate panel in the right dock
- renders timeline in the bottom slot

Test Edit mode:

- renders `workbench-tool-rail`
- renders edit properties in the right dock
- renders `Canvas`, `Viewer`, and `Workflow` tabs

Test Batch/Templates:

- still render their existing special layouts
- do not accidentally show the workbench mini-tabs unless intentionally
  included later

**Step 2: Run and verify failure**

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: FAIL because `WorkspaceLayout` is not using `WorkbenchShell`.

**Step 3: Wire `WorkspaceLayout`**

Import `WorkbenchShell` and `WorkflowPlaceholder`.

For `generate` and `quick`, render:

- `canvas`: existing `canvas`
- `viewer`: existing `canvas` for now, wrapped in a lightweight viewer panel if
  needed
- `workflow`: `<WorkflowPlaceholder />`
- right dock tab: `Settings` containing `panels[activePanel]`
- bottom: existing `timeline`

For `edit`, render:

- `toolRail`: existing `toolStrip`
- `canvas`: existing `editCanvas || canvas`
- `viewer`: existing `canvas`
- `workflow`: `<WorkflowPlaceholder />`
- right dock tabs:
  - `Inspector`: `editProperties`
  - `Layers`: placeholder text only if layers are not separated in this batch
- bottom: existing `timeline`

Keep `batch` and `templates` paths special for now.

**Step 4: Update `App.tsx` props**

Pass:

```tsx
activeWorkbenchView={activeWorkbenchView}
onWorkbenchViewChange={setActiveWorkbenchView}
```

to `WorkspaceLayout`.

Wrap the workflow placeholder import at the layout level, not the app level, so
`App.tsx` does not become a layout registry.

**Step 5: Run layout tests**

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add src/App.tsx src/components/layout/WorkspaceLayout.tsx src/components/layout/WorkspaceLayout.test.tsx
git commit -m "feat(workbench): route core modes through workbench shell"
```

## Task 5: Legacy Chrome Regression

**Files:**

- Create: `src/components/layout/WorkbenchChromeCarbon.test.tsx`
- Modify only if test exposes issues:
  - `src/components/layout/WorkbenchShell.tsx`
  - `src/components/layout/WorkspaceLayout.tsx`
  - `src/components/workflow/WorkflowPlaceholder.tsx`

**Step 1: Write regression tests**

Render the workbench shell and the workflow placeholder. Assert shell chrome does
not contain:

```ts
const legacyPrimarySelector = [
  '.text-red-primary',
  '.bg-red-aura',
  '.border-red-primary',
  '.ring-red-primary',
  '.glow-red',
  '.glow-red-subtle',
  '.shadow-red-glow',
].join(', ');
```

Assert active mini-tabs use accent classes.

**Step 2: Run and verify failure or pass**

```powershell
npx vitest run src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
```

Expected: PASS if Tasks 2-4 stayed clean. If it fails, fix only the new shell
chrome.

**Step 3: Commit**

```powershell
git add src/components/layout/WorkbenchChromeCarbon.test.tsx src/components/layout/WorkbenchShell.tsx src/components/layout/WorkspaceLayout.tsx src/components/workflow/WorkflowPlaceholder.tsx
git commit -m "test(workbench): guard Carbon Pro shell chrome"
```

## Task 6: Verification And Browser Smoke

**Files:** no planned source changes.

**Step 1: Run focused tests**

```powershell
npx vitest run src/components/layout src/components/workflow src/store/appStore.test.ts --project component --project unit
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

Start Vite:

```powershell
npm run dev -- --host 127.0.0.1
```

Use Playwright with mocked `window.electron` APIs to capture:

- Generate mode with Canvas mini-tab.
- Generate mode after clicking Workflow.
- Edit mode with tool rail and right inspector.
- Edit mode after clicking Workflow.

Check:

- Mini-tabs are visible in core modes.
- Workflow placeholder is visible and stable.
- Right dock renders expected context.
- Timeline still renders where expected.
- No visible old red active shell chrome.

Remove new screenshots and Vite logs before final status unless the user asks to
keep them.

**Step 4: Restore generated files**

If `npm run build` modifies generated Electron output, restore it:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

Only restore generated files changed by this verification step.

**Step 5: Final commit**

If all prior task commits were not made individually, commit the complete batch:

```powershell
git add src docs/plans/2026-04-16-workbench-layout-refactor.md
git commit -m "feat(workbench): introduce Invoke-benchmark layout shell"
```

Push only when explicitly requested.
