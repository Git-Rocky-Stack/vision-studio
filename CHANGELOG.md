# Changelog

All notable changes to Vision Studio will be documented in this file.

## [3.4.0] - 2026-08-24

Canvas and measurement release: the region tools on the Canvas tab can draw
again, the Konva stage and the edit inspector stop re-rendering on project
writes that have nothing to do with them, two panels stop crashing when the
renderer runs outside Electron, and the performance suite measures the shipped
bundle - and the page rather than its own harness - instead of the dev server it
had been benchmarking. Additive - no known breaking changes.

### Fixed
- **Settings and the workflow workbench no longer crash outside Electron** -
  `src/types/electron.d.ts:509` declares `window.electron` as a required
  property. That holds inside the shipping app and nowhere else, so the compiler
  could not flag mount-path code that assumed it, and there is no preload in the
  two hosts this bundle is also loaded into: the `vite preview` build the
  performance suite measures and the dev server used for headless design review.
  `SettingsPanel` evaluated `window.electron.settings.get()` synchronously in a
  mount effect, throwing "Cannot read properties of undefined (reading
  'settings')" before first paint and rendering its ErrorBoundary instead of the
  panel; a second effect produced an unhandled rejection; `WorkflowWorkbench`
  did the same with `accounts.list()`. All six mount-path call sites now resolve
  the bridge through `getElectronBridge()`
  (`src/utils/electronBridge.ts:30`, used at `src/pages/SettingsPanel.tsx:202`,
  `:231`, `:294`, `:333`, `:455` and
  `src/components/workflow/WorkflowWorkbench.tsx:113`) and degrade to an empty
  state instead of throwing. A browser run against the shipped bundle now
  reports zero page errors across all five panels, against one before. Event
  handlers are deliberately untouched: they only run in a window Electron
  opened. Covered by `src/utils/electronBridge.test.ts`,
  `src/pages/SettingsPanel.test.tsx:292`,
  `src/components/workflow/WorkflowWorkbench.test.tsx:316` and, structurally,
  by `tests/electron-bridge-mount-paths.test.ts`
- **Node tests get the test timeout the config says they get** -
  `vitest.config.ts` set `testTimeout: 20000` with a comment explaining that
  full-suite runs under the pre-commit hook saturate CPU and flake on the
  default. That value never reached the `unit` project: a project declaring its
  own `test` block does not inherit it, so every node test - most of the suite -
  ran against the 5s default. Demonstrated directly: a 6s test fails with "Test
  timed out in 5000ms" without a project-level value and passes with one. The
  `unit` project now restates it (`vitest.config.ts:28`), as the `component`
  project already did. Found when a new whole-repo scan test passed in isolation
  and failed in the pre-commit gate
- **The edit inspector no longer re-renders on unrelated project writes** - the
  same defect the Konva stage was fixed for, in a fourth component:
  `EditPropertiesPanel` derived the active region lock and the active scene by
  hand from a `projects` array subscription, so a write to another project or
  another scene re-rendered the whole inspector, filter grid and sliders
  included. It now subscribes through the same identity-preserving selectors
  (`src/components/edit/EditPropertiesPanel.tsx:140`), which also removes the
  duplicated derivations. Covered by Profiler commit-count tests
  (`src/components/edit/EditPropertiesPanel.test.tsx:46`)
- **Region-lock masks can be drawn on the Canvas tab** - the Canvas tab renders
  `EditCanvas`, not the generation `Canvas`
  (`src/components/layout/DockviewLayout.tsx:64`), and `EditCanvas` mounted the
  region mask toolbar without any drawing surface behind it. Selecting Rectangle
  and dragging could never reach a region lock, so a lock's mask stayed at its
  default bounds. `EditCanvas` now renders the mask surface over the displayed
  image (`src/components/edit/EditCanvas.tsx:553`), scaled to the stage and
  bound to the active lock; the AI inpaint mask still takes precedence while it
  is open, so only one surface ever owns the pointer
