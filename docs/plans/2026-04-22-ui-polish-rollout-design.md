# UI Polish Rollout Design

## Goal

Systematically improve the main Vision Studio shell and workbench experience in small, verifiable desktop-focused slices. The rollout should make the app feel more intentional and more efficient to use without turning the current workbench into a broad redesign project.

## Chosen Approach

Use milestone-based UI polish passes with commit and verification gates after each slice.

This approach was chosen over a single large visual pass because it keeps layout risk contained, makes desktop regressions easier to catch, and gives each polish area a clean rollback boundary.

## Alternatives Considered

### 1. Milestone slices with commit and validation after each pass

- Best control over regressions.
- Cleanest fit for desktop layout work where resizing, scroll behavior, and persistence can break independently.
- Recommended.

### 2. Foundation first, then one larger visual pass

- Faster than strict milestones.
- Higher regression risk because several surfaces shift before runtime checks.

### 3. One continuous polish branch

- Fastest to execute.
- Weakest review boundary and easiest place for scope drift.

## Architecture And State Model

Add a focused persisted layout-preferences layer inside the existing UI store rather than scattering new view state across unrelated components.

Persisted UI preferences should include:

- left dock width
- right dock width
- right-dock split ratios
- selected density mode for review surfaces
- curated collapsed section ids for the generate/settings pane

These should live in the UI-oriented state owned by [src/store/appStore.types.ts](/C:/vision-studio/src/store/appStore.types.ts) and [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts).

Non-persisted UI state should remain local to components:

- scroll position
- drag-in-progress state
- hover state
- transient banners and inline notices
- local compare controls like slider position or onion overlay opacity
- in-flight generation progress details already managed by active status state

## Ownership Boundaries

- [src/components/layout/DockviewLayout.tsx](/C:/vision-studio/src/components/layout/DockviewLayout.tsx) owns dock sizing, shell splitters, and panel geometry.
- [src/components/layout/DockviewSettingsPanel.tsx](/C:/vision-studio/src/components/layout/DockviewSettingsPanel.tsx) owns sticky left-pane shell behavior and sub-mode shell structure.
- [src/pages/GeneratePanel.tsx](/C:/vision-studio/src/pages/GeneratePanel.tsx) owns section grouping, section collapse behavior, and the sticky action footer.
- [src/components/layout/WorkbenchGalleryDock.tsx](/C:/vision-studio/src/components/layout/WorkbenchGalleryDock.tsx) and [src/components/layout/WorkbenchViewer.tsx](/C:/vision-studio/src/components/layout/WorkbenchViewer.tsx) own browsing density and review-loop action polish.
- [src/components/layout/WorkbenchBoardsDock.tsx](/C:/vision-studio/src/components/layout/WorkbenchBoardsDock.tsx) and [src/components/layout/Canvas.tsx](/C:/vision-studio/src/components/layout/Canvas.tsx) own empty-state CTA clarity for boards and canvas.
- [src/components/layout/Timeline.tsx](/C:/vision-studio/src/components/layout/Timeline.tsx) owns timeline readability polish only.
- [src/components/layout/Header.tsx](/C:/vision-studio/src/components/layout/Header.tsx) owns truthful shell status presentation, but not backend process logic.

## Milestones

### 1. Shell Interaction Pass

Scope:

- Replace hardcoded dock sizing with explicit draggable splitters for left and right docks.
- Support persisted dock widths and right-dock split ratios.
- Add keyboard-accessible resize behavior and reset-to-default handling.
- Add top and bottom scroll-shadow affordances to long shell panes.
- Keep responsive fallback behavior intact on smaller viewports.

Primary files:

- [src/components/layout/DockviewLayout.tsx](/C:/vision-studio/src/components/layout/DockviewLayout.tsx)
- [src/components/layout/DockviewSettingsPanel.tsx](/C:/vision-studio/src/components/layout/DockviewSettingsPanel.tsx)
- [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts)
- [src/store/appStore.types.ts](/C:/vision-studio/src/store/appStore.types.ts)

### 2. Left-Pane Hierarchy Pass

Scope:

