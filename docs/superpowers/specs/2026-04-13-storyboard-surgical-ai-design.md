# Vision Studio Phase 1: Storyboard & Surgical AI — Design Spec

**Date:** 2026-04-13
**Author:** Claude (Elite Partner) + Rocky Elsalaymeh
**Status:** Approved for implementation planning
**Approach:** C — Scene-First Redesign

---

## Overview

Vision Studio Phase 1 transforms the app from a single-image generation tool into a **scene-first narrative workspace** with **surgical AI editing precision**. This addresses two critical competitive gaps:

1. **Narrative workflow** — LTX Studio's core differentiator is storyboard-based scene planning with character consistency. Vision Studio needs scene-based project structure, character references, and playback preview.
2. **Surgical editing** — The #1 user pain point across all AI image tools is lack of precision. Changing one element causes unintended collateral changes. Region-locked AI editing on a layer-aware canvas solves this.

**Target user:** Creative professionals (designers, illustrators, photographers) who need AI as part of a real production workflow.

**Business model:** One-time purchase desktop app competing against free tools (ComfyUI, Automatic1111) on professional UX, surgical precision, and narrative workflow.

---

## Data Model

### Project (new top-level container)

```
Project {
  id: string (uuid)
  name: string
  created: ISO 8601 timestamp
  modified: ISO 8601 timestamp
  dimensions: { width: number, height: number }
  fps: number (default: 24)
  characters: CharacterRef[]
  scenes: Scene[]
  metadata: Record<string, unknown>
}
```

A project holds scenes, characters, and settings. Users can have multiple projects. The existing flat asset list becomes a special "My Library" project.

### Scene (replaces current "generation result")

```
Scene {
  id: string (uuid)
  orderIndex: number
  name: string
  prompt: string
  negativePrompt: string
  generationConfig: GenerationConfig
  referenceImages: ReferenceImage[]
  frames: Frame[]
  regionLocks: RegionLock[]
  transitions: { type: TransitionType, duration: number }
  camera: CameraKeyframe[]  // Phase 2 placeholder
  metadata: {
    created: ISO 8601
    modified: ISO 8601
    duration: number (ms, for video)
    fps: number
    notes: string
  }
}

TransitionType = "cut" | "fade" | "dissolve" | "wipe-left" | "wipe-right" | "zoom"

GenerationConfig {
  model: string
  steps: number (1-100, default 25)
  cfgScale: number (1-30, default 7.5)
  scheduler: string
  seed: number (-1 for random)
  width: number
  height: number
  clipSkip: number
  lora: LoRAConfig[]
  controlNet: ControlNetConfig[]
}
```

Every generation creates a scene. Scenes are the atomic unit of work. Images become single-frame scenes; videos become multi-frame scenes.

### Frame (single visual output)

```
Frame {
  id: string (uuid)
  sceneId: string
  layers: Layer[]
  dimensions: { width: number, height: number }
  duration: number (ms, for video frames)
  renderOutput: {
    path: string
    format: string
    dimensions: { width: number, height: number }
  }
}
```

A scene has 1 frame (image) or N frames (video). This unifies image and video under one model and enables frame-level editing.

### CharacterRef (persistent character reference)

```
CharacterRef {
  id: string (uuid)
  projectId: string
  name: string
  description: string
  faceImages: string[] (file paths, 1-5 required)
  bodyImages: string[] (optional)
  styleImages: string[] (optional)
  lockedFeatures: ("face" | "body" | "style" | "pose")[]
  consistencyStrength: number (0.0-1.0, default 0.85)
  color: string (hex, for UI identification)
}
```

Characters live at the project level and can be referenced by any scene. Face images are required; body and style are optional. The `lockedFeatures` array controls which aspects the AI preserves. The `consistencyStrength` slider controls adherence (0.0 = ignore refs, 1.0 = strict match).

### RegionLock (surgical editing constraint)