- **The Konva canvas no longer re-renders on unrelated project writes** - the
  region-lock work above resolved the active lock from a `projects` array
  subscription, and `CanvasControlLayerRail` resolved the active scene the same
  way. Every project writer rebuilds `projects` wholesale
  (`src/store/slices/projectSlice.ts:715`), so renaming a project or writing a
  region on another scene re-rendered the whole Konva stage. Both now subscribe
  through selectors that resolve the object and preserve its identity -
  `selectActiveRegionLock` (`src/store/slices/projectSlice.ts:940`, used at
  `src/components/edit/EditCanvas.tsx:79`) and `selectActiveScene`
  (`src/store/slices/projectSlice.ts:956`, used at
  `src/components/canvas/CanvasControlLayerRail.tsx:181`). Covered by a Profiler
  commit-count test (`src/components/edit/EditCanvas.test.tsx:218`) and selector
  identity tests (`src/store/slices/projectSelectors.test.ts`)
- **CI's TypeScript job type-checked nothing** - both gating workflows ran
  `npx tsc --noEmit`. `tsconfig.json` is a solution file (`"files": []` plus
  `references`), and TypeScript only follows references under `--build`, so that
  command compiled zero files and the job passed by construction - on every pull
  request and on every release. Measured rather than reasoned about: with a
  deliberate `TS2322` in `src/utils/electronBridge.ts`,
  `npx tsc --noEmit --listFiles` lists 0 files and exits 0, while
  `npm run typecheck` exits 2 and names the error. Both workflows now run
  `npm run typecheck` (`.github/workflows/pr-gate.yml:35`,
  `.github/workflows/release.yml:46`). Note that this gate had been inert since
  the solution-style `tsconfig.json` was introduced, so a type error could have
  reached `main` at any point before now
- **Public documentation stated test counts, commands and CI gates that were no
  longer true** - the README told contributors to run the backend suite with
  `python -m unittest discover`, which `CONTRIBUTING.md` separately and
  correctly forbids because it silently skips the pytest-style suites;
  `CONTRIBUTING.md` documented `npm run dev:frontend` and `npm run dev:backend`,
  neither of which exists in `package.json`; and `docs/ARCHITECTURE.md` §10
  listed Vitest 3 with 16 files / 119 tests, a `unittest` backend of 7 files, a
  `happy-dom` environment the repo does not depend on, and `npm run lint` as a
  CI gate that no workflow runs. Every count in the README, `CONTRIBUTING.md`
  and `ARCHITECTURE.md` is now the measured v3.4.0 figure and names the command
  that reproduces it

### Added
- **A gate on unguarded mount-path uses of the preload bridge** - the rule that
  mount paths must reach `window.electron` through `getElectronBridge()` while
  event handlers need not was carried by an argument in a comment, so nothing
  stopped the next unguarded mount-path call from being added. It is now
  enforced by `tests/electron-bridge-mount-paths.test.ts`, which builds a
  per-file call graph over `src` - module scope, component and hook render
  bodies, and effect callbacks as roots - and reports any bare `window.electron`
  dereference reachable from one. Optional-chained access and a guard that
  precedes the dereference are both accepted; 15 fixtures pin the classifier in
  both directions so a scanner that silently stops finding anything is not
  mistaken for a clean repo. It found one call site the earlier scan had missed
  (`src/pages/SettingsPanel.tsx:455`, reached from the account effect at `:358`),
  now guarded
- **A gate on the CI type-check gate** - `tests/ci-typecheck-gate.test.ts` fails
  the suite if either gating workflow reverts to a bare `tsc --noEmit`, and -
  the part that keeps this fixed rather than fixed-once - if a project is added
  to `tsconfig.json`'s `references` without being added to the `typecheck`
  script, which would reopen the same blind spot on a narrower surface. That is
  not hypothetical: `tsconfig.tests.json` was added to both in this release, and
  nothing but review would have caught it if it had not been

### Changed
- **The performance suite measures the shipped bundle, not the dev server** -
  `tests/e2e/performance/performance.spec.ts` ran against `vite dev`, so its
  numbers described Vite: a cold dev server reported 250 resource entries
  against a `< 250` budget and timed out the page-load test, where the
  production bundle reports 17 and loads in ~0.7s. Playwright now starts a
  second web server on :4273 serving a fresh production build
  (`playwright.config.ts:72`, `npm run preview:web`) and the performance specs
  point there; every other spec still uses the dev server on :5173. Three
  further measurement defects are fixed with it: panel switches are measured
  warm, because the first visit to a code-split panel pays a one-time chunk
  download; clicks skip Playwright actionability waits, which were timing the
  settle of a 150ms CSS transition rather than the 11ms panel render. No budget
  was loosened
