# Invoke-Exact Layout Template Design

Date: 2026-04-17

## Status

Approved direction for the next workbench layout pass.

The goal is to make Vision Studio follow InvokeAI's spatial layout template
closely while preserving Vision Studio's Carbon Pro visual language and product
continuity across Viewer, Canvas, Storyboard, and Workflow.

## Sources

- InvokeAI repository: https://github.com/invoke-ai/InvokeAI
- Invoke user interface overview: https://support.invoke.ai/support/solutions/articles/151000170670-user-interface-overview
- Invoke workflow editor: https://support.invoke.ai/support/solutions/articles/151000159646-workflow-editor
- Invoke frontend workflow design: https://invoke-ai.github.io/InvokeAI/contributing/frontend/workflows/
- Invoke Generate layout source: https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/frontend/web/src/features/ui/layouts/generate-tab-auto-layout.tsx
- Invoke Canvas layout source: https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/frontend/web/src/features/ui/layouts/canvas-tab-auto-layout.tsx
- Invoke vertical nav source: https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/frontend/web/src/features/ui/components/VerticalNavBar.tsx
- Invoke UI library theme: https://github.com/invoke-ai/ui-library/blob/v0.0.48/lib/theme/theme.ts

## Benchmark Summary

InvokeAI's documented UI is built around three persistent work areas:

- a Settings / Invoke panel on the left
- a central Working / Viewing area
- a Boards, Gallery, and Layers panel on the right

Its actual frontend source reinforces that pattern. The global app rail is
separate from the workbench. Each core mode mounts a docked layout with a left
settings panel, a center dockview area, and a right panel stack. The center area
uses mini-tabs for Launchpad, Canvas or Workflow, and Image Viewer. Canvas adds
Layers to the right stack.

## Vision Studio Translation

Vision Studio should copy the spatial grammar, not the brand palette.

The current app already has a global rail, center mini-tabs, Viewer, Workflow
placeholder, and right context dock. The mismatch is that Generate and Quick
settings currently live in the right dock. To match Invoke's template, settings
must move to the left workbench dock, and the right side must become output and
asset context: Boards, Gallery, and Layers.

The approved visual constraints remain:

- no emoji icons
- AMOLED black and neutral charcoal/gray tokens
- no blue or green tint in the Vision Studio shell
- red only for destructive or status states
- compact professional chrome
- no decorative cards around the work surface

## Layout Template

```text
[Global Rail]
  fixed app navigation
  icon-led, compact, persistent

[Left Workbench Dock]
  generation settings, queue controls, mode-specific parameter panels
  360-420px target width
  docked directly beside the global rail

[Optional Mode Tool Rail]
  narrow tool strip for edit/canvas tools
  between left dock and center work area
  icon-only, stable width

[Center Working Area]
  primary canvas/viewer/workflow surface
  mini-tabs at top-left inside the work area
  no decorative frame around the surface

[Right Context Stack]
  Boards / project context
  Gallery / outputs / assets
  Layers for Canvas/Edit
  Inspector only when it represents selected-object context rather than global settings

[Bottom Continuity Strip]
  timeline, queue, variants, storyboard continuity
  attached to the workbench, not floating
```

## Mode Mapping

### Generate

- Left dock: Generate settings panel.
- Center: Canvas, Viewer, Workflow mini-tabs.
- Right stack: Boards and Gallery.
- Bottom: Timeline/continuity strip.

### Quick

- Left dock: Quick settings panel.
- Center: Canvas, Viewer, Workflow mini-tabs.
- Right stack: Boards and Gallery.
- Bottom: Timeline/continuity strip.

### Edit

- Left dock: Edit inspector/properties, treated as mode-specific settings.
- Tool rail: existing edit tool strip.
- Center: Edit canvas, Viewer, Workflow mini-tabs.
- Right stack: Layers and Gallery, with Boards/project context when available.
- Bottom: Timeline/continuity strip.

### Workflow

The current placeholder remains in the center mini-tab. The future workflow
editor should follow Invoke's split:

- left dock: workflow fields, metadata, Linear UI controls
- center: node canvas or linear run surface
- right stack: workflow library, gallery, run outputs, selected-node inspector

### Storyboard

Storyboard can remain on its existing right-panel layout until a later pass, but
new work should prepare it to join the same template:

- left dock for scene generation settings
- center for selected scene/canvas
- right stack for scenes, references, characters, and inspector context

## Component Language

### Buttons

Use compact button families:

- global rail: icon-only, link/ghost behavior, selected state through icon/text
  color only
- toolbars: icon buttons with divider groups
- panel headers: small ghost text buttons for collapse/selection, small link icon
  buttons for search/settings
- primary workbench actions: restrained outline or muted accent buttons
- destructive actions: red/error only

### Menus

Menus should be dark, compact, and utilitarian:

- no heavy bordered cards
- neutral panel background
- small rows
- icons with lower default opacity
- hover on neutral elevated gray
- destructive menu items use red only in text/rest state and stronger red only
  on hover

### Panels

Panels should read as docked software:

- fixed/min widths for spatial memory
- hairline borders
- 4-8px radii
- compact section gaps
- no cards inside cards
- no soft gradient decoration

### Tabs

Workbench mini-tabs should be inside the center working area, not the global
rail. The active tab should use muted accent/background and a clear border, but
the palette must stay neutral in Vision Studio.

Right-side context can be a stacked dock instead of tab-only navigation. This
better matches Invoke's Boards/Gallery/Layers panel and leaves room for future
collapsible sections.

## Data And State

The existing `activeWorkbenchView` state remains correct for Canvas, Viewer, and
Workflow mini-tabs.

The existing right dock tab state can remain for compatibility, but the next
layout pass should not use it for Generate/Quick settings. If right context
becomes a stack, collapse state should be separate from tab state and should be
scoped per workbench panel.

## Testing Strategy

Use component tests for the shell contract:

- Generate renders settings in `workbench-left-dock`.
- Generate right dock renders Boards and Gallery, not Settings.
- Edit renders the tool rail, left edit properties, and right Layers/Gallery.
- Canvas, Viewer, and Workflow mini-tabs remain accessible.
- Batch and Templates remain on specialized layouts.
- Shell chrome contains no old red-primary classes.

Use browser smoke after implementation:

- Generate default Canvas view.
- Generate Viewer view.
- Generate Workflow view.
- Edit with tool rail and Layers/Gallery right stack.
- Mobile-width or narrow-window layout should not overflow text.

## Non-Goals

- Do not build the node workflow editor in this pass.
- Do not redesign every settings control.
- Do not replace the generation pipeline.
- Do not implement full board management unless a lightweight project/board
  surface is needed to complete the layout.
- Do not copy Invoke's blue/yellow palette.

## Success Criteria

- Vision Studio's Generate and Quick modes match Invoke's left-settings,
  center-work, right-gallery spatial model.
- The right side is no longer the default home of generation settings.
- Viewer, Canvas, and Workflow feel like sibling work surfaces.
- Edit mode reads closer to a professional canvas editor, with tools near the
  work surface and Layers/Gallery on the right.
- The shell remains neutral, dense, stable, and Carbon Pro compliant.