```
RegionLock {
  id: string (uuid)
  sceneId: string
  frameId: string
  name: string
  mask: {
    type: "rectangle" | "polygon" | "brush"
    points: Point[]
    bounds: BoundingBox
    featherRadius: number (0-20px, default 2)
    blendEdges: boolean (default true)
  }
  targetLayers: string[] (layer IDs to modify)
  protectedLayers: string[] (layer IDs to preserve)
  generationConfig: Partial<GenerationConfig> (overrides scene-level)
  aiTool: "generative-fill" | "style-transfer" | "upscale" | "remove"
  prompt: string (for generative-fill and style-transfer)
  strength: number (0.0-1.0, default 0.85)
  invertMask: boolean (default false)
}
```

Region locks are attached to frames. When active, AI operations only modify pixels within the mask on the target layers. Protected layers are never touched. Masks persist on the frame so users can re-generate without redrawing.

---

## UI Architecture

### Layout Restructure

The current panel-based workspace (Generate, Edit, Assets, Settings sidebar icons) restructures around scenes:

**Left panel → Storyboard**
- Ordered scene list with thumbnails, titles, status badges, character refs
- Character reference library below scenes (circular avatars, color-coded)
- "Add Scene" button (from prompt, from template, duplicate existing)
- Drag-to-reorder scenes
- Transition indicators between scenes (arrows showing type)

**Center → Canvas (scene-aware)**
- Shows current scene with all layers
- Region lock overlay (green dashed boundary when active)
- Layer lock indicators on canvas (lock icons on protected layers)
- Scene name in top-left corner
- Region tool strip (Rect, Lasso, Brush, Erase) when region mode active

**Bottom → Timeline (upgraded)**
- Scene playback strip with thumbnails
- Drag-to-reorder scenes in timeline
- Transition indicators between scenes
- Playback button to preview full sequence
- Scene duration indicators

**Right panel → Scene Properties**
- Scene-level generation config
- Layer panel (with region-lock indicators on targeted layers)
- AI tools section
- Transition settings
- Region lock properties (when region selected)

### Sidebar Icons

| Icon | Label | Mode |
|------|-------|------|
| Current Generate icon | "Quick" | Quick Generate — single image, no project overhead |
| New icon | "Storyboard" | Full scene-first project workflow |
| Current Edit icon | "Edit" | Canvas editing (unchanged) |
| Current Assets icon | "Assets" | Asset library (filtered by project) |
| Current Settings icon | "Settings" | Settings (unchanged) |

---

## Storyboard View

### Scene Cards

Each scene in the storyboard displays:
- Thumbnail preview (auto-generated, refreshes on generation)
- Scene name (editable inline on double-click)
- Prompt preview (truncated, full text on hover)
- Status badge: `draft` | `queued` | `generating` | `complete` | `error`
- Character reference count (e.g., "1 ref", "2 refs")
- Active state indicator (left border accent color)

### Scene Creation Flows

1. **From Prompt** — Click "+" → type prompt → scene appears as draft → generate → thumbnail updates
2. **From Template** — Click "+" → pick template (YouTube intro, product shot, etc.) → pre-configured scene added
3. **Duplicate** — Right-click scene → duplicate → inherits prompt, config, character refs → tweak and regenerate

### Scene States & Transitions

- **draft** — Created but not yet generated. Gray indicator.
- **queued** — Submitted to generation queue. Yellow indicator.
- **generating** — Actively being generated. Yellow pulsing indicator with progress bar.
- **complete** — Successfully generated. Green indicator.
- **error** — Generation failed. Red indicator with retry button.

**Inter-scene transitions:** cut (instant, default), fade (0-2s configurable), dissolve, wipe-left, wipe-right, zoom. Click the arrow between scenes to change type. Duration shown below the arrow.

### Scene Interactions

- **Drag-to-reorder** — Grab any scene card and drag to reorder. Transitions auto-adjust.
- **Right-click context menu** — Duplicate, delete, regenerate, change transition, assign character, export scene, set as thumbnail, move up/down
- **Multi-select batch operations** — Shift+click to select multiple scenes → batch regenerate, batch export, assign character to all, delete all
- **Inline quick-edit** — Double-click scene prompt to edit inline without switching to properties panel