- **The settings panel now has a switch-time budget** - it had functional
  coverage (`tests/e2e/accessibility.spec.ts:107` and the visual suite, both on
  the Electron fixture) but no performance budget anywhere, because it could not
  mount outside Electron. With its mount paths guarded it mounts in a browser,
  so it joins the panel matrix
  (`tests/e2e/performance/performance.spec.ts:99`) and is measured against the
  same budget as every other panel; the switch into it measured 13.2-20.7ms
  once the measurement moved into the page (see below)
- **The page-load budget measures the page, not the harness** - the test wrapped
  a Node-side stopwatch around `waitForLoadState('networkidle')`, so it measured
  Playwright RPC and a 500ms no-request debounce on top of the load. Broken down
  on the shipped bundle: the page's own navigationStart to loadEventEnd is
  40-86ms and `networkidle` adds a further 410-620ms, which is how a 3000ms
  budget came to report 700-769ms idle and 2499ms on a contended run - a 3.5x
  swing in a number the app never moved. It now reads
  `PerformanceNavigationTiming.duration` inside the page
  (`tests/e2e/performance/performance.spec.ts:352`). Re-measured with 7 of 8
  cores saturated, the new figure moved 40-82ms to 47-86ms where the old form
  went 545-590ms to 627-967ms, so the budget is tightened to 1000ms and no
  longer fails for a busy runner
- **The panel-switch and time-to-interactive budgets measure the page, not the
  harness** - the last two Node-side stopwatches in the suite. Panel switching
  wrapped `Date.now()` around a Playwright click and a `waitForSelector`, so it
  timed two RPC round trips and the runner's scheduling alongside the app: the
  same switches read 198-419ms run to run and produced 448ms and 593ms outliers
  under load, which `retries: 1` absorbed rather than reported. Time to
  Interactive started its clock after `page.goto` had already resolved, so it
  measured neither the navigation nor the mount cleanly. Both now take both
  endpoints inside the page - a capture-phase click listener and a
  MutationObserver plus frame pump on the target selector
  (`tests/e2e/performance/performance.spec.ts:168`). Measured across 9 full
  matrices, 45 switches: 12.5-90.8ms idle and 10.9-62.1ms with 7 of 8 cores
  saturated, so the contended run is no longer the slower one. The panel-switch
  budget is tightened 350ms to 250ms on that evidence
  (`tests/e2e/performance/performance.spec.ts:51`); the TTI budget is held at
  2000ms because the figure it guards now covers strictly more work than before
  (568-912ms measured). Proven capable of failing: a 300ms stall injected into
  `GeneratePanel`'s render took `settings -> generate` from ~50ms to 344.3ms and
  tripped the budget, while the four switches that do not render that panel
  stayed at 14-22ms
- **The performance suite can no longer measure a different application** -
  `vite preview` defaults to :4173 and Playwright's `reuseExistingServer` probes
  the URL before running its own command, so whatever answered first was
  measured. That port was found serving an unrelated project's preview build
  (title "WealthWise OS") while this work was in progress. The performance
  server moves to a port no other Vite project claims by default
  (`playwright.config.ts:20`) and no longer reuses an existing server, which is
  what makes the config's long-standing claim that the numbers describe the
  current source actually true - previously a stale build from an earlier run
  was adopted as-is. The dev server stays on :5173, where the port is
  load-bearing for the backend CORS allow-list (`backend/main.py:436`) and the
  documented workflow (`CONTRIBUTING.md:92`), and where a foreign app fails the
  behavioural specs loudly instead of yielding a plausible wrong number. Guarded
  by `tests/playwright-config.test.ts`
- **Everything under `tests/` is typechecked** - `tsconfig.app.json` covered
  only `src`, `shared` and `tests/setup.ts`, so no integration test and no e2e
  spec was ever seen by `tsc`. A new `tsconfig.tests.json` covers the tree and
  runs in `npm run typecheck` (`package.json:33`); it found 20 errors on first
  run, including five in `tests/vite-config.test.ts` where a
  `ManualChunksOption` union was called without narrowing. Two release scripts
  gained declaration files (`scripts/publish-r2-core.d.cts`,
  `scripts/verify-release-signing.d.cts`) rather than enabling `allowJs`, which
  measured 27s against 10s on a config the pre-commit hook runs
