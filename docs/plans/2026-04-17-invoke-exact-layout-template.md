# Invoke-Exact Layout Template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the workbench shell so Generate, Quick, and Edit follow InvokeAI's exact spatial template: left settings, center work mini-tabs, and right Boards/Gallery/Layers context.

**Architecture:** Extend `WorkbenchShell` with first-class left dock and arbitrary right dock stack slots while preserving the existing mini-tab API. Then wire `WorkspaceLayout` so settings move out of the right dock into the left dock, and the right side becomes a stack for Boards, Gallery, and Layers. Keep Batch and Templates on their specialized layouts.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Vitest, Testing Library, Playwright smoke checks.

---

### Task 1: Workbench Shell Left Dock Contract

**Files:**

- Modify: `src/components/layout/WorkbenchShell.test.tsx`
- Modify: `src/components/layout/WorkbenchShell.tsx`

**Step 1: Write the failing shell tests**

Add tests proving that `WorkbenchShell` can render a left dock and a custom right stack.

```tsx
it('renders a left workbench dock beside the working area', () => {
  render(
    <WorkbenchShell
      activeView="canvas"
      onViewChange={vi.fn()}
      leftDock={<div>Left settings content</div>}
      canvas={<div>Canvas content</div>}
      viewer={<div>Viewer content</div>}
      workflow={<div>Workflow content</div>}
    />
  );

  expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Left settings content');
  expect(screen.getByText('Canvas content')).toBeInTheDocument();
});

it('renders a custom right dock stack instead of tabbed right dock content', () => {
  render(
    <WorkbenchShell
      activeView="canvas"
      onViewChange={vi.fn()}
      canvas={<div>Canvas content</div>}
      viewer={<div>Viewer content</div>}
      workflow={<div>Workflow content</div>}
      rightDock={<div>Boards and Gallery stack</div>}
      rightDockTabs={[
        { id: 'settings', label: 'Settings', content: <div>Settings content</div> },
      ]}
    />
  );

  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Boards and Gallery stack');
  expect(screen.queryByText('Settings content')).not.toBeInTheDocument();
});
```

**Step 2: Run the shell tests and verify failure**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchShell.test.tsx --project component
```

Expected: FAIL because `leftDock` and `rightDock` props do not exist.

**Step 3: Add shell props**

Update `WorkbenchShellProps`:

```ts
interface WorkbenchShellProps {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  canvas: ReactNode;
  viewer: ReactNode;
  workflow: ReactNode;
  leftDock?: ReactNode;
  rightDock?: ReactNode;
  rightDockTabs?: WorkbenchDockTab[];
  defaultDockTabId?: string;
  activeDockTabId?: string | null;
  onDockTabChange?: (tabId: string) => void;
  toolRail?: ReactNode;
  bottom?: ReactNode;
}
```

Render the left dock before `toolRail`:

```tsx
{leftDock && (
  <aside
    data-testid="workbench-left-dock"
    className="flex w-[clamp(340px,28%,420px)] flex-shrink-0 flex-col border-r border-border bg-surface"
  >
    {leftDock}
  </aside>
)}
```

Render custom right dock content before falling back to tabbed tabs:

```tsx
{rightDock && (
  <aside
    data-testid="workbench-right-dock"
    className="flex w-[clamp(320px,30%,420px)] flex-shrink-0 flex-col border-l border-border bg-surface"
  >
    {rightDock}
  </aside>
)}

{!rightDock && rightDockTabs.length > 0 && (
  // existing tabbed right dock
)}
```

Keep the existing `rightDockTabs` behavior intact for compatibility.

**Step 4: Run the shell tests and verify pass**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchShell.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkbenchShell.tsx src/components/layout/WorkbenchShell.test.tsx
git commit -m "feat(workbench): add left and stacked right dock slots"
```

### Task 2: Invoke-Style Right Context Stack

**Files:**

- Create: `src/components/layout/WorkbenchRightStack.tsx`
- Create: `src/components/layout/WorkbenchRightStack.test.tsx`
- Create: `src/components/layout/WorkbenchBoardsDock.tsx`
- Create: `src/components/layout/WorkbenchBoardsDock.test.tsx`

**Step 1: Write failing tests for `WorkbenchRightStack`**

Create `src/components/layout/WorkbenchRightStack.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkbenchRightStack } from './WorkbenchRightStack';

describe('WorkbenchRightStack', () => {
  it('renders stacked dock sections with stable labels', () => {
    render(
      <WorkbenchRightStack
        sections={[
          { id: 'boards', label: 'Boards', content: <div>Boards content</div> },
          { id: 'gallery', label: 'Gallery', content: <div>Gallery content</div> },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery' })).toBeInTheDocument();
    expect(screen.getByText('Boards content')).toBeInTheDocument();
    expect(screen.getByText('Gallery content')).toBeInTheDocument();
  });
});
```

