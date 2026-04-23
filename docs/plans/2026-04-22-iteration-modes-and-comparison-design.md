# Iteration Modes And Comparison Design

## Goal

Turn the existing iteration selector into a real mounted-shell behavior in Vision Studio. The first product-depth slice should make `panel`, `timeline`, and `overlay` mode selections change the live UI, and it should wire `ComparisonPanel` into the shipped workbench instead of leaving comparison state half-connected.

## Chosen Approach

Use an existing-shell host swap.

Keep the current Dockview shell and make iteration mode drive what the iteration workspace renders. `panel` stays tree-first, `timeline` promotes an expanded timeline review surface, and `overlay` turns Canvas into the active visualization surface while the dock becomes the companion detail or compare pane.

This approach was chosen over a larger workspace takeover because it fixes the broken selector behavior with the least shell churn, preserves the current center-tab model, and fits the existing Dockview layout without reopening the whole navigation system.

## Alternatives Considered

### 1. Existing-shell host swap

- Smallest layout risk.
- Reuses the current right-dock history slot and current center-view routing.
- Recommended.

### 2. Center-workspace takeover

- Makes `timeline` and `overlay` more immersive.
- Touches the meaning of center tabs and adds more layout churn than this slice needs.

### 3. Floating compare workspace

- Fastest bolt-on option.
- Weakest fit for the current workbench and easiest to make feel detached from iteration browsing.

## Architecture And State Model

Persisted state:

- `iterationView`
- `iterationComparisonMode`

Ephemeral state:

- `comparisonIds`

`activeIterationId` remains the browse focus. `comparisonIds` becomes the ordered pair that drives compare mode. Normal selection should not mutate compare state.

Add explicit comparison actions to the iteration slice instead of letting components mutate `comparisonIds` directly:

- `toggleIterationComparison(id)`
- `swapIterationComparison()`
- `clearIterationComparison()`
- `pruneIterationComparison()` or equivalent internal sanitizing

Keep the layout branch logic thin by introducing one iteration host component, expected to live at `src/components/iteration/IterationWorkspacePanel.tsx`. That host should decide:

- which visualization surface is mounted for the current `iterationView`
- whether the companion region shows `IterationNodeDetail` or `ComparisonPanel`
- whether the compact footer timeline should be hidden because an expanded timeline surface is already active

## Interaction Model

Compare is explicit.

- Clicking a node only updates `activeIterationId`.
- Compare is entered through dedicated `Compare` actions on iteration surfaces.
- `comparisonIds` behaves as an ordered set of up to two IDs.
- Re-clicking a compared item removes it.
- Choosing a third item replaces the oldest compared slot.
- `ComparisonPanel` appears only when two valid compare IDs exist.

Comparison behavior:

- header actions: `Swap`, `Clear`
- compare across branches: allowed and visibly labeled
- selecting an item inside compare updates `activeIterationId`

## Mode Behavior

### Panel

- Right dock remains tree-first.
- Detail region shows `IterationNodeDetail` for one selected node.
- When two compare IDs exist, the detail region swaps to `ComparisonPanel`.

### Timeline

- Right dock becomes an expanded timeline-first review surface for the active branch.
- Detail region beneath the timeline shows `IterationNodeDetail` or `ComparisonPanel`.
- The compact footer timeline in `DockviewSettingsPanel` is suppressed in this mode to avoid duplicate timelines.

### Overlay

- Overlay mode is meaningful only on Canvas.
- If the user selects `overlay` while on Viewer or Workflow, the app promotes Canvas to the active center view.
- `IterationCanvasOverlay` mounts over the canvas surface and drives `activeIterationId`.
- The right dock becomes the companion detail or compare pane.
- Compare remains docked, not floating above the canvas.

## Ownership Boundaries

- `src/store/slices/iterationSlice.ts` owns compare-state actions and sanitizing.
- `src/store/appStore.types.ts` owns new action typing.
- `src/components/layout/DockviewLayout.tsx` owns shell routing and overlay promotion to Canvas.
- `src/components/layout/DockviewSettingsPanel.tsx` owns duplicate-timeline suppression.
- `src/components/iteration/IterationWorkspacePanel.tsx` owns iteration mode rendering and detail-versus-compare switching.
- `src/components/iteration/IterationTreePanel.tsx` owns tree browsing and tree-level compare affordances.
- `src/components/iteration/IterationTimeline.tsx` owns expanded timeline browsing affordances and compare entry from the strip.
- `src/components/iteration/IterationNodeDetail.tsx` owns selected-node actions and compare toggles.
- `src/components/iteration/ComparisonPanel.tsx` owns compare-specific controls and cross-branch labeling.
- `src/components/layout/Canvas.tsx` owns conditional overlay mounting when `iterationView === 'overlay'`.

## Failure Handling

- Invalid compare IDs self-heal. Missing nodes are pruned automatically.
- Duplicate compare IDs collapse to a single slot.
- If compare drops below two valid IDs, the UI falls back to the normal detail surface.
- If overlay mode is selected away from Canvas, the center view switches to Canvas rather than rendering an empty overlay state.
- Cross-branch compare is allowed and labeled instead of rejected.

## Verification Rules

This slice should ship with:

- store tests for compare ordering, replacement, swap, clear, and stale-ID cleanup
- component tests for actual `panel`, `timeline`, and `overlay` rendering decisions
- component tests for compare actions in tree, timeline, and detail surfaces
- component tests for `ComparisonPanel` swap, clear, and cross-branch badges
- runtime browser and packaged-Electron smokes using a seeded multi-branch iteration tree

## Out Of Scope

- no new docking framework
- no redesign of the center tab model
- no new generation backend behavior
- no visual diff engine beyond the existing compare modes
- no workflow or prompt-history expansion in this slice
