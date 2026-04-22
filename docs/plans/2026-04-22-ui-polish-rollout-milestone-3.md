# UI Polish Rollout Milestone 3

## Completed

Review surfaces pass.

## Shipped

- added a shared persisted review-density preference for gallery and viewer surfaces
- upgraded the gallery dock with density controls, denser compact browsing, and direct empty-state actions into `Generate` and `Assets`
- upgraded the viewer with density-aware thumbnail browsing, clearer compare-state status, and direct empty-state actions
- upgraded the boards dock empty state with direct `New Board` and `Open Generate` actions
- replaced passive canvas empty-state chips with real buttons for `Generate`, `Viewer`, and `Storyboard`

## Verification

- `npm run typecheck`
- `npm run test -- src/store/appStore.test.ts src/components/layout/Canvas.test.tsx src/components/layout/WorkbenchReviewSurfaces.test.tsx`
- `npm run test -- src/styles/ui-glyphs.test.ts`
- `npm run build`
- direct Electron smoke:
  launched `dist-electron/main.mjs` with backend autostart disabled, forced the center view to `canvas`, clicked `Open Viewer`, seeded a viewer asset through the exposed store, and confirmed the compare-status surface rendered in `viewer`

## Next

Milestone 4: timeline and motion pass for zoom readability, row rhythm, playhead contrast, and overflow cues.
