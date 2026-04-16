# Vision Studio Carbon Pro Design Spec

Date: 2026-04-16

## Status

Approved design direction. This spec supersedes the earlier Dark Cinema visual
system and reframes Vision Studio as a serious creative workstation for
fast-changing generative model workflows.

## North Star

Vision Studio is a desktop-native creative command center for generative image
and video workflows.

It is not a model playground, a ComfyUI skin, a SaaS dashboard, or a themed
prompt form. It is professional creative software for managing intent, models,
variants, scenes, assets, timelines, and output pipelines while the model
ecosystem changes underneath it.

The product should feel like:

- A serious studio tool.
- Canvas-first.
- Model/runtime aware.
- Dense but calm.
- Fast, precise, and technically credible.
- Built for continuity across images, edits, variants, scenes, and video.

## Benchmark

Invoke is the immediate credibility benchmark.

Invoke communicates maturity through restraint: sparse palette, sharp hierarchy,
central product proof, dense professional panels, and a canvas-oriented workflow.
Vision Studio should learn from that restraint without copying Invoke directly.

Vision Studio should exceed Invoke by owning:

- Model/runtime routing as a first-class UX.
- Storyboard and timeline continuity.
- Variant management.
- Desktop-native project state.
- Image plus video workflows.
- Local, BYOM, ComfyUI, and cloud-capable routing over time.

Other reference points:

- DaVinci Resolve: professional density, timeline seriousness, output-oriented
  workflow.
- Figma: quiet chrome, precise inspectors, fast spatial interaction.
- Krea: AI-native model experimentation and creative immediacy.
- ComfyUI: powerful workflow runtime, but not the target UX.

## Design Principles

### Canvas First

The canvas is the emotional and functional center of the product. Every panel
serves the stage. Empty states, render states, comparison states, and edit states
must feel intentional and premium.

### Model-Agnostic By Design

Models are replaceable capability providers, not the product itself. The UI
should organize around capabilities such as image generation, edit, inpaint,
upscale, image-to-video, text-to-video, and storyboard-to-video.

### Serious Restraint

Avoid decorative AI tropes. No excessive glow, no one-note red theme, no playful
sparkle language, no dashboard-card repetition, and no visual noise that competes
with creative output.

### Professional Density

The app should trust users. Controls can be compact and information-rich when
the hierarchy is clear. Use inspector rows, segmented controls, tool groups, and
metadata strips instead of oversized SaaS cards.

### Continuity Over Single Outputs

Every result belongs to a chain: prompt, model, runtime, seed, scene, variant,
asset, edit, timeline clip, export. The UI should preserve this creative
provenance visibly and elegantly.

## Visual System

### Palette

The base palette shifts from red-glow cinema to carbon professional software.

| Role | Token | Direction |
| --- | --- | --- |
| App shell | Carbon Black | Near-black, neutral, non-blue, non-purple |
| Workspace | Graphite | Slightly lifted from shell |
| Canvas backplate | Deep Carbon | Dark stage behind artboards |
| Panels | Panel Graphite | Quiet, low-contrast inspector surfaces |
| Overlays | Slate Glass | Subtle transparency only when functionally useful |
| Primary text | Studio White | Crisp, not pure white everywhere |
| Secondary text | Muted Steel | Legible, calm, never washed out |
| Borders | Hairline | Fine separators over boxy outlines |
| Focus/primary | Chrome Silver | Sparse, professional signature accent |
| Danger/error | Red | Reserved for destructive/error/recording states |

Chrome Silver should feel precise, technical, and hardware-native rather than
playful or neon. Red should no longer be the main brand color.

Capability accents are secondary and used sparingly:

- Image: cyan.
- Video: amber.
- Edit and mask: magenta.
- Local and BYOM: green.
- Cloud/provider: blue.
- Error/destructive: red.

### Typography

Use a calm professional type hierarchy:

- UI/body: Inter, Geist, or another high-legibility neutral sans.
- Display: same family in stronger weight unless a distinctive production-grade
  display face is selected later.
- Mono: JetBrains Mono or equivalent, only for technical metadata, seeds,
  dimensions, runtime IDs, and file paths.

Rules:

- Reduce uppercase micro-labeling.
- Use 0 letter spacing by default.
- Use mono sparingly.
- Prefer clear alignment and scale over decorative typography.
- Section titles should be quieter and more useful than the current panel
  headers.