- **The version-sync test no longer pins a release date** -
  `tests/version-sync.test.ts:57` compared the newest changelog heading against
  a hardcoded `2026-08-24`, so a release that slipped a day failed as a
  version-sync defect and every release needed a hand-edit. It now matches the
  heading by shape and validates the date by round-tripping it through `Date`,
  which still fails on a stale `## [Unreleased]`, a stale version, a missing
  date, and an impossible one like `2026-13-45`
- **Frame rate and heap growth are recorded, not gated** - both measured the
  runner rather than the app: a headless runner does not drive
  `requestAnimationFrame` from a real compositor (the same idle production page
  measured 35.4fps and 56.8fps on consecutive runs against a `>= 55` gate) and
  exposes no dependable GC hook. Both tests now record their measurement as a
  Playwright annotation and assert only that the probe returned a usable
  reading. The 55fps threshold was not lowered - it was removed as a gate. These
  two tests are explicitly not coverage of frame rate or of memory leaks

## [3.3.0] - 2026-08-23

Codebase audit release: ten shipped-but-hollow features made real, three dead
modules removed, the whole class of design-system colour drift closed off with a
guard test, and every known dependency advisory cleared. Additive - no known
breaking changes.

### Added
- **Model Foundry acquire flow** - Discover results now render the full result
  card (tier, security badges, downloads/likes/size, license) with a working
  **Acquire** action, live download-job status, and the license-gate hand-off.
  Pickle and `trust_remote_code` results route through the security consent
  dialog and only download once consent is granted. Search previously listed
  nothing but a model name, so there was no way to install what you found
- **Layer canvas mounted in the Edit workspace** - the Konva surface that draws
  and transforms `editLayers` now renders in the centre of the Canvas tab. The
  tool strip, layer list, and text controls already wrote to that model; nothing
  had been drawing it
- **Real asset tagging** - `assetAnalysis` derives style, subject, colour, and
  mood tags from the positive prompt by whole-word lexicon match, longest term
  first. Confidence is the term's positional weight in the prompt (earlier
  tokens carry more), colour tags resolve to their real sRGB hex, and the
  negative prompt is excluded. Nothing is guessed or fabricated
- **Tagging modes wired** - the Settings tagging control now governs behaviour:
  `on-generation` analyses as renders land, `background-batch` and `on-demand`
  queue for the Analyze control, `off` does nothing. The queue is drained, and
  smart collections re-evaluate whenever new metadata arrives
- **Keyframe authoring** - the animation editor can add a keyframe at the
  playhead for the selected layer, retime via the filmstrip, edit interpolation
  and easing, and delete. `addKeyframe`/`updateKeyframe`/`deleteKeyframe` had no
  callers, so the editor could only ever show its empty state
- **Onion-skin controls** - depth, opacity, and direction controls, with the
  overlay mounted over the active storyboard scene. The toolbar toggle
  previously flipped a flag nothing consumed
- **Scene camera moves** - a `SceneCameraPanel` in the storyboard inspector adds,
  selects, retimes, and deletes `Scene.camera` keyframes through the existing
  camera editor. Playback already badged a scene "CAM", but nothing could
  author one
- **Launchpad workspace** - the Launchpad centre view is now a real entry
  surface: quick actions into Generate/Quick/Batch/Storyboard, the most recent
  renders (click to open in the viewer), and the project list. It previously
  rendered the word "Launchpad"
- **Character-to-scene assignment** - character cards assign and unassign on the
  active scene and reflect selection; they were inert with `isSelected={false}`
- **Collection cards** - real asset thumbnails (cover asset first), working
  activation, and the query terms a smart collection matches on. The Tagged and
  Untagged filters now filter
- **Palette guard test** - `carbon-pro-palette.test.ts` fails on any stock
  Tailwind hue class in `src/`, so single-accent discipline cannot drift again

### Fixed
- **Iteration tree could corrupt itself** - "Fork" passed the node's own job, so
  the node became its own parent *and* its own child, producing a cycle that
  made the tree unwalkable. `addIteration` now rejects a self-parent and a
  parent id that names no node
- **Fork and re-roll fabricated renders** - both minted a tree node carrying the
  previous render's thumbnail without generating anything. They now load the
  iteration's real settings into the generator (fork keeps the seed, re-roll
  releases it) and record the node as the parent of whatever renders next
- **Iteration lineage was never recorded** - completed jobs were always attached
  as roots, so branches and settings diffs could never appear