**Step 2: Write failing tests for `WorkbenchBoardsDock`**

Create `src/components/layout/WorkbenchBoardsDock.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';

describe('WorkbenchBoardsDock', () => {
  beforeEach(() => {
    useAppStore.setState({
      projects: [],
      activeProjectId: null,
    });
  });

  it('renders a Quick Captures empty state when no projects exist', () => {
    render(<WorkbenchBoardsDock />);

    expect(screen.getByText('Quick Captures')).toBeInTheDocument();
    expect(screen.getByText('No scenes captured yet.')).toBeInTheDocument();
  });

  it('renders existing storyboard projects as boards', () => {
    const project = useAppStore.getState().createProject('Campaign Boards', { width: 1024, height: 1024 });

    render(<WorkbenchBoardsDock />);

    expect(screen.getByText('Campaign Boards')).toBeInTheDocument();
    expect(screen.getByText('0 scenes')).toBeInTheDocument();
    expect(screen.getByText(project.name)).toBeInTheDocument();
  });
});
```

**Step 3: Run the new tests and verify failure**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchRightStack.test.tsx src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: FAIL because both components do not exist.

**Step 4: Implement `WorkbenchRightStack`**

Implement a small stacked dock, not a card layout:

```tsx
import type { ReactNode } from 'react';

interface WorkbenchRightStackSection {
  id: string;
  label: string;
  content: ReactNode;
  defaultHeight?: string;
}

interface WorkbenchRightStackProps {
  sections: WorkbenchRightStackSection[];
}

export function WorkbenchRightStack({ sections }: WorkbenchRightStackProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {sections.map((section, index) => (
        <section
          key={section.id}
          className="flex min-h-0 flex-1 flex-col border-b border-border last:border-b-0"
          style={section.defaultHeight ? { flexBasis: section.defaultHeight } : undefined}
        >
          <button
            type="button"
            className="flex h-9 flex-shrink-0 items-center justify-between border-b border-border px-3 text-left font-display text-xs font-semibold text-text-body"
          >
            {section.label}
          </button>
          <div className="min-h-0 flex-1 overflow-hidden">{section.content}</div>
        </section>
      ))}
    </div>
  );
}
```

Do not add collapse state in this task. It can be added later once the layout is stable.

**Step 5: Implement `WorkbenchBoardsDock`**

Use existing project state as a lightweight board analogue:

```tsx
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

export function WorkbenchBoardsDock() {
  const { projects, activeProjectId, setActiveProject } = useAppStore();
  const boards = projects.length > 0 ? projects : [];

  if (boards.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-4 text-center">
        <h3 className="font-display text-sm font-semibold text-text-primary">Quick Captures</h3>
        <p className="mt-2 text-xs text-text-muted">No scenes captured yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-2">
      <div className="flex flex-col gap-1">
        {boards.map((project) => {
          const isActive = project.id === activeProjectId;

          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setActiveProject(project.id)}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-all',
                isActive
                  ? 'border-accent-primary-border bg-accent-primary-muted'
                  : 'border-transparent hover:border-border-hover hover:bg-elevated'
              )}
            >
              <span className="block truncate font-display text-xs font-semibold text-text-primary">
                {project.name}
              </span>
              <span className="mt-1 block font-mono text-micro text-text-muted">
                {project.scenes.length} scenes
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 6: Run tests and verify pass**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchRightStack.test.tsx src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: PASS.

**Step 7: Commit**

```powershell
git add src/components/layout/WorkbenchRightStack.tsx src/components/layout/WorkbenchRightStack.test.tsx src/components/layout/WorkbenchBoardsDock.tsx src/components/layout/WorkbenchBoardsDock.test.tsx
git commit -m "feat(workbench): add Invoke-style right context stack"
```

### Task 3: Wire Generate And Quick To Left Settings

**Files:**

- Modify: `src/components/layout/WorkspaceLayout.test.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Update failing Generate and Quick layout tests**

Update the Generate test so Settings is no longer in the right dock:

```tsx
it('routes Generate through Invoke-style left settings and right context', () => {
  renderWorkspace('generate');

  expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Generate settings');
  expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Viewer' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Workflow' })).toBeInTheDocument();
  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Boards');
  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
  expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  expect(screen.getByTestId('workbench-bottom')).toHaveTextContent('Timeline strip');
});
```

Add the Quick equivalent:

