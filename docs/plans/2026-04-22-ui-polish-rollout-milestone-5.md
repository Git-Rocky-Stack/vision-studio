# UI Polish Rollout Milestone 5

## Completed

Header and status intelligence pass.

## Shipped

- extended renderer system state with backend process metadata so the shell can distinguish offline, warming, and ready conditions
- updated the app bootstrap and Settings backend-start path to fetch combined health and process status instead of only a boolean-ready snapshot
- upgraded the header status chip to surface live states for `Warming`, `Queue active`, `Downloading models`, `GPU ready`, `CPU mode`, `No models`, and `Not ready`
- kept the header footprint stable while adding richer detail text for model availability and queue activity
- added focused header tests covering ready, warming, queue-active, and offline cases

## Verification

- `npm run typecheck`
- `npm run test -- src/components/layout/Header.test.tsx src/styles/ui-glyphs.test.ts`
- `npm run build`
- `npx playwright test tests/e2e/workbench-responsive.spec.ts`
- direct Electron smoke:
  launched `dist-electron/main.mjs` with backend autostart disabled, forced the store through a warming state and then a queued generation state, and confirmed the header chip rendered `Warming` with bundled-backend detail and then `Queue active` with running and queued counts

## Next

UI polish rollout complete.
