# Invoke-Benchmark Product Roadmap

Date: 2026-04-16

## Purpose

This roadmap reframes the active project plans around the Invoke benchmark.
Existing Carbon Pro work remains valid, but the next product push is now a
layout and workflow-capability pivot rather than incremental polish.

## Benchmark Summary

Invoke's documented strengths:

- Persistent three-zone UI: settings, work/viewing area, and boards/gallery/layers.
- Working-area mini-tabs for Launchpad, Image Viewer, Canvas, and Workflow.
- A node Workflow Editor for advanced control.
- Form Builder and Linear UI to expose complex workflows as simpler user-facing
  controls.
- Right-side layers/gallery affordances tied closely to the canvas.

Vision Studio should match that baseline and exceed it through desktop-native
project continuity, local execution, region-locked editing, timeline/storyboard
state, and model/runtime routing.

## Current Plan Reconciliation

### Keep

- Carbon Pro visual system and token migration.
- Header/sidebar stabilization already committed.
- Secondary panel Carbon Pro pass already committed.
- P2/P3 feature work as backend/frontend capability backlog.
- Storyboard surgical AI direction.

### Reframe

- UI polish should now happen inside the workbench shell, not as isolated panel
  restyles.
- Feature-completion work should map into workbench zones: Settings, Canvas,
  Viewer, Inspector, Layers, Gallery, Timeline, Workflow.
- Workflow planning should begin now, but implementation should start with shell
  architecture and placeholders before node behavior.

### Defer

- Broad one-off restyling of every remaining old-red component.
- Node workflow editor implementation.
- Full right-dock gallery redesign.
- New provider/cloud runtime integration.

## Enhancement Phases

### Phase 1: Workbench Layout Refactor

Goal: Establish the stable shell.

Deliverables:

- Working-area mini-tabs: Canvas, Viewer, Workflow.
- Workflow placeholder.
- Optional mode tool rail.
- Right context dock abstraction.
- Edit and Generate mapped into the new shell.
- Layout regression tests.

### Phase 2: Context Dock Upgrade

Goal: Make the right side better than Invoke's panel stack.

Deliverables:

- Right dock tabs: Settings, Inspector, Layers, Gallery.
- Per-mode default tab rules.
- Persistent dock state.
- Layers promoted from bottom of edit inspector into its own dock tab.
- Gallery tab backed by current asset/result state.

### Phase 3: Viewer And Variants

Goal: Make generated outputs easy to review, compare, and branch.

Deliverables:

- Viewer connected to recent outputs.
- Compare controls integrated into Viewer.
- Variant pinning and branch actions.
- Metadata strip for prompt/model/seed/runtime.
- Promote-to-asset, promote-to-scene, and send-to-edit affordances.

### Phase 4: Workflow Foundation

Goal: Build the non-node workflow substrate.

Deliverables:

- Workflow records in state.
- Workflow metadata: name, description, tags, notes.
- Linear UI schema for exposed fields.
- Workflow run history.
- Placeholder replaced with workflow library/empty state.

### Phase 5: Node Canvas

Goal: Add advanced workflow editing.

Deliverables:

- Node graph canvas.
- Color-coded ports and connection validation.
- Node copy/paste/delete/multi-select basics.
- Form/linear UI field exposure.
- Workflow save/load.

### Phase 6: Outdo Invoke

Goal: Win through capabilities Invoke does not fully solve.

Deliverables:

- Region-locked generation and edit flows.
- Timeline/storyboard-to-video continuity.
- Model Router for local, ComfyUI, BYOM, and future cloud routing.
- Hybrid local/cloud run policy.
- Brand and character consistency workflows.

## Product Bets

### Bet 1: Workbench Over Pages

The user should not feel like they are moving between unrelated panels. They
should feel like the same project remains in front of them while tools and
context adapt.

### Bet 2: Linear UI Before Node Complexity

Expose high-value workflows through simple controls first. Add node editing only
after the product can store, run, and explain workflows cleanly.

### Bet 3: Continuity Beats One-Off Generation

Generated images should become assets, variants, scene frames, timeline clips,
and workflow inputs without losing provenance.

### Bet 4: Local Desktop Is A Feature

Local GPU execution, filesystem access, project state, and desktop performance
should be visible advantages, not hidden implementation details.

## Near-Term Commit Sequence

1. Commit pivot design and roadmap docs.
2. Commit first workbench layout implementation plan.
3. Implement workbench shell behind existing behavior.
4. Add Viewer/Workflow mini-tabs and placeholder.
5. Move right-side context into a tabbed dock.
6. Run browser screenshots against Generate and Edit.
7. Commit and push the layout refactor.