```tsx
it('routes Quick through Invoke-style left settings and right context', () => {
  renderWorkspace('quick');

  expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Quick settings');
  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Boards');
  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
  expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
});
```

Remove or rewrite the existing test that expects Generate dock tab changes for `Gallery`, because Generate should no longer use tabbed right dock state.

**Step 2: Run the layout tests and verify failure**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: FAIL because Generate and Quick still put Settings in the right dock.

**Step 3: Wire Generate and Quick**

Import:

```ts
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';
import { WorkbenchRightStack } from './WorkbenchRightStack';
```

For `generate` and `quick`, replace `rightDockTabs` with:

```tsx
leftDock={panels[activePanel]}
rightDock={
  <WorkbenchRightStack
    sections={[
      {
        id: 'boards',
        label: 'Boards',
        content: <WorkbenchBoardsDock />,
        defaultHeight: '34%',
      },
      {
        id: 'gallery',
        label: 'Gallery',
        content: <WorkbenchGalleryDock />,
      },
    ]}
  />
}
```

Remove `activeDockTabId`, `onDockTabChange`, and `defaultDockTabId` from the Generate/Quick `WorkbenchShell` call.

**Step 4: Run the layout tests and verify pass**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkspaceLayout.tsx src/components/layout/WorkspaceLayout.test.tsx
git commit -m "feat(workbench): move generate settings to left dock"
```

### Task 4: Wire Edit To Left Inspector And Right Layers/Gallery

**Files:**

- Modify: `src/components/layout/WorkspaceLayout.test.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Update failing Edit layout tests**

Update the Edit test to expect edit properties in the left dock and Layers/Gallery in the right stack:

```tsx
it('routes Edit through left inspector, tool rail, and right layers stack', () => {
  renderWorkspace('edit');

  expect(screen.getByTestId('workbench-left-dock')).toHaveTextContent('Edit inspector');
  expect(screen.getByTestId('workbench-tool-rail')).toHaveTextContent('Edit tool rail');
  expect(screen.getByText('Edit canvas')).toBeInTheDocument();
  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Layers');
  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('Gallery');
  expect(screen.queryByRole('tab', { name: 'Inspector' })).not.toBeInTheDocument();
});
```

Replace the existing `promotes Layers into the Edit dock` test with:

```tsx
it('renders Layers in the Edit right context stack', () => {
  renderWorkspace('edit');

  expect(screen.getByTestId('workbench-right-dock')).toHaveTextContent('No layers');
});
```

**Step 2: Run layout tests and verify failure**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: FAIL because Edit still uses tabbed right dock tabs.

**Step 3: Wire Edit**

For `edit`, replace the right dock tabs with:

```tsx
leftDock={editProperties}
rightDock={
  <WorkbenchRightStack
    sections={[
      {
        id: 'layers',
        label: 'Layers',
        content: <LayerPanel />,
        defaultHeight: '45%',
      },
      {
        id: 'gallery',
        label: 'Gallery',
        content: <WorkbenchGalleryDock />,
      },
    ]}
  />
}
```

Keep:

```tsx
toolRail={toolStrip}
canvas={editCanvas || canvas}
viewer={<WorkbenchViewer />}
workflow={<WorkflowPlaceholder />}
bottom={timeline}
```

Remove `activeDockTabId`, `onDockTabChange`, `defaultDockTabId`, and `rightDockTabs` from the Edit `WorkbenchShell` call.

**Step 4: Run layout tests and verify pass**

Run:

```powershell
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/WorkspaceLayout.tsx src/components/layout/WorkspaceLayout.test.tsx
git commit -m "feat(workbench): align edit dock layout with Invoke"
```

### Task 5: Store Cleanup For Obsolete Dock Tabs

**Files:**

- Modify: `src/store/appStore.test.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`
- Modify: `src/components/layout/WorkspaceLayout.test.tsx`

**Step 1: Audit usage**

Run:

```powershell
rg -n "activeWorkbenchDockTabs|setActiveWorkbenchDockTab|onWorkbenchDockTabChange|activeWorkbenchDockTabs" src
```

Expected: usage in store, `App.tsx`, `WorkspaceLayout.tsx`, and tests only.

**Step 2: Decide whether to delete or retain**

If no tabbed right dock remains in the app after Tasks 3-4, delete:

```ts
export type WorkbenchDockPanel = 'generate' | 'quick' | 'edit';
export type WorkbenchDockTabs = Partial<Record<WorkbenchDockPanel, string>>;
activeWorkbenchDockTabs: WorkbenchDockTabs;
setActiveWorkbenchDockTab: (panel: WorkbenchDockPanel, tabId: string) => void;
```

