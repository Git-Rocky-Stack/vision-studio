# Changelog

All notable changes to Vision Studio will be documented in this file.

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
