# Changelog

All notable changes to Vision Studio will be documented in this file.

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
