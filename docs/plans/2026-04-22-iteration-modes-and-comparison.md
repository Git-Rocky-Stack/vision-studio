# Iteration Modes And Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make iteration mode selection change the real mounted UI and fully wire compare selection plus `ComparisonPanel` into the shipped workbench.

**Architecture:** Keep the existing Dockview shell and add one iteration workspace host that renders the correct surface for `panel`, `timeline`, and `overlay`. Store compare state as an explicit ordered pair in `iterationSlice`, keep normal selection separate from compare selection, and route detail versus comparison UI through the new host instead of scattering compare logic across the shell.

**Tech Stack:** React, TypeScript, Zustand, Vitest, React Testing Library, Electron renderer shell

---

### Task 1: Comparison Store Actions

**Files:**
- Modify: `src/store/appStore.types.ts`
- Modify: `src/store/slices/iterationSlice.ts`
- Test: `src/store/appStore.test.ts`

**Step 1: Write the failing tests**

Add iteration-store tests for:

```ts
it('toggles comparison ids as an ordered pair', () => {
  seedIterationTree();
  useAppStore.getState().toggleIterationComparison('iter-1');
  expect(useAppStore.getState().comparisonIds).toEqual(['iter-1']);

  useAppStore.getState().toggleIterationComparison('iter-2');
  expect(useAppStore.getState().comparisonIds).toEqual(['iter-1', 'iter-2']);

  useAppStore.getState().toggleIterationComparison('iter-1');
  expect(useAppStore.getState().comparisonIds).toEqual(['iter-2']);
});

it('replaces the oldest comparison id when a third node is compared', () => {
  seedIterationTree();
  const state = useAppStore.getState();
  state.toggleIterationComparison('iter-1');
  state.toggleIterationComparison('iter-2');
  state.toggleIterationComparison('iter-3');
  expect(useAppStore.getState().comparisonIds).toEqual(['iter-2', 'iter-3']);
});

it('swaps and clears comparison ids', () => {
  seedIterationTree();
  const state = useAppStore.getState();
  state.toggleIterationComparison('iter-1');
  state.toggleIterationComparison('iter-2');
  state.swapIterationComparison();
  expect(useAppStore.getState().comparisonIds).toEqual(['iter-2', 'iter-1']);
  state.clearIterationComparison();
  expect(useAppStore.getState().comparisonIds).toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/store/appStore.test.ts`

Expected: FAIL with missing comparison action types or missing behavior around `comparisonIds`.

**Step 3: Write minimal implementation**

Add action types:

```ts
toggleIterationComparison: (id: string) => void;
swapIterationComparison: () => void;
clearIterationComparison: () => void;
```

Implement a small helper inside `iterationSlice.ts`:

```ts
function nextComparisonIds(
  current: [string, string] | [string] | null,
  id: string
): [string, string] | [string] | null {
  if (!current) return [id];
  if (current.includes(id)) {
    const remaining = current.filter((entry) => entry !== id);
    return remaining.length === 0 ? null : (remaining as [string]);
  }
  if (current.length === 1) return [current[0], id];
  return [current[1], id];
}
```

Add `swapIterationComparison` and `clearIterationComparison`, and make branch-deletion paths prune stale compare IDs.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/store/appStore.test.ts`

Expected: PASS for the new iteration comparison tests.

**Step 5: Commit**

```bash
git add src/store/appStore.types.ts src/store/slices/iterationSlice.ts src/store/appStore.test.ts
git commit -m "feat(iteration): add comparison state actions"
```

### Task 2: Iteration Workspace Host

**Files:**
- Create: `src/components/iteration/IterationWorkspacePanel.tsx`
- Test: `src/components/iteration/IterationWorkspacePanel.test.tsx`
- Modify: `src/components/layout/DockviewLayout.tsx`

**Step 1: Write the failing test**

Create renderer tests that prove the host switches surfaces:

```tsx
it('renders tree mode by default', () => {
  useAppStore.getState().setIterationView('panel');
  render(<IterationWorkspacePanel />);
  expect(screen.getByText('History')).toBeInTheDocument();
});

it('renders timeline mode when selected', () => {
  useAppStore.getState().setIterationView('timeline');
  render(<IterationWorkspacePanel />);
  expect(screen.getByLabelText('Expanded iteration timeline')).toBeInTheDocument();
});

