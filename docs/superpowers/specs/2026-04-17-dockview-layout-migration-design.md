# Dockview Layout Migration — Design Spec

**Date:** 2026-04-17
**Phase:** 1 of 5 (Dockview Layout Migration)
**Status:** Approved

## Overview

Re-author Vision Studio's layout layer to adopt InvokeAI's three-panel dockable layout pattern using `@mathuo/dockview`. Retain all existing features, content components, and business logic. Replace the layout shell (WorkspaceLayout, Sidebar, WorkbenchShell) with a Dockview-based system.

**Goal:** Mirror InvokeAI's layout, buttons, instrumentation, and overall design system while keeping Vision Studio's color scheme and feature set.

## Scope

- Narrow icon-only NavBar (replacing expandable Sidebar)
- 6 consolidated tabs: Generate, Canvas, Story, Workflows, Assets, Settings
- Three-panel dockable layout per tab (left settings dock | center workspace | right gallery/boards dock)
- Sub-mode switching via segmented controls in left dock (Generate/Quick/Batch, Storyboard/Templates)
- `@mathuo/dockview` as layout engine for resizable, dockable panels
- Layout state persistence (panel sizes, tab order) via Zustand

**Out of scope (future phases):**
- Prompt Studio
- Iteration History
- Smart Collections
- Enhanced Timeline
- Refinement Pipeline
- Live Preview

---

## 1. Architecture

### Current layout stack (replaced)

```
App.tsx
 └─ WorkspaceLayout.tsx
     ├─ Sidebar.tsx (76–168px, expandable, text labels)
     ├─ Header.tsx
     ├─ Timeline.tsx
     └─ WorkbenchShell.tsx (fixed-width left/center/right docks)
         ├─ WorkbenchRightStack.tsx (tab-switched Boards/Gallery)
         └─ WorkbenchViewer.tsx (center viewer)
```

### New layout stack

```
App.tsx
 └─ DockviewLayout.tsx
     ├─ NavBar.tsx (narrow icon-only, 6 tabs, top/bottom clusters)
     └─ Dockview root (three-panel grid: left | center | right)
         ├─ Left dock: settings panel (sub-mode segmented control)
         ├─ Center: workspace Dockview (tabbed: canvas/viewer/workflow/launchpad)
         └─ Right dock: vertical Gridview (Gallery stacked above Boards/Layers)
```

### Key architectural decisions

