# Vision Studio Panel Redesign: Dark Cinema Edition

**Date:** 2026-02-23
**Scope:** Generate Panel, Edit Panel, Batch Panel, Templates Panel
**Approach:** Contextual Workspace Modes (Approach 2)
**Priority:** Equal across all four panels
**Type:** UX + Functionality + Aesthetic overhaul

---

## 1. Design System & Aesthetic Foundation

### Concept: "Dark Cinema"

The interface evokes a cinematic creative studio -- deep rich blacks with dramatic lighting effects, volumetric red glows, and atmospheric textures. Every surface breathes with subtle animation. The existing charcoal/red identity is preserved but amplified to maximum cinematic intensity.

### Color Architecture

Three-tier black depth system with blue-cool undertones:

| Token | Value | Usage |
|---|---|---|
| `--color-void` | `#050507` | Deepest background, canvas area |
| `--color-canvas` | `#0c0c0e` | Canvas surface |
| `--color-surface` | `#141416` | Panel backgrounds |
| `--color-elevated` | `#1c1c1f` | Cards, dropdowns, overlays |
| `--color-red-primary` | `#e63946` | Primary accent, CTAs |
| `--color-red-highlight` | `#ff6b6b` | Glow, hover highlights |
| `--color-red-pressed` | `#c1121f` | Pressed/active states |
| `--color-red-glow` | `rgba(230, 57, 70, 0.3)` | Box-shadow glow |
| `--color-red-aura` | `rgba(230, 57, 70, 0.08)` | Background tint near active elements |
| `--color-text-primary` | `#fafafa` | Headings, primary text |
| `--color-text-body` | `#94949c` | Body text |
| `--color-text-muted` | `#5a5a64` | Muted, disabled text |
| `--color-border` | `rgba(255,255,255,0.06)` | Ultra-subtle borders |
| `--color-border-hover` | `rgba(255,255,255,0.12)` | Hover state borders |

### Typography

Replace Inter with cinematic pairing:

- **Display/Headings:** Instrument Sans (condensed weights for labels, bold for headings)
- **Body:** DM Sans (clean, excellent readability at small sizes)
- **Monospace/Data:** JetBrains Mono (numerical values, seeds, timestamps)

Type scale uses tighter letter-spacing for headings, uppercase tracking for labels, tabular figures for numbers.

### Signature Visual Elements

- **Volumetric light bleed:** Red accent bleeds atmospheric light into surrounding dark surfaces via stacked box-shadows with large spread radii. CTAs have a warm luminance like a projector beam.
- **Animated noise grain:** Subtle animated film grain texture (2-3% opacity) drifting/flickering across surfaces. Living, breathing quality.
- **Ambient particles:** Tiny floating light particles drift slowly across the canvas area, like dust in a projector beam.
- **Depth-of-field blur:** Inactive/background elements receive subtle blur, focusing attention on the active workspace.
- **Color temperature zones:** Warm zones near active elements/CTAs, cool zones in inactive areas.
- **Glass panels:** Panels use `backdrop-filter: blur(20px)` with semi-transparent backgrounds.
- **Dramatic shadows:** Multi-layered box-shadows with warm undertones create floating depth.
- **Cinematic transitions:** Panel switches fade through black momentarily, like a film cut.
- **Red glow aura:** Active/generating states emit a warm pulsing red glow.

---

## 2. Workspace Architecture: Contextual Modes

The core architectural change: the workspace layout transforms based on the active panel. The sidebar navigation remains constant as the anchor. Everything else adapts.

### Mode Layouts

**Generate Mode:**
- Left: Sidebar
- Center: Full canvas (live preview, generation progress, queue thumbnails)
- Right: Generate panel (400px)

**Edit Mode:**
- Left: Sidebar
- Second-left: Vertical tool strip (56px)
- Center: Interactive canvas with transform/crop handles
- Right: Properties/adjustments panel (360px)

**Batch Mode:**
- Left: Sidebar
- Left panel (420px): Prompt queue and management
- Right/Center: Results gallery grid

**Templates Mode:**
- Left: Sidebar
- Full center area: Template browser (full width)

### Transition Behavior

Panel switches use a cinematic crossfade through black (opacity dip to ~0.3 over 150ms, then fade in new layout over 200ms). Layout sections animate to their new positions with spring physics.

---

## 3. Generate Panel Design

### Right Panel Structure (400px, top to bottom)

#### 3.1 Mode Toggle (Image/Video)
- Cinematic toggle with red glow transfer animation
- Active mode has warm underline glow
- Glow slides from one tab to the other on switch

#### 3.2 Prompt Area
- **Main prompt textarea:** 6 rows, subtle inner glow on focus, character count in corner
- **Prompt toolbar** (below textarea, icon button row):
  - Dice: randomize prompt from library
  - Magic wand: AI enhance prompt (backend enrichment)
  - History clock: last 50 prompts, searchable dropdown
  - Heart: saved/favorited prompts
  - Copy: clipboard

- **Negative prompt:** Collapsible section, initially collapsed, smooth expand animation

#### 3.3 Prompt Composition Tools
- **Toggle:** Switch between raw text mode and visual prompt builder
- **Visual builder:** Token chips, draggable to reorder, attention weight per token (click to adjust via popover slider)
- **Syntax highlighting** in raw mode: parentheses/brackets for attention highlighted, color-coded tokens (subject=blue, style=purple, quality=green, negative=red)
- **Token counter:** Live CLIP token count with limit warning (77 for SD, larger for FLUX)

#### 3.4 Style Presets Bar
- Horizontal scrolling row of style chips
- Each chip: tiny color swatch + label
- Presets: Cinematic, Anime, Photorealistic, Oil Painting, Watercolor, 3D Render, Pixel Art, Line Art, Comic Book, Neon, etc.
- Click appends style modifier to prompt
- "+" chip for custom style presets
- Hover: chip glows its associated color

#### 3.5 Reference Image (img2img)
- Collapsed: single "Add Reference Image" button
- Expanded (when image dropped):
  - Reference thumbnail
  - Denoising strength slider (0.0 to 1.0)
  - Mode selector: img2img, inpainting mask, ControlNet

#### 3.6 ControlNet Panel (collapsible)
- Toggle to enable
- Preprocessor selector: Canny Edge, Depth Map, OpenPose, Scribble, Segmentation, Normal Map
- Reference image upload with live preprocessor preview on canvas
- Control strength slider (0.0 to 1.5)
- Start/end step sliders
- When active: canvas shows split view (preprocessor output | generation)

#### 3.7 LoRA Model Mixing
- "Add LoRA" button opens searchable browser
- Active LoRAs as cards: name, trigger word, weight slider (0.0 to 2.0)
- Stack multiple, drag to reorder priority
- Color-coded tags, remove button per card

#### 3.8 Dimensions & Model
- **Aspect ratio buttons:** Visual ratio previews with red gradient fill
- **Model selector:** Custom dropdown with model cards (name, quality badge, VRAM requirement, preview swatch)
- **Resolution display:** Exact pixel dimensions with info icon

#### 3.9 Advanced Settings (expandable)
- Sampling steps slider (glow track)
- CFG Scale slider
- Seed input with randomize button
- Scheduler dropdown (Euler, DPM++, DDIM, etc.)
- Clip skip selector

#### 3.10 Generate Button
- Full-width, large, warm red glow aura when idle
- Generating state: transforms into progress bar with pulsing glow, shows percentage
- Disabled state when no prompt entered

### Canvas Area -- Generate Mode

- **Idle:** Last generated image, or atmospheric empty state with floating particles and "Create something extraordinary" text
- **Generating:** Real-time preview via WebSocket progressive rendering. Circular progress ring with step count overlays center. Canvas border glows red.
- **Queue strip:** Horizontal strip at bottom of canvas showing recent generation thumbnails. Click to load previous. Hover shows prompt and settings.

### Generation Comparison View
- Toolbar above canvas after generating:
  - **Side-by-side:** Two images with labels
  - **Slider:** Draggable vertical divider between image A and B
  - **Onion skin:** Overlay with opacity slider
  - **Grid:** 2x2 or 3x3 of recent generations
- **Version history:** Collapsible left strip on canvas with chronological thumbnails. Click to swap.

---

## 4. Edit Panel Design

### Layout: Full Editor Mode

- Sidebar (constant)
- Vertical tool strip (56px, second-left)
- Interactive canvas (center)
- Properties panel (360px, right)

### 4.1 Vertical Tool Strip

Icon buttons grouped with subtle dividers:

**Selection & Transform:**
- Move (V)
- Scale/Transform (T)
- Crop (C)
- Rotate (R)

**Paint & Touch-up:**
- Brush (B) -- inpainting masks
- Eraser (E)
- Clone stamp (S)
- Healing brush (H)

**Shape & Text:**
- Text tool (T)
- Shape tool (U) -- rectangles, ellipses, lines
- Pen/path tool (P)

**View:**
- Hand/pan (Space)
- Zoom (Z)
- Eyedropper (I)

Active tool: red left-border glow indicator. Keyboard shortcuts in tooltips.

### 4.2 Interactive Canvas

- Image renders on HTML5 Canvas element
- **Transform handles:** 8 resize handles + rotation handle on bounding box (Move/Scale tool)
- **Crop overlay:** Darkened overlay with crop handles, aspect ratio presets, rule-of-thirds grid option (Crop tool)
- **Inpainting mask:** Semi-transparent red mask painting, "Regenerate Masked Area" button (Brush + Inpaint mode)
- **Text rendering:** Live text cursor placement and font preview (Text tool)
- **Zoom controls:** Fit, pixel-level, percentage in toolbar

### 4.3 Properties Panel (right, context-sensitive)

Changes based on active tool/tab:

**Adjust Tab:**
- Basic: Brightness, Contrast, Saturation, Exposure, Temperature, Tint, Highlights, Shadows, Whites, Blacks (all -100 to +100 or appropriate ranges)
- Effects: Sharpness, Blur, Noise Reduction, Vignette, Grain
- Real-time preview via CSS filters, bake to canvas on confirm
- Reset All + Auto Enhance (AI) buttons

**Filters Tab:**
- Grid of filter thumbnails with live preview on current image
- Categories: Cinematic, Vintage, B&W, Portrait, Landscape, Creative
- Intensity slider (0-100%)
- Stackable filters

**Crop Tab:**
- Aspect ratio presets: Free, 1:1, 16:9, 9:16, 4:3, 3:2, Custom
- Rotation slider (-45 to +45 degrees)
- Flip H/V buttons
- Straighten tool (draw horizontal reference line)
- Crop dimensions in pixels

**Text Tab:**
- Font family dropdown with live preview
- Size, weight, style, alignment
- Color picker with recent colors
- Shadow: toggle + offset/blur/color
- Stroke: toggle + width/color
- Letter spacing, line height, opacity
- Effects: gradient fill, glow, emboss

**AI Tools Tab:**
- **Background Removal:** One-click via rembg/SAM, checkerboard preview, "Replace Background" (text prompt), edge refinement slider
- **AI Upscale:** 2x/4x via Real-ESRGAN/SwinIR, model selector (General/Face/Anime), before/after comparison slider
- **Style Transfer:** From reference image or presets (Van Gogh, Monet, Ukiyo-e, Comic, Watercolor, Pencil Sketch), style strength slider, custom reference upload
- **Generative Fill (Inpainting):** Paint mask, enter prompt, generates seamless content, 4 variants to choose from
- **Face Enhancement:** GFPGAN/CodeFormer, strength slider, eye enhancement, skin smoothing
- **Object Removal:** Brush over object, one-click LaMa inpainting removal
- **AI Expand (Outpainting):** Extend image beyond boundaries in any direction, pixel amount, prompt for expanded area

### 4.4 Layer Panel (bottom of right panel, always visible)

- Layer list: all elements (background image, text layers, shape layers, adjustment layers)
- Drag to reorder
- Per layer: visibility toggle, opacity slider, blend mode dropdown, lock toggle
- New layer / duplicate / delete buttons

### 4.5 Edit Mode Toolbar (top of canvas)

- Undo / Redo with step count
- History panel toggle
- Before/After comparison toggle
- Apply / Discard current edits

---

## 5. Batch Panel Design

### Layout: Split View

- Sidebar (constant)
- Left panel (420px): Prompt queue
- Right/Center: Results gallery grid

### 5.1 Left Panel -- Prompt Queue

**Header:**
- Title with batch count badge
- Import (JSON/CSV/TXT) / Export buttons
- Clear All with confirmation

**Prompt Cards:**
- Drag handle for reorder
- Prompt number badge
- Multi-line textarea
- Per-prompt settings override toggle (expandable: width/height/steps/model/seed)
- Status indicator with colored left border (pending/generating/completed/failed)
- Remove + Duplicate buttons
- Completed prompts show result thumbnail

**Quick Add Tools:**
- Add Prompt button
- Generate Variations (base prompt + N style variations)
- Import from File (JSON/CSV/TXT)
- Generate from Template (apply template to subject list)

**Shared Settings (collapsible bottom):**
- Model, width, height, steps, CFG, seed strategy (random/sequential/fixed)
- Apply to all unless individually overridden

**Batch Controls:**
- Start / Pause / Cancel with progress indicator
- Concurrent Jobs selector (1-4, VRAM-based)
- Estimated completion display

### 5.2 Right Panel -- Results Grid

**Grid Layout:**
- Responsive masonry or uniform grid
- Each cell: thumbnail, prompt snippet, generation time, seed
- Hover: expand with shadow, full prompt tooltip
- Click: full-size preview with metadata
- Multi-select: shift+click or drag-select
- Bulk actions bar (on selection): Delete, Export, Send to Edit, Favorite

**Grid Controls (top bar):**
- View toggle: Grid / List / Large preview
- Sort: Creation time, prompt order, status
- Filter: All / Completed / Failed / Favorites
- Export All (ZIP), Select All / Deselect All

**Full Preview Modal:**
- Large image display
- Left/right navigation arrows
- Metadata panel: full prompt, negative prompt, model, steps, CFG, seed, time, resolution
- Actions: Send to Edit, Delete, Export, Copy Prompt, Regenerate, Upscale

---

## 6. Templates Panel Design

### Layout: Full-Width Gallery

- Sidebar (constant)
- Full center area: Template browser

### 6.1 Template Browser

**Top Bar:**
- Search input with filter icon
- Category tabs: All, YouTube, Social Media, Marketing, Art & Creative, My Templates
- Sort: Popular, Newest, A-Z
- View toggle: Cards / Compact list

**Template Cards (responsive grid, 3-4 columns):**
- **Top 60%:** Large preview area with sample generated image (bundled examples). If no preview, styled gradient placeholder matching aspect ratio.
- **Bottom 40%:** Name (bold), category badge (color-coded), description (2 lines), settings chips (resolution/model/steps), "Use Template" primary button, "Preview" ghost button
- User-created templates: Edit / Delete buttons
- **Hover:** Card lifts with dramatic shadow, preview zooms slightly, red glow border

**Template Preview Modal:**
- Full-screen overlay
- Left: Large sample images (carousel)
- Right: Full settings breakdown, prompt text (copyable), notes
- "Use This Template" primary CTA
- "Customize First" secondary CTA (settings editor before applying)

### 6.2 My Templates

**Create Custom Template Flow:**
1. Name and description
2. Category selection
3. Settings (model, resolution, steps, CFG, seed strategy)
4. Base prompt and negative prompt
5. Optional preview image upload
6. Save (persists via Electron IPC to JSON file + Zustand store)

**Template Sharing:**
- Export as `.vst` JSON file (Vision Studio Template)
- Import `.vst` via drag-and-drop or file picker
- Template file includes settings + optional base64 preview thumbnail

### 6.3 Store Updates for User Templates

Add to Zustand store:
- `userTemplates: ProjectTemplate[]`
- `addUserTemplate(template)`
- `updateUserTemplate(id, updates)`
- `deleteUserTemplate(id)`
- Persist to localStorage and filesystem (via IPC)

---

## 7. Canvas & Timeline Improvements

### Canvas Upgrades (all modes)

- Generation progress visualization: cinematic progress overlay (circular ring, step count, denoising indicator, ETA)
- Layer compositing support for Edit mode
- Smart fit: auto-fit generated images to viewport
- Right-click context menu: Copy, Save as, Send to Edit, Generation info, Open in explorer

### Timeline Improvements

- Connected to real data (actual generated content, not placeholders)
- Drag clips to reorder
- Split/trim clips
- Audio waveform visualization
- Keyframe markers for animation properties
- Minimizable to thin bar when not in use

---

## 8. New Components Required

| Component | Purpose |
|---|---|
| `WorkspaceLayout` | Orchestrates contextual layout switching per mode |
| `PromptComposer` | Visual prompt builder with tokens and weights |
| `PromptHistory` | Searchable prompt history dropdown |
| `StylePresetsBar` | Horizontal scrolling style chip row |
| `ImageDropZone` | Reference image upload area for img2img |
| `ControlNetPanel` | ControlNet configuration sub-panel |
| `LoRAMixer` | LoRA model stacking interface |
| `ModelSelector` | Rich model dropdown with cards |
| `ComparisonView` | Side-by-side / slider / onion skin / grid comparison |
| `GenerationQueue` | Canvas bottom strip with generation thumbnails |
| `ToolStrip` | Vertical tool icon column for Edit mode |
| `InteractiveCanvas` | HTML5 Canvas with transform/crop/mask handles |
| `LayerPanel` | Layer management list with controls |
| `AdjustmentPanel` | Full image adjustment sliders |
| `FilterGrid` | Filter thumbnail grid with live preview |
| `CropControls` | Crop ratio presets and rotation |
| `TextControls` | Font/style/color controls for text tool |
| `AIToolsPanel` | AI feature cards (bg remove, upscale, etc.) |
| `BatchPromptCard` | Draggable prompt card with overrides |
| `ResultsGrid` | Masonry/uniform gallery with multi-select |
| `ImagePreviewModal` | Full-size preview with metadata and actions |
| `TemplateCard` | Template display card with preview |
| `TemplatePreviewModal` | Full-screen template detail view |
| `TemplateCreator` | Custom template creation flow |
| `FilmGrainOverlay` | Animated noise grain texture layer |
| `AmbientParticles` | Floating light particles canvas effect |
| `CinematicTransition` | Crossfade through black on panel switch |

---

## 9. Store Additions

```typescript
// New state additions to AppState
interface AppStateAdditions {
  // Prompt history
  promptHistory: PromptHistoryEntry[];
  favoritePrompts: string[];

  // Style presets
  stylePresets: StylePreset[];
  customStylePresets: StylePreset[];

  // User templates
  userTemplates: ProjectTemplate[];

  // Edit mode
  editLayers: Layer[];
  editHistory: EditHistoryEntry[];
  activeEditTool: EditTool;

  // Comparison
  comparisonMode: 'off' | 'side-by-side' | 'slider' | 'onion' | 'grid';
  comparisonImages: string[];

  // Generation queue
  generationQueue: GenerationQueueItem[];

  // Batch results
  batchResults: BatchResult[];
}
```

---

## 10. Technical Considerations

- **HTML5 Canvas for Edit mode:** Use fabric.js or konva.js for interactive canvas with layers, transforms, text rendering
- **CSS filters for real-time preview:** brightness(), contrast(), saturate(), blur() for instant adjustment feedback before baking to canvas
- **WebSocket for generation progress:** Already in place, extend for progressive image rendering
- **ControlNet/LoRA:** Requires backend API extensions (new FastAPI endpoints)
- **AI editing features:** Require backend model integration (rembg, Real-ESRGAN, GFPGAN, LaMa)
- **Film grain animation:** CSS animation with SVG turbulence filter or canvas noise generation
- **Ambient particles:** Lightweight canvas-based particle system
- **Drag and drop:** Use @dnd-kit/core for sortable lists (prompts, layers, LoRAs)
- **Google Fonts import:** Instrument Sans + DM Sans via @import or self-hosted