Also remove `activeWorkbenchDockTabs` from `partialize`.

If another route still uses tabbed right dock, keep the store and skip this task. Do not keep dead persisted state.

**Step 3: Update tests**

If deleting, remove tests that assert dock tab persistence. Keep tests for `activeWorkbenchView`.

**Step 4: Run store and layout tests**

Run:

```powershell
npx vitest run src/store/appStore.test.ts --project unit
npx vitest run src/components/layout/WorkspaceLayout.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/store/appStore.ts src/store/appStore.test.ts src/App.tsx src/components/layout/WorkspaceLayout.tsx src/components/layout/WorkspaceLayout.test.tsx
git commit -m "refactor(workbench): remove obsolete right dock tab state"
```

### Task 6: Carbon Pro Chrome Regression

**Files:**

- Modify: `src/components/layout/WorkbenchChromeCarbon.test.tsx`
- Modify only if needed: `src/components/layout/WorkbenchShell.tsx`
- Modify only if needed: `src/components/layout/WorkbenchRightStack.tsx`
- Modify only if needed: `src/components/layout/WorkbenchBoardsDock.tsx`
- Modify only if needed: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Extend regression tests**

Update `WorkbenchChromeCarbon.test.tsx` to render:

- `WorkbenchShell` with `leftDock`
- `WorkbenchShell` with custom `rightDock`
- `WorkbenchRightStack`
- `WorkbenchBoardsDock`

Assert no legacy red classes:

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

expect(container.querySelector(legacyPrimarySelector)).toBeNull();
```

Assert active center mini-tabs still use neutral/accent classes:

```ts
expect(screen.getByRole('tab', { name: 'Canvas' }).className).toContain('bg-accent-primary-muted');
```

**Step 2: Run regression test**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchChromeCarbon.test.tsx --project component
```

Expected: PASS. If it fails, change only new workbench shell chrome.

**Step 3: Commit**

```powershell
git add src/components/layout/WorkbenchChromeCarbon.test.tsx src/components/layout/WorkbenchShell.tsx src/components/layout/WorkbenchRightStack.tsx src/components/layout/WorkbenchBoardsDock.tsx src/components/layout/WorkspaceLayout.tsx
git commit -m "test(workbench): guard Invoke-style Carbon chrome"
```

### Task 7: Focused And Full Verification

**Files:** no planned source changes.

**Step 1: Run focused component tests**

Run:

```powershell
npx vitest run src/components/layout/WorkbenchShell.test.tsx src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchRightStack.test.tsx src/components/layout/WorkbenchBoardsDock.test.tsx --project component
```

Expected: PASS.

**Step 2: Run broader checks**

Run:

```powershell
npm run typecheck
npm run test
npm run build
git diff --check
```

Expected:

- `npm run typecheck`: PASS
- `npm run test`: PASS
- `npm run build`: PASS, existing chunk-size warning acceptable
- `git diff --check`: PASS

**Step 3: Restore generated Electron bundle output if changed**

Run:

```powershell
git status --short dist-electron
```

If `dist-electron/main.mjs` or `dist-electron/preload.cjs` changed only because of `npm run build`, restore them:

```powershell
git restore -- dist-electron/main.mjs dist-electron/preload.cjs
```

Do not restore source files or docs.

**Step 4: Commit verification-only fixes if any**

Only if verification required source changes:

```powershell
git add <changed-source-files>
git commit -m "fix(workbench): stabilize Invoke-style dock layout"
```

### Task 8: Browser Smoke

**Files:** no planned source changes.

**Step 1: Start Vite**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Use a PowerShell-managed process. Avoid inline Node child-process server management on Windows because the previous hand-off hit `spawn EINVAL` and cleanup issues.

**Step 2: Smoke Generate**

Use Playwright to verify:

- left dock contains Generate settings
- center mini-tabs contain Canvas, Viewer, Workflow
- right dock contains Boards and Gallery
- Settings is not a right dock tab

**Step 3: Smoke Viewer and Workflow**

Click Viewer:

- Viewer surface renders
- left settings remain stable
- right Boards/Gallery remain stable

Click Workflow:

- Workflow placeholder renders
- left settings remain stable
- right Boards/Gallery remain stable

**Step 4: Smoke Edit**

Switch to Edit:

- left dock contains Edit inspector/properties
- tool rail renders between left dock and center
- center renders Edit canvas
- right dock contains Layers and Gallery

**Step 5: Stop Vite and clean screenshots/logs**

Stop the dev server process. Remove temporary smoke screenshots and logs unless the user asks to keep them.

**Step 6: Final status**

Report:

- source files changed
- tests run
- any generated files restored
- any known residual risks