it('renders overlay companion mode when selected', () => {
  useAppStore.getState().setIterationView('overlay');
  render(<IterationWorkspacePanel />);
  expect(screen.getByText('Canvas overlay')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/iteration/IterationWorkspacePanel.test.tsx src/components/layout/DockviewLayout.test.tsx`

Expected: FAIL because `IterationWorkspacePanel` does not exist and `DockviewLayout` still mounts `IterationTreePanel` directly.

**Step 3: Write minimal implementation**

Create a host component shaped like:

```tsx
export function IterationWorkspacePanel() {
  const iterationView = useAppStore((s) => s.iterationView);

  if (iterationView === 'timeline') return <IterationTimelinePanel />;
  if (iterationView === 'overlay') return <IterationOverlayPanel />;
  return <IterationTreePanel />;
}
```

Update `DockviewLayout.tsx` so the right-dock history slot mounts `IterationWorkspacePanel` instead of hardwiring `IterationTreePanel`.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/iteration/IterationWorkspacePanel.test.tsx src/components/layout/DockviewLayout.test.tsx`

Expected: PASS with the right dock switching hosts by `iterationView`.

**Step 5: Commit**

```bash
git add src/components/iteration/IterationWorkspacePanel.tsx src/components/iteration/IterationWorkspacePanel.test.tsx src/components/layout/DockviewLayout.tsx
git commit -m "feat(iteration): add iteration workspace host"
```

### Task 3: Timeline Mode And Duplicate-Strip Suppression

**Files:**
- Create: `src/components/iteration/IterationTimelinePanel.tsx`
- Test: `src/components/iteration/IterationTimelinePanel.test.tsx`
- Modify: `src/components/layout/DockviewSettingsPanel.tsx`
- Modify: `src/components/iteration/IterationTimeline.tsx`

**Step 1: Write the failing tests**

Add tests that prove:

- `timeline` mode renders an expanded timeline host plus companion region
- the compact footer timeline in `DockviewSettingsPanel` disappears while `timeline` mode is active

```tsx
it('hides the footer strip when iteration timeline mode is active', () => {
  seedIterationTree();
  useAppStore.getState().setIterationView('timeline');
  render(<DockviewSettingsPanel />);
  expect(screen.queryByTestId('iteration-timeline-summary')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/iteration/IterationTimelinePanel.test.tsx src/components/layout/DockviewLayout.test.tsx`

Expected: FAIL because there is no expanded timeline host and the footer strip still renders.

**Step 3: Write minimal implementation**

Create an expanded panel with:

- `IterationTimeline` on top
- `IterationNodeDetail` below when compare is inactive
- `ComparisonPanel` below when two compare IDs exist

Gate the footer strip in `DockviewSettingsPanel.tsx`:

```tsx
const showFooterTimeline =
  (activeTab === 'generate' || activeTab === 'canvas') &&
  iterationBranches.length > 0 &&
  iterationView !== 'timeline';
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/iteration/IterationTimelinePanel.test.tsx src/components/layout/DockviewLayout.test.tsx`

Expected: PASS with a single visible timeline surface in timeline mode.

**Step 5: Commit**

```bash
git add src/components/iteration/IterationTimelinePanel.tsx src/components/iteration/IterationTimelinePanel.test.tsx src/components/layout/DockviewSettingsPanel.tsx src/components/iteration/IterationTimeline.tsx
git commit -m "feat(iteration): add expanded timeline mode"
```

### Task 4: Compare Entry Points And Visual State

**Files:**
- Modify: `src/components/iteration/IterationTreePanel.tsx`
- Modify: `src/components/iteration/IterationNode.tsx`
- Modify: `src/components/iteration/IterationNodeDetail.tsx`
- Modify: `src/components/iteration/IterationTimeline.tsx`
- Test: `src/components/iteration/IterationTreePanel.test.tsx`
- Test: `src/components/iteration/IterationTimeline.test.tsx`

**Step 1: Write the failing tests**

Add interaction tests that prove compare is explicit and visible:

```tsx
it('adds the active node to comparison from node detail', async () => {
  seedIterationTree();
  render(<IterationTreePanel />);
  await user.click(screen.getByRole('button', { name: 'Compare' }));
  expect(useAppStore.getState().comparisonIds).toEqual(['iter-1']);
});

it('shows compared timeline items as selected for compare', () => {
  seedIterationTree();
  useAppStore.getState().toggleIterationComparison('iter-1');
  render(<IterationTimeline />);
  expect(screen.getByTestId('iteration-timeline-node-iter-1')).toHaveAttribute('data-compare-selected', 'true');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/iteration/IterationTreePanel.test.tsx src/components/iteration/IterationTimeline.test.tsx`

Expected: FAIL because compare actions and compare visual state do not exist yet.

**Step 3: Write minimal implementation**

Add a compare button to node detail:

```tsx
<button type="button" onClick={() => toggleIterationComparison(node.id)}>
  {isCompared ? 'Compared' : 'Compare'}
</button>
```

Expose compare affordances in tree and timeline rows without making plain selection mutate `comparisonIds`. Add a lightweight visual marker for compared IDs.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/iteration/IterationTreePanel.test.tsx src/components/iteration/IterationTimeline.test.tsx`

Expected: PASS with explicit compare entry points in tree, detail, and timeline surfaces.

**Step 5: Commit**

```bash
git add src/components/iteration/IterationTreePanel.tsx src/components/iteration/IterationNode.tsx src/components/iteration/IterationNodeDetail.tsx src/components/iteration/IterationTimeline.tsx src/components/iteration/IterationTreePanel.test.tsx src/components/iteration/IterationTimeline.test.tsx
git commit -m "feat(iteration): add compare actions to iteration surfaces"
```

### Task 5: Comparison Panel And Overlay Mode

**Files:**
- Modify: `src/components/iteration/ComparisonPanel.tsx`
- Modify: `src/components/iteration/ComparisonPanel.test.tsx`
- Modify: `src/components/layout/Canvas.tsx`
- Modify: `src/components/layout/DockviewLayout.tsx`
- Modify: `src/components/iteration/IterationCanvasOverlay.tsx`

**Step 1: Write the failing tests**

Add tests that prove:

- `ComparisonPanel` renders `Swap` and `Clear`
- cross-branch compare surfaces a badge
- choosing `overlay` while not on Canvas promotes the center view to `canvas`

```tsx
it('clears comparison ids from the compare panel header', async () => {
  seedCrossBranchComparison();
  render(<ComparisonPanel leftId="iter-1" rightId="iter-3" />);
  await user.click(screen.getByRole('button', { name: 'Clear Compare' }));
  expect(useAppStore.getState().comparisonIds).toBeNull();
});

it('promotes canvas when overlay mode is selected from viewer', () => {
  useAppStore.getState().setCenterView('viewer');
  useAppStore.getState().setIterationView('overlay');
  render(<DockviewLayout />);
  expect(useAppStore.getState().centerView).toBe('canvas');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/iteration/ComparisonPanel.test.tsx src/components/layout/DockviewLayout.test.tsx`

Expected: FAIL because compare actions and overlay promotion are not wired.

**Step 3: Write minimal implementation**

Update `ComparisonPanel` header to include:

```tsx
<button type="button" onClick={swapIterationComparison}>Swap</button>
<button type="button" onClick={clearIterationComparison}>Clear Compare</button>
```

Add cross-branch labeling when the compared nodes have different `branchId` values.

Mount `IterationCanvasOverlay` only in overlay mode and promote the center surface to canvas when needed.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/iteration/ComparisonPanel.test.tsx src/components/layout/DockviewLayout.test.tsx`

Expected: PASS with compare header actions, cross-branch labeling, and real overlay routing.

**Step 5: Commit**

```bash
git add src/components/iteration/ComparisonPanel.tsx src/components/iteration/ComparisonPanel.test.tsx src/components/layout/Canvas.tsx src/components/layout/DockviewLayout.tsx src/components/iteration/IterationCanvasOverlay.tsx
git commit -m "feat(iteration): wire comparison panel and overlay mode"
```

### Task 6: Runtime Validation And Cleanup

**Files:**
- Modify: `docs/plans/2026-04-22-iteration-modes-and-comparison.md`
- Modify: `docs/plans/2026-04-22-iteration-modes-and-comparison-design.md`

**Step 1: Run focused automated verification**

Run:

```bash
npm run test -- src/store/appStore.test.ts src/components/iteration/IterationTreePanel.test.tsx src/components/iteration/IterationTimeline.test.tsx src/components/iteration/ComparisonPanel.test.tsx src/components/layout/DockviewLayout.test.tsx
npm run typecheck
```

Expected: PASS.

**Step 2: Run runtime smoke checks**

Run:

```bash
npx playwright test tests/e2e/workbench-responsive.spec.ts
```

Then launch the packaged or local shell and verify manually:

- `panel` mode shows the tree plus detail
- `timeline` mode shows one expanded timeline surface and no duplicate footer strip
- `overlay` mode promotes canvas and shows the overlay layer
- compare across branches opens `ComparisonPanel`
- `Swap` and `Clear` behave correctly

**Step 3: Update the plan docs with outcome notes if execution spans multiple commits**

Add a short completion note or a milestone doc in `docs/plans/` if validation revealed follow-up work.

**Step 4: Commit**

```bash
git add docs/plans/2026-04-22-iteration-modes-and-comparison.md docs/plans/2026-04-22-iteration-modes-and-comparison-design.md
git commit -m "docs(iteration): record validation follow-up"
```

### References

- `docs/plans/2026-04-18-iteration-history-smart-collections.md`
- `docs/superpowers/specs/2026-04-18-iteration-history-smart-collections-design.md`
- `docs/plans/2026-04-22-ui-polish-rollout-design.md`
- `docs/plans/2026-04-22-ui-polish-rollout-milestone-4.md`