- **Onion skin ghosted empty frames** - a frame slot with no image rendered
  `<img src="">`, which draws nothing and makes the browser re-request the
  current document. Blank slots are now skipped
- **Filmstrip reported a fixed 100ms** under every frame regardless of the real
  keyframe spacing; durations are now measured gaps
- **Analyze control did nothing** - it called `analyzeAssets([])` and disabled
  itself whenever the queue was non-empty. It now reports and drains the real
  untagged count, and explains itself when tagging is off
- **Dead interactions announced as controls** - collection cards
  (`role="button"`), character cards, and pipeline step dots all carried
  accessible names and pressed state while doing nothing. Each is now wired, and
  the pipeline dots degrade to plain status indicators when no handler is passed
- **Design-system colour drift** - 54 stock Tailwind palette classes across six
  files moved onto Carbon Pro tokens: region-lock and prompt-syntax states onto
  `--color-status-*`, category badges onto surface depth, theme swatches onto
  literal preview values

### Removed
- `CollectionsPanel.tsx` - a divergent duplicate of the mounted `CollectionsPage`
- `ScenePlaybackStrip.tsx` - superseded by the store-integrated `StoryboardPlayback`
- `hostedControlAssets.ts` - built for hosted ControlNet/inpaint, then superseded
  by the authoritative decision to reject those passes (HuggingFace documents no
  such contract)

### Changed
- `MonoLabel` forwards an `id`, so a region can name itself via `aria-labelledby`
- `FrameFilmstrip` takes `addLabel`/`addDisabled`/`addTitle`, so a host can name
  and gate its add control instead of always saying "Add frame"
- The backend no longer carries its own version literal. It had drifted two
  releases behind, reporting `3.1.1` from a 3.2.0 install in its OpenAPI spec, on
  its root endpoint, and in the User-Agent it sent to Hugging Face and CivitAI.
  Electron now passes `app.getVersion()` down when it spawns the process, and
  `backend/version.py` resolves that single number

### Security
- **All 19 known dependency advisories cleared.** Seven in the shipped tree,
  including an `electron-updater` flaw that leaked `PRIVATE-TOKEN` and
  `Authorization` credentials across a cross-origin redirect
  ([GHSA-p2f4-r6v6-j797](https://github.com/advisories/GHSA-p2f4-r6v6-j797)), and
  twelve in the build toolchain - a `node-tar` chain under electron-builder 25
  carrying path-traversal, symlink-poisoning and DoS advisories
  ([GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v),
  [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), and
  others). `npm audit` and `npm audit --omit=dev` both report zero
- **Installers now carry Vision Studio's own MIT notice.** `LICENSE` was never
  packaged, and `THIRD-PARTY-LICENSES.md` - the one licence document inside an
  installer - pointed readers at a `LICENSE.txt` that was not there either. MIT
  requires the notice to travel with every copy
- `scripts/build-windows.cjs` no longer synthesises licence text. It used to
  write its own `LICENSE.txt` when one was absent, naming the wrong copyright
  holder and stopping short of the entire liability limitation
- Published a security policy ([`SECURITY.md`](SECURITY.md)) with private
  reporting, disclosure timelines, an explicit scope, and safe harbour

### Build
- **electron-builder 25 -> 26.** The major moved every signtool option under
  `win.signtoolOptions`; `tests/packaging-schema.test.ts` now validates both
  packaging configs against the installed electron-builder schema, so a removed
  option fails as a unit test instead of aborting a 40-minute CI package run
- `verify-release-signing.cjs` mirrors the publisher name into the Azure signing
  block, read back from `electron-builder.yml`. app-builder-lib ignores
  `signtoolOptions` entirely when Azure signing is active, which would have left
  update-signature verification resolving against no publisher name at all

## [3.2.0] - 2026-07-18

Feature + design release on top of 3.1.1. Real canvas text layers in the Edit
workspace, the workflow LoRA Loader node wired to the installed-LoRA library,
the hosted HuggingFace LoRA slice, and full Carbon Pro design conformance.
Additive - no known breaking changes.

### Added
- **Canvas text layers (Edit workspace)** - the Text panel now drives the real
  layer model end to end: add, edit, and delete text layers with live styling
  (font, size, weight, color, shadow, stroke, blend mode, opacity), rendered on
  the canvas via Konva with click-to-select and drag/transform persistence. A
  single shared selection keeps the canvas, layer list, and Text panel in
  agreement, and every mutation records a history entry. The font list
  (`src/features/edit/textLayers.ts`) offers only the bundled IBM Plex families
  plus OS-safe stacks, so a layer can never silently fall back to a missing
  pre-Plex font
- **Workflow LoRA Loader node** - the graph's LoraLoader is now first-class: a
  node-inspector LoRA picker fed from the installed-LoRA library (incompatible
  entries shown but disabled), a model-strength control, and ComfyUI-faithful
  defaults so graphs export cleanly. The sampler's model input walks
  checkpoint -> LoraLoader chains (cycle-guarded) and validates each selection
  with per-node issues (missing, unknown, incompatible base architecture, or
  invalid strength)
- **Hosted HuggingFace LoRA** - a flux-family Hub-hosted LoRA at full weight now
  dispatches through HuggingFace adapter-by-model-id via the official
  `@huggingface/inference` client, which resolves the live provider mapping
  (fal-ai / replicate / wavespeed) and per-provider payload. Combinations
  outside that verified contract decline with the specific unmet condition
  instead of a blanket prompt-only message

### Changed
- **Carbon Pro design conformance** - the app now fully matches the Carbon Pro
  design language:
  - Removed the runtime Google Fonts CDN (IBM Plex is bundled locally, so the
    load was dead weight) and tightened the CSP `style-src`/`font-src` to
    `'self'`, restoring the zero-CDN, offline-first guarantee
  - Aligned the right-rail History dock header with its Gallery and Boards
    siblings (faceplate-stripe strip + chrome mono label) so the three docks
    read as one unit

### Fixed
- The chrome **Generate** call-to-action label is now legible in the light
  theme: it was pinned to a token the light theme remaps to near-white,
  rendering the engraving at ~1.03:1 on the theme-independent metal cap. It is
  now pinned dark in both themes
- Error surfaces lead with friendly copy and tuck the raw exception behind a
  collapsed "Technical details" disclosure (the generic ErrorBoundary and the
  run-readiness PreflightFooter), instead of showing a raw JS exception string
  as the headline
- Removed a stale, hardcoded `<html class="dark">` that never tracked theme
  changes; `data-theme` is now the single source of truth for theming
- Hosted still-image routes now refuse a LoRA-bearing job that fails the hosted
  contract outright, instead of silently dropping the adapter and generating a
  prompt-only image

## [3.1.1] - 2026-06-27

Security hardening patch on top of 3.1.0, from an independent review of the
release. Additive and behavior-preserving for normal use.

### Security
- The allow-list for opening, revealing, and exporting files is now scoped to the
  standard user content directories (Desktop, Documents, Downloads, Pictures,
  Videos) instead of the entire home folder. Including `home` had widened
  acceptance to the whole user profile (AppData, dotfiles, Startup), letting a
  renderer-supplied path reach sensitive locations through the OS shell
- `app:open-path` now refuses to launch executable and script file types, so the
  in-app "Open" action can never run a program even from an allowed directory

### Fixed
- External-backend mode (`VISION_STUDIO_BACKEND_EXTERNAL`) now logs a clear
  startup warning when no shared `VISION_STUDIO_BACKEND_AUTH_TOKEN` is set:
  previously the app and a manually-started backend generated mismatched tokens,
  so authenticated requests failed with HTTP 403 and the backend appeared
  disconnected. The shared-token requirement is now documented in the
  architecture reference

## [3.1.0] - 2026-06-20

Hardening + feature-consolidation release on top of the public 3.0.0. Folds the
M6-M9 work into a coherent, documented, shippable build. Additive only - no known
breaking changes.

### Added
- **Provider Routing Fabric (M6)** - local-first generation plus optional OpenRouter BYOK; per-account routing of prompt tools and still images, hosted image/video/ControlNet/inpaint providers, and over-budget fallback
- **AI Director + RAG Context (M7)** - retrieval-augmented prompt assistance grounded in project context
- **ComfyUI Interop Deepening (M8)** - import and run ComfyUI API-format graphs in the workbench
- **Accelerator + Inference Enhancement (M9)** - per-optimization Performance panel (SDPA, channels-last, torch.compile, quantization, attention slicing) tuned to your GPU, with an honest applied/skipped/fell-back readout
- **TensorRT engine path (M10)** - opt-in `torch_tensorrt` engine build/cache, auto-off until hardware-verified (see `docs/TENSORRT_VERIFICATION.md`)
- `THIRD-PARTY-NOTICES.md` and a license-compatibility scan

### Changed
- Attention slicing is now derived from VRAM headroom instead of always-on, removing a per-generation slowdown when the model fits with room to spare
- Documentation refreshed across the user guide, build docs, and README for the M6-M9 surface

### Fixed
- Acceleration optimizations are best-effort and never fail a generation; failures fall back to eager and are surfaced honestly in the Performance panel
- Local (non-ComfyUI) image generation crashed on its first denoising step on Python 3.12 - the progress callback captured the event loop from a worker thread; it now schedules onto the main loop thread-safely
- ControlNet/LoRA load failures no longer masquerade as success and emit placeholder images as a 200 OK; a real failure now surfaces an error
- Changing Performance-panel acceleration settings is honored on a re-load of an already-cached model instead of silently reusing the first load's settings
- The local backend now fails closed when no auth token is configured (a bare `python main.py` gets a generated token) instead of leaving non-exempt routes unauthenticated
- Imported ComfyUI graphs are bounded by node count and numeric input ranges to prevent resource exhaustion on the connected server
- The over-budget fallback dialog now traps focus so keyboard and screen-reader users can reach its actions; the AI Director provenance no longer goes stale while the Prompt Studio panel stays mounted

## [3.0.0] - 2026-05-30

First public release. Vision Studio-X is now open source under the MIT license,
with the full source available at https://github.com/Git-Rocky-Stack/vision-studio.
No application code changed at 3.0.0 - the release commit touched only packaging
and metadata - so what became public here is the codebase as it stood at 2.5.0.
Every entry below this one is pre-public development history, kept for lineage.

### Added
- Public, MIT-licensed source release of the full application (Electron 33 + React 19 + Python FastAPI/PyTorch)

### Changed
- Renamed project to Vision Studio-X
- Pointed repository, homepage, and installer metadata at the public GitHub repository

## [2.5.0] - 2026-04-23

### Added
- Canvas-native control layers with reusable inspector, rail, mask editing, and generation/timeline payload resolution
- Script-to-storyboard import pipeline with parsed drafts, review flow, merged Elements, and scene-linked continuity metadata
- Storyboard-to-timeline derivation that creates or reuses project sequences, derives one clip per approved scene, and preserves beat markers and reference context

### Changed
- Timeline side columns can now be collapsed to reveal the full strip, and timeline action button typography now matches the rest of the shell
- ControlNet panel icon styling now uses the same neutral chrome treatment as the rest of the app

## [2.4.0] - 2026-04-23

### Added
- Real timeline playback preview driven by the shared sequence composition resolver
- Silent local MP4 export pipeline with backend encoding and progress tracking
- Timeline export dialog with active-range summary, success/failure state, and open/reveal actions
- First-class video review and edit round-trip improvements across timeline, viewer, canvas, and clip inspector

### Changed
- Timeline editing now behaves like a real clip workflow with playback, range-aware transport, and export entry points in the shell
- Exported files can now be opened or revealed directly even when saved outside managed output roots

## [2.3.0] - 2026-04-21

### Added
- **Enhanced Timeline** with three modes: Storyboard, Animation, and Canvas
  - Storyboard mode: Scene playback and transitions
  - Animation mode: Frame filmstrip and keyframe diamonds
  - Canvas mode: Keyframe markers and integration tests
  - Onion skin overlay compositor
- **Refinement Pipeline** with visual builder
  - 6 built-in pipeline presets (`src/store/slices/pipelineSlice.ts`)
  - Visual PipelineBuilder with node palette, configuration panel, and preview
  - Refine context menu for quick access
  - Pipelines sub-mode in Workflows tab
- **Pipeline Types & Store**: Complete types system and Zustand slice with 8 actions
- **Main Process Services**: Enhanced guide schema and service architecture

### Fixed
- Replaced non-existent Pipeline icon with Workflow icon from lucide-react
- Wired EditPropertiesPanel TODO for pipeline configuration

### Changed
- Complete dockview layout migration with 6 consolidated tabs
- 26 style presets in 7 collapsible categories (was 9 flat presets)

## [2.2.0] - Previous Release

### Added
- Initial dockview layout foundation
- Three-panel layout architecture
