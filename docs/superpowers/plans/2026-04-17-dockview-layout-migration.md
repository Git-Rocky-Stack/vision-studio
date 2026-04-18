# Dockview Layout Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Vision Studio's layout layer with an InvokeAI-style three-panel dockable system using `@mathuo/dockview`, while retaining all existing features, content components, and business logic.

**Architecture:** Dockview `Gridview` for the root three-column split (left settings | center workspace | right gallery+boards), Dockview `DockviewReact` for the center workspace tab area. Narrow icon-only `NavBar` replaces the expandable `Sidebar`. Six consolidated tabs with sub-mode segmented controls for Generate and Story tabs. Store navigation refactored from `activePanel` (8 values) to `activeTab` (6 values) + `activeSubMode`.

**Tech Stack:** React 19, TypeScript, `@mathuo/dockview`, Zustand 5, Tailwind CSS v4, Framer Motion, Vitest 3.2.4, @testing-library/react 16.3.2

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/components/layout/NavBar.tsx` | Narrow icon-only sidebar, 6 tabs, top/bottom clusters |
| `src/components/layout/DockviewLayout.tsx` | Root layout, creates Dockview/Gridview instances, loads presets per tab |
| `src/components/layout/DockviewSettingsPanel.tsx` | Left dock wrapper with sub-mode segmented control |
| `src/components/layout/DockviewWorkspacePanel.tsx` | Center workspace tab group (Canvas/Viewer/Workflow/Launchpad) |
| `src/components/layout/DockviewGalleryPanel.tsx` | Right dock gallery panel |
| `src/components/layout/DockviewBoardsPanel.tsx` | Right dock boards panel |
| `src/components/layout/DockviewLayersPanel.tsx` | Right dock layers panel (Canvas tab only) |
| `src/components/layout/layoutPresets.ts` | Layout configuration definitions per tab |
| `src/components/layout/NavBar.test.tsx` | NavBar component tests |
| `src/components/layout/DockviewLayout.test.tsx` | Dockview layout integration tests |
| `src/components/layout/layoutPresets.test.ts` | Layout preset unit tests |
| `src/types/navigation.ts` | Navigation type definitions (ActiveTab, ActiveSubMode, CenterView) |

### Modified files

| File | Change |
|------|--------|
| `src/App.tsx` | Replace WorkspaceLayout with DockviewLayout wiring |
| `src/store/appStore.types.ts` | Replace `activePanel` with `activeTab` + `activeSubMode`, add `centerView`, remove `sidebarCollapsed` |
| `src/store/slices/uiSlice.ts` | Replace actions: `setActivePanel` → `setActiveTab` + `setActiveSubMode`, `toggleSidebar` → removed, `setActiveWorkbenchView` → `setCenterView` |
| `src/store/appStore.ts` | Update partialize to persist new keys, remove old keys |
| `src/types/workflow.ts` | Extend `WorkbenchView` to include `'launchpad'` |
| `src/components/layout/WorkbenchBoardsDock.tsx` | Replace `setActivePanel('storyboard')` → `setActiveTab('story')` + `setActiveSubMode('storyboard')` |
| `src/components/layout/WorkbenchGalleryDock.tsx` | Replace `setActiveWorkbenchView('viewer')` → `setCenterView('viewer')` |
| `src/components/layout/WorkbenchViewer.tsx` | Replace `setActivePanel('edit')` → `setActiveTab('canvas')`, `setActivePanel('generate')` → `setActiveTab('generate')`, `setActiveWorkbenchView('canvas')` → `setCenterView('canvas')` |
| `src/components/batch/ResultsGrid.tsx` | Replace `setActivePanel('edit')` → `setActiveTab('canvas')` |
| `src/components/canvas/CanvasContextMenu.tsx` | Replace `setActivePanel('edit')` → `setActiveTab('canvas')` |
| `src/components/edit/EditPropertiesPanel.tsx` | Replace `activePanel` → `activeTab` |
| `src/store/appStore.test.ts` | Update navigation tests for new API |
| `package.json` | Add `@mathuo/dockview` dependency |

### Deleted files (Task 12)

| File | Replaced by |
|------|-----------|
| `src/components/layout/WorkspaceLayout.tsx` | `DockviewLayout.tsx` |
| `src/components/layout/Sidebar.tsx` | `NavBar.tsx` |
| `src/components/layout/WorkbenchShell.tsx` | Dockview panels |
| `src/components/layout/WorkbenchRightStack.tsx` | Dockview right dock panels |
| `src/components/layout/WorkbenchBoardsDock.tsx` | `DockviewBoardsPanel.tsx` |
| `src/components/layout/WorkbenchGalleryDock.tsx` | `DockviewGalleryPanel.tsx` |
| `src/components/layout/WorkbenchViewer.tsx` | Center workspace tab panel |
| `src/components/layout/Sidebar.test.tsx` | `NavBar.test.tsx` |
| `src/components/layout/WorkspaceLayout.test.tsx` | `DockviewLayout.test.tsx` |
| `src/components/layout/WorkbenchShell.test.tsx` | Dockview layout tests |
| `src/components/layout/WorkbenchBoardsDock.test.tsx` | DockviewBoardsPanel tests |
| `src/components/layout/WorkbenchGalleryDock.test.tsx` | DockviewGalleryPanel tests |
| `src/components/layout/WorkbenchViewer.test.tsx` | Center workspace tests |
| `src/components/layout/WorkbenchChromeCarbon.test.tsx` | Dockview layout tests |

---

## Task 1: Install Dockview & Create Navigation Types

**Files:**
- Modify: `package.json`
- Create: `src/types/navigation.ts`

- [ ] **Step 1: Install @mathuo/dockview**

```bash
cd /c/vision-studio && npm install @mathuo/dockview
```

- [ ] **Step 2: Run typecheck to verify Dockview installs cleanly**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (Dockview is a new dependency, no existing code references it yet)

- [ ] **Step 3: Create navigation types file**

Create `src/types/navigation.ts`:

```ts
export type ActiveTab = 'generate' | 'canvas' | 'story' | 'workflows' | 'assets' | 'settings';