---

## Region-Locked AI Editing

### Workflow

1. **Select** — Choose region tool (rect, lasso, brush) and draw mask on canvas
2. **Configure** — Set prompt, choose AI tool, adjust strength and feather. Mask overlays in green.
3. **Generate** — AI fills only the masked region. Surrounding pixels untouched.
4. **Refine** — Adjust mask, re-generate, or commit. Region becomes a layer.

### Mask Types

- **Rectangle** — Click-drag to define rectangular region
- **Lasso** — Freehand polygon selection
- **Brush** — Paint mask with adjustable radius (1-100px)
- **Eraser** — Subtract from existing mask
- **Invert** — Flip mask to protect the opposite region

### Layer-Aware Locking

Each layer can be independently locked or targeted:
- **Locked layers** (face, background) — AI never modifies these. Shown with lock indicator on canvas and in properties panel.
- **Target layers** (shirt region) — AI only modifies these within the mask boundary.
- Users explicitly choose which layers to lock vs. target before generating.

### Edge Blending & Feathering

- Adjustable feather radius (0-20px) for seamless blending at mask boundaries
- Blend edges toggle ensures generated content merges naturally with surrounding pixels
- Inpaint model selection (SD Inpaint default, others available)

### Persistent Masks

- Region locks persist on the frame — come back later and the mask is still there
- Re-generate with different prompts without redrawing the mask
- Name masks for reference (e.g., "shirt region", "sky replacement")
- Multiple masks per frame supported (with conflict warnings for overlapping masks)

### Region Lock Properties Panel

When a region lock is selected, the right panel shows:
- Prompt input for the region
- AI tool selector (Generative Fill, Style Transfer, Upscale, Remove)
- Protected layers list with lock/target indicators
- Generation settings (strength, feather, inpaint model, blend edges)
- Generate and Clear buttons

---

## Character Reference Library

### Purpose

Character references solve cross-scene consistency. Without them, AI produces different faces across scenes. With them, the same character appears identically every time.

### Character Reference Card

Each character shows:
- Reference image grid (1-5 face images required, body/style optional)
- Name and description
- Feature lock toggles (face, body, style, pose)
- Consistency strength slider (0.0-1.0)
- "Used in scenes" indicator showing which scenes reference this character

### Character Assignment to Scenes

- Scene cards display character chips (color-coded, showing locked features)
- "Add character" button per scene
- Drag characters to reorder priority within a scene (first character gets stronger consistency weight)
- Click character chip to toggle feature locks per-scene
- Removing a character from a scene preserves the scene data but removes the consistency constraint

### Backend Integration

Character reference images are passed to the generation backend as:
- ControlNet reference images (for face/body locking)
- IP-Adapter inputs (for style/pose consistency)
- The `consistencyStrength` maps to ControlNet conditioning scale and IP-Adapter scale

---

## Quick Generate Mode

Quick Generate preserves the existing fast single-image workflow without project overhead:

- Click "Quick" sidebar icon → simplified generation view (current Generate panel)
- Prompt → generate → result. No project, no storyboard, no scene management.
- Behind the scenes, Quick Generate creates a Scene object (single-frame, auto-assigned to "Quick Captures" project)
- Users can later promote a quick capture into a storyboard by dragging it from "Quick Captures" into any project
- Data model is unified — the scene-first model is always underneath, but Quick Generate lets users interact at a simpler level

**Key principle:** Progressive disclosure, not forced complexity.

---

## Migration Strategy

On first launch after the update:

1. **Automatic migration** runs in the background
2. All existing assets convert to single-frame Scenes in a "My Library" project
3. Generation configs, prompts, seeds, and model data are preserved 1:1
4. The existing flat asset grid view becomes available as a filter within "My Library"
5. No data loss — every existing generation is accounted for
6. Migration progress shown in a non-blocking overlay
7. "Quick Captures" project is created for future single-image generations
8. Video assets (multiple frames) become multi-frame scenes with all frames preserved as layer groups within a single Frame object

