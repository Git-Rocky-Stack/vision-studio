# Carbon Pro Hardware-Language Rollout — Handoff

Status as of 2026-05-29. The **foundation is complete and shipped green** (full suite 135 files / 1201 tests, typecheck, build all passed in a prior verified run). This file tracks the per-surface rollout that continues on top of it.

## Foundation (DONE, verified)
- `src/fonts.ts` — IBM Plex Sans Condensed / Sans / Mono bundled via `@fontsource` (18 woff2, no CDN). Imported in `src/main.tsx`.
- `src/index.css` — IBM Plex font tokens, hardware motion envelopes, machined radii (2/4/8), four-layer depth utilities (`.raised-panel`, `.recessed-well`, `.raised-control`, `.btn-chrome`, `.faceplate-stripe`, `.hex-bolt`, `.led-glow`, `.mono-label`, `.data-mono`, `.display-*`), website token aliases (`--color-chrome/carbon/silver/led/cap`), `vx-*` interaction states. Light theme retained.
- `src/components/hardware/` — `Led`, `Lcd`, `MonoLabel`, `HexBolt`, `Faceplate`, `ChromeButton`, `tokens.ts`, barrel `index.ts`, `hardware.test.tsx` (5 tests pass).
- `src/components/layout/Header.tsx` — backend-status pill = `recessed-well` + `Led`; brand mark = `btn-chrome`. Tests pass (a11y label on sr-only `<span role="status">`).
- `DESIGN.md` (app root) + `CLAUDE.md` "Design System" section. Both written.

## CRITICAL working rules (cost me cycles — obey)
1. **READ each file region before Edit.** Do NOT guess strings; the codebase differs from assumptions. Every guessed Edit failed with "string not found".
2. **No decorative glyphs anywhere in `src/`** incl. comments: middot U+00B7, em/en dash, bullet, times, ellipsis. Enforced by `src/styles/ui-glyphs.test.ts`. Use ASCII hyphens.
3. **Shell-typography allowlist** (`ui-glyphs.test.ts` `shellTypographyFiles`) bans `font-mono` / `font-display` / `uppercase` / `tracking-*` / `text-[..]` / `text-micro` in those files (incl. `GeneratePanel.tsx`, `QuickGeneratePanel.tsx`, `StoryboardPanel.tsx`, many components). `.mono-label`, `.recessed-well`, `.raised-control`, `ChromeButton` are SAFE (don't match the regex).
4. **Never add `--spacing-*` tokens** to index.css (`tailwind-source.test.ts`). Use `--space-*`.
5. **Don't edit asserted tokens** in `carbon-pro-tokens.test.ts`.
6. Verify pattern: `npm run typecheck`; `npx eslint <files>`; `npx vitest run <file> src/styles`; pipe to `$env:TEMP\x.txt` then read (ANSI-strip with `sed 's/\x1b\[[0-9;]*m//g'`). Tool channel stalls intermittently — re-probe, don't spam.

## Rollout progress
- **Wave 1 GeneratePanel (`src/pages/GeneratePanel.tsx`)** — EDITS APPLIED, needs final test confirm:
  - Added `import { ChromeButton, Lcd } from '@/components/hardware';` after the framer-motion import.
  - `GenerateSectionCard`: section → `raised-panel`; icon chip → `raised-control`; badge → `recessed-well`; toggle → `raised-control vx-knob`.
  - Workflow header card → `raised-panel`; mode badge → `<Lcd>`; mode-toggle container → `recessed-well`.
  - Generate CTA `motion.button` → `<ChromeButton>` (kept `data-testid="generate-button"`, `key="generate"`).
  - `motion` import still used by remaining `motion.div`s — keep it.
  - LAST STEP PENDING: confirm `npx vitest run src/pages/GeneratePanel.test.tsx src/styles` is green (was running when channel stalled). If green, mark Wave 1 done.

- **Wave 2 QuickGeneratePanel (`src/pages/QuickGeneratePanel.tsx`)** — NOT STARTED. Real content: uses `<Button variant="primary">` (Generate) + `<Button variant="ghost">` (clear), state `prompt`/`negativePrompt`/`selectedRatio`, ASPECT_RATIOS map with `cn()`. Plan: primary Generate `<Button>` → `<ChromeButton variant="chrome">`; textareas → add `recessed-well`; aspect buttons → `raised-control vx-pad`; labels → `mono-label`. File IS in shell allowlist — keep classes safe.

- **Wave 3 Batch/Templates/Settings** — NOT STARTED.
  - `src/pages/BatchPanel.tsx` (contains `BatchPromptQueue` — NOT a separate file). Already uses shared `<Button>` (variant cinema/danger/secondary) which inherits tokens. Optional: "Start Batch" `<Button variant="cinema">` → `<ChromeButton>`. Toolbar/filter pills use ad-hoc `bg-accent-primary-muted` — could become `raised-control`. BatchPanel NOT in shell allowlist, but BatchPanel.test.tsx asserts behavior — keep `data-testid`/labels.
  - `src/pages/TemplatesPanel.tsx` (610 lines) — has 2 `bg-accent-primary text-void` primary CTAs to convert to ChromeButton.
  - `src/pages/SettingsPanel.tsx` (1559 lines) — uses `<Button>`; 0 ad-hoc primary CTAs. Low priority.

- **Wave 4** — final `npm run typecheck` + full `npx vitest run` + `npm run build` (expect 18 plex woff2, 0 CDN leaks), scrub banned glyphs (`Get-ChildItem src -Include *.ts,*.tsx,*.css -Recurse` regex `[·•—–−×…]`).

## Other surfaces worth a pass later (lower priority)
StoryboardPanel, EditPanel, CollectionsPage, AssetsPanel, TemplatesPanel cards, the `ui/Button` primary variant itself (could route through `.btn-chrome` for global chrome CTAs — highest-leverage single change but touches many tests, do carefully).