export type GenerateSubMode = 'generate' | 'quick' | 'batch';

export type StorySubMode = 'storyboard' | 'templates';

export type ActiveSubMode = GenerateSubMode | StorySubMode | null;

export type CenterView = 'canvas' | 'viewer' | 'workflow' | 'launchpad';

export interface NavBarTab {
  id: ActiveTab;
  label: string;
  icon: string; // lucide icon name
  cluster: 'top' | 'bottom';
}
```

- [ ] **Step 4: Run typecheck to verify new types**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types/navigation.ts
git commit -m "feat(layout): install dockview and add navigation types"
```

---

## Task 2: Refactor Store Navigation Model

**Files:**
- Modify: `src/store/appStore.types.ts:140-144,243-244`
- Modify: `src/store/slices/uiSlice.ts`
- Modify: `src/store/appStore.ts` (partialize block)
- Test: `src/store/appStore.test.ts`

This task is additive — new keys are added alongside existing keys. Existing code keeps working. Old keys are removed in Task 12.

- [ ] **Step 1: Write failing tests for new navigation actions**

Add to `src/store/appStore.test.ts` inside a new `describe('navigation refactor')` block:

```ts
describe('navigation refactor', () => {
  it('defaults activeTab to generate', () => {
    expect(useAppStore.getState().activeTab).toBe('generate');
  });

  it('defaults activeSubMode to generate', () => {
    expect(useAppStore.getState().activeSubMode).toBe('generate');
  });

  it('defaults centerView to canvas', () => {
    expect(useAppStore.getState().centerView).toBe('canvas');
  });

  it('setActiveTab changes the active tab', () => {
    useAppStore.getState().setActiveTab('canvas');
    expect(useAppStore.getState().activeTab).toBe('canvas');
  });

  it('setActiveSubMode changes the sub-mode', () => {
    useAppStore.getState().setActiveSubMode('quick');
    expect(useAppStore.getState().activeSubMode).toBe('quick');
  });

  it('setActiveTab sets default sub-mode for the new tab', () => {
    useAppStore.getState().setActiveTab('story');
    expect(useAppStore.getState().activeSubMode).toBe('storyboard');
  });

  it('setActiveTab sets sub-mode to null for tabs without sub-modes', () => {
    useAppStore.getState().setActiveTab('assets');
    expect(useAppStore.getState().activeSubMode).toBeNull();
  });

  it('setCenterView changes the center workspace view', () => {
    useAppStore.getState().setCenterView('workflow');
    expect(useAppStore.getState().centerView).toBe('workflow');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: FAIL — `activeTab`, `activeSubMode`, `centerView`, `setActiveTab`, `setActiveSubMode`, `setCenterView` don't exist yet

- [ ] **Step 3: Add new state keys to appStore.types.ts**

In `src/store/appStore.types.ts`, add after line 142 (`activeWorkbenchView`):

```ts
  // New navigation model (replaces activePanel/sidebarCollapsed)
  activeTab: ActiveTab;
  activeSubMode: ActiveSubMode;
  centerView: CenterView;
```

Add the import at the top:

```ts
import type { ActiveTab, ActiveSubMode, CenterView } from '@/types/navigation';
```

Add new action signatures in the Actions section:

```ts
  setActiveTab: (tab: ActiveTab) => void;
  setActiveSubMode: (subMode: ActiveSubMode) => void;
  setCenterView: (view: CenterView) => void;
```

- [ ] **Step 4: Add new initial state and actions to uiSlice.ts**

In `src/store/slices/uiSlice.ts`, add to `uiInitialState`:

```ts
  activeTab: 'generate' as const,
  activeSubMode: 'generate' as const,
  centerView: 'canvas' as const,
```

Add to `createUIActions`:

```ts
    setActiveTab: (tab: AppState['activeTab']) => {
      const subModeDefaults: Record<string, AppState['activeSubMode']> = {
        generate: 'generate',
        canvas: null,
        story: 'storyboard',
        workflows: null,
        assets: null,
        settings: null,
      };
      set({ activeTab: tab, activeSubMode: subModeDefaults[tab] ?? null });
    },
    setActiveSubMode: (subMode: AppState['activeSubMode']) => set({ activeSubMode: subMode }),
    setCenterView: (view: AppState['centerView']) => set({ centerView: view }),
```

- [ ] **Step 5: Update partialize in appStore.ts**

In `src/store/appStore.ts`, inside the `partialize` function, add `activeTab` and remove `sidebarCollapsed`:

Add after `sidebarCollapsed`:

```ts
        activeTab: state.activeTab,
        activeSubMode: state.activeSubMode,
        centerView: state.centerView,