---

## Error Handling & Edge Cases

### Scene Generation Failures

- Failed scenes show error badge + retry button in storyboard
- Retry uses the same prompt/config (no re-entry needed)
- Partial video generation (some frames fail) marks scene as "partial" with retry option
- Network/GPU errors show contextual messages with suggested fixes (check GPU memory, reduce dimensions, try different model)

### Character Consistency Conflicts

- Deleted reference image → scenes using it show "broken ref" warning with re-link option
- Re-linking a ref image restores consistency across all scenes that reference that character
- Two characters with locked face features in same scene → warn about potential blending conflicts, offer options (reduce strength on one, unlock features, proceed anyway)

### Region Lock Edge Cases

- Region mask on a deleted layer → mask auto-transfers to remaining layers with notification
- Region mask extends beyond canvas bounds → auto-clipped with subtle warning
- Multiple overlapping region locks on same frame → warn about conflicting edits, offer merge or sequential apply
- Zero-area mask (accidental click) → show helpful tooltip: "Draw a larger area to create a region"

### Project Recovery

- Auto-save every 30 seconds (leveraging existing Zustand persist middleware)
- Project file corruption → offer recovery from last auto-save
- Scene-level undo/redo (100 entries, existing pattern) plus project-level undo for structural changes (reorder, delete, merge scenes)
- Unsaved changes warning on project close or app quit

---

## Backend API Changes

### New Endpoints

```
POST   /api/v1/projects                    — Create project
GET    /api/v1/projects                    — List projects
GET    /api/v1/projects/{id}              — Get project with scenes
PUT    /api/v1/projects/{id}              — Update project
DELETE /api/v1/projects/{id}              — Delete project

POST   /api/v1/projects/{id}/scenes       — Add scene to project
PUT    /api/v1/projects/{id}/scenes/{sid} — Update scene
DELETE /api/v1/projects/{id}/scenes/{sid} — Delete scene
PUT    /api/v1/projects/{id}/scenes/reorder — Reorder scenes

POST   /api/v1/projects/{id}/characters        — Add character ref
PUT    /api/v1/projects/{id}/characters/{cid}  — Update character ref
DELETE /api/v1/projects/{id}/characters/{cid}  — Delete character ref

POST   /api/v1/scenes/{id}/generate         — Generate scene (respects region locks)
POST   /api/v1/scenes/{id}/region-generate  — Generate within region lock only
POST   /api/v1/scenes/{id}/retry             — Retry failed generation
```

### Modified Endpoints

```
POST /api/generate/image  — Now creates a Scene object, returns scene ID
POST /api/generate/video  — Now creates a Scene object, returns scene ID
```

### WebSocket Updates

Job progress events extended with:
- `scene_id` field (links progress to storyboard scene)
- `region_lock_id` field (when generating within a region)
- `character_ref_ids` field (which characters were used for consistency)

---

## Store Changes

### New Zustand Store Slices

```typescript
// Added to appStore.ts
interface ProjectSlice {
  projects: Project[]
  activeProjectId: string | null
  activeSceneId: string | null
  
  // Project actions
  createProject: (name: string) => Project
  deleteProject: (id: string) => void
  setActiveProject: (id: string) => void
  
  // Scene actions
  addScene: (projectId: string, config?: Partial<Scene>) => Scene
  deleteScene: (projectId: string, sceneId: string) => void
  reorderScenes: (projectId: string, sceneIds: string[]) => void
  duplicateScene: (projectId: string, sceneId: string) => Scene
  setActiveScene: (id: string) => void
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void
  
  // Character actions
  addCharacter: (projectId: string, char: Partial<CharacterRef>) => CharacterRef
  updateCharacter: (projectId: string, charId: string, updates: Partial<CharacterRef>) => void
  deleteCharacter: (projectId: string, charId: string) => void
  assignCharacterToScene: (projectId: string, sceneId: string, charId: string, features: string[]) => void
  removeCharacterFromScene: (projectId: string, sceneId: string, charId: string) => void
  
  // Region lock actions
  createRegionLock: (sceneId: string, frameId: string, config: Partial<RegionLock>) => RegionLock
  updateRegionLock: (sceneId: string, lockId: string, updates: Partial<RegionLock>) => void
  deleteRegionLock: (sceneId: string, lockId: string) => void
  
  // Quick Generate
  quickGenerate: (config: GenerationConfig) => void
  promoteToProject: (sceneId: string, projectId: string) => void
}
```

### Migration Slice

```typescript
interface MigrationSlice {
  migrationStatus: 'idle' | 'running' | 'complete' | 'error'
  migrationProgress: number (0-100)
  runMigration: () => Promise<void>
}
```

---

## Component Inventory

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `StoryboardPanel` | `src/components/storyboard/` | Left panel scene list + character library |
| `SceneCard` | `src/components/storyboard/` | Individual scene in storyboard |
| `SceneCardList` | `src/components/storyboard/` | Virtual-scrolled scene list |
| `TransitionIndicator` | `src/components/storyboard/` | Arrow between scenes showing transition type |
| `CharacterLibrary` | `src/components/storyboard/` | Character reference cards below scene list |
| `CharacterRefCard` | `src/components/storyboard/` | Single character reference |
| `CharacterAssignmentChip` | `src/components/storyboard/` | Character badge on scene cards |
| `ScenePlaybackStrip` | `src/components/canvas/` | Timeline with scene thumbnails + playback |
| `RegionLockOverlay` | `src/components/edit/` | Canvas overlay showing active region mask |
| `RegionLockToolbar` | `src/components/edit/` | Tool strip for rect/lasso/brush/erase masks |
| `RegionLockProperties` | `src/components/edit/` | Right panel section for region lock settings |
| `QuickGeneratePanel` | `src/pages/` | Simplified single-image generation (preserves current UX) |
| `ProjectDropdown` | `src/components/layout/` | Project selector in header |

### Modified Components

| Component | Change |
|-----------|--------|
| `WorkspaceLayout` | Restructure panels for scene-first layout |
| `Canvas` | Add region lock overlay, scene name indicator, layer lock badges |
| `Timeline` | Upgrade to scene playback strip with thumbnails |
| `EditPropertiesPanel` | Add region lock properties section |
| `AIToolsPanel` | Region-aware: apply within mask when active |
| `LayerPanel` | Lock/target indicators per layer |
| `Sidebar` | Add Storyboard and Quick icons, relabel Generate → Quick |
| `Header` | Add project selector dropdown |

---

## Phasing Within Phase 1

This design represents Phase 1 in full. For implementation planning, it breaks into sub-phases:

**Phase 1A — Data Model & Storyboard Shell**
- Project/Scene/Frame/CharacterRef types
- Zustand store slices
- Backend API endpoints for projects, scenes, characters
- StoryboardPanel, SceneCard, CharacterLibrary UI
- Migration logic

**Phase 1B — Region-Locked AI Editing**
- RegionLock type and store
- Canvas overlay (mask drawing, feather, invert)
- RegionLockToolbar, RegionLockProperties
- Backend region-generate endpoint
- Layer-aware generation integration

**Phase 1C — Scene Playback & Transitions**
- ScenePlaybackStrip
- Transition types (cut, fade, dissolve, wipe, zoom)
- Playback preview
- Scene interactions (drag-reorder, multi-select, inline edit)

**Phase 1D — Quick Generate & Migration**
- QuickGeneratePanel (simplified current UX)
- Asset migration logic
- "My Library" and "Quick Captures" projects
- Promote-to-project workflow

---

## Success Criteria

- Users can create a project, add scenes, assign characters, and generate with cross-scene consistency
- Region-locked AI editing generates only within the masked area while preserving all protected layers
- Scene playback shows the full sequence with transitions
- Quick Generate provides the same speed as the current workflow
- All existing assets migrate to "My Library" project with zero data loss
- Character references produce consistent faces across 3+ scenes with >85% visual similarity
- Region locks produce zero unintended modifications outside the mask boundary