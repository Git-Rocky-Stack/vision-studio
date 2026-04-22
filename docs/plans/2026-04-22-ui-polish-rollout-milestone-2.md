# UI Polish Rollout Milestone 2

## Completed

Left-pane hierarchy pass.

## Shipped

- regrouped Generate into stable workflow cards: `Prompt`, `Style + Model`, `Reference Inputs`, `Motion`, `Control Layers`, `Output`, and `Advanced`
- persisted collapse state for curated secondary sections in the app store
- refactored `AdvancedGenerationSettings` into plain section content so the outer Generate cards own disclosure behavior
- upgraded the sticky preflight footer with model, frame size, runtime mode, estimated duration, and dependency warnings
- fixed collapsed-section normalization so `Advanced` can be fully expanded and saved instead of snapping back to the default collapsed state

## Verification

- `npm run typecheck`
- `npm run test -- src/store/appStore.test.ts src/pages/GeneratePanel.test.tsx`
- `npm run test -- src/styles/ui-glyphs.test.ts`
- `npm run build`
- `npx playwright test tests/e2e/workbench-responsive.spec.ts`
  passed with retry after one initial Electron fixture stall waiting for `[data-testid="nav-generate"]`
- direct Electron smoke:
  launched `dist-electron/main.mjs` with backend autostart disabled, opened Generate, confirmed the preflight summary rendered, toggled `Advanced`, and observed `Sampling Steps`

## Next

Milestone 3: review surfaces pass for gallery, viewer, boards, and canvas density and CTA polish.
