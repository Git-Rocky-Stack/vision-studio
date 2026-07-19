# Vision Studio - Agent Guide

Vision Studio is a professional, local-first AI image and video generation desktop app: Electron 42 + React 19 + TypeScript + Vite + Tailwind CSS v4, with a Python (FastAPI/PyTorch) backend. Everything runs on the user's GPU. No cloud, no subscription.

## Design System

**Read `DESIGN.md` before any visual or UI work.** It is the canonical design source of truth and mirrors the `Vision-Studio-X-website` Carbon Pro Workshop language.

- **Typography:** IBM Plex Sans Condensed (display >=48px) / IBM Plex Sans (body, UI) / IBM Plex Mono (data, labels) - bundled locally in `src/fonts.ts`, never a runtime CDN. UI labels use `.mono-label` (Mono UPPERCASE +0.66px).
- **Color:** Carbon Pro - true-black AMOLED neutrals + a single chrome `#E6E6E6` accent. Canonical token names live in `src/index.css @theme`; the website `chrome/carbon/silver/led` names are aliased on top. Never edit the asserted tokens (`carbon-pro-tokens.test.ts`).
- **Radius:** machined - cards 2px, controls 4px, overlays 8px, pills round. Never a uniform 16px.
- **Motion:** hardware envelopes (`--ease-click/snap/glide/settle/vu/led`); everything collapses under `prefers-reduced-motion`.
- **Depth:** four-layer system - `.raised-panel` / `.recessed-well` / `.raised-control` / `.btn-chrome` (+ `.faceplate-stripe`, `.hex-bolt`, `.led-glow`). Each surface declares one depth layer; never mix inset directions on one element.
- **Hardware primitives:** `src/components/hardware/` - every one must drive real state, never decoration.
- **Do not** add `--spacing-*` tokens (breaks `tailwind-source.test.ts`); use the `--space-*` 8pt grid. Dark is canonical; the light theme is retained and inherits the new type/radii.
- **No emoji** in app source (`ui-glyphs.test.ts`); no decorative middot/em-dash/bullet glyphs in `src/`. Use `lucide-react` icons.
- Flag any code that does not match `DESIGN.md` during review.

## Conventions

- Path alias `@/` resolves to `src/`.
- Zustand store in `src/store/`; use `useShallow` for multi-field selectors.
- Keep IPC channel names in sync between `electron/preload.ts` and the handlers.
- Tests: `npm run typecheck`, `npm test` (Vitest), `npm run build` must all be green before shipping.