- Reframe the Generate surface into stable workflow cards: `Prompt`, `Style + Model`, `Reference Inputs`, `Motion`, `Control Layers`, `Output`, and `Advanced`.
- Persist collapse state only for curated secondary sections such as `Advanced`, `Control Layers`, and `Reference Inputs`.
- Strengthen spacing, headings, and section rhythm without rewriting the underlying controls.
- Upgrade the sticky footer into a compact action summary with model, output dimensions, runtime mode, and dependency warnings.

Primary files:

- [src/pages/GeneratePanel.tsx](/C:/vision-studio/src/pages/GeneratePanel.tsx)
- [src/components/layout/DockviewSettingsPanel.tsx](/C:/vision-studio/src/components/layout/DockviewSettingsPanel.tsx)
- [src/components/generate/AdvancedGenerationSettings.tsx](/C:/vision-studio/src/components/generate/AdvancedGenerationSettings.tsx)
- [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts)

### 3. Review Surfaces Pass

Scope:

- Add a shared `comfortable` and `compact` density preference for review surfaces.
- Tighten gallery and viewer thumbnail presentation for higher-volume browsing.
- Improve compare affordances so pinned-output state is easier to understand.
- Turn empty states into direct action surfaces with real routing and next-step actions.

Primary files:

- [src/components/layout/WorkbenchGalleryDock.tsx](/C:/vision-studio/src/components/layout/WorkbenchGalleryDock.tsx)
- [src/components/layout/WorkbenchViewer.tsx](/C:/vision-studio/src/components/layout/WorkbenchViewer.tsx)
- [src/components/layout/WorkbenchBoardsDock.tsx](/C:/vision-studio/src/components/layout/WorkbenchBoardsDock.tsx)
- [src/components/layout/Canvas.tsx](/C:/vision-studio/src/components/layout/Canvas.tsx)
- [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts)

### 4. Timeline And Motion Pass

Scope:

- Increase playhead contrast and selected-track readability.
- Add clearer row rhythm, ruler contrast, and overflow cues.
- Improve zoom-state readability without changing the underlying timeline engine.
- Tighten the collapsed transport bar so it reads as a useful status summary.

Primary files:

- [src/components/layout/Timeline.tsx](/C:/vision-studio/src/components/layout/Timeline.tsx)

### 5. Header And Status Intelligence Pass

Scope:

- Update the header status indicator to represent truthful readiness states such as `Offline`, `Starting`, and `Ready`.
- Keep the accepted header geometry and right-side reserve for native window controls.
- Add lightweight secondary shell context only when it already exists in local state, such as GPU or CPU mode and active queue presence.
- Avoid speculative status labels that the backend does not currently expose.

Primary files:

- [src/components/layout/Header.tsx](/C:/vision-studio/src/components/layout/Header.tsx)
- [src/App.tsx](/C:/vision-studio/src/App.tsx)
- [electron/services/backendProcess.ts](/C:/vision-studio/electron/services/backendProcess.ts)
- [electron/services/backend.ts](/C:/vision-studio/electron/services/backend.ts)
- [src/store/appStore.types.ts](/C:/vision-studio/src/store/appStore.types.ts)

## Verification Rules

Every milestone should ship with three levels of verification:

- store-level tests for clamp logic and persisted preference behavior where applicable
- component tests for the touched controls or layout affordances
- one runtime smoke path that proves the user-visible behavior actually works in the mounted shell

Examples:

- drag a dock divider, reload, and confirm persisted geometry
- collapse a supported generate section, reload, and confirm the saved state
- switch density mode and confirm both gallery and viewer surfaces respond
- confirm header readiness states track real backend readiness, not just HTTP liveness

## Sequencing Rules

- Keep each milestone mechanically narrow.
- Do not fold search, tagging, virtualization, or deep data-flow changes into polish passes.
- Preserve the accepted custom header geometry while improving status truthfulness.
- Prefer runtime validation after each slice instead of deferring all checks to the end.
- Add a short dated progress note in `docs/plans/` for each completed milestone if the rollout spans multiple commits.

## Out Of Scope

- no new docking framework
- no broad navigation redesign
- no backend feature expansion beyond exposing already-available readiness truth
- no major workflow or generation engine changes
- no speculative UX for statuses the backend does not expose today
