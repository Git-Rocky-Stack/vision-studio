# Invoke-Benchmark Workbench Pivot Design

Date: 2026-04-16

## Status

Approved product pivot for the next design phase. This extends the Carbon Pro
visual direction and changes the next priority from surface polish to a
workbench layout refactor.

## Benchmark Sources

- Invoke user interface overview: https://support.invoke.ai/support/solutions/articles/151000170670-user-interface-overview
- Invoke workflow editor: https://support.invoke.ai/support/solutions/articles/151000159646-workflow-editor

Invoke's documented UI model is built around three persistent areas: a settings
panel, a working/viewing area, and a boards/gallery/layers panel. Its working
area can move between Launchpad, Image Viewer, Canvas, and Workflow views using
mini-tabs. Its workflow editor is a node canvas whose complexity can be exposed
through a simpler Linear UI.

Vision Studio should use that as the credibility benchmark, then outdo it in
the places where the current market still has gaps: unified desktop workflows,
local-first execution, surgical editing, project continuity, timeline/storyboard
state, and model/runtime routing.

## North Star

Vision Studio becomes a desktop creative workbench for image, edit, workflow,
storyboard, and video production.

It should feel less like mode-specific pages and more like one stable production
room where the user's work remains centered while the surrounding controls adapt
to the task.

## Strategic Pivot

The immediate priority is no longer another narrow polish pass. The next phase
is a layout architecture pass that makes the shell capable of supporting:

- Canvas-first image generation and editing.
- A persistent viewer for generated outputs and comparisons.
- A visible workflow placeholder that establishes the product direction.
- A future workflow editor without another shell rewrite.
- Right-side context that can switch between inspector, layers, gallery, and
  workflow details.
- Bottom continuity surfaces for timeline, queue, variants, and storyboard.

## Product Principles

### Stable Spatial Memory

Users should always know where work lives, where settings live, where assets
live, and where timeline/output state lives. The workbench should preserve the
same spatial map across Generate, Edit, Storyboard, Batch, Assets, and future
Workflow modes.

### Complexity Behind A Simpler Surface

Invoke exposes node workflows through Form Builder and Linear UI. Vision Studio
should adopt the same principle without copying the exact implementation:
advanced workflows can exist behind the scenes, but everyday users get a clean
linear control surface when that is enough.

### Outdo Invoke Through Continuity

Invoke is strong at canvas and layers. Vision Studio should compete there, then
go further with continuity across assets, scenes, variants, timeline clips,
runtime metadata, and model routing.

### Desktop-Native Production Feel

The app should feel like installed creative software. Use compact chrome,
stable docking, fast switching, precise inspectors, and quiet but visible state.

### Workflow Placeholder Now, Node Editor Later

The first layout refactor should show a Workflow mini-tab so the product
direction is explicit. It should be honest about readiness: a polished
placeholder, not a fake node editor.

## Layout Model

### App Rail

The existing app navigation remains on the far left as the global mode rail:
Generate, Quick, Edit, Storyboard, Batch, Assets, Templates, Settings.

The rail should stay compact and calm. It is global navigation, not the place
for tool-specific controls.

### Workbench Tool Rail

Modes that need tools get a second rail next to the global rail. In the first
layout refactor, Edit owns this slot with the existing `ToolStrip`.

Future mode-specific rails can host:

- Canvas tools.
- Workflow node tools.
- Storyboard tools.
- Mask/region tools when they need persistent access.

### Working Area

The center owns the user's work. It contains a top-left mini-tab strip:

- `Canvas`: the active image/canvas workspace.
- `Viewer`: generated output viewer and comparison-oriented view.
- `Workflow`: visible placeholder in the first pass.

This mini-tab strip should live inside the working area, not in the global nav.
It communicates that these are alternate views of the current work context.

### Right Context Dock

The right side becomes a tabbed context dock instead of a different ad hoc panel
per mode.

Initial context tabs:

- `Settings`: generation or mode settings.
- `Inspector`: edit properties or selected-object properties.
- `Layers`: layer stack and layer actions.
- `Gallery`: assets/results relevant to the current project.

The first layout refactor can wire only the tabs backed by existing components.
Disabled or placeholder tabs should be visibly intentional, not broken.

### Bottom Continuity Strip

The bottom region remains the home for time and output continuity:

- Timeline in regular creation/edit/storyboard flows.
- Batch queue/results in batch flows.
- Future variant strip and workflow run history.

The layout refactor should not rebuild the timeline, but it must avoid making a
future timeline/variants pass harder.

## First Refactor Scope

### In Scope

- Evolve `WorkspaceLayout` or introduce `WorkbenchLayout` around stable zones.
- Add working-area mini-tabs for `Canvas`, `Viewer`, and `Workflow`.
- Show a professional Workflow placeholder.
- Move Edit mode into the new workbench model with tool rail, working area,
  right context dock, and bottom timeline.
- Normalize Generate and Quick around the same working area plus context dock.
- Keep Batch and Templates stable unless the shell abstraction needs light
  support for them.
- Add regression tests for layout zones and legacy red avoidance in new shell
  chrome.
- Keep existing feature behavior intact.

### Out Of Scope

- Building a node workflow editor.
- Implementing workflow serialization.
- Changing backend generation APIs.
- Replacing the model router or generation settings in the same batch.
- Rebuilding layers, gallery, timeline, or storyboard behavior.
- Adding cloud/provider integrations.

## Workflow Placeholder

The Workflow placeholder should be a serious product promise:

- Title: `Workflow`
- Message: `Node workflows are coming to this workbench.`
- Supporting text: `For now, keep building through Canvas and Viewer.`
- Optional status chips: `Planned`, `Linear UI`, `Node Canvas`

It should not be a marketing hero, empty decorative card, or apology screen.
It should read as a disabled professional workspace view.

## Design Language

Continue Carbon Pro rules:

- Red is status/destructive only.
- Accent tokens are used for selection, focus, and primary active shell states.
- Panel radii stay at 6-8px unless the component is inherently round.
- No decorative gradient blobs or AI-glow tropes.
- Canvas and work surfaces are not embedded inside decorative cards.
- Docked regions use hairline borders, calm contrast, and stable dimensions.

## Feature Phases

### Phase A: Workbench Shell

Build the stable shell: app rail, optional workbench tool rail, center working
area, mini-tabs, right context dock, and bottom continuity strip.

### Phase B: Viewer And Gallery

Make Viewer a true output review surface. Connect it to recent generations,
asset metadata, comparison modes, and project gallery state.

### Phase C: Inspector And Layers

Rework the right dock into a professional context system. Make Settings,
Inspector, Layers, and Gallery predictable across modes.

### Phase D: Workflow Foundation

Replace the placeholder with a first workflow foundation: saved workflow records,
linear UI schemas, workflow metadata, and a non-node workflow run surface.

### Phase E: Node Workflow Editor

Add the node canvas only after the shell, state model, and linear UI foundation
are stable. The node editor should be powerful but not the default mental model
for every user.

### Phase F: Outdo Invoke

Invest in the gaps: region-locked edits, timeline/storyboard continuity,
variant branching, local/cloud model routing, and workflow-to-video pipelines.

## Success Criteria

- Generate and Edit feel like configurations of the same workbench.
- The user can switch between Canvas, Viewer, and Workflow without losing the
  global layout.
- The Workflow placeholder establishes direction without overpromising
  implemented behavior.
- Right-side context becomes a docked system, not one-off panels.
- Existing generation/edit behavior remains intact.
- New shell chrome follows Carbon Pro and contains no old red-primary active
  treatment.