- **Dockview for center workspace** — Handles tabbed panels (Canvas | Viewer | Workflow | Launchpad), panel drag/reorder, resize
- **Gridview for left/right docks** — Fixed-role panels that resize but don't float or detach
- **Layout presets per tab** — Each of the 6 tabs has a predefined Dockview layout. No custom layout saving yet (matching InvokeAI's current behavior)
- **Panel components are thin wrappers** — Each Dockview panel wraps an existing content component with minimal adaptation
- **Store navigation refactor** — `activePanel` becomes `activeTab`, new `activeSubMode` for sub-mode switching, `sidebarCollapsed` removed

---

## 2. Component Map

### New components

| Component | Purpose |
|-----------|---------|
| `DockviewLayout.tsx` | Root layout. Creates Dockview instance, loads preset per active tab, wires NavBar |
| `NavBar.tsx` | Narrow icon-only sidebar. 6 icons, top/bottom clusters, active state, tooltips |
| `DockviewSettingsPanel.tsx` | Left dock wrapper. Renders correct settings content per tab + sub-mode segmented control |
| `DockviewWorkspacePanel.tsx` | Center workspace. Hosts tabbed panels (Canvas, Viewer, Workflow, Launchpad) |
| `DockviewGalleryPanel.tsx` | Right dock gallery panel. Wraps existing GalleryDock content |
| `DockviewBoardsPanel.tsx` | Right dock boards panel. Wraps existing BoardsDock content |
| `DockviewLayersPanel.tsx` | Right dock layers panel. Canvas tab only. Wraps LayerPanel content |
| `layoutPresets.ts` | Layout configuration definitions per tab (panel IDs, sizes, splits, default active) |

### Modified components (minor prop/type changes)

| Component | Change |
|-----------|--------|
| `App.tsx` | Wire `DockviewLayout` instead of `WorkspaceLayout` |
| `GeneratePanel.tsx` | Accept sub-mode from parent context |
| `QuickGeneratePanel.tsx` | May merge into GeneratePanel as a sub-mode |
| `BatchPanel.tsx` | May merge into GeneratePanel as a sub-mode |
| `StoryboardPanel.tsx` | Accept sub-mode for Storyboard/Templates switching |
| `TemplatesPanel.tsx` | May merge into StoryboardPanel as a sub-mode |
| `WorkflowWorkbench.tsx` | Minor prop changes for Dockview panel context |

### Removed components (replaced by Dockview)

| Component | Replaced by |
|-----------|-------------|
| `WorkspaceLayout.tsx` | `DockviewLayout.tsx` |
| `Sidebar.tsx` | `NavBar.tsx` |
| `WorkbenchShell.tsx` | Dockview layout panels |
| `WorkbenchRightStack.tsx` | Dockview right dock (Gallery + Boards/Layers as stacked panels) |
| `WorkbenchBoardsDock.tsx` | Content extracted into `DockviewBoardsPanel.tsx` |
| `WorkbenchGalleryDock.tsx` | Content extracted into `DockviewGalleryPanel.tsx` |
| `WorkbenchViewer.tsx` | Content becomes a center workspace tab panel |
| `WorkbenchChromeCarbon.test.tsx` | Replaced by Dockview layout tests |

### Preserved components (no changes)

- All UI primitives (Button, Slider, Switch, Tooltip, ConfirmDialog, etc.)
- EditCanvas, LayerPanel, EditPropertiesPanel, ToolStrip, ColorPicker, FilterGrid, AIToolsPanel
- WorkflowGraphEditor, WorkflowWorkbench
- All Zustand store slices and actions (beyond navigation)
- All type definitions
- All 504 existing tests (content tests pass unchanged)

---

## 3. Tab Layout Definitions

### Generate tab

```
┌──────┬──────────────────────────────────┬─────────────────┐
│ LEFT │           CENTER                 │     RIGHT       │
│      │                                  │                 │
│ [Generate | Quick | Batch]  ◄─segmented │  Canvas │Viewer │  ┌─ Gallery ──────┐ │
│ ┌────────────────────┐     │Workflow│   │  │                 │ │
│ │ Prompt Area         │     │Launchpad│  │  │                 │ │
│ │ Model Selector       │     └───────┘   │  │                 │ │
│ │ ControlNet           │                  │  ├─ Boards ──────┤ │
│ │ LoRA Mixer           │                  │  │                 │ │
│ │ Style Presets        │                  │  │                 │ │
│ │ Prompt History        │                  │  │                 │ │
│ └────────────────────┘                  │  └─────────────────┘ │
│  min: 380px              resizable       │   min: 280px          │
└──────┴──────────────────────────────────┴─────────────────┘
```

- Left dock: SettingsPanel with segmented control (Generate/Quick/Batch). Content switches per sub-mode.
- Center: Dockview with Canvas, Viewer, Workflow, Launchpad tabs. Launchpad shows generation progress/queue.
- Right: Gridview with Gallery (top) and Boards (bottom), resizable vertical split.

### Canvas tab

```
┌──────┬──────────────────────────────────┬─────────────────┐
│ LEFT │           CENTER                 │     RIGHT       │
│      │                                  │                 │
│ ┌────────────────────┐                  │  ┌─ Layers ─────┐ │
│ │ Tool Strip           │                  │  │               │ │
│ │ Edit Properties      │   Edit Canvas   │  ├─ Gallery ────┤ │
│ │ Color Picker         │                  │  │               │ │
│ │ Filter Grid          │                  │  │               │ │
│ │ AI Tools             │                  │  │               │ │
│ └────────────────────┘                  │  └───────────────┘ │
│  min: 340px                              │   min: 280px       │
└──────┴──────────────────────────────────┴─────────────────┘
```

- Left dock: ToolStrip + EditPropertiesPanel (no sub-mode switching).
- Center: EditCanvas fills the workspace.
- Right: Gridview with Layers (top) and Gallery (bottom).

### Story tab

```
┌──────┬──────────────────────────────────┬─────────────────┐
│ LEFT │           CENTER                 │     RIGHT       │
│      │                                  │                 │
│ [Storyboard | Templates]  ◄─segmented  │  ┌─ Boards ─────┐ │
│ ┌────────────────────┐                  │  │               │ │
│ │ Scene controls       │  Storyboard     │  │               │ │
│ │ Frame settings       │  canvas │       │  ├─ Gallery ────┤ │
│ │ Context metadata     │  Template       │  │               │ │
│ └────────────────────┘  browser          │  │               │ │
│  min: 340px                              │  └───────────────┘ │
└──────┴──────────────────────────────────┴─────────────────┘
```

- Left dock: SettingsPanel with segmented control (Storyboard/Templates).
- Center: Storyboard canvas or Template browser based on sub-mode.
- Right: Gridview with Boards (top) and Gallery (bottom).

### Workflows tab

```
┌──────┬──────────────────────────────────┬─────────────────┐
│ LEFT │           CENTER                 │     RIGHT       │
│      │                                  │                 │
│ ┌────────────────────┐                  │  ┌─ Gallery ────┐ │
│ │ Node Inspector       │                  │  │               │ │
│ │ Workflow Settings     │  Graph Editor   │  │               │ │
│ │ Export Panel          │                  │  ├─ Boards ─────┤ │
│ └────────────────────┘                  │  │               │ │
│  min: 340px                              │  └───────────────┘ │
└──────┴──────────────────────────────────┴─────────────────┘
```

- Left dock: Node inspector + workflow settings + export panel.
- Center: Workflow graph editor (existing WorkflowWorkbench).
- Right: Gallery + Boards.

### Assets tab (full-width, no side docks)

```
┌──────┬──────────────────────────────────────────────────────┐
│ NAV  │              Assets Grid                              │
│ BAR  │                                                       │
│      │   Virtual scrolling grid with filters & search       │
│      │                                                       │
│      │                                                       │
└──────┴──────────────────────────────────────────────────────┘
```

- No side docks. Full-width asset grid with search/filter bar.

### Settings tab (full-width, no side docks)

```
┌──────┬──────────────────────────────────────────────────────┐
│ NAV  │              Settings Panels                          │
│ BAR  │                                                       │
│      │   General | Models | Backend | Shortcuts | About     │
│      │                                                       │
│      │                                                       │
└──────┴──────────────────────────────────────────────────────┘
```

- No side docks. Full-width settings with internal tab navigation.

### NavBar structure (all tabs)

```
┌──────┐
│ Logo │
│      │
│ Gen  │  ◄─ Wand icon (Wand2 from lucide)
│ Can  │  ◄─ Palette icon
│ Sto  │  ◄─ Clapperboard icon
│ Wrk  │  ◄─ Flow icon (GitBranch from lucide)
│      │
│ ──── │  ◄─ Divider
│      │
│ Ast  │  ◄─ Folder icon
│ Set  │  ◄─ Settings icon
│      │
│ GPU  │  ◄─ Status indicator
│ User │  ◄─ User menu
└──────┘
  ~56px wide, icon-only, tooltips on hover
```

Top cluster: Generate, Canvas, Story, Workflows
Bottom cluster: Assets, Settings
Separator between clusters

---

## 4. Data Flow & Store Changes

### Current store navigation model

```ts
activePanel: 'generate' | 'quick' | 'batch' | 'edit' | 'storyboard' | 'templates' | 'assets' | 'settings'
activeWorkbenchView: 'canvas' | 'viewer' | 'workflow'
sidebarCollapsed: boolean
```

### New store navigation model

```ts
activeTab: 'generate' | 'canvas' | 'story' | 'workflows' | 'assets' | 'settings'
activeSubMode: 'generate' | 'quick' | 'batch'    // Generate tab
             | 'storyboard' | 'templates'         // Story tab
             | null                                 // Tabs without sub-modes
centerView: 'canvas' | 'viewer' | 'workflow' | 'launchpad'  // Center workspace tab
// sidebarCollapsed removed — NavBar is always narrow
```

### Store action changes

| Action | Current | New |
|--------|---------|-----|
| Navigate | `setActivePanel('generate')` | `setActiveTab('generate')` + `setActiveSubMode('generate')` |
| Switch sub-mode | N/A (separate panels) | `setActiveSubMode('quick')` — stays on same tab |
| Switch center view | `setActiveWorkbenchView('workflow')` | `setCenterView('workflow')` — same concept, new name |
| Toggle sidebar | `toggleSidebar()` | **Removed** — NavBar is fixed width |

### Dockview state persistence

- Dockview exposes `api.toJSON()` / `api.fromJSON()` for layout serialization
- Store a `dockviewLayout` slice in Zustand (persisted via middleware)
- Save layout state on panel resize, tab reorder, dock expand/collapse
- Restore layout on app startup; fall back to default preset if corruption detected

### Data flow for tab switch

```
NavBar icon click
  → setActiveTab('canvas')
  → DockviewLayout reads activeTab from store
  → DockviewLayout loads canvas layout preset via api.fromJSON()
  → Dockview renders: left=CanvasSettings, center=EditCanvas, right=Layers+Gallery
  → Sub-modes default to their first option
```

### Data flow for sub-mode switch

```
Segmented control click in left dock
  → setActiveSubMode('batch')
  → DockviewSettingsPanel reads activeSubMode from store
  → Settings panel content swaps to BatchPanel
  → Center and right docks unchanged
```

### What stays the same

- All domain slices (generation, assets, batch, workflow, etc.) — untouched
- All actions beyond navigation — untouched
- All selectors — untouched
- All 504 existing tests — passing unchanged

---

## 5. Error Handling & Testing

### Error handling

| Scenario | Handling |
|----------|----------|
| Dockview layout JSON corruption | Catch parse error, clear persisted layout, fall back to default preset for the active tab |
| Panel component crash | React ErrorBoundary per Dockview panel. Failed panel shows recoverable error state with "Retry" button. Other panels remain functional |
| Missing panel content (e.g., no workflow graph yet) | Panel renders empty state with call-to-action (e.g., "Create a workflow to get started") |
| Sub-mode switch with unsaved changes | Check dirty state before switching. If dirty, show ConfirmDialog. After confirm, switch sub-mode |
| Tab switch with generation in progress | Generation continues in background. Queue status persists across tab switches. Progress indicator in NavBar badge on Generate icon |

### Testing strategy

| Layer | Tests | Count target |
|-------|-------|-------------|
| NavBar | Navigation clicks, active state, tooltips, bottom cluster rendering, GPU status | ~12 tests |
| DockviewLayout | Tab preset loading, panel registration, layout persistence (toJSON/fromJSON), fallback on corruption | ~15 tests |
| DockviewSettingsPanel | Sub-mode segmented control, content switching per tab/sub-mode | ~8 tests |
| layoutPresets | Each tab produces correct panel structure, sizes, default active view | ~6 tests |
| Store navigation | `setActiveTab`, `setActiveSubMode`, `setCenterView`, persistence, fallback defaults | ~15 tests |
| Integration | Full tab switch flow, sub-mode switch, panel resize persistence, error recovery | ~10 tests |
| Existing tests | All 504 continue passing — content components unchanged | 504 unchanged |

**Total new tests: ~66. Existing tests: 504, all preserved.**

### Migration path for existing layout tests

| Existing test | Replacement |
|---------------|-------------|
| `WorkspaceLayout.test.tsx` | `DockviewLayout.test.tsx` |
| `Sidebar.test.tsx` | `NavBar.test.tsx` |
| `WorkbenchShell.test.tsx` | DockviewLayout center workspace tests |
| `WorkbenchRightStack.test.tsx` | Right dock panel tests |
| `WorkbenchBoardsDock.test.tsx` | Content preserved, mounting changes to Dockview panel context |
| `WorkbenchGalleryDock.test.tsx` | Same as above |
| `WorkbenchChromeCarbon.test.tsx` | Replaced by Dockview layout tests |

---

## 6. Implementation Sequence

### Step 1: Install Dockview & Create Layout Foundation

- Install `@mathuo/dockview` and `@mathuo/dockview-core`
- Create `layoutPresets.ts` with all 6 tab layout definitions
- Create `DockviewLayout.tsx` — root component with Dockview instance, layout loading, error boundary
- Create `NavBar.tsx` — narrow icon-only sidebar with 6 tabs, top/bottom clusters
- Update `App.tsx` to mount `DockviewLayout` instead of `WorkspaceLayout`

### Step 2: Store Navigation Refactor

- Add `activeTab`, `activeSubMode`, `centerView` to Zustand store
- Add `setActiveTab`, `setActiveSubMode`, `setCenterView` actions
- Remove `activePanel`, `sidebarCollapsed`, `toggleSidebar`
- Add `dockviewLayout` persistence slice
- Update all navigation calls throughout the app

### Step 3: Panel Wrapper Components

- Create `DockviewSettingsPanel.tsx` — left dock with sub-mode segmented control
- Create `DockviewWorkspacePanel.tsx` — center workspace tab group
- Create `DockviewGalleryPanel.tsx` — right dock gallery
- Create `DockviewBoardsPanel.tsx` — right dock boards
- Create `DockviewLayersPanel.tsx` — right dock layers (Canvas tab)
- Each wrapper mounts existing content components with minimal prop adaptation

### Step 4: Wire Generate Tab End-to-End

- Build Generate tab preset: left=settings+sub-modes, center=canvas|viewer|workflow|launchpad, right=gallery+boards
- Validate all 3 sub-modes (Generate, Quick, Batch) switch correctly
- Validate panel resizing works
- Validate layout persistence (resize, tab reorder, reload)

### Step 5: Wire Remaining Tabs

- Canvas tab preset
- Story tab preset (with Storyboard/Templates sub-modes)
- Workflows tab preset
- Assets tab preset (full-width)
- Settings tab preset (full-width)

### Step 6: Remove Old Layout Components

- Delete `WorkspaceLayout.tsx`, `Sidebar.tsx`, `WorkbenchShell.tsx`, `WorkbenchRightStack.tsx`
- Delete `WorkbenchBoardsDock.tsx`, `WorkbenchGalleryDock.tsx`, `WorkbenchViewer.tsx`, `WorkbenchChromeCarbon.test.tsx`
- Update all imports throughout the app
- Clean up orphaned props in `App.tsx`

### Step 7: Tests & Polish

- Write all ~66 new tests
- Update any integration tests that reference old layout components
- Verify all 504 existing tests still pass
- Accessibility audit on NavBar (keyboard nav, ARIA, focus management)
- Panel resize UX polish (min/max constraints, snap behavior)
- Dark theme validation across all panels

### Risk mitigation

- Each step is independently testable and committable
- Content components are never modified — only their mounting context changes
- Store changes are additive first (new keys), then subtractive (remove old keys) in Step 6
- If Dockview has issues, we discover them in Step 1 before touching any content

---

## Future Phases (out of scope for Phase 1)

| Phase | Scope |
|-------|-------|
| **2** | Prompt Studio + Live Preview |
| **3** | Iteration History + Smart Collections |
| **4** | Enhanced Timeline (keyframes, scrubbing, playback, onion-skinning) |
| **5** | Refinement Pipeline (one-click image enhancement chains) |