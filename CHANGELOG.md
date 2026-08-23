# Changelog

All notable changes to Vision Studio will be documented in this file.

## [Unreleased]

Codebase audit release: five shipped-but-hollow features made real, three dead
modules removed, and the whole class of design-system colour drift closed off
with a guard test. Additive - no known breaking changes.

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
  agreement, and every mutation records a history entry. The font list offers
  only the bundled IBM Plex families plus OS-safe stacks, so a layer can never
  silently fall back to a missing pre-Plex font
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

### Added
- Public, MIT-licensed source release of the full application (Electron 33 + React 19 + Python FastAPI/PyTorch)

### Changed
- Renamed project to Vision Studio-X
- Pointed repository, homepage, and installer metadata at the public GitHub repository

This release includes every feature developed through 2.5.0 (detailed below).

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
  - 6 built-in pipeline presets
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