### Shape And Surface

Carbon Pro should reduce rounded, repetitive card language.

Rules:

- Use 6-8px radius for controls and overlays.
- Avoid large rounded cards except for true repeated items, modals, asset cards,
  and model cards.
- Prefer hairline dividers and docked panels over floating boxes.
- Shadows should be subtle and depth-oriented, not glow-oriented.
- Use glass only for floating canvas tools and transient overlays.

### Motion

Motion should feel expensive and fast.

Rules:

- 120-180ms for most transitions.
- Transform and opacity only.
- No bouncy playful motion.
- No persistent decorative animation competing with the canvas.
- Reduced-motion support is required.
- Render progress may use restrained movement because it communicates state.

## Layout Architecture

The app uses one persistent creative workspace with contextual modes.

Primary regions:

- Left: compact mode rail.
- Top: quiet project/runtime chrome.
- Center: canvas stage.
- Right: contextual inspector.
- Bottom: timeline, variant strip, or output history depending on mode.

Modes should feel like different configurations of the same studio, not separate
web pages.

## Navigation

### Mode Rail

Replace the expanded admin-style sidebar with a compact professional rail.

Groups:

- Create: Generate, Quick.
- Sequence: Storyboard, Batch, Timeline.
- Refine: Edit, Assets.
- System: Models, Settings.

Behavior:

- Icon rail by default.
- Labels can appear on hover, command palette, or expanded mode.
- Active indicator uses the signature accent sparingly.
- Remove global actions such as Preview, Export, Save, Undo, and Redo from the
  nav rail. Place them in contextual toolbars where they belong.

### Header

The header should become quiet production chrome.

It should contain:

- Project selector.
- Save/sync state.
- Runtime status.
- Active profile or capability status.
- Optional command/search entry.

It should not contain an oversized logo or visually heavy branding. Branding
belongs in startup, about, website, and maybe the collapsed rail mark.

## Canvas Stage

The canvas must feel like a studio stage.

States:

- Empty: premium prompt/start state integrated with the stage, not a generic
  placeholder.
- Active image: crisp artboard with subtle backplate, metadata, and fit controls.
- Generating: focused render state with progress, model, elapsed time, and
  cancellation.
- Comparing: side-by-side, slider, onion, or grid comparison.
- Editing: visible tool affordances, masks, handles, and layer indicators.

Rules:

- Floating canvas tools should be compact and functionally grouped.
- Grid, zoom, pan, fit, and compare controls should feel like instruments.
- The canvas should not be framed inside decorative cards.
- Metadata overlays should be quiet and dismissible.

## Model Router

The Model Router is a signature Vision Studio component.

It replaces the basic model dropdown with a compact routing control that explains
what will happen without overwhelming users.

Each model/workflow option should expose:

- Capability: image, edit, inpaint, video, upscale, storyboard.
- Runtime: local, ComfyUI, BYOM, Hugging Face, hosted provider, Vision Studio.
- Availability: ready, install required, login required, unsupported, external.
- Hardware fit: laptop-safe, creator laptop, workstation, unknown.
- Cost state: free/local, external credits, provider key, Vision Studio credits.
- Quality tier: draft, balanced, pro, experimental.
- Expected speed: fast, normal, slow, long-running.
- License/access notes where needed.

Primary UX:

- The closed control shows model name, capability, runtime, and status.
- The expanded router groups options by capability and availability.
- Unavailable models remain visible only when useful, with clear reasons.
- Advanced technical IDs are secondary metadata, not primary labels.

This is where Vision Studio should feel smarter than Invoke.

## Generate Inspector

The current right-side form should become a pro inspector.

Structure:

- Prompt composer: dominant, clean, no gimmicks.
- Model Router: immediately below prompt.
- Core controls: aspect, size, quality/speed, seed.
- Reference inputs: image, mask, style, character, scene.
- Advanced controls: collapsed, grouped, compact.
- Generate action: strong but not glowing everywhere.

Rules:

- Use rows, grouped sections, and segmented controls.
- Keep controls dense but readable.
- Show practical warnings inline: hardware, login, cost, model availability.
- The primary action should communicate exactly what will run.

## Edit Inspector

Edit mode should feel closer to Figma/Photoshop/Invoke.

Core sections:

- Active layer/object/region.
- Transform and geometry.
- Mask/region lock settings.
- Prompted edit controls.
- AI tools: inpaint, object remove, background, upscale, expand.
- Layer stack.

Rules:

- Tool-specific controls should appear only when relevant.
- Mask controls should use edit/magenta accent, not global primary accent.
- Region locks and protected areas should be visually precise and trustworthy.

## Timeline And Variants

This is Vision Studio's main differentiation from image-only tools.

Bottom region can switch between:

- Recent outputs.
- Pinned variants.
- Scene timeline.
- Batch queue/results.
- Video strip.

Capabilities:

- Pin a result.
- Branch from a result.
- Promote result to asset, scene, or timeline clip.
- Compare variants.
- Preserve prompt/model/seed/runtime metadata.
- Drag clips/scenes to reorder.

Visual treatment:

- Dense filmstrip or timeline, not chunky cards.
- Thumbnail-first.
- Quiet metadata on hover or selection.
- Strong selected-state clarity.

## Dashboard / Studio Lobby

If Vision Studio has a home/dashboard, it should feel like a studio lobby, not a
SaaS analytics dashboard.

Content:

- Continue last project.
- Recent projects.
- Recent outputs.
- Active runtime profile.
- Available workflows.
- Quick start: Image, Edit, Video, Storyboard, Batch.
- Alerts: missing model pack, external login required, runtime offline.

Rules:

- Sparse and visual.
- Product screenshot/output previews carry credibility.
- Avoid charts unless they directly help creative work.

## Component Direction

First redesign targets:

- `src/index.css`: replace Dark Cinema tokens with Carbon Pro tokens and keep
  compatibility aliases during migration.
- `src/components/layout/Header.tsx`: quiet chrome, remove oversized logo
  treatment.
- `src/components/layout/Sidebar.tsx`: compact mode rail and contextual action
  removal.
- `src/components/layout/Canvas.tsx`: premium canvas stage, empty state, floating
  instruments.
- `src/components/generate/ModelSelector.tsx`: evolve into Model Router.
- Generate, Quick, Batch, Storyboard panels: inspector/timeline treatment.
- Timeline components: make the bottom region a real differentiator.

## Accessibility And Usability Rules

- Maintain WCAG AA contrast.
- Preserve visible focus states.
- Keep touch/click targets at least 44px where practical, especially for
  interactive rails and floating tools.
- Avoid color-only state indicators.
- Respect reduced motion.
- Text must fit in all panels and not rely on viewport-width font scaling.
- Dense UI is acceptable only when hierarchy and spacing remain clear.

## Implementation Phases

### Phase 1: Shell And Tokens

- Replace visual tokens with Carbon Pro palette.
- Reduce glow and red usage.
- Update buttons, inputs, switches, sliders, and focus states.
- Refine header and sidebar.
- Keep existing layout behavior intact.

### Phase 2: Canvas Stage

- Redesign empty state and active artboard treatment.
- Refine floating canvas tools.
- Improve generation progress overlay.
- Improve output metadata overlays.

### Phase 3: Model Router

- Replace the basic dropdown with the first Model Router version.
- Add runtime, capability, availability, and hardware-fit metadata.
- Keep existing generation request IDs unchanged initially.

### Phase 4: Inspector Panels

- Rework Generate and Quick panels into compact inspectors.
- Rework Edit properties into more precise contextual groups.
- Reduce card nesting and border noise.

### Phase 5: Timeline And Variants

- Upgrade bottom timeline/filmstrip.
- Add pinned variants and result provenance affordances.
- Make storyboard/video continuity visually central.

### Phase 6: Dashboard / Studio Lobby

- Add or redesign home/dashboard view once the core workspace has the new visual
  language.

## Non-Goals For First Pass

- Do not redesign every feature panel at once.
- Do not change generation runtime architecture in the same pass.
- Do not add new model providers as part of the visual spec.
- Do not chase decorative animation.
- Do not remove local/ComfyUI/direct generation code as part of UI work.

## Success Criteria

The redesign is successful when:

- The app no longer reads as a dark SaaS dashboard.
- The canvas feels like the primary product surface.
- The Model Router feels like a differentiated Vision Studio idea.
- Red is no longer the dominant visual identity.
- Dense controls feel professional rather than cluttered.
- Invoke remains a benchmark, but Vision Studio reads as broader and more
  workflow-native.
