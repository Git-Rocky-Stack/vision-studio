# UI Polish Rollout Milestone 1

## Completed

Shell interaction pass.

## Shipped

- persisted left and right dock widths in the app store
- persisted right-dock split ratios for canvas, dual-panel, and triple-panel layouts
- keyboard-accessible shell splitters with double-click reset behavior
- responsive left-dock rendering so narrow desktop and phone-width shells keep the center workspace usable
- shell-level scroll shadows on the settings pane, gallery, boards dock, and iteration tree surfaces

## Verification

- `npm run typecheck`
- `npm run test -- src/store/appStore.test.ts src/components/layout/DockviewLayout.test.tsx`
- `npm run build`
- `npx playwright test tests/e2e/workbench-responsive.spec.ts`
- Electron persistence smoke:
  left dock width, right dock width, and triple-panel ratios survived an in-app reload through persisted store state

## Next

Milestone 2: left-pane hierarchy pass in `GeneratePanel` and the settings shell.