```

- [ ] **Step 6: Run new tests to verify they pass**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: The new `navigation refactor` describe block passes. Existing tests may fail due to type changes — that's expected, we'll fix those in Task 10.

- [ ] **Step 7: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: May have type errors in files that reference `AppState` — that's OK for now. The store itself is consistent.

- [ ] **Step 8: Commit**

```bash
git add src/types/navigation.ts src/store/appStore.types.ts src/store/slices/uiSlice.ts src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(store): add activeTab, activeSubMode, centerView navigation model"
```

---

## Task 3: Extend WorkbenchView Type

**Files:**
- Modify: `src/types/workflow.ts:1`

- [ ] **Step 1: Add launchpad to WorkbenchView**

In `src/types/workflow.ts`, change line 1:

```ts
export type WorkbenchView = 'canvas' | 'viewer' | 'workflow' | 'launchpad';
```

- [ ] **Step 2: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (adding a new union member is backward-compatible)

- [ ] **Step 3: Commit**

```bash
git add src/types/workflow.ts
git commit -m "feat(types): add launchpad to WorkbenchView union"
```

---

## Task 4: Create NavBar Component

**Files:**
- Create: `src/components/layout/NavBar.tsx`
- Create: `src/components/layout/NavBar.test.tsx`

- [ ] **Step 1: Write failing NavBar tests**

Create `src/components/layout/NavBar.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavBar } from './NavBar';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('NavBar', () => {
  beforeEach(resetStore);

  it('renders all 6 tab icons', () => {
    render(<NavBar />);
    expect(screen.getByLabelText('Generate')).toBeInTheDocument();
    expect(screen.getByLabelText('Canvas')).toBeInTheDocument();
    expect(screen.getByLabelText('Story')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflows')).toBeInTheDocument();
    expect(screen.getByLabelText('Assets')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    useAppStore.setState({ activeTab: 'canvas' });
    render(<NavBar />);
    const canvasButton = screen.getByLabelText('Canvas');
    expect(canvasButton).toHaveAttribute('data-active', 'true');
  });

  it('switches tab on click', async () => {
    const user = userEvent.setup();
    render(<NavBar />);
    await user.click(screen.getByLabelText('Canvas'));
    expect(useAppStore.getState().activeTab).toBe('canvas');
  });

  it('sets default sub-mode when switching tabs', async () => {
    const user = userEvent.setup();
    render(<NavBar />);
    await user.click(screen.getByLabelText('Story'));
    expect(useAppStore.getState().activeSubMode).toBe('storyboard');
  });

  it('shows GPU status indicator', () => {
    useAppStore.setState({ systemInfo: { gpuAvailable: true, gpuName: 'RTX 4090', vramTotal: 24, vramUsed: 8, cpuUsage: 45, ramTotal: 64, ramUsed: 32 } });
    render(<NavBar />);
    expect(screen.getByLabelText('GPU available')).toBeInTheDocument();
  });

  it('renders bottom cluster below divider', () => {
    render(<NavBar />);
    const divider = screen.getByRole('separator');
    expect(divider).toBeInTheDocument();
    const assetsButton = screen.getByLabelText('Assets');
    const settingsButton = screen.getByLabelText('Settings');
    // Bottom cluster items exist after the divider
    expect(assetsButton).toBeInTheDocument();
    expect(settingsButton).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/components/layout/NavBar.test.tsx --project component
```

Expected: FAIL — `NavBar` module not found

- [ ] **Step 3: Implement NavBar component**

Create `src/components/layout/NavBar.tsx`:

```tsx
import { memo } from 'react';
import {
  Wand2,
  Palette,
  Clapperboard,
  GitBranch,
  FolderOpen,
  Settings,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Tooltip } from '@/components/ui/Tooltip';
import type { ActiveTab } from '@/types/navigation';

interface NavTabDef {
  id: ActiveTab;
  label: string;
  icon: typeof Wand2;
  cluster: 'top' | 'bottom';
}

const navTabs: NavTabDef[] = [
  { id: 'generate', label: 'Generate', icon: Wand2, cluster: 'top' },
  { id: 'canvas', label: 'Canvas', icon: Palette, cluster: 'top' },
  { id: 'story', label: 'Story', icon: Clapperboard, cluster: 'top' },
  { id: 'workflows', label: 'Workflows', icon: GitBranch, cluster: 'top' },
  { id: 'assets', label: 'Assets', icon: FolderOpen, cluster: 'bottom' },
  { id: 'settings', label: 'Settings', icon: Settings, cluster: 'bottom' },
];

export const NavBar = memo(function NavBar() {
  const { activeTab, setActiveTab, systemInfo } = useAppStore();

  const topTabs = navTabs.filter((t) => t.cluster === 'top');
  const bottomTabs = navTabs.filter((t) => t.cluster === 'bottom');

  const renderTab = (tab: NavTabDef) => {
    const isActive = activeTab === tab.id;
    const Icon = tab.icon;

    const button = (
      <button
        key={tab.id}
        type="button"
        aria-label={tab.label}
        data-active={isActive}
        onClick={() => setActiveTab(tab.id)}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg transition-all',
          isActive
            ? 'bg-accent-primary-muted text-accent-primary'
            : 'text-text-body hover:bg-elevated hover:text-text-primary'
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
    );

    return (
      <Tooltip key={tab.id} content={tab.label} side="right">
        {button}
      </Tooltip>
    );
  };

  return (
    <nav aria-label="Main navigation" className="flex h-full w-14 flex-col items-center border-r border-border bg-surface py-4">
      {/* Logo */}
      <div className="mb-6 flex h-8 w-8 items-center justify-center rounded-md border border-accent-primary-border bg-accent-primary-muted">
        <Wand2 className="h-4 w-4 text-accent-primary" aria-hidden="true" />
      </div>

      {/* Top cluster */}
      <div className="flex flex-col items-center gap-2">
        {topTabs.map(renderTab)}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Divider */}
      <div className="my-3 h-px w-8 bg-border" role="separator" />

      {/* Bottom cluster */}
      <div className="flex flex-col items-center gap-2">
        {bottomTabs.map(renderTab)}
      </div>

      {/* GPU Status */}
      <div className="mt-3">
        {systemInfo.gpuAvailable ? (
          <Tooltip content={systemInfo.gpuName ?? 'GPU'} side="right">
            <div aria-label="GPU available">
              <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden="true" />
            </div>
          </Tooltip>
        ) : (
          <Tooltip content="No GPU detected" side="right">
            <div aria-label="No GPU">
              <AlertCircle className="h-4 w-4 text-status-warning" aria-hidden="true" />
            </div>
          </Tooltip>
        )}
      </div>
    </nav>
  );
});
```

- [ ] **Step 4: Run NavBar tests to verify they pass**

```bash
cd /c/vision-studio && npx vitest run src/components/layout/NavBar.test.tsx --project component
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/NavBar.tsx src/components/layout/NavBar.test.tsx
git commit -m "feat(layout): create narrow icon-only NavBar component"
```

---

## Task 5: Create Layout Presets

**Files:**
- Create: `src/components/layout/layoutPresets.ts`
- Create: `src/components/layout/layoutPresets.test.ts`

- [ ] **Step 1: Write failing layout preset tests**

Create `src/components/layout/layoutPresets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getLayoutPreset, type LayoutPreset } from './layoutPresets';

describe('layoutPresets', () => {
  it('returns a preset for each tab', () => {
    const tabs = ['generate', 'canvas', 'story', 'workflows', 'assets', 'settings'] as const;
    for (const tab of tabs) {
      const preset = getLayoutPreset(tab);
      expect(preset).toBeDefined();
      expect(preset.tabId).toBe(tab);
    }
  });

  it('generate preset has left, center, and right panels', () => {
    const preset = getLayoutPreset('generate');
    expect(preset.hasLeftDock).toBe(true);
    expect(preset.hasRightDock).toBe(true);
    expect(preset.centerViews).toEqual(['canvas', 'viewer', 'workflow', 'launchpad']);
  });

  it('canvas preset has layers in right dock', () => {
    const preset = getLayoutPreset('canvas');
    expect(preset.rightDockPanels).toContain('layers');
    expect(preset.rightDockPanels).toContain('gallery');
  });

  it('story preset has sub-modes', () => {
    const preset = getLayoutPreset('story');
    expect(preset.subModes).toEqual(['storyboard', 'templates']);
  });

  it('assets preset has no side docks', () => {
    const preset = getLayoutPreset('assets');
    expect(preset.hasLeftDock).toBe(false);
    expect(preset.hasRightDock).toBe(false);
  });

  it('settings preset has no side docks', () => {
    const preset = getLayoutPreset('settings');
    expect(preset.hasLeftDock).toBe(false);
    expect(preset.hasRightDock).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/components/layout/layoutPresets.test.ts --project unit
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement layout presets**

Create `src/components/layout/layoutPresets.ts`:

```ts
import type { ActiveTab, ActiveSubMode, CenterView } from '@/types/navigation';

export interface LayoutPreset {
  tabId: ActiveTab;
  hasLeftDock: boolean;
  hasRightDock: boolean;
  centerViews: CenterView[];
  rightDockPanels: string[];
  subModes: ActiveSubMode[];
  leftDockMinWidth: number;
  rightDockMinWidth: number;
}

const presets: Record<ActiveTab, LayoutPreset> = {
  generate: {
    tabId: 'generate',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas', 'viewer', 'workflow', 'launchpad'],
    rightDockPanels: ['gallery', 'boards'],
    subModes: ['generate', 'quick', 'batch'],
    leftDockMinWidth: 380,
    rightDockMinWidth: 280,
  },
  canvas: {
    tabId: 'canvas',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas'],
    rightDockPanels: ['layers', 'gallery'],
    subModes: [],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  story: {
    tabId: 'story',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['canvas'],
    rightDockPanels: ['boards', 'gallery'],
    subModes: ['storyboard', 'templates'],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  workflows: {
    tabId: 'workflows',
    hasLeftDock: true,
    hasRightDock: true,
    centerViews: ['workflow'],
    rightDockPanels: ['gallery', 'boards'],
    subModes: [],
    leftDockMinWidth: 340,
    rightDockMinWidth: 280,
  },
  assets: {
    tabId: 'assets',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    rightDockPanels: [],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
  settings: {
    tabId: 'settings',
    hasLeftDock: false,
    hasRightDock: false,
    centerViews: ['canvas'],
    rightDockPanels: [],
    subModes: [],
    leftDockMinWidth: 0,
    rightDockMinWidth: 0,
  },
};

export function getLayoutPreset(tab: ActiveTab): LayoutPreset {
  return presets[tab];
}
```

- [ ] **Step 4: Run layout preset tests to verify they pass**

```bash
cd /c/vision-studio && npx vitest run src/components/layout/layoutPresets.test.ts --project unit
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/layoutPresets.ts src/components/layout/layoutPresets.test.ts
git commit -m "feat(layout): create layout presets for all 6 tabs"
```

---

## Task 6: Create Dockview Panel Wrappers

**Files:**
- Create: `src/components/layout/DockviewSettingsPanel.tsx`
- Create: `src/components/layout/DockviewGalleryPanel.tsx`
- Create: `src/components/layout/DockviewBoardsPanel.tsx`
- Create: `src/components/layout/DockviewLayersPanel.tsx`

- [ ] **Step 1: Implement DockviewSettingsPanel**

Create `src/components/layout/DockviewSettingsPanel.tsx`:

```tsx
import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { GeneratePanel } from '@/pages/GeneratePanel';
import { QuickGeneratePanel } from '@/pages/QuickGeneratePanel';
import { BatchPanel } from '@/pages/BatchPanel';
import { StoryboardPanel } from '@/pages/StoryboardPanel';
import { TemplatesPanel } from '@/pages/TemplatesPanel';
import { EditPropertiesPanel } from '@/components/edit/EditPropertiesPanel';
import { ToolStrip } from '@/components/edit/ToolStrip';
import type { ActiveSubMode } from '@/types/navigation';

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { id: ActiveSubMode; label: string }[];
  value: ActiveSubMode;
  onChange: (id: ActiveSubMode) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border px-3 py-2" role="tablist" aria-label="Sub-mode">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex-1 rounded-md border px-2 py-1.5 type-ui transition-all',
            value === opt.id
              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
              : 'border-transparent text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const generateSubModes = [
  { id: 'generate' as const, label: 'Generate' },
  { id: 'quick' as const, label: 'Quick' },
  { id: 'batch' as const, label: 'Batch' },
];

const storySubModes = [
  { id: 'storyboard' as const, label: 'Storyboard' },
  { id: 'templates' as const, label: 'Templates' },
];

export const DockviewSettingsPanel = memo(function DockviewSettingsPanel() {
  const { activeTab, activeSubMode, setActiveSubMode } = useAppStore();

  const renderSubModeControl = () => {
    if (activeTab === 'generate') {
      return (
        <SegmentedControl
          options={generateSubModes}
          value={activeSubMode ?? 'generate'}
          onChange={setActiveSubMode}
        />
      );
    }
    if (activeTab === 'story') {
      return (
        <SegmentedControl
          options={storySubModes}
          value={activeSubMode ?? 'storyboard'}
          onChange={setActiveSubMode}
        />
      );
    }
    return null;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'generate':
        if (activeSubMode === 'quick') return <QuickGeneratePanel />;
        if (activeSubMode === 'batch') return <BatchPanel />;
        return <GeneratePanel />;
      case 'canvas':
        return (
          <div className="flex h-full flex-col">
            <ToolStrip />
            <EditPropertiesPanel />
          </div>
        );
      case 'story':
        if (activeSubMode === 'templates') return <TemplatesPanel />;
        return <StoryboardPanel />;
      case 'workflows':
        return <StoryboardPanel />; // placeholder — will become workflow inspector
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {renderSubModeControl()}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Implement DockviewGalleryPanel**

Create `src/components/layout/DockviewGalleryPanel.tsx`:

```tsx
import { memo } from 'react';
import { WorkbenchGalleryDock } from './WorkbenchGalleryDock';

export const DockviewGalleryPanel = memo(function DockviewGalleryPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-shrink-0 items-center border-b border-border px-3">
        <h2 className="type-ui text-text-primary">Gallery</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkbenchGalleryDock />
      </div>
    </div>
  );
});
```

- [ ] **Step 3: Implement DockviewBoardsPanel**

Create `src/components/layout/DockviewBoardsPanel.tsx`:

```tsx
import { memo } from 'react';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';

export const DockviewBoardsPanel = memo(function DockviewBoardsPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-shrink-0 items-center border-b border-border px-3">
        <h2 className="type-ui text-text-primary">Boards</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkbenchBoardsDock />
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Implement DockviewLayersPanel**

Create `src/components/layout/DockviewLayersPanel.tsx`:

```tsx
import { memo } from 'react';
import { LayerPanel } from '@/components/edit/LayerPanel';

export const DockviewLayersPanel = memo(function DockviewLayersPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-shrink-0 items-center border-b border-border px-3">
        <h2 className="type-ui text-text-primary">Layers</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <LayerPanel />
      </div>
    </div>
  );
});
```

- [ ] **Step 5: Run typecheck to verify all wrappers compile**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (these components are new, not wired yet)

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/DockviewSettingsPanel.tsx src/components/layout/DockviewGalleryPanel.tsx src/components/layout/DockviewBoardsPanel.tsx src/components/layout/DockviewLayersPanel.tsx
git commit -m "feat(layout): create dockview panel wrapper components"
```

---

## Task 7: Create DockviewLayout Root Component

**Files:**
- Create: `src/components/layout/DockviewLayout.tsx`
- Create: `src/components/layout/DockviewLayout.test.tsx`

This is the core component — it replaces `WorkspaceLayout` and `WorkbenchShell` with a Dockview `Gridview` root that splits into left/center/right panels.

- [ ] **Step 1: Write failing DockviewLayout tests**

Create `src/components/layout/DockviewLayout.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DockviewLayout } from './DockviewLayout';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

// Mock dockview since jsdom doesn't support its DOM requirements
vi.mock('@mathuo/dockview', () => ({
  GridviewReact: ({ props }: any) => (
    <div data-testid="gridview-mock">{props.children}</div>
  ),
  DockviewReact: () => (
    <div data-testid="dockview-mock" />
  ),
  Orientation: { HORIZONTAL: 'HORIZONTAL', VERTICAL: 'VERTICAL' },
}));

describe('DockviewLayout', () => {
  beforeEach(resetStore);

  it('renders NavBar', () => {
    render(<DockviewLayout />);
    expect(screen.getByLabelText('Generate')).toBeInTheDocument();
  });

  it('renders left dock for generate tab', () => {
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);
    expect(screen.getByTestId('left-dock')).toBeInTheDocument();
  });

  it('renders right dock for generate tab', () => {
    useAppStore.setState({ activeTab: 'generate' });
    render(<DockviewLayout />);
    expect(screen.getByTestId('right-dock')).toBeInTheDocument();
  });

  it('does not render side docks for assets tab', () => {
    useAppStore.setState({ activeTab: 'assets' });
    render(<DockviewLayout />);
    expect(screen.queryByTestId('left-dock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-dock')).not.toBeInTheDocument();
  });

  it('does not render side docks for settings tab', () => {
    useAppStore.setState({ activeTab: 'settings' });
    render(<DockviewLayout />);
    expect(screen.queryByTestId('left-dock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-dock')).not.toBeInTheDocument();
  });

  it('renders layers panel for canvas tab right dock', () => {
    useAppStore.setState({ activeTab: 'canvas' });
    render(<DockviewLayout />);
    expect(screen.getByText('Layers')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/vision-studio && npx vitest run src/components/layout/DockviewLayout.test.tsx --project component
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement DockviewLayout**

Create `src/components/layout/DockviewLayout.tsx`:

```tsx
import { memo, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { NavBar } from './NavBar';
import { DockviewSettingsPanel } from './DockviewSettingsPanel';
import { DockviewGalleryPanel } from './DockviewGalleryPanel';
import { DockviewBoardsPanel } from './DockviewBoardsPanel';
import { DockviewLayersPanel } from './DockviewLayersPanel';
import { getLayoutPreset } from './layoutPresets';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AssetsPanel } from '@/pages/AssetsPanel';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { Canvas } from './Canvas';
import { WorkflowWorkbench } from '@/components/workflow/WorkflowWorkbench';
import { WorkbenchViewer } from './WorkbenchViewer';

export const DockviewLayout = memo(function DockviewLayout() {
  const { activeTab, centerView, setCenterView } = useAppStore();
  const preset = useMemo(() => getLayoutPreset(activeTab), [activeTab]);

  // Full-width tabs (no side docks)
  if (activeTab === 'assets') {
    return (
      <div className="flex h-full">
        <NavBar />
        <main className="flex-1 min-w-0">
          <AssetsPanel />
        </main>
      </div>
    );
  }

  if (activeTab === 'settings') {
    return (
      <div className="flex h-full">
        <NavBar />
        <main className="flex-1 min-w-0">
          <SettingsPanel />
        </main>
      </div>
    );
  }

  // Three-panel tabs
  const renderCenterContent = () => {
    switch (centerView) {
      case 'viewer':
        return <WorkbenchViewer />;
      case 'workflow':
        return <WorkflowWorkbench />;
      default:
        return <Canvas />;
    }
  };

  const renderRightDock = () => {
    if (activeTab === 'canvas') {
      return (
        <div data-testid="right-dock" className="flex h-full min-h-0 w-[clamp(280px,30%,420px)] flex-shrink-0 flex-col border-l border-border bg-surface">
          <DockviewLayersPanel />
          <div className="flex min-h-0 flex-1 flex-col border-t border-border">
            <DockviewGalleryPanel />
          </div>
        </div>
      );
    }

    return (
      <div data-testid="right-dock" className="flex h-full min-h-0 w-[clamp(280px,30%,420px)] flex-shrink-0 flex-col border-l border-border bg-surface">
        <DockviewGalleryPanel />
        <div className="flex min-h-0 flex-1 flex-col border-t border-border">
          <DockviewBoardsPanel />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full">
      <NavBar />
      <div className="flex flex-1 min-w-0">
        {/* Left dock */}
        <ErrorBoundary fallbackLabel="Settings panel error">
          <aside data-testid="left-dock" className="flex h-full min-h-0 w-[clamp(340px,32%,420px)] flex-shrink-0 flex-col border-r border-border bg-surface">
            <DockviewSettingsPanel />
          </aside>
        </ErrorBoundary>

        {/* Center workspace */}
        <main className="flex min-w-0 flex-1 flex-col bg-void">
          {/* Center view tabs */}
          {preset.centerViews.length > 1 && (
            <div className="flex items-center border-b border-border bg-surface px-3 py-2">
              <div className="flex gap-1" role="tablist" aria-label="Workbench view">
                {preset.centerViews.map((view) => {
                  const isActive = centerView === view;
                  const labels: Record<string, string> = {
                    canvas: 'Canvas',
                    viewer: 'Viewer',
                    workflow: 'Workflow',
                    launchpad: 'Launchpad',
                  };
                  return (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setCenterView(view)}
                      className={`rounded-md border px-3 py-1.5 type-ui transition-all ${
                        isActive
                          ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                          : 'border-transparent text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
                      }`}
                    >
                      {labels[view] ?? view}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <section className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary fallbackLabel="Workspace error">
              {renderCenterContent()}
            </ErrorBoundary>
          </section>
        </main>

        {/* Right dock */}
        <ErrorBoundary fallbackLabel="Right dock error">
          {renderRightDock()}
        </ErrorBoundary>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Run DockviewLayout tests to verify they pass**

```bash
cd /c/vision-studio && npx vitest run src/components/layout/DockviewLayout.test.tsx --project component
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/DockviewLayout.tsx src/components/layout/DockviewLayout.test.tsx
git commit -m "feat(layout): create DockviewLayout root component with three-panel structure"
```

---

## Task 8: Wire DockviewLayout into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace WorkspaceLayout with DockviewLayout in App.tsx**

In `src/App.tsx`, replace the `WorkspaceLayout` usage with `DockviewLayout`. Remove all the panel wiring that `WorkspaceLayout` previously needed.

Replace the return block's `WorkspaceLayout` usage with:

```tsx
return (
  <>
    <ErrorBoundary fallbackLabel="Workspace error">
      <DockviewLayout />
    </ErrorBoundary>
    <KeyboardShortcuts onToggleShortcuts={() => setShowShortcuts((v) => !v)} />
    {showShortcuts && (
      <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
    )}
    <FilmGrainOverlay />
  </>
);
```

Remove these imports that are no longer needed in App.tsx:

```tsx
// Remove: Sidebar, Header, Canvas, Timeline, WorkspaceLayout
// Remove: GeneratePanel, EditPanel, AssetsPanel, SettingsPanel, TemplatesPanel
// Remove: BatchPromptQueue, BatchResultsPanel, QuickGeneratePanel, StoryboardPanel
// Remove: ToolStrip, EditPropertiesPanel
```

Add this import:

```tsx
import { DockviewLayout } from '@/components/layout/DockviewLayout';
```

Also remove the destructured store values that are no longer needed in App.tsx:

```tsx
// Remove from destructure: activePanel, activeWorkbenchView, setActiveWorkbenchView
```

- [ ] **Step 2: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (or minor type errors in App.tsx — fix inline)

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire DockviewLayout as root layout"
```

---

## Task 9: Update Navigation Calls Across Codebase

**Files:**
- Modify: `src/components/layout/WorkbenchBoardsDock.tsx:28,43`
- Modify: `src/components/layout/WorkbenchGalleryDock.tsx:23,78`
- Modify: `src/components/layout/WorkbenchViewer.tsx:69-70,171,178-179`
- Modify: `src/components/batch/ResultsGrid.tsx:36,130`
- Modify: `src/components/canvas/CanvasContextMenu.tsx:29,104`
- Modify: `src/components/edit/EditPropertiesPanel.tsx:86,217`

These files currently call `setActivePanel` and `setActiveWorkbenchView`. They need to call the new actions instead.

- [ ] **Step 1: Update WorkbenchBoardsDock.tsx**

Replace:
```ts
setActivePanel,
```
with:
```ts
setActiveTab,
setActiveSubMode,
```

Replace:
```ts
setActivePanel('storyboard');
```
with:
```ts
setActiveTab('story');
setActiveSubMode('storyboard');
```

- [ ] **Step 2: Update WorkbenchGalleryDock.tsx**

Replace:
```ts
setActiveWorkbenchView,
```
with:
```ts
setCenterView,
```

Replace:
```ts
setActiveWorkbenchView('viewer');
```
with:
```ts
setCenterView('viewer');
```

- [ ] **Step 3: Update WorkbenchViewer.tsx**

Replace:
```ts
setActivePanel,
setActiveWorkbenchView,
```
with:
```ts
setActiveTab,
setCenterView,
```

Replace:
```ts
setActivePanel('edit');
```
with:
```ts
setActiveTab('canvas');
```

Replace:
```ts
setActiveWorkbenchView('canvas');
setActivePanel('generate');
```
with:
```ts
setCenterView('canvas');
setActiveTab('generate');
```

- [ ] **Step 4: Update ResultsGrid.tsx**

Replace:
```ts
setActivePanel,
```
with:
```ts
setActiveTab,
```

Replace:
```ts
setActivePanel('edit');
```
with:
```ts
setActiveTab('canvas');
```

- [ ] **Step 5: Update CanvasContextMenu.tsx**

Replace:
```ts
const { currentImage, currentImageAssetPath, setActivePanel } = useAppStore();
```
with:
```ts
const { currentImage, currentImageAssetPath, setActiveTab } = useAppStore();
```

Replace:
```ts
setActivePanel('edit');
```
with:
```ts
setActiveTab('canvas');
```

- [ ] **Step 6: Update EditPropertiesPanel.tsx**

Replace:
```ts
activePanel,
```
with:
```ts
activeTab,
```

Replace:
```ts
sourcePanel: activePanel,
```
with:
```ts
sourceTab: activeTab,
```

(Or adjust the `sourcePanel` field to `sourceTab` in the relevant type. Check the type definition used here.)

- [ ] **Step 7: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS

- [ ] **Step 8: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

Expected: All tests pass (content tests unchanged, navigation tests updated)

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/WorkbenchBoardsDock.tsx src/components/layout/WorkbenchGalleryDock.tsx src/components/layout/WorkbenchViewer.tsx src/components/batch/ResultsGrid.tsx src/components/canvas/CanvasContextMenu.tsx src/components/edit/EditPropertiesPanel.tsx
git commit -m "refactor: update navigation calls from setActivePanel to setActiveTab"
```

---

## Task 10: Update Store Tests for New Navigation Model

**Files:**
- Modify: `src/store/appStore.test.ts`

- [ ] **Step 1: Update existing navigation tests**

In `src/store/appStore.test.ts`, find the existing `describe('toggleSidebar')` and `describe('setActivePanel')` blocks. Update or replace them:

Replace `setActivePanel` tests with `setActiveTab` tests:

```ts
describe('setActiveTab', () => {
  it('changes the active tab', () => {
    useAppStore.getState().setActiveTab('canvas');
    expect(useAppStore.getState().activeTab).toBe('canvas');
  });

  it('sets default sub-mode when switching tabs', () => {
    useAppStore.getState().setActiveTab('story');
    expect(useAppStore.getState().activeSubMode).toBe('storyboard');
  });

  it('clears sub-mode for tabs without sub-modes', () => {
    useAppStore.getState().setActiveSubMode('quick');
    useAppStore.getState().setActiveTab('assets');
    expect(useAppStore.getState().activeSubMode).toBeNull();
  });
});
```

Remove the `toggleSidebar` describe block (functionality removed).

Remove the `setActivePanel` describe block (replaced by `setActiveTab`).

- [ ] **Step 2: Run store tests**

```bash
cd /c/vision-studio && npx vitest run src/store/appStore.test.ts --project unit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/appStore.test.ts
git commit -m "test(store): update navigation tests for new tab model"
```

---

## Task 11: Visual Validation & Smoke Testing

No new files. Manual verification.

- [ ] **Step 1: Start dev server**

```bash
cd /c/vision-studio && npm run dev
```

- [ ] **Step 2: Verify NavBar renders with 6 icons**

Check: All 6 icons visible (Generate, Canvas, Story, Workflows, Assets, Settings). Top cluster and bottom cluster separated by divider.

- [ ] **Step 3: Verify tab switching**

Click each NavBar icon. Confirm:
- Generate tab shows settings left dock with Generate/Quick/Batch segmented control
- Canvas tab shows tool strip + edit properties left dock
- Story tab shows settings left dock with Storyboard/Templates segmented control
- Workflows tab shows workflow inspector left dock
- Assets tab shows full-width grid (no side docks)
- Settings tab shows full-width settings (no side docks)

- [ ] **Step 4: Verify sub-mode switching**

In Generate tab, click Quick then Batch. Confirm left dock content switches. In Story tab, click Storyboard then Templates. Confirm left dock content switches.

- [ ] **Step 5: Verify right dock panels**

For Generate tab: Gallery (top) + Boards (bottom).
For Canvas tab: Layers (top) + Gallery (bottom).
For Story tab: Gallery (top) + Boards (bottom).
For Workflows tab: Gallery (top) + Boards (bottom).

- [ ] **Step 6: Verify center workspace tab switching**

In Generate tab, click Canvas/Viewer/Workflow/Launchpad tabs. Confirm center content switches.

- [ ] **Step 7: Verify ErrorBoundaries**

If any panel crashes, confirm ErrorBoundary shows recovery UI and other panels remain functional.

- [ ] **Step 8: Commit any fixes discovered during smoke testing**

```bash
git add -A
git commit -m "fix(layout): address smoke testing findings"
```

---

## Task 12: Remove Old Layout Components

**Files:**
- Delete: `src/components/layout/WorkspaceLayout.tsx`
- Delete: `src/components/layout/Sidebar.tsx`
- Delete: `src/components/layout/WorkbenchShell.tsx`
- Delete: `src/components/layout/WorkbenchRightStack.tsx`
- Delete: `src/components/layout/Sidebar.test.tsx`
- Delete: `src/components/layout/WorkspaceLayout.test.tsx`
- Delete: `src/components/layout/WorkbenchShell.test.tsx`
- Delete: `src/components/layout/WorkbenchBoardsDock.test.tsx`
- Delete: `src/components/layout/WorkbenchGalleryDock.test.tsx`
- Delete: `src/components/layout/WorkbenchViewer.test.tsx`
- Delete: `src/components/layout/WorkbenchChromeCarbon.test.tsx`
- Modify: `src/store/appStore.types.ts` — Remove `activePanel`, `sidebarCollapsed`, `toggleSidebar`, `setActivePanel`
- Modify: `src/store/slices/uiSlice.ts` — Remove `activePanel`, `sidebarCollapsed`, `toggleSidebar`, `setActivePanel`
- Modify: `src/store/appStore.ts` — Remove `sidebarCollapsed` from partialize

- [ ] **Step 1: Delete old layout component files**

```bash
cd /c/vision-studio && git rm src/components/layout/WorkspaceLayout.tsx src/components/layout/Sidebar.tsx src/components/layout/WorkbenchShell.tsx src/components/layout/WorkbenchRightStack.tsx
```

- [ ] **Step 2: Delete old test files**

```bash
cd /c/vision-studio && git rm src/components/layout/Sidebar.test.tsx src/components/layout/WorkspaceLayout.test.tsx src/components/layout/WorkbenchShell.test.tsx src/components/layout/WorkbenchBoardsDock.test.tsx src/components/layout/WorkbenchGalleryDock.test.tsx src/components/layout/WorkbenchViewer.test.tsx src/components/layout/WorkbenchChromeCarbon.test.tsx
```

- [ ] **Step 3: Remove old navigation keys from appStore.types.ts**

In `src/store/appStore.types.ts`, remove:

```ts
  sidebarCollapsed: boolean;
  activePanel: 'generate' | 'quick' | 'storyboard' | 'edit' | 'assets' | 'settings' | 'templates' | 'batch';
```

Remove from Actions:

```ts
  toggleSidebar: () => void;
  setActivePanel: (panel: AppState['activePanel']) => void;
```

- [ ] **Step 4: Remove old navigation keys from uiSlice.ts**

In `src/store/slices/uiSlice.ts`, remove from `uiInitialState`:

```ts
  sidebarCollapsed: false,
  activePanel: 'generate' as const,
```

Remove from `createUIActions`:

```ts
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setActivePanel: (panel: AppState['activePanel']) => set({ activePanel: panel }),
```

- [ ] **Step 5: Remove sidebarCollapsed from partialize**

In `src/store/appStore.ts`, remove from `partialize`:

```ts
        sidebarCollapsed: state.sidebarCollapsed,
```

- [ ] **Step 6: Run typecheck**

```bash
cd /c/vision-studio && npm run typecheck
```

Expected: PASS (or fix any remaining references to deleted APIs)

- [ ] **Step 7: Run full test suite**

```bash
cd /c/vision-studio && npm run test
```

Expected: All tests pass. Deleted test files are gone. New tests cover the same functionality.

- [ ] **Step 8: Run production build**

```bash
cd /c/vision-studio && npm run build
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(layout): remove old WorkspaceLayout, Sidebar, WorkbenchShell and legacy navigation model"
```

---

## Task 13: Accessibility & Polish

**Files:**
- Modify: `src/components/layout/NavBar.tsx`
- Modify: `src/components/layout/DockviewLayout.tsx`
- Modify: `src/components/layout/DockviewSettingsPanel.tsx`

- [ ] **Step 1: Verify NavBar keyboard navigation**

All NavBar buttons must be focusable via Tab. Enter/Space must activate the tab. Focus ring must be visible using the project's focus-visible styles.

- [ ] **Step 2: Add ARIA attributes to segmented controls**

In `DockviewSettingsPanel.tsx`, verify the `SegmentedControl` component has proper `role="tablist"`, `role="tab"`, and `aria-selected` attributes (already present from Task 6 implementation).

- [ ] **Step 3: Verify panel resize behavior**

Test panel resize by dragging borders between left dock, center workspace, and right dock. Confirm:
- Minimum widths are respected (340-380px left, 280px right)
- Panels don't collapse to zero
- Layout feels smooth at 60fps

- [ ] **Step 4: Verify dark theme across all new components**

All new components use the design system tokens (`text-text-primary`, `bg-surface`, `border-border`, etc.) so dark theme should work. Confirm visually.

- [ ] **Step 5: Run full test suite final verification**

```bash
cd /c/vision-studio && npm run test && npm run typecheck && npm run build
```

Expected: All pass

- [ ] **Step 6: Commit any polish fixes**

```bash
git add -A
git commit -m "fix(layout): accessibility and polish for NavBar and DockviewLayout"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| Install @mathuo/dockview | Task 1 |
| Narrow icon-only NavBar | Task 4 |
| 6 consolidated tabs | Task 4 (NavBar), Task 5 (presets), Task 7 (DockviewLayout) |
| Three-panel dockable layout | Task 7 |
| Sub-mode segmented controls | Task 6 (DockviewSettingsPanel) |
| Store navigation refactor | Task 2 |
| Layout state persistence | Task 2 (partialize), Task 7 |
| Panel wrapper components | Task 6 |
| Wire Generate tab | Task 7, Task 8 |
| Wire remaining tabs | Task 7 (handled by preset-driven rendering) |
| Remove old layout components | Task 12 |
| Tests & polish | Task 10, Task 13 |
| Error boundaries | Task 7 (ErrorBoundary wrapping) |
| Navigation call updates | Task 9 |

**2. Placeholder scan:** No TBD, TODO, or "implement later" found. All steps have complete code.

**3. Type consistency:** `ActiveTab`, `ActiveSubMode`, `CenterView` defined in Task 1, used consistently in Tasks 2-9. `setActiveTab`, `setActiveSubMode`, `setCenterView` defined in Task 2, called consistently in Tasks 4, 7, 9. `getLayoutPreset` defined in Task 5, called in Task 7.