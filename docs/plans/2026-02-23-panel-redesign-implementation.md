# Vision Studio Panel Redesign: Dark Cinema Edition - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform all four main panels (Generate, Edit, Batch, Templates) into a showpiece-quality application with contextual workspace modes, cinematic "Dark Cinema" aesthetic, and comprehensive functionality including AI-powered editing, prompt intelligence, and full canvas editing.

**Architecture:** Contextual workspace modes where the layout transforms based on active panel. Sidebar remains constant, everything else adapts. Generate gets a right panel + canvas. Edit becomes a full photo editor (tool strip + canvas + properties). Batch splits into prompt queue + results grid. Templates goes full-width gallery. The "Dark Cinema" design system provides the aesthetic foundation with volumetric glows, animated grain, and cinematic transitions.

**Tech Stack:** React 19, TypeScript 5.7, Tailwind CSS v4, Zustand 5, Framer Motion 12, Vite 6, Electron 33, Konva.js (canvas), @dnd-kit (drag-and-drop), Google Fonts (Instrument Sans, DM Sans, JetBrains Mono)

**Design Document:** `docs/plans/2026-02-23-panel-redesign-design.md`

---

## Phase 0: Foundation - Design System & Dependencies

### Task 0.1: Install New Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install production dependencies**

Run:
```bash
cd C:/vision-studio && npm install konva react-konva @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

These provide:
- `konva` + `react-konva`: Interactive HTML5 Canvas for the Edit mode (layers, transforms, text, shapes)
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`: Drag-and-drop for prompt reordering, layer reordering, LoRA stacking

**Step 2: Verify installation**

Run: `cd C:/vision-studio && npm ls konva react-konva @dnd-kit/core @dnd-kit/sortable`
Expected: All packages listed without errors

**Step 3: Commit**

```bash
cd C:/vision-studio && git add package.json package-lock.json && git commit -m "chore: add konva, react-konva, and dnd-kit dependencies"
```

---

### Task 0.2: Design System - Color Tokens & Typography

**Files:**
- Modify: `src/index.css`

**Step 1: Update the CSS theme tokens and typography**

Replace the entire `@theme` block and global styles in `src/index.css` with the Dark Cinema design system. This is the foundation every other component builds on.

The new `@theme` block must define:
- All new color tokens from the design doc (void, canvas, surface, elevated, red-primary, red-highlight, red-pressed, red-glow, red-aura, text-primary, text-body, text-muted, border, border-hover)
- Keep backward-compatible aliases for existing token names (charcoal, charcoal-light, etc.) that map to the new values so existing components don't break during migration

Typography changes:
- Import Google Fonts: Instrument Sans (400, 500, 600, 700), DM Sans (400, 500, 700), JetBrains Mono (400, 500)
- Update the `body` font-family to use `'DM Sans'` as primary
- Add utility classes: `.font-display` (Instrument Sans), `.font-mono` (JetBrains Mono)
- Add type scale utilities: `.text-label` (uppercase, tracking-wider, font-display, text-xs, font-semibold)

New animation keyframes:
- `@keyframes grain-drift` for animated film grain
- `@keyframes glow-pulse` for red glow pulsing on active elements
- `@keyframes float-particle` for ambient particles
- `@keyframes cinema-fade` for panel transition crossfade

New utility classes:
- `.glass` - update to use new color tokens with `backdrop-filter: blur(20px)`
- `.glow-red` - volumetric red glow box-shadow stack
- `.glow-red-subtle` - lighter version for hover states
- `.shadow-cinematic` - multi-layered dramatic shadow with warm undertones
- `.border-cinema` - ultra-subtle border using new token

**Step 2: Verify fonts load**

Run: `cd C:/vision-studio && npm run dev`
Check: Fonts should load in the browser. Inspect body to confirm DM Sans is applied.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/index.css && git commit -m "feat: implement Dark Cinema design system tokens and typography"
```

---

### Task 0.3: Film Grain Overlay Component

**Files:**
- Create: `src/components/effects/FilmGrainOverlay.tsx`

**Step 1: Create the animated film grain overlay**

This component renders a full-screen SVG noise filter that animates to create a living film grain effect. It should:
- Use an SVG `<feTurbulence>` filter with `baseFrequency` around 0.65
- Animate the `seed` attribute to create grain drift
- Render at 2-3% opacity via a `pointer-events-none` absolute overlay
- Accept an `opacity` prop (default 0.025)
- Accept an `animated` prop (default true)
- Use `requestAnimationFrame` to update the seed every ~100ms for the flicker effect

The component renders a `div` with `position: fixed, inset: 0, z-index: 9999, pointer-events: none` containing an SVG filter applied to a full-screen rect.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/effects/FilmGrainOverlay.tsx && git commit -m "feat: add animated film grain overlay effect component"
```

---

### Task 0.4: Ambient Particles Component

**Files:**
- Create: `src/components/effects/AmbientParticles.tsx`

**Step 1: Create the floating light particle effect**

A lightweight canvas-based particle system that renders tiny floating light dots, like dust in a projector beam. Requirements:
- Uses a `<canvas>` element with `pointer-events: none`
- Spawns 30-50 particles with random positions, sizes (1-3px), and opacity (0.1-0.4)
- Particles drift slowly upward and slightly sideways with subtle sinusoidal motion
- Particles that exit the viewport wrap to the bottom
- Uses `requestAnimationFrame` for smooth 60fps animation
- Accepts `color` prop (default warm white `rgba(255, 200, 150, 0.3)`) and `count` prop
- Cleans up animation frame on unmount
- Resizes canvas on window resize

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/effects/AmbientParticles.tsx && git commit -m "feat: add ambient floating particles effect component"
```

---

### Task 0.5: Cinematic Transition Component

**Files:**
- Create: `src/components/effects/CinematicTransition.tsx`

**Step 1: Create the panel transition wrapper**

A Framer Motion wrapper that provides the cinematic crossfade-through-black effect when panels switch. Requirements:
- Wraps `AnimatePresence` with a custom transition
- On exit: opacity fades to 0, slight scale down to 0.98, over 150ms
- Brief black gap (the parent background shows through)
- On enter: opacity fades from 0 to 1, slight scale up from 0.98, over 200ms with 50ms delay
- Uses `mode="wait"` to ensure exit completes before enter
- Accepts a `transitionKey` prop (the active panel name) to trigger re-render

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/effects/CinematicTransition.tsx && git commit -m "feat: add cinematic crossfade transition wrapper"
```

---

### Task 0.6: Upgraded UI Primitives - Button, Slider, Input, Textarea

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Slider.tsx`
- Modify: `src/components/ui/Input.tsx`
- Modify: `src/components/ui/Textarea.tsx`

**Step 1: Upgrade Button component**

Update the Button to use the new design system:
- Replace hardcoded color values with new Tailwind tokens (`bg-red-primary`, `text-text-primary`, etc.)
- Primary variant gets `glow-red` class for the volumetric glow effect
- Add `variant: 'cinema'` - a special full-glow variant with warm aura background
- Hover states: scale 1.02 with elevated shadow
- Active/pressed: scale 0.98 with `red-pressed` color
- Loading spinner gets a red glow
- Use `font-display` (Instrument Sans) for button text

**Step 2: Upgrade Slider component**

Replace the basic `<input type="range">` with a custom slider built from divs:
- Track: dark background (`bg-void`) with subtle border
- Filled portion: red gradient from `red-pressed` to `red-primary`
- Filled portion has a subtle glow (`box-shadow` with red-glow)
- Thumb: 16px circle with red-primary fill, glow on hover, scale on drag
- Display value in `font-mono` (JetBrains Mono)
- Labels use `font-display` with `text-label` class

**Step 3: Upgrade Input and Textarea**

Update both to use new tokens:
- Background: `bg-elevated`
- Border: `border-cinema`
- Focus: red glow border (`ring-red-primary`, `glow-red-subtle`)
- Text: `text-text-primary`
- Placeholder: `text-text-muted`
- Font: DM Sans for body, JetBrains Mono variant for number inputs

**Step 4: Commit**

```bash
cd C:/vision-studio && git add src/components/ui/ && git commit -m "feat: upgrade UI primitives to Dark Cinema design system"
```

---

### Task 0.7: Zustand Store Extensions

**Files:**
- Modify: `src/store/appStore.ts`
- Create: `src/types/editor.ts`
- Create: `src/types/generation.ts`

**Step 1: Create type definition files**

Create `src/types/generation.ts` with:
```typescript
export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  negativePrompt: string;
  timestamp: Date;
  model: string;
  result?: string; // thumbnail path
}

export interface StylePreset {
  id: string;
  name: string;
  modifier: string;
  color: string; // hex color for the chip
  category: 'cinematic' | 'anime' | 'realistic' | 'artistic' | 'creative';
  isCustom: boolean;
}

export interface GenerationQueueItem {
  id: string;
  prompt: string;
  thumbnail?: string;
  params: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

export interface BatchResult {
  id: string;
  batchId: string;
  promptIndex: number;
  prompt: string;
  imagePath: string;
  seed: number;
  generationTime: number;
  params: Record<string, any>;
  createdAt: Date;
  isFavorite: boolean;
}

export interface LoRAConfig {
  id: string;
  name: string;
  triggerWord: string;
  weight: number;
  color: string;
}

export interface ControlNetConfig {
  enabled: boolean;
  preprocessor: 'canny' | 'depth' | 'openpose' | 'scribble' | 'segmentation' | 'normal';
  referenceImage?: string;
  strength: number;
  startStep: number;
  endStep: number;
}
```

Create `src/types/editor.ts` with:
```typescript
export type EditTool =
  | 'move' | 'scale' | 'crop' | 'rotate'
  | 'brush' | 'eraser' | 'clone' | 'heal'
  | 'text' | 'shape' | 'pen'
  | 'hand' | 'zoom' | 'eyedropper';

export interface Layer {
  id: string;
  name: string;
  type: 'image' | 'text' | 'shape' | 'adjustment';
  visible: boolean;
  opacity: number;
  blendMode: string;
  locked: boolean;
  data: Record<string, any>;
}

export interface EditHistoryEntry {
  id: string;
  action: string;
  timestamp: Date;
  snapshot?: string; // base64 canvas snapshot for undo
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  sharpness: number;
  blur: number;
  noiseReduction: number;
  vignette: number;
  grain: number;
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0, contrast: 0, saturation: 0, exposure: 0,
  temperature: 0, tint: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, sharpness: 0, blur: 0,
  noiseReduction: 0, vignette: 0, grain: 0,
};
```

**Step 2: Extend the Zustand store**

Add these state fields and actions to `src/store/appStore.ts`:

New state:
- `promptHistory: PromptHistoryEntry[]` (default: [])
- `favoritePrompts: string[]` (default: [])
- `stylePresets: StylePreset[]` (populate with built-in presets)
- `customStylePresets: StylePreset[]` (default: [])
- `userTemplates: ProjectTemplate[]` (default: [])
- `generationQueue: GenerationQueueItem[]` (default: [])
- `batchResults: BatchResult[]` (default: [])
- `comparisonMode: 'off' | 'side-by-side' | 'slider' | 'onion' | 'grid'` (default: 'off')
- `comparisonImages: string[]` (default: [])
- `activeEditTool: EditTool` (default: 'move')
- `editLayers: Layer[]` (default: [])
- `editHistory: EditHistoryEntry[]` (default: [])
- `currentImage: string | null` (default: null) — the currently loaded image on canvas
- `imageAdjustments: ImageAdjustments` (default: DEFAULT_ADJUSTMENTS)

New actions:
- `addToPromptHistory(entry: PromptHistoryEntry): void`
- `toggleFavoritePrompt(prompt: string): void`
- `addCustomStylePreset(preset: StylePreset): void`
- `removeCustomStylePreset(id: string): void`
- `addUserTemplate(template: ProjectTemplate): void`
- `updateUserTemplate(id: string, updates: Partial<ProjectTemplate>): void`
- `deleteUserTemplate(id: string): void`
- `addToGenerationQueue(item: GenerationQueueItem): void`
- `removeFromGenerationQueue(id: string): void`
- `addBatchResult(result: BatchResult): void`
- `toggleBatchResultFavorite(id: string): void`
- `setComparisonMode(mode: ...): void`
- `setComparisonImages(images: string[]): void`
- `setActiveEditTool(tool: EditTool): void`
- `addEditLayer(layer: Layer): void`
- `updateEditLayer(id: string, updates: Partial<Layer>): void`
- `removeEditLayer(id: string): void`
- `reorderEditLayers(layerIds: string[]): void`
- `pushEditHistory(entry: EditHistoryEntry): void`
- `setCurrentImage(imagePath: string | null): void`
- `setImageAdjustments(adjustments: Partial<ImageAdjustments>): void`
- `resetImageAdjustments(): void`

Update `partialize` to also persist: `promptHistory` (last 50), `favoritePrompts`, `customStylePresets`, `userTemplates`, `batchResults` (last 200).

Populate `stylePresets` with built-in presets:
```typescript
const BUILT_IN_STYLE_PRESETS: StylePreset[] = [
  { id: 'cinematic', name: 'Cinematic', modifier: 'cinematic lighting, film grain, dramatic atmosphere, movie still', color: '#e63946', category: 'cinematic', isCustom: false },
  { id: 'anime', name: 'Anime', modifier: 'anime style, cel shading, vibrant colors, Studio Ghibli inspired', color: '#ff6b9d', category: 'anime', isCustom: false },
  { id: 'photorealistic', name: 'Photorealistic', modifier: 'photorealistic, 8k UHD, DSLR, sharp focus, professional photography', color: '#4ecdc4', category: 'realistic', isCustom: false },
  { id: 'oil-painting', name: 'Oil Painting', modifier: 'oil painting, textured brushstrokes, classical art, rich colors', color: '#f4a261', category: 'artistic', isCustom: false },
  { id: 'watercolor', name: 'Watercolor', modifier: 'watercolor painting, soft washes, flowing pigment, paper texture', color: '#a8dadc', category: 'artistic', isCustom: false },
  { id: '3d-render', name: '3D Render', modifier: '3D render, octane render, CGI, volumetric lighting, ray tracing', color: '#6c5ce7', category: 'creative', isCustom: false },
  { id: 'pixel-art', name: 'Pixel Art', modifier: 'pixel art, 16-bit, retro game style, limited palette', color: '#00b894', category: 'creative', isCustom: false },
  { id: 'line-art', name: 'Line Art', modifier: 'line art, ink drawing, clean lines, detailed illustration', color: '#636e72', category: 'artistic', isCustom: false },
  { id: 'comic-book', name: 'Comic Book', modifier: 'comic book art, bold lines, halftone dots, dynamic composition', color: '#fdcb6e', category: 'creative', isCustom: false },
  { id: 'neon', name: 'Neon', modifier: 'neon lights, cyberpunk, glowing, dark background, vivid colors', color: '#e17055', category: 'creative', isCustom: false },
];
```

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/types/ src/store/appStore.ts && git commit -m "feat: extend store with prompt history, edit state, batch results, and style presets"
```

---

## Phase 1: Workspace Architecture

### Task 1.1: WorkspaceLayout Component

**Files:**
- Create: `src/components/layout/WorkspaceLayout.tsx`
- Modify: `src/App.tsx`

**Step 1: Create the WorkspaceLayout component**

This is the orchestrator that switches the layout based on `activePanel`. It replaces the current static layout in `App.tsx`.

```typescript
interface WorkspaceLayoutProps {
  activePanel: string;
  sidebar: React.ReactNode;
  children: Record<string, React.ReactNode>;
}
```

Layout logic:
- **generate** mode: `<Sidebar /> | <Canvas /> | <GeneratePanel />(400px)`
- **edit** mode: `<Sidebar /> | <ToolStrip />(56px) | <EditCanvas /> | <EditPropertiesPanel />(360px)`
- **batch** mode: `<Sidebar /> | <BatchPromptQueue />(420px) | <BatchResultsGrid />`
- **templates** mode: `<Sidebar /> | <TemplatesBrowser />(full width)`
- **assets** mode: `<Sidebar /> | <Canvas /> | <AssetsPanel />(320px)` (keep current layout)
- **settings** mode: `<Sidebar /> | <Canvas /> | <SettingsPanel />(600px)` (keep current layout)

Each mode renders its children into a flex layout. The canvas area fills remaining space.

Use the `CinematicTransition` component to wrap the mode content area (not the sidebar). The sidebar always stays mounted.

**Step 2: Update App.tsx**

Replace the current static layout with `<WorkspaceLayout>`. The sidebar always renders. The main content area switches via WorkspaceLayout based on `activePanel`.

Remove the current `renderPanel()` switch pattern and the hardcoded `w-80` / `w-[600px]` right panel. The WorkspaceLayout handles all width decisions per mode.

Keep the Header component above the workspace. Keep the Timeline below.

**Step 3: Verify the app still renders**

Run: `cd C:/vision-studio && npm run dev`
Each sidebar navigation button should switch the layout. The existing panels should still render (even if not yet upgraded) in their new layout positions.

**Step 4: Commit**

```bash
cd C:/vision-studio && git add src/components/layout/WorkspaceLayout.tsx src/App.tsx && git commit -m "feat: implement contextual workspace layout mode system"
```

---

### Task 1.2: Upgrade Sidebar with Dark Cinema Aesthetic

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Upgrade the sidebar visuals**

Apply the Dark Cinema design system to the sidebar:
- Background: `bg-surface` with a very subtle vertical gradient (slightly lighter at top)
- Border: `border-cinema` (ultra-subtle)
- Logo area: The "Vision" text uses `font-display` (Instrument Sans), "Studio" uses `text-red-primary`
- Logo icon: warm red gradient with `glow-red-subtle` on hover
- Nav items: Use `font-display` for labels
  - Active state: left border glow (3px red-primary with box-shadow glow), background `red-aura`, text `red-primary`
  - Remove the pulsing animation on active icons (too distracting)
  - Hover: `bg-elevated`, text `text-primary`
- GPU status pill: Use the new color system. GPU available = warm green glow. CPU mode = amber glow.
- Collapse toggle: Smoother, wider click target
- Quick actions: Remove these (they'll be replaced by the contextual workspace)

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/layout/Sidebar.tsx && git commit -m "feat: upgrade sidebar to Dark Cinema aesthetic"
```

---

### Task 1.3: Upgrade Header with Dark Cinema Aesthetic

**Files:**
- Modify: `src/components/layout/Header.tsx`

**Step 1: Upgrade the header visuals**

Apply Dark Cinema:
- Background: `bg-surface` (consistent with sidebar)
- Border: ultra-subtle bottom border
- Project name: `font-display`, `text-text-primary`
- "Edited just now" text: `text-text-muted`, `font-mono`
- Action buttons: Use upgraded Button component with new tokens
- Undo/Redo group: `bg-elevated`, border-cinema
- Export button: `variant="cinema"` with warm glow
- User avatar: red gradient with `glow-red-subtle`

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/layout/Header.tsx && git commit -m "feat: upgrade header to Dark Cinema aesthetic"
```

---

### Task 1.4: Add Film Grain and Particles to App Shell

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add the atmospheric effects**

Import and render `FilmGrainOverlay` and `AmbientParticles` in the App component:
- `<FilmGrainOverlay opacity={0.025} />` rendered as the last child (fixed positioning, covers everything)
- `<AmbientParticles count={35} />` rendered inside the canvas area only (not over panels)

Both components use `pointer-events: none` so they don't interfere with interaction.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/App.tsx && git commit -m "feat: add film grain and ambient particles to app shell"
```

---

## Phase 2: Generate Panel

### Task 2.1: Generate Panel - Core Layout & Mode Toggle

**Files:**
- Rewrite: `src/pages/GeneratePanel.tsx`

**Step 1: Rewrite the Generate Panel shell**

Create the new 400px panel with:
- Scrollable content area
- Sticky bottom generate button
- Image/Video mode toggle at top with red glow transfer animation:
  - Use a shared `motion.div` with `layoutId="modeGlow"` for the glow underline that slides between tabs
  - Active tab: `text-red-primary` with underline glow
  - Inactive tab: `text-text-muted` with hover state

Keep the existing generation logic (`handleGenerate`, `pollJobStatus`) but organize the JSX into the new structure. Sections that will be built in subsequent tasks render as placeholder containers with section titles.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/pages/GeneratePanel.tsx && git commit -m "feat: rewrite generate panel shell with mode toggle and new layout"
```

---

### Task 2.2: Prompt Area with Toolbar

**Files:**
- Create: `src/components/generate/PromptArea.tsx`
- Create: `src/components/generate/PromptToolbar.tsx`

**Step 1: Create the PromptArea component**

A focused prompt input section with:
- Main textarea: 6 rows, uses the upgraded Textarea component
- Subtle inner glow on focus (via a wrapper div with conditional `glow-red-subtle`)
- Character count in the corner (`font-mono`, `text-text-muted`)
- Below the textarea: the `PromptToolbar`
- Collapsible negative prompt section (AnimatePresence, initially collapsed)
  - Small "Negative prompt" toggle link
  - When expanded: 3-row textarea

Props:
```typescript
interface PromptAreaProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  generationType: 'image' | 'video';
}
```

**Step 2: Create the PromptToolbar component**

A row of small icon buttons below the prompt textarea:
- Dice (Dice5 icon) — calls `onRandomize` callback
- Magic wand (Wand2 icon) — calls `onEnhance` callback
- History clock (Clock icon) — calls `onShowHistory` callback
- Heart (Heart icon, filled if favorited) — calls `onToggleFavorite` callback
- Copy (Copy icon) — copies prompt to clipboard via `navigator.clipboard.writeText`

Each button: 28px square, rounded-md, `text-text-muted`, hover: `text-text-primary`, `bg-elevated`. Active/toggled: `text-red-primary`, `bg-red-aura`.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/ && git commit -m "feat: add prompt area with toolbar (dice, enhance, history, favorite, copy)"
```

---

### Task 2.3: Prompt History Dropdown

**Files:**
- Create: `src/components/generate/PromptHistory.tsx`

**Step 1: Create the searchable prompt history dropdown**

A dropdown panel that opens below the prompt toolbar when the history icon is clicked:
- Search input at top (filters the list)
- Scrollable list of prompt history entries (max height ~300px)
- Each entry shows: prompt text (truncated to 2 lines), model badge, timestamp (`font-mono`), tiny thumbnail if available
- Click to load that prompt into the prompt area
- Delete button (X) on hover to remove entry
- Empty state: "No prompt history yet"

Uses the `promptHistory` state from the store. The dropdown positions absolute below the toolbar.

**Step 2: Integrate with GeneratePanel**

When history icon is clicked in PromptToolbar, toggle PromptHistory dropdown visibility. When a history item is selected, update prompt and negative prompt in the GeneratePanel state.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/PromptHistory.tsx && git commit -m "feat: add searchable prompt history dropdown"
```

---

### Task 2.4: Style Presets Bar

**Files:**
- Create: `src/components/generate/StylePresetsBar.tsx`

**Step 1: Create the horizontal scrolling style presets**

A horizontally scrollable row of style chips:
- Container: `overflow-x-auto`, `scrollbar-hide` (custom CSS to hide scrollbar), `flex gap-2`
- Each chip: `px-3 py-1.5 rounded-full`, background `bg-elevated`, border `border-cinema`
- Chip content: small colored dot (6px circle using preset's `color`) + label (`font-display text-xs`)
- Selected state: border becomes the preset color, `bg` uses color at 10% opacity, text uses color
- Hover: chip glows its color (box-shadow with the preset's color at 30% opacity)
- Click: calls `onSelect(preset)` which appends the modifier to the prompt
- Deselect: click again removes the modifier from the prompt
- Last chip: "+" icon to add custom preset (opens a small popover with name + modifier + color picker inputs)

Uses `stylePresets` and `customStylePresets` from the store.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/StylePresetsBar.tsx && git commit -m "feat: add horizontal scrolling style presets bar with custom preset creation"
```

---

### Task 2.5: Image Drop Zone (img2img)

**Files:**
- Create: `src/components/generate/ImageDropZone.tsx`

**Step 1: Create the reference image upload area**

Collapsed state: a small button "Add Reference Image" with Upload icon.

Expanded state (when image is set):
- Reference image thumbnail (80px square, rounded, with remove X button)
- Denoising strength slider (0.0 to 1.0, default 0.75)
- Mode selector: three small buttons — "img2img", "Inpaint", "ControlNet"
  - These are pill-shaped toggle buttons. Active one has `bg-red-primary` text white.

The drop zone:
- Accepts drag-and-drop (onDragOver, onDrop) and click-to-upload (hidden file input)
- Shows dashed border area with "Drop image here" text when no image
- Supports: .png, .jpg, .jpeg, .webp
- Reads the dropped/selected file as a data URL for the thumbnail
- Stores the file path (via Electron dialog if needed) for backend usage

Props:
```typescript
interface ImageDropZoneProps {
  referenceImage: string | null;
  onImageChange: (imagePath: string | null) => void;
  denoisingStrength: number;
  onDenoisingStrengthChange: (value: number) => void;
  mode: 'img2img' | 'inpaint' | 'controlnet';
  onModeChange: (mode: 'img2img' | 'inpaint' | 'controlnet') => void;
}
```

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/ImageDropZone.tsx && git commit -m "feat: add reference image drop zone for img2img/inpaint/controlnet"
```

---

### Task 2.6: ControlNet Panel

**Files:**
- Create: `src/components/generate/ControlNetPanel.tsx`

**Step 1: Create the collapsible ControlNet configuration**

A collapsible section (AnimatePresence) with:
- Toggle header: "ControlNet" label with on/off switch (custom toggle component)
- When enabled:
  - Preprocessor dropdown: Canny Edge, Depth Map, OpenPose, Scribble, Segmentation, Normal Map
  - Reference image upload (reuses ImageDropZone pattern but smaller)
  - Control strength slider (0.0 to 1.5, default 1.0)
  - Start step slider (0.0 to 1.0, default 0.0)
  - End step slider (0.0 to 1.0, default 1.0)
- All values managed via `ControlNetConfig` type from store

Note: The actual backend ControlNet integration is a backend task. This task creates the UI controls that will send parameters via the existing IPC generation API (extended later).

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/ControlNetPanel.tsx && git commit -m "feat: add ControlNet configuration panel UI"
```

---

### Task 2.7: LoRA Mixer

**Files:**
- Create: `src/components/generate/LoRAMixer.tsx`

**Step 1: Create the LoRA model stacking interface**

A section with:
- "Add LoRA" button that opens a searchable popup/dropdown listing available LoRAs
  - For now, populate with placeholder LoRA entries since the backend LoRA API isn't built yet
  - Each entry: name, file size, "Add" button
- Active LoRA list: vertical stack of cards, each showing:
  - Color-coded left border (each LoRA gets an assigned color from a palette)
  - LoRA name (bold) + trigger word (muted, monospace)
  - Weight slider (0.0 to 2.0, default 1.0)
  - Remove button (X)
- Drag to reorder via `@dnd-kit/sortable`
  - Each LoRA card is a `SortableItem`
  - Drag handle on the left edge

State: `loraConfigs: LoRAConfig[]` managed locally in the GeneratePanel.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/LoRAMixer.tsx && git commit -m "feat: add LoRA model mixing interface with drag-to-reorder"
```

---

### Task 2.8: Model Selector Dropdown

**Files:**
- Create: `src/components/generate/ModelSelector.tsx`

**Step 1: Create the rich model selector**

Replace the basic `<select>` with a custom dropdown:
- Trigger button: shows selected model name + quality badge, styled like an elevated card
- Dropdown panel: absolute positioned, `bg-elevated`, `shadow-cinematic`, `border-cinema`
- Each model option is a card row:
  - Model name (`font-display`, bold)
  - Quality badge: "Best Quality" (green), "Fast" (amber), "Balanced" (blue) — small pill
  - VRAM requirement: "23.8 GB VRAM" in `font-mono text-text-muted text-xs`
  - Description: one line, `text-text-body text-xs`
- Selected model has `bg-red-aura` and `border-red-primary`
- Hover: `bg-elevated` darker shade
- Separate sections for image models and video models based on `generationType`
- Close on click outside or on selection

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/generate/ModelSelector.tsx && git commit -m "feat: add rich model selector dropdown with model cards"
```

---

### Task 2.9: Advanced Settings Section

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`

**Step 1: Upgrade the advanced settings section**

Keep the existing expandable AnimatePresence pattern, but:
- Use upgraded Slider components (glow track, cinematic styling)
- Add scheduler dropdown: Euler, Euler a, DPM++ 2M, DPM++ 2M Karras, DPM++ SDE, DPM++ SDE Karras, DDIM, UniPC
  - Use a custom dropdown similar to ModelSelector but simpler
- Add clip skip selector: buttons for 1 and 2 (pill toggle)
- All labels use `text-label` class
- All values use `font-mono`

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/pages/GeneratePanel.tsx && git commit -m "feat: upgrade advanced settings with scheduler and clip skip"
```

---

### Task 2.10: Generate Button with Progress State

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`

**Step 1: Upgrade the generate button**

Replace the current button with a cinematic CTA:
- Idle state: full-width, `bg-red-primary`, `glow-red` class for volumetric warm glow, large size
  - Text: "Generate Image" or "Generate Video" in `font-display`
  - Wand2 icon on left
- Hover: increased glow spread, slight scale up
- Disabled (no prompt): `opacity-40`, no glow
- Generating state: transforms into a progress bar
  - Background becomes `bg-elevated`
  - A red progress fill animates from left to right based on job progress
  - Progress percentage in `font-mono` on the right
  - Step count ("Step 12/25") in `text-text-muted` on the left
  - Pulsing `glow-red` on the progress fill edge
  - "Cancel" text appears in center, clickable to cancel generation

Wire this to the existing `handleGenerate` and `pollJobStatus` logic. The progress is received from the WebSocket via `updateJob`.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/pages/GeneratePanel.tsx && git commit -m "feat: cinematic generate button with progress bar transformation"
```

---

### Task 2.11: Assemble Complete Generate Panel

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`

**Step 1: Wire all sub-components together**

Assemble the complete GeneratePanel from all the components built in Tasks 2.1-2.10:

Order (top to bottom in scrollable area):
1. Mode toggle (Image/Video)
2. PromptArea (with PromptToolbar, PromptHistory)
3. StylePresetsBar
4. ImageDropZone (img2img)
5. ControlNetPanel (collapsible)
6. LoRAMixer
7. Aspect ratio buttons + ModelSelector + Resolution display
8. Advanced settings (expandable)
9. Estimated info bar
10. Error/success messages
11. Generate button (sticky bottom)

Wire up:
- Prompt changes to store's `addToPromptHistory` on generation
- Style preset selection to modify prompt text
- All generation params passed to `window.electron.generation.generateImage/generateVideo`
- ControlNet and LoRA configs passed as additional params (backend will need extension)

**Step 2: Test full panel**

Run: `cd C:/vision-studio && npm run dev`
Verify: All sections render, expand/collapse works, typing in prompt works, model selector opens, sliders adjust, generate button shows correct state.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/pages/GeneratePanel.tsx src/components/generate/ && git commit -m "feat: assemble complete generate panel with all sub-components"
```

---

### Task 2.12: Canvas - Generation Progress & Queue Strip

**Files:**
- Modify: `src/components/layout/Canvas.tsx`
- Create: `src/components/canvas/GenerationProgress.tsx`
- Create: `src/components/canvas/GenerationQueue.tsx`

**Step 1: Create GenerationProgress overlay**

A centered overlay that appears on the canvas during generation:
- Circular SVG progress ring (120px diameter)
- Step count in center: "12 / 25" in `font-mono`
- "Generating..." label below in `text-text-muted`
- ETA below that (calculated from average step time)
- The canvas border gets a pulsing red glow during generation
- Uses `activeJobs` from the store to determine if generating

**Step 2: Create GenerationQueue strip**

A horizontal strip at the bottom of the canvas:
- Shows thumbnails (48x48) of recent completed generations from `generationQueue`
- Each thumbnail: rounded, border, hover shows larger preview tooltip with prompt
- Click loads that image as the `currentImage` on canvas
- Scrolls horizontally if more than fit
- Fades in/out based on whether there are items

**Step 3: Update Canvas component**

Integrate both new components:
- GenerationProgress renders centered when a job is active
- GenerationQueue renders at the bottom
- When `currentImage` is set in the store, display it centered on the canvas instead of the placeholder
- The canvas artboard size adapts to the current image's dimensions
- Keep existing zoom/pan functionality

**Step 4: Commit**

```bash
cd C:/vision-studio && git add src/components/layout/Canvas.tsx src/components/canvas/ && git commit -m "feat: add generation progress overlay and queue strip to canvas"
```

---

### Task 2.13: Comparison View

**Files:**
- Create: `src/components/canvas/ComparisonView.tsx`
- Create: `src/components/canvas/ComparisonToolbar.tsx`

**Step 1: Create ComparisonToolbar**

A toolbar that renders above the canvas when `comparisonMode !== 'off'`:
- Four mode buttons: Side-by-side, Slider, Onion Skin, Grid
- Image A / Image B selectors (dropdown of recent generations)
- Close button to exit comparison mode

**Step 2: Create ComparisonView**

Renders inside the canvas area when comparison is active:
- **Side-by-side:** Two images rendered next to each other, each with a label ("A" / "B")
- **Slider:** Both images stacked, with a draggable vertical divider. Left of divider shows A, right shows B. The divider is a thin red line with a handle.
  - Use `onMouseDown` on handle, `onMouseMove` on window to track drag position
  - Clip the top image with `clip-path: inset(0 ${100 - position}% 0 0)`
- **Onion skin:** Image B overlaid on Image A with an opacity slider (0-100%)
- **Grid:** 2x2 or 3x3 grid showing recent generations, click one to select as A or B

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/components/canvas/ComparisonView.tsx src/components/canvas/ComparisonToolbar.tsx && git commit -m "feat: add generation comparison view (side-by-side, slider, onion, grid)"
```

---

## Phase 3: Edit Panel

### Task 3.1: Tool Strip Component

**Files:**
- Create: `src/components/edit/ToolStrip.tsx`

**Step 1: Create the vertical tool strip**

A 56px-wide vertical column rendered to the left of the canvas in edit mode:
- Background: `bg-surface`, right border: `border-cinema`
- Groups of icon buttons with subtle `border-b border-cinema` dividers between groups

Tool groups (use Lucide icons):
- Selection & Transform: Move, Scaling, Crop, RotateCw
- Paint & Touch-up: Paintbrush, Eraser, Stamp, Heart (healing)
- Shape & Text: Type, Square, PenTool
- View: Hand, ZoomIn, Pipette

Each tool button:
- 40px square, centered icon (20px)
- Default: `text-text-muted`
- Hover: `text-text-primary`, `bg-elevated`
- Active: `text-red-primary` with a 3px left border glow (`border-l-3 border-red-primary shadow-[inset_3px_0_8px_rgba(230,57,70,0.3)]`)
- Tooltip on hover showing tool name + keyboard shortcut (e.g., "Move (V)")

Uses `activeEditTool` and `setActiveEditTool` from the store.

Add keyboard shortcut listener (useEffect with keydown handler):
- V = move, T = scale, C = crop, R = rotate
- B = brush, E = eraser, S = clone, H = heal
- Space = hand, Z = zoom, I = eyedropper

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/ToolStrip.tsx && git commit -m "feat: add edit mode vertical tool strip with keyboard shortcuts"
```

---

### Task 3.2: Interactive Canvas with Konva

**Files:**
- Create: `src/components/edit/EditCanvas.tsx`

**Step 1: Create the interactive edit canvas**

Uses `react-konva` to render a Konva Stage with layers:
- Stage fills the available center area
- Background layer: checkerboard pattern (for transparency)
- Image layer: renders the current image (`currentImage` from store)
- Drawing layer: for brush strokes (inpainting mask)
- UI layer: for transform handles, crop overlay

Konva setup:
```tsx
<Stage width={containerWidth} height={containerHeight}>
  <Layer> {/* Background checkerboard */} </Layer>
  <Layer> {/* Main image */}
    <KonvaImage image={loadedImage} />
  </Layer>
  <Layer> {/* Drawing/mask layer */} </Layer>
  <Layer> {/* Transform handles, crop overlay */} </Layer>
</Stage>
```

Behaviors based on `activeEditTool`:
- **move/scale:** Image is draggable. When selected, show Konva `Transformer` with 8 handles + rotation.
- **crop:** Show a crop rectangle overlay with handles. The area outside the crop darkens.
- **brush:** Enable freehand drawing on the drawing layer. Brush color: red with 50% opacity (for inpainting mask visualization).
- **eraser:** Same as brush but erases (globalCompositeOperation: destination-out)
- **text:** Click on stage to place a text node. Konva `Text` object with editable contenteditable div on dblclick.
- **hand:** Stage is draggable (pan)
- **zoom:** Click to zoom in, shift+click to zoom out

Zoom: Use scroll wheel to zoom in/out (scale the stage).

CSS filter preview: Apply CSS filters on the Stage container div for real-time adjustment preview:
```css
filter: brightness(${1 + adjustments.brightness/100}) contrast(${1 + adjustments.contrast/100}) saturate(${1 + adjustments.saturation/100}) blur(${adjustments.blur}px);
```

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/EditCanvas.tsx && git commit -m "feat: add interactive Konva canvas for edit mode with tool behaviors"
```

---

### Task 3.3: Adjustment Panel

**Files:**
- Create: `src/components/edit/AdjustmentPanel.tsx`

**Step 1: Create the image adjustment controls**

Renders in the right properties panel when the Adjust tab is active:

**Basic Adjustments section:**
- Section header: Sun icon + "Basic Adjustments" with `text-label`
- Sliders (using upgraded Slider component) for:
  - Brightness (-100 to +100, default 0)
  - Contrast (-100 to +100, default 0)
  - Saturation (-100 to +100, default 0)
  - Exposure (-2.0 to +2.0, step 0.1, default 0)
  - Temperature (-100 to +100, default 0)
  - Tint (-100 to +100, default 0)
  - Highlights (-100 to +100, default 0)
  - Shadows (-100 to +100, default 0)
  - Whites (-100 to +100, default 0)
  - Blacks (-100 to +100, default 0)

**Effects section:**
- Section header: Wand2 icon + "Effects" with `text-label`
- Sliders for:
  - Sharpness (0 to 200, default 0)
  - Blur (0 to 20, step 0.1, default 0)
  - Noise Reduction (0 to 100, default 0)
  - Vignette (0 to 100, default 0)
  - Grain (0 to 100, default 0)

**Footer:**
- "Reset All" ghost button — calls `resetImageAdjustments()`
- "Auto Enhance" primary button — sends image to backend for AI optimization (placeholder for now, shows toast "Coming soon")

All slider changes update `imageAdjustments` in the store, which the EditCanvas reads to apply CSS filters in real-time.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/AdjustmentPanel.tsx && git commit -m "feat: add comprehensive image adjustment panel with real-time preview"
```

---

### Task 3.4: Filter Grid

**Files:**
- Create: `src/components/edit/FilterGrid.tsx`

**Step 1: Create the filter thumbnail grid**

Renders in the right properties panel when Filters tab is active:

- Category pills at top: All, Cinematic, Vintage, B&W, Portrait, Landscape, Creative
- Grid of filter cards (2 columns):
  - Each card:
    - Thumbnail preview (the current image with the filter applied via CSS filter string)
    - Filter name below
    - Selected state: `border-red-primary`, `glow-red-subtle`
  - Use `<canvas>` elements to render tiny filter previews (draw the current image with CSS filter equivalents)

- Below the grid: Intensity slider (0-100%, default 100%)
- "Stack Filters" toggle — when on, multiple filters can be selected

Built-in filters (each is a CSS filter string + optional Konva color matrix):
```typescript
const FILTERS = [
  { id: 'cinematic-warm', name: 'Cinematic Warm', category: 'cinematic', css: 'contrast(1.1) saturate(1.3) sepia(0.15)' },
  { id: 'cinematic-cool', name: 'Cinematic Cool', category: 'cinematic', css: 'contrast(1.15) saturate(0.9) hue-rotate(10deg)' },
  { id: 'vintage-film', name: 'Vintage Film', category: 'vintage', css: 'sepia(0.4) contrast(1.1) brightness(0.95)' },
  { id: 'vintage-fade', name: 'Vintage Fade', category: 'vintage', css: 'sepia(0.2) contrast(0.9) brightness(1.1) saturate(0.8)' },
  { id: 'noir', name: 'Noir', category: 'bw', css: 'grayscale(1) contrast(1.3) brightness(0.9)' },
  { id: 'bw-classic', name: 'B&W Classic', category: 'bw', css: 'grayscale(1) contrast(1.1)' },
  { id: 'portrait-soft', name: 'Portrait Soft', category: 'portrait', css: 'contrast(0.95) brightness(1.05) saturate(1.1)' },
  { id: 'landscape-vivid', name: 'Landscape Vivid', category: 'landscape', css: 'saturate(1.5) contrast(1.1) brightness(1.05)' },
  { id: 'dreamy', name: 'Dreamy', category: 'creative', css: 'brightness(1.1) contrast(0.9) saturate(1.2) blur(0.5px)' },
  { id: 'cyberpunk', name: 'Cyberpunk', category: 'creative', css: 'contrast(1.3) saturate(1.5) hue-rotate(-10deg)' },
  { id: 'vibrant', name: 'Vibrant', category: 'creative', css: 'saturate(1.8) contrast(1.1)' },
  { id: 'matte', name: 'Matte', category: 'creative', css: 'contrast(0.85) brightness(1.1) saturate(0.9)' },
];
```

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/FilterGrid.tsx && git commit -m "feat: add filter grid with live thumbnails and intensity control"
```

---

### Task 3.5: Crop Controls

**Files:**
- Create: `src/components/edit/CropControls.tsx`

**Step 1: Create crop and rotation controls**

Renders in right panel when Crop tab is active:

- **Aspect ratio presets:** Grid of buttons (2 columns)
  - Free, 1:1, 16:9, 9:16, 4:3, 3:2, Custom
  - Active preset: `bg-red-primary text-white`
  - When "Custom" is selected, show width/height number inputs

- **Rotation:** Slider (-45 to +45 degrees, step 0.5)
- **Flip buttons:** Two icon buttons — Flip Horizontal, Flip Vertical
- **Straighten tool:** A button that when clicked, activates "draw a line" mode on the canvas. User draws a line along what should be horizontal, and the image rotates to align.
- **Crop dimensions:** Read-only display of crop area in pixels (`font-mono`)

- **Apply / Cancel buttons** at bottom:
  - "Apply Crop" primary button — bakes the crop to the canvas
  - "Cancel" ghost button — removes the crop overlay

This component communicates with EditCanvas through store state:
- `cropRect: { x, y, width, height } | null`
- `cropAspectRatio: string`
- `imageRotation: number`
- `imageFlipH: boolean`
- `imageFlipV: boolean`

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/CropControls.tsx && git commit -m "feat: add crop controls with aspect presets, rotation, and flip"
```

---

### Task 3.6: Text Controls

**Files:**
- Create: `src/components/edit/TextControls.tsx`

**Step 1: Create text overlay controls**

Renders in right panel when Text tab is active:

- **Font family dropdown:** Custom dropdown with font preview (each option rendered in its own font)
  - Include fonts: DM Sans, Instrument Sans, JetBrains Mono, Playfair Display, Bebas Neue, Montserrat, Oswald, Roboto Slab, Merriweather, Fira Code
  - Load additional Google Fonts dynamically as needed

- **Font size:** Number input + small increase/decrease buttons (12 to 200, default 48)
- **Font weight:** Dropdown: Light (300), Regular (400), Medium (500), Semi-bold (600), Bold (700)
- **Font style:** Toggle buttons: Italic, Underline
- **Text alignment:** Toggle group: Left, Center, Right

- **Text color:**
  - Color swatch button that opens a color picker popover
  - Recent colors row (last 8 used colors, stored in local state)
  - Input for hex value

- **Text shadow:** Toggle + controls when enabled:
  - X offset slider (-20 to 20)
  - Y offset slider (-20 to 20)
  - Blur slider (0 to 30)
  - Shadow color picker

- **Text stroke:** Toggle + controls when enabled:
  - Width slider (0 to 10)
  - Stroke color picker

- **Letter spacing:** Slider (-5 to 20, default 0)
- **Line height:** Slider (0.8 to 3.0, step 0.1, default 1.4)
- **Opacity:** Slider (0 to 100, default 100)

- **Action buttons:**
  - "Add Text" — creates a new Konva Text node on the canvas
  - "Delete Selected" — removes the selected text layer

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/TextControls.tsx && git commit -m "feat: add comprehensive text overlay controls with font, color, shadow, stroke"
```

---

### Task 3.7: AI Tools Panel

**Files:**
- Create: `src/components/edit/AIToolsPanel.tsx`

**Step 1: Create the AI editing features panel**

Renders in right panel when AI Tools tab is active. Each AI feature is an expandable card:

**Card structure:**
- Collapsed: icon + name + brief description + "Apply" button
- Expanded: full controls for that feature
- Dramatic card style: `bg-elevated`, `border-cinema`, red icon accent

**Cards:**

1. **Background Removal**
   - Icon: Scissors
   - Controls: "Remove Background" primary button, Edge refinement slider (0-100), "Replace Background" secondary button with prompt input
   - Result: shows checkerboard behind subject

2. **AI Upscale**
   - Icon: Maximize2
   - Controls: Scale selector (2x, 4x), Model dropdown (General, Face, Anime), "Upscale" button
   - Result: before/after comparison slider

3. **Style Transfer**
   - Icon: Palette
   - Controls: Style presets grid (Van Gogh, Monet, Ukiyo-e, Comic, Watercolor, Pencil Sketch), custom reference image upload, Strength slider (0-100%)
   - Result: applied to canvas

4. **Generative Fill**
   - Icon: Paintbrush
   - Controls: "Paint mask area first" instruction text, prompt input for fill content, "Generate" button, variant grid (4 options to pick from)

5. **Face Enhancement**
   - Icon: User
   - Controls: Enhancement strength slider, Eye enhancement toggle, Skin smoothing slider (0-100)

6. **Object Removal**
   - Icon: Eraser
   - Controls: "Brush over object to remove" instruction, "Remove" button

7. **AI Expand (Outpainting)**
   - Icon: Expand
   - Controls: Direction buttons (up/down/left/right/all), pixel amount input, prompt for expanded area

Each card calls the backend via new API endpoints. For now, the buttons show a loading spinner and a "Processing..." state. If the backend doesn't have the endpoint yet, show a toast: "AI feature requires backend setup - see docs."

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/AIToolsPanel.tsx && git commit -m "feat: add AI tools panel (bg removal, upscale, style transfer, gen fill, etc.)"
```

---

### Task 3.8: Layer Panel

**Files:**
- Create: `src/components/edit/LayerPanel.tsx`

**Step 1: Create the layer management panel**

Renders at the bottom of the right properties panel, always visible in edit mode:

- **Header:** "Layers" label + action buttons (New Layer, Duplicate, Delete)
- **Layer list:** Scrollable list (max-height ~200px), each layer as a row:
  - Drag handle (GripVertical icon) — uses `@dnd-kit/sortable` for reorder
  - Visibility toggle (Eye/EyeOff icon)
  - Layer thumbnail (tiny 32x32 preview)
  - Layer name (editable on double-click)
  - Opacity slider (inline, small, 0-100%)
  - Blend mode dropdown (Normal, Multiply, Screen, Overlay, Soft Light, Hard Light, Difference)
  - Lock toggle (Lock/Unlock icon)

- Layers are rendered bottom-to-top (bottom layer = bottom of list)
- Selected layer: `bg-red-aura`, `border-l-2 border-red-primary`
- Click to select, drag to reorder

Uses `editLayers`, `addEditLayer`, `updateEditLayer`, `removeEditLayer`, `reorderEditLayers` from the store.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/LayerPanel.tsx && git commit -m "feat: add layer management panel with drag-reorder and blend modes"
```

---

### Task 3.9: Edit Properties Panel & Tab System

**Files:**
- Create: `src/components/edit/EditPropertiesPanel.tsx`

**Step 1: Create the properties panel shell with tab navigation**

The right panel in edit mode (360px wide) with:
- **Tab bar at top:** Five tabs — Adjust, Filters, Crop, Text, AI Tools
  - Each tab: icon + short label
  - Active tab: `text-red-primary` with underline glow (same pattern as generate mode toggle)
  - Uses `font-display text-xs`

- **Tab content area:** Scrollable, renders the appropriate component:
  - Adjust → `<AdjustmentPanel />`
  - Filters → `<FilterGrid />`
  - Crop → `<CropControls />`
  - Text → `<TextControls />`
  - AI Tools → `<AIToolsPanel />`

- **Layer panel at bottom:** Always visible below the tab content, separated by a resizable divider (drag border to change the split between tab content and layer panel).

- **Edit toolbar at very top** (above tabs):
  - Undo button with step count badge
  - Redo button with step count badge
  - Before/After toggle button
  - History dropdown button

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/edit/EditPropertiesPanel.tsx && git commit -m "feat: add edit properties panel with tab system and layer panel"
```

---

### Task 3.10: Assemble Edit Mode

**Files:**
- Rewrite: `src/pages/EditPanel.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Rewrite EditPanel as a mode orchestrator**

The EditPanel is no longer a right-side panel — it's a full workspace mode. The old EditPanel.tsx becomes a thin orchestrator that:
- Renders `<ToolStrip />` on the left
- Renders `<EditCanvas />` in the center
- Renders `<EditPropertiesPanel />` on the right
- Manages the coordination between tool selection, canvas state, and properties

However, since WorkspaceLayout already handles the layout, EditPanel.tsx may instead export the three sub-components that WorkspaceLayout positions. The simplest approach:
- `EditPanel` exports a component that renders just the `<EditPropertiesPanel />`
- WorkspaceLayout renders `<ToolStrip />` and `<EditCanvas />` directly in edit mode

**Step 2: Update WorkspaceLayout for edit mode**

Ensure the edit mode layout correctly renders:
- Sidebar | ToolStrip (56px) | EditCanvas (flex-1) | EditPropertiesPanel (360px)

**Step 3: Test edit mode**

Run: `cd C:/vision-studio && npm run dev`
Navigate to Edit. Verify: tool strip renders on left, canvas in center, properties on right. Tab switching works. Tool selection works. Sliders in adjustment panel respond.

**Step 4: Commit**

```bash
cd C:/vision-studio && git add src/pages/EditPanel.tsx src/components/layout/WorkspaceLayout.tsx src/components/edit/ && git commit -m "feat: assemble complete edit mode with tool strip, canvas, and properties"
```

---

## Phase 4: Batch Panel

### Task 4.1: Batch Prompt Card with Drag-and-Drop

**Files:**
- Create: `src/components/batch/BatchPromptCard.tsx`

**Step 1: Create the draggable prompt card**

A single prompt card for the batch queue:
- Uses `@dnd-kit/sortable` — the card is a `useSortable` item
- Left edge: drag handle (GripVertical icon), visible on hover
- Prompt number badge (circle, `bg-elevated`, `font-mono`)
- Multi-line textarea (3 rows, expanding)
- Status indicator: colored left border
  - pending: `border-border`
  - generating: `border-amber-500` + pulse animation
  - completed: `border-green-500`
  - failed: `border-red-primary`
- Completed state: small thumbnail in top-right corner (24x24)
- Action buttons (right side, visible on hover):
  - Settings override toggle (Settings2 icon) — expands inline settings overrides
  - Duplicate (Copy icon)
  - Remove (Trash2 icon)

**Settings override (expandable):**
When toggled, shows a compact settings section within the card:
- Width/Height dropdowns (compact)
- Steps slider (compact)
- Model dropdown (compact)
- Seed input

Props:
```typescript
interface BatchPromptCardProps {
  prompt: BatchPrompt;
  index: number;
  isGenerating: boolean;
  onUpdate: (id: string, updates: Partial<BatchPrompt>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}
```

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/batch/BatchPromptCard.tsx && git commit -m "feat: add draggable batch prompt card with settings override"
```

---

### Task 4.2: Batch Prompt Queue Panel

**Files:**
- Create: `src/components/batch/BatchPromptQueue.tsx`

**Step 1: Create the left-side prompt queue panel**

A 420px panel containing:

**Header section:**
- "Batch Generation" heading + badge showing prompt count
- Import/Export buttons:
  - Import: click opens file dialog (JSON/CSV/TXT), parse file into prompts
  - Export: calls `handleExport()` (existing logic, move here)
- "Clear All" button with confirmation (small modal or popover: "Clear all prompts?")

**Prompt list:**
- `DndContext` + `SortableContext` wrapping the list of `BatchPromptCard` components
- `verticalListSortingStrategy`
- `onDragEnd` handler updates prompt order in state
- Smooth drag overlay with card preview

**Quick add tools (below list):**
- "Add Prompt" button (Plus icon)
- "Generate Variations" button (Wand2 icon) — takes the last prompt, generates 4 variations
- "Import from File" button (FileUp icon)

**Shared settings (collapsible bottom section):**
- Exactly as in design doc: model, width, height, steps, CFG, seed strategy
- Seed strategy: Radio group — Random, Sequential, Fixed (with seed input)

**Batch controls (sticky bottom):**
- Progress bar (when running): shows completed/total with percentage
- "Start Batch (N)" primary button — disabled if no prompts
- "Pause" / "Cancel" buttons (when running)
- "Concurrent Jobs" selector: 1, 2, 3, 4 (dropdown or small button group)

Migrate the existing BatchPanel logic (handleStartBatch, pollBatchProgress, handleCancel, handleExport) into this component, cleaned up to use the new store actions.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/batch/BatchPromptQueue.tsx && git commit -m "feat: add batch prompt queue panel with drag-reorder and shared settings"
```

---

### Task 4.3: Results Grid

**Files:**
- Create: `src/components/batch/ResultsGrid.tsx`
- Create: `src/components/batch/ResultCard.tsx`

**Step 1: Create ResultCard component**

A single result image card:
- Image thumbnail (fills card width, maintains aspect ratio)
- Below image: prompt text (2 lines, truncated), seed in `font-mono`, generation time
- Hover: card lifts (`shadow-cinematic`), subtle scale(1.02), shows overlay with:
  - Full prompt tooltip
  - Quick action buttons: heart (favorite), download, edit (send to edit panel)
- Selected state: `border-red-primary`, `ring-2 ring-red-glow`
- Failed state: error icon overlay, red tint

**Step 2: Create ResultsGrid component**

The right/center area in batch mode:

**Controls bar (top):**
- View toggle: three icon buttons — Grid, List, Large
  - Grid: 3-4 columns of ResultCards
  - List: single column, wider cards with more metadata
  - Large: 2 columns, bigger thumbnails
- Sort dropdown: Creation time, Prompt order, Status
- Filter pills: All, Completed, Failed, Favorites
- "Export All" button (ZIP download) + "Select All" / "Deselect All"

**Grid area:**
- Responsive grid of ResultCard components
- Multi-select: hold Shift+click to select range, Ctrl+click to toggle individual
- When items selected, a bulk actions bar appears at bottom:
  - "N selected" count
  - Delete, Export, Send to Edit, Favorite buttons

**Empty state:**
- When no results: centered message with Layers icon, "Generate a batch to see results here"

Uses `batchResults` from the store.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/components/batch/ResultsGrid.tsx src/components/batch/ResultCard.tsx && git commit -m "feat: add batch results grid with multi-select and bulk actions"
```

---

### Task 4.4: Image Preview Modal

**Files:**
- Create: `src/components/shared/ImagePreviewModal.tsx`

**Step 1: Create the full-size preview modal**

A full-screen overlay modal for viewing generated images:
- Dark overlay background (`bg-void/90`)
- Large image display (centered, max 80vh height, maintains aspect ratio)
- Left/right arrow buttons for navigation between images
- Keyboard: left/right arrows to navigate, Escape to close

**Metadata sidebar (right, 320px):**
- Full prompt text (scrollable if long)
- Negative prompt
- Settings: model, steps, CFG, seed, scheduler — each as a label:value row in `font-mono`
- Generation time
- Resolution

**Action buttons (below metadata):**
- "Send to Edit" — sets `currentImage` and switches to edit panel
- "Copy Prompt" — copies to clipboard
- "Regenerate" — switches to generate panel with these settings pre-filled
- "Upscale" — sends to AI upscale (placeholder)
- "Export" — triggers save file dialog
- "Delete" — removes from results with confirmation

Uses Framer Motion for entrance/exit animation (fade + scale).

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/shared/ImagePreviewModal.tsx && git commit -m "feat: add full-size image preview modal with metadata and actions"
```

---

### Task 4.5: Assemble Batch Mode

**Files:**
- Rewrite: `src/pages/BatchPanel.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Rewrite BatchPanel**

The BatchPanel now orchestrates the split layout:
- Left: `<BatchPromptQueue />`
- Right: `<ResultsGrid />`
- `<ImagePreviewModal />` rendered conditionally when a result is clicked

State coordination: when batch generates, results flow from `BatchPromptQueue` (which manages the generation) into the store's `batchResults`, which `ResultsGrid` reads.

**Step 2: Update WorkspaceLayout for batch mode**

Ensure batch mode renders:
- Sidebar | BatchPromptQueue (420px) | ResultsGrid (flex-1)

No canvas or timeline in batch mode.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/pages/BatchPanel.tsx src/components/layout/WorkspaceLayout.tsx src/components/batch/ && git commit -m "feat: assemble complete batch mode with prompt queue and results grid"
```

---

## Phase 5: Templates Panel

### Task 5.1: Template Card Component

**Files:**
- Create: `src/components/templates/TemplateCard.tsx`

**Step 1: Create the dramatic template card**

A visually rich card:
- **Top 60%:** Preview area
  - If template has a preview image: render it with `object-cover`
  - If not: styled gradient placeholder matching the template's category color, with aspect ratio shape outline in center
  - Hover: image zooms slightly (scale 1.05, overflow hidden), red glow border appears
- **Bottom 40%:** Info area on `bg-elevated`
  - Template name: `font-display`, `text-text-primary`, bold
  - Category badge: small pill with category color (same colors from existing code)
  - Description: 2 lines, `text-text-body text-sm`, overflow ellipsis
  - Settings chips row: resolution, model, steps — each as tiny `bg-surface rounded-md px-2 py-0.5 text-xs font-mono text-text-muted`
  - Action row: "Use Template" primary button (small) + "Preview" ghost button (small)
  - For user templates: Edit (Pencil icon) + Delete (Trash2 icon) icon buttons

Card has `shadow-cinematic` on hover, lifts with `translateY(-2px)`.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/templates/TemplateCard.tsx && git commit -m "feat: add dramatic template card with preview and category badge"
```

---

### Task 5.2: Template Preview Modal

**Files:**
- Create: `src/components/templates/TemplatePreviewModal.tsx`

**Step 1: Create the full-screen template preview**

A modal overlay:
- Left (60%): Large preview image or gradient placeholder. If multiple example images, a simple carousel (left/right arrows).
- Right (40%): Template details panel on `bg-surface`
  - Template name (large, `font-display`)
  - Category badge
  - Description (full text)
  - Settings breakdown: each setting as a row
    - Resolution: "1280 x 720"
    - Model: "FLUX.1 [dev]"
    - Steps: "25"
    - CFG Scale: "7.5"
  - Prompt text: displayed in a styled code-block-like area, with copy button
  - Negative prompt: same treatment

- **CTAs at bottom of right panel:**
  - "Use This Template" — primary, full width, glow effect
  - "Customize First" — secondary — opens inline settings editor (sliders + inputs overlaying the details)

Close: X button top-right, click overlay, Escape key

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/templates/TemplatePreviewModal.tsx && git commit -m "feat: add template preview modal with details and customize option"
```

---

### Task 5.3: Template Creator Flow

**Files:**
- Create: `src/components/templates/TemplateCreator.tsx`

**Step 1: Create the custom template creation flow**

A multi-step form rendered as a modal or slide-in panel:

**Step 1 - Basics:**
- Name input
- Description textarea (3 rows)
- Category selector: pill buttons for YouTube, Social Media, Marketing, Art & Creative

**Step 2 - Settings:**
- Model selector (same ModelSelector component from generate panel)
- Resolution: width/height dropdowns or aspect ratio presets
- Steps slider
- CFG Scale slider
- Seed strategy: Random / Fixed (with seed input)

**Step 3 - Prompts:**
- Base prompt textarea (4 rows)
- Negative prompt textarea (2 rows)
- Style presets bar (reuse StylePresetsBar) to quick-add style modifiers

**Step 4 - Preview (optional):**
- "Upload Preview Image" drop zone
- Or "Generate Preview" button — generates one image using the template settings
- Skip button

**Navigation:**
- Back / Next buttons
- Step indicator dots
- "Save Template" final button

On save: calls `addUserTemplate()` from the store. The template gets a unique ID and `isCustom: true` flag. Also persists via `window.electron.store.set('userTemplates', ...)`.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/templates/TemplateCreator.tsx && git commit -m "feat: add multi-step template creator flow"
```

---

### Task 5.4: Template Browser & Assemble Templates Mode

**Files:**
- Rewrite: `src/pages/TemplatesPanel.tsx`
- Modify: `src/components/layout/WorkspaceLayout.tsx`

**Step 1: Rewrite TemplatesPanel as full-width browser**

The TemplatesPanel now takes the full workspace width:

**Top bar:**
- Search input: `bg-elevated`, `border-cinema`, search icon, placeholder "Search templates..."
  - Filters templates by name and description
- Category tabs: All, YouTube, Social Media, Marketing, Art & Creative, My Templates
  - Styled as pill buttons, same as current but with Dark Cinema tokens
  - "My Templates" shows user-created templates + has a badge count
- Sort dropdown: Popular (default), Newest, A-Z
- View toggle: Cards (default) / Compact
- "Create Template" button (Plus icon) — opens TemplateCreator modal

**Template grid:**
- Responsive grid: 3 columns on wide screens, 2 on medium
- Uses `TemplateCard` components
- Staggered entrance animation (delay per card: `index * 0.05s`)
- Empty state for "My Templates" when no custom templates: "Create your first custom template" CTA

**Modals:**
- `TemplatePreviewModal` — opens when "Preview" is clicked on a card
- `TemplateCreator` — opens when "Create Template" is clicked

Template import/export:
- Add "Import Template" button (in My Templates section)
- Import: accepts `.vst` files (JSON with template data + optional base64 preview)
- Export: on each user template card, an export button saves as `.vst`

**Step 2: Update WorkspaceLayout for templates mode**

Templates mode: Sidebar | TemplatesPanel (full flex-1 width). No canvas, no right panel, no timeline.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/pages/TemplatesPanel.tsx src/components/layout/WorkspaceLayout.tsx src/components/templates/ && git commit -m "feat: assemble complete templates mode as full-width gallery browser"
```

---

## Phase 6: Canvas & Timeline Polish

### Task 6.1: Canvas Context Menu

**Files:**
- Create: `src/components/canvas/CanvasContextMenu.tsx`
- Modify: `src/components/layout/Canvas.tsx`

**Step 1: Create right-click context menu**

A custom context menu that appears on right-click in the canvas area:
- "Copy Image" — copies to clipboard
- "Save As..." — opens save dialog via `window.electron.dialog.saveFile`
- "Send to Edit" — loads image into edit mode
- Divider
- "Generation Info" — shows a small popover with the generation params
- "Open in Explorer" — opens the file location
- Divider
- "Zoom to Fit" / "Zoom to 100%"

Style: `bg-elevated`, `shadow-cinematic`, `border-cinema`, `rounded-lg`. Items use `font-display text-sm`.

**Step 2: Integrate into Canvas**

Add `onContextMenu` handler to the canvas container that prevents default and shows the custom menu at cursor position.

**Step 3: Commit**

```bash
cd C:/vision-studio && git add src/components/canvas/CanvasContextMenu.tsx src/components/layout/Canvas.tsx && git commit -m "feat: add right-click context menu to canvas"
```

---

### Task 6.2: Timeline Polish

**Files:**
- Modify: `src/components/layout/Timeline.tsx`

**Step 1: Upgrade Timeline with Dark Cinema aesthetic and collapsibility**

- Apply Dark Cinema tokens to all colors
- Add minimize/maximize toggle: click to collapse to a thin 32px bar showing only play controls
- Connect to real data: use `completedJobs` from store to populate tracks
  - Each completed job becomes a track clip
  - Image jobs: single frame, duration = 1s
  - Video jobs: duration from params
- Remove placeholder tracks
- Style upgrade: track clips get red gradient fills, glow on selected, `font-display` for labels
- Add a "No content yet" empty state when no completed jobs

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/layout/Timeline.tsx && git commit -m "feat: upgrade timeline with real data, Dark Cinema aesthetic, and collapse"
```

---

## Phase 7: Integration & Final Polish

### Task 7.1: Assets Panel Dark Cinema Upgrade

**Files:**
- Modify: `src/pages/AssetsPanel.tsx`

**Step 1: Apply Dark Cinema aesthetic to Assets panel**

Update all colors, fonts, and effects to match the new design system. Keep existing functionality but upgrade the visual treatment.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/pages/AssetsPanel.tsx && git commit -m "feat: upgrade assets panel to Dark Cinema aesthetic"
```

---

### Task 7.2: Settings Panel Dark Cinema Upgrade

**Files:**
- Modify: `src/pages/SettingsPanel.tsx`

**Step 1: Apply Dark Cinema aesthetic to Settings panel**

Same as above — update colors, fonts, effects to match the new design system.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/pages/SettingsPanel.tsx && git commit -m "feat: upgrade settings panel to Dark Cinema aesthetic"
```

---

### Task 7.3: Setup Wizard Dark Cinema Upgrade

**Files:**
- Modify: `src/components/SetupWizard.tsx`

**Step 1: Apply Dark Cinema aesthetic to the first-run wizard**

Update the wizard to use new typography, colors, and effects. The wizard should feel like the dramatic opening of the app.

**Step 2: Commit**

```bash
cd C:/vision-studio && git add src/components/SetupWizard.tsx && git commit -m "feat: upgrade setup wizard to Dark Cinema aesthetic"
```

---

### Task 7.4: Full Integration Test

**Step 1: Run the full application**

Run: `cd C:/vision-studio && npm run dev`

**Step 2: Test each workspace mode**

Test checklist:
- [ ] Sidebar navigation switches between all modes
- [ ] Cinematic transition plays between mode switches
- [ ] Film grain overlay is visible and animated
- [ ] Ambient particles drift in canvas area

**Generate mode:**
- [ ] Prompt area accepts text, character count updates
- [ ] Prompt toolbar buttons are interactive
- [ ] Style presets bar scrolls, chips are clickable
- [ ] Image drop zone accepts drag-and-drop
- [ ] ControlNet panel expands/collapses
- [ ] LoRA mixer allows adding/removing/reordering
- [ ] Model selector opens with model cards
- [ ] Advanced settings expand with all sliders
- [ ] Generate button shows correct state (idle/generating/disabled)
- [ ] Canvas shows generation progress overlay
- [ ] Queue strip at bottom shows completed generations

**Edit mode:**
- [ ] Tool strip renders on left with all tool groups
- [ ] Keyboard shortcuts select tools
- [ ] Canvas renders with Konva
- [ ] Properties panel tabs switch correctly
- [ ] Adjustment sliders update CSS filter preview in real-time
- [ ] Filter grid shows filter thumbnails
- [ ] Crop controls show aspect ratio presets
- [ ] Text controls have font selector
- [ ] AI tools cards render and expand
- [ ] Layer panel shows at bottom with drag reorder

**Batch mode:**
- [ ] Prompt queue on left, results grid on right
- [ ] Prompts can be added, removed, reordered (drag)
- [ ] Settings override per-prompt works
- [ ] Import/Export buttons functional
- [ ] Results grid shows completed images
- [ ] Multi-select works with shift+click
- [ ] Image preview modal opens on click

**Templates mode:**
- [ ] Full-width gallery renders
- [ ] Category filtering works
- [ ] Search filters templates
- [ ] Template cards show preview, info, actions
- [ ] "Use Template" loads settings into generate mode
- [ ] "Preview" opens template preview modal
- [ ] "Create Template" opens creator flow
- [ ] Creator flow saves to store

**Step 3: Fix any integration issues found**

Address broken layouts, missing imports, state synchronization issues, or visual inconsistencies.

**Step 4: Commit**

```bash
cd C:/vision-studio && git add -A && git commit -m "fix: integration fixes from full application testing"
```

---

### Task 7.5: Build Verification

**Step 1: Run production build**

Run: `cd C:/vision-studio && npm run build`
Expected: Build completes without errors.

**Step 2: Test the built app**

Run: `cd C:/vision-studio && npm run preview` (or electron preview if available)
Verify the built version works correctly.

**Step 3: Fix any build issues**

Address TypeScript errors, missing imports, or bundling problems.

**Step 4: Commit**

```bash
cd C:/vision-studio && git add -A && git commit -m "fix: resolve production build issues"
```

---

## Dependency Graph

```
Phase 0 (Foundation) ──┬── Task 0.1 (Dependencies)
                       ├── Task 0.2 (Design System) ──> all subsequent tasks
                       ├── Task 0.3 (Film Grain)
                       ├── Task 0.4 (Particles)
                       ├── Task 0.5 (Transition)
                       ├── Task 0.6 (UI Primitives) ──> Phase 2, 3, 4, 5
                       └── Task 0.7 (Store) ──> Phase 2, 3, 4, 5

Phase 1 (Workspace) ───┬── Task 1.1 (WorkspaceLayout) ──> Phase 2, 3, 4, 5
                       ├── Task 1.2 (Sidebar)
                       ├── Task 1.3 (Header)
                       └── Task 1.4 (Effects in App)

Phase 2 (Generate) ────┬── Task 2.1 (Shell)
                       ├── Task 2.2 (Prompt Area)
                       ├── Task 2.3 (History)
                       ├── Task 2.4 (Style Presets)
                       ├── Task 2.5 (Image Drop)
                       ├── Task 2.6 (ControlNet)
                       ├── Task 2.7 (LoRA)
                       ├── Task 2.8 (Model Selector)
                       ├── Task 2.9 (Advanced Settings)
                       ├── Task 2.10 (Generate Button)
                       ├── Task 2.11 (Assemble) ──> depends on 2.1-2.10
                       ├── Task 2.12 (Canvas Progress)
                       └── Task 2.13 (Comparison View)

Phase 3 (Edit) ────────┬── Task 3.1 (Tool Strip)
                       ├── Task 3.2 (Edit Canvas)
                       ├── Task 3.3 (Adjustments)
                       ├── Task 3.4 (Filters)
                       ├── Task 3.5 (Crop)
                       ├── Task 3.6 (Text)
                       ├── Task 3.7 (AI Tools)
                       ├── Task 3.8 (Layers)
                       ├── Task 3.9 (Properties Panel) ──> depends on 3.3-3.8
                       └── Task 3.10 (Assemble) ──> depends on 3.1, 3.2, 3.9

Phase 4 (Batch) ───────┬── Task 4.1 (Prompt Card)
                       ├── Task 4.2 (Prompt Queue) ──> depends on 4.1
                       ├── Task 4.3 (Results Grid)
                       ├── Task 4.4 (Preview Modal)
                       └── Task 4.5 (Assemble) ──> depends on 4.2, 4.3, 4.4

Phase 5 (Templates) ───┬── Task 5.1 (Template Card)
                       ├── Task 5.2 (Preview Modal)
                       ├── Task 5.3 (Creator Flow)
                       └── Task 5.4 (Assemble) ──> depends on 5.1, 5.2, 5.3

Phase 6 (Polish) ──────┬── Task 6.1 (Context Menu)
                       └── Task 6.2 (Timeline)

Phase 7 (Integration) ─┬── Task 7.1 (Assets)
                       ├── Task 7.2 (Settings)
                       ├── Task 7.3 (Wizard)
                       ├── Task 7.4 (Integration Test)
                       └── Task 7.5 (Build Verify)
```

**Phases 2-5 can be worked in parallel** since they are independent workspace modes. Within each phase, tasks should be completed in order (sub-components before assembly).
