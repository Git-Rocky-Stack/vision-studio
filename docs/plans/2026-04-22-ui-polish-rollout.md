# UI Polish Rollout Implementation Plan

## Execution Strategy

Ship the approved UI polish program as five narrow milestones. Each milestone ends with focused verification, a commit, and a short dated progress note if the rollout spans multiple sessions.

## Task 1: Shell Interaction Pass

Goals:

- add persisted left and right dock widths
- add persisted right-dock split ratios
- replace fixed dock sizing with draggable splitters
- support keyboard resizing and reset-to-default behavior
- add shell-level scroll shadows to long panes

Primary files:

- [src/store/appStore.types.ts](/C:/vision-studio/src/store/appStore.types.ts)
- [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts)
- [src/components/layout/DockviewLayout.tsx](/C:/vision-studio/src/components/layout/DockviewLayout.tsx)
- [src/components/layout/DockviewSettingsPanel.tsx](/C:/vision-studio/src/components/layout/DockviewSettingsPanel.tsx)
- [src/index.css](/C:/vision-studio/src/index.css)

Verification:

- store clamp and reset tests
- layout tests for rendered splitter handles and keyboard resize behavior
- runtime smoke proving dock geometry persists after reload

## Task 2: Left-Pane Hierarchy Pass

Goals:

- reorganize Generate into stable workflow sections
- persist collapse state for curated secondary sections
- improve section rhythm and summary text
- upgrade sticky action footer with compact preflight context

Primary files:

- [src/pages/GeneratePanel.tsx](/C:/vision-studio/src/pages/GeneratePanel.tsx)
- [src/components/generate/AdvancedGenerationSettings.tsx](/C:/vision-studio/src/components/generate/AdvancedGenerationSettings.tsx)
- [src/components/layout/DockviewSettingsPanel.tsx](/C:/vision-studio/src/components/layout/DockviewSettingsPanel.tsx)
- [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts)

Verification:

- collapse-state persistence tests
- generate-panel interaction tests
- runtime smoke for sticky footer and section behavior

## Task 3: Review Surfaces Pass

Goals:

- add shared comfortable and compact density modes
- tighten gallery and viewer thumbnail browsing
- improve compare-state visibility
- replace passive empty hints with direct operational CTAs

Primary files:

- [src/components/layout/WorkbenchGalleryDock.tsx](/C:/vision-studio/src/components/layout/WorkbenchGalleryDock.tsx)
- [src/components/layout/WorkbenchViewer.tsx](/C:/vision-studio/src/components/layout/WorkbenchViewer.tsx)
- [src/components/layout/WorkbenchBoardsDock.tsx](/C:/vision-studio/src/components/layout/WorkbenchBoardsDock.tsx)
- [src/components/layout/Canvas.tsx](/C:/vision-studio/src/components/layout/Canvas.tsx)
- [src/store/slices/uiSlice.ts](/C:/vision-studio/src/store/slices/uiSlice.ts)

Verification:

- density-mode store and component tests
- review-surface interaction checks
- runtime smoke for CTA routing and compare affordances

## Task 4: Timeline And Motion Pass

Goals:

- improve playhead and selected-track contrast
- add clearer row rhythm and overflow cues
- strengthen zoom readability
- tighten the collapsed transport summary

Primary files:

- [src/components/layout/Timeline.tsx](/C:/vision-studio/src/components/layout/Timeline.tsx)

Verification:

- touched timeline tests
- focused interaction smoke for zoom, selection, and collapse behavior

## Task 5: Header And Status Intelligence Pass

Goals:

- surface truthful readiness states: `Offline`, `Starting`, `Ready`
- preserve accepted header geometry and native-control reserve
- add lightweight shell context for runtime mode and queue presence

Primary files:

- [src/components/layout/Header.tsx](/C:/vision-studio/src/components/layout/Header.tsx)
- [src/App.tsx](/C:/vision-studio/src/App.tsx)
- [electron/services/backendProcess.ts](/C:/vision-studio/electron/services/backendProcess.ts)
- [electron/services/backend.ts](/C:/vision-studio/electron/services/backend.ts)
- [src/store/appStore.types.ts](/C:/vision-studio/src/store/appStore.types.ts)

Verification:

- focused status-state tests
- runtime smoke against real backend readiness behavior

## Immediate Next Step

Start Task 1 and keep the write set limited to store types, UI slice state, shell layout, and shell-level chrome affordances.
