# Vision Studio Carbon Pro Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Dark Cinema/red-glow interface with the first Carbon Pro pass: a serious canvas-first creative workstation shell with refined chrome, compact mode rail, premium canvas stage, and an initial model-router visual language.

**Architecture:** Keep existing React/Electron/FastAPI behavior intact and make the first pass UI-only. Migrate the design system through CSS tokens and component classes, preserving compatibility aliases where possible so feature code keeps working while the aesthetic changes. Start with the global shell, shared primitives, canvas, and model selector before touching deeper panels.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Framer Motion, Vitest, Testing Library.

---

## Context

Read first:

- `docs/plans/2026-04-16-vision-studio-carbon-pro-design.md`
- `docs/plans/2026-02-23-panel-redesign-design.md`
- `src/index.css`
- `src/components/layout/Header.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Canvas.tsx`
- `src/components/generate/ModelSelector.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Textarea.tsx`
- `src/components/ui/Switch.tsx`
- `src/components/ui/Slider.tsx`

Rules:

- Do not change backend generation behavior in this pass.
- Do not change model IDs sent to the backend in this pass.
- Do not remove existing tests unless replacing them with equivalent coverage.
- Keep red as an error/destructive/recording color only after migration.
- Avoid decorative animation and excessive glow.
- Use clickable controls with visible focus states.

## Task 1: Carbon Pro Token Foundation

**Files:**

- Modify: `src/index.css`
- Test: `src/components/ui/Button.test.tsx`
- Test: `src/components/ui/Input.test.tsx`
- Test: `src/components/ui/Textarea.test.tsx`
- Test: `src/components/ui/Switch.test.tsx`
- Test: `src/components/ui/Slider.test.tsx`

**Step 1: Add token migration tests where existing tests are brittle**

Inspect tests that assert old red utility classes directly. Keep behavioral tests,
but update class assertions to target semantic classes or accessible state where
possible.

Run:

```powershell
npx vitest run src/components/ui/Button.test.tsx src/components/ui/Input.test.tsx src/components/ui/Textarea.test.tsx src/components/ui/Switch.test.tsx src/components/ui/Slider.test.tsx --project unit --project component
```

Expected: current tests pass or reveal direct red-class assertions that need
semantic updating.

**Step 2: Replace Dark Cinema tokens with Carbon Pro tokens**

In `src/index.css`, update the top token block:

- `--color-void`: carbon app shell.
- `--color-canvas`: deep carbon stage.
- `--color-surface`: graphite panels.
- `--color-elevated`: lifted panel/overlay graphite.
- Add semantic primary tokens:
  - `--color-accent-primary`
  - `--color-accent-primary-hover`
  - `--color-accent-primary-muted`
  - `--color-accent-primary-border`
- Add capability tokens:
  - `--color-capability-image`
  - `--color-capability-video`
  - `--color-capability-edit`
  - `--color-capability-local`
  - `--color-capability-cloud`
- Keep backward-compatible aliases:
  - `--color-red-primary: var(--color-status-error)`
  - `--color-red-highlight: var(--color-status-error)`
  - `--color-red-aura: var(--color-status-error-muted)`
  - `--color-red-glow: rgba(...)`

Suggested Carbon Pro values:

```css
--color-void: #070809;
--color-canvas: #0d0f10;
--color-surface: #111416;
--color-elevated: #181c1f;
--color-panel: #15191c;
--color-panel-raised: #1c2226;
--color-accent-primary: #d7ff3f;
--color-accent-primary-hover: #ecff82;
--color-accent-primary-pressed: #a9d800;
--color-accent-primary-muted: rgba(215, 255, 63, 0.09);
--color-accent-primary-border: rgba(215, 255, 63, 0.28);
--color-text-primary: #f4f6f3;
--color-text-body: #a7aea8;
--color-text-muted: #788179;
--color-border: rgba(229, 235, 224, 0.08);
--color-border-hover: rgba(229, 235, 224, 0.16);
```

**Step 3: Replace focus and selection primary color**

Update global focus, selection, range slider, gradient text, glow utilities, and
component-support utilities to use `--color-accent-primary` where the state is
primary/focused, and status red only where the state is error/danger.

**Step 4: Run focused UI tests**

Run:

```powershell
npx vitest run src/components/ui/Button.test.tsx src/components/ui/Input.test.tsx src/components/ui/Textarea.test.tsx src/components/ui/Switch.test.tsx src/components/ui/Slider.test.tsx --project unit --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/index.css src/components/ui/Button.test.tsx src/components/ui/Input.test.tsx src/components/ui/Textarea.test.tsx src/components/ui/Switch.test.tsx src/components/ui/Slider.test.tsx
git commit -m "feat(ui): add Carbon Pro design tokens"
```

## Task 2: Shared UI Primitive Carbon Pass

**Files:**

- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Input.tsx`
- Modify: `src/components/ui/Textarea.tsx`
- Modify: `src/components/ui/Switch.tsx`
- Modify: `src/components/ui/Slider.tsx`
- Modify: `src/components/ui/Tooltip.tsx`
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Test: existing tests under `src/components/ui/`

**Step 1: Write or update variant tests**

Assert:

- Primary button renders usable text and is not disabled by default.
- Danger button remains visually distinct from primary.
- Switch checked state remains accessible through `aria-checked`.
- Inputs and textareas still expose errors with `aria-describedby` if existing
  component patterns support it.

Run:

```powershell
npx vitest run src/components/ui --project unit --project component
```

Expected: PASS before visual class changes or focused failures from class
assertions.

**Step 2: Update primitives**

Apply Carbon Pro styling:

- Primary button: carbon/citron accent, no red glow.
- Secondary/ghost buttons: graphite surfaces, hairline borders, precise hover.
- Danger button: red only for destructive actions.
- Inputs/textareas: graphite field, citron focus, red error.
- Switch: citron checked state.
- Slider: citron active track/thumb, status red only for error contexts.
- Tooltip/dialog: reduce roundedness and glow, use graphite/elevated surfaces.

**Step 3: Run primitive tests**

Run:

```powershell
npx vitest run src/components/ui --project unit --project component
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/components/ui
git commit -m "feat(ui): refresh primitives for Carbon Pro"
```

## Task 3: Header As Quiet Production Chrome

**Files:**

- Modify: `src/components/layout/Header.tsx`
- Test: `src/components/layout/Header.test.tsx`

**Step 1: Write failing/updated header tests**

Update tests to assert:

- Header renders project dropdown.
- Backend status label is present.
- Oversized branding image is not required for layout.
- Header exposes `data-testid="app-header"`.

Run:

```powershell
npx vitest run src/components/layout/Header.test.tsx --project component
```

Expected: PASS for existing behavior or focused failures if tests assume the old
logo treatment.

**Step 2: Implement quiet chrome**

In `Header.tsx`:

- Remove the oversized `h-40 w-40` logo image from the right action area.
- Add a compact wordmark or glyph only if it does not dominate the header.
- Use `h-12` or keep `h-14` with tighter visual density.
- Show runtime status as a small pill:
  - Ready: citron/green restrained status.
  - Not ready: warning/error status.
- Keep project dropdown first.

**Step 3: Run header test**

Run:

```powershell
npx vitest run src/components/layout/Header.test.tsx --project component
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/components/layout/Header.tsx src/components/layout/Header.test.tsx
git commit -m "feat(ui): refine header as Carbon Pro chrome"
```

## Task 4: Sidebar To Compact Mode Rail

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`
- Test: `src/store/appStore.test.ts`
- Add if needed: `src/components/layout/Sidebar.test.tsx`

**Step 1: Add sidebar behavior tests**

Create `src/components/layout/Sidebar.test.tsx` if there is no existing sidebar
component coverage.

Test:

```tsx
it('renders primary workspace modes', () => {
  render(<Sidebar />);
  expect(screen.getByLabelText('Generate')).toBeInTheDocument();
  expect(screen.getByLabelText('Storyboard')).toBeInTheDocument();
  expect(screen.getByLabelText('Settings')).toBeInTheDocument();
});

it('changes active panel when a mode is clicked', async () => {
  const user = userEvent.setup();
  render(<Sidebar />);
  await user.click(screen.getByLabelText('Edit'));
  expect(useAppStore.getState().activePanel).toBe('edit');
});
```

Run:

```powershell
npx vitest run src/components/layout/Sidebar.test.tsx src/store/appStore.test.ts --project unit --project component
```

Expected: FAIL if test file is new and imports/mocks need adjustment, then PASS
after setup.

**Step 2: Rework Sidebar visual structure**

In `Sidebar.tsx`:

- Default to a compact rail visual even when the persisted collapsed state is
  false.
- Keep persisted collapse behavior if needed, but reduce expanded state visual
  dominance.
- Group nav items into:
  - Create: Generate, Quick.
  - Sequence: Storyboard, Batch, Templates.
  - Refine: Edit, Assets.
  - System: Settings.
- Remove or relocate global action rows from the rail. If removal is too broad
  for this pass, visually de-emphasize them behind a compact secondary group.
- Replace red active classes with accent-primary classes.
- Keep tooltips for icon-only states.

**Step 3: Run sidebar/store tests**

Run:

```powershell
npx vitest run src/components/layout/Sidebar.test.tsx src/store/appStore.test.ts --project unit --project component
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/store/appStore.test.ts
git commit -m "feat(ui): convert sidebar into Carbon Pro mode rail"
```

## Task 5: Canvas Stage First Pass

**Files:**

- Modify: `src/components/layout/Canvas.tsx`
- Modify: `src/components/canvas/GenerationProgress.tsx`
- Modify: `src/components/canvas/GenerationQueue.tsx`
- Test: existing canvas/generation component tests if present

**Step 1: Add canvas state tests**

Add or update component tests to assert:

- Empty canvas renders the primary start message.
- Zoom buttons are accessible.
- Current image renders with `data-testid="generation-result"`.
- Generation progress renders when an active job is processing.

Run:

```powershell
npx vitest run src/components/layout src/components/canvas --project component
```

Expected: current tests pass or identify missing component coverage.

**Step 2: Redesign canvas shell**

In `Canvas.tsx`:

- Remove or reduce ambient particles if they read decorative.
- Use a carbon stage background with subtle radial depth from CSS, not bokeh.
- Refine floating toolbar as a compact instrument cluster.
- Replace red generating ring/glow with restrained accent or neutral progress.
- Upgrade empty state copy to be product-facing and concise:
  - Title: `Start with an image, scene, or prompt`
  - Supporting text: `Choose a workflow and build from every result.`
- Keep pan/zoom behavior unchanged.

**Step 3: Refine generation queue/progress**

- Make progress overlay show model/runtime/job progress in a compact graphite
  surface.
- Make queue strip thumbnail-first and reduce card-like treatment.

**Step 4: Run canvas tests**

Run:

```powershell
npx vitest run src/components/layout src/components/canvas --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/layout/Canvas.tsx src/components/canvas/GenerationProgress.tsx src/components/canvas/GenerationQueue.tsx
git commit -m "feat(ui): redesign canvas stage for Carbon Pro"
```

## Task 6: Model Selector To Model Router Visual V1

**Files:**

- Modify: `src/components/generate/ModelSelector.tsx`
- Test: `src/components/generate/ModelSelector.test.tsx`

**Step 1: Update tests for router metadata**

Extend tests to assert:

- The selected model name renders.
- The selected model exposes a runtime/status badge.
- Image and video model groups still render by `generationType`.
- Selecting a model calls `onChange` with the existing model ID.

Run:

```powershell
npx vitest run src/components/generate/ModelSelector.test.tsx --project component
```

Expected: FAIL until metadata is added.

**Step 2: Add router metadata without changing backend IDs**

Extend `ModelOption`:

```ts
interface ModelOption {
  id: string;
  name: string;
  capability: 'image' | 'video' | 'edit' | 'inpaint';
  runtime: 'local' | 'comfyui' | 'cloud' | 'byom';
  availability: 'ready' | 'install-required' | 'login-required' | 'import-required';
  hardware: 'laptop' | 'creator' | 'workstation' | 'unknown';
  quality: 'draft' | 'balanced' | 'pro' | 'experimental' | 'local';
  description: string;
  type: 'image' | 'video';
}
```

Use current models and conservative metadata:

- Qwen Image: `runtime: 'local'`, `availability: 'install-required'`,
  `hardware: 'workstation'`.
- Wan 2.2: `runtime: 'local'`, `availability: 'install-required'`,
  `hardware: 'workstation'`.
- FLUX: `runtime: 'byom'`, `availability: 'import-required'`,
  `hardware: 'workstation'`.
- SD 1.5/SDXL/SD3.5: local/install-required based on existing behavior.

**Step 3: Redesign closed and open states**

Closed control:

- Model name.
- Capability badge.
- Runtime badge.
- Availability/hardware line.

Open control:

- Group by image/video.
- Each option shows model, capability, runtime, hardware fit, and short
  description.
- Use capability accent colors sparingly.
- Use accent-primary only for selected/focus.

**Step 4: Run model selector tests**

Run:

```powershell
npx vitest run src/components/generate/ModelSelector.test.tsx --project component
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/components/generate/ModelSelector.tsx src/components/generate/ModelSelector.test.tsx
git commit -m "feat(ui): introduce Model Router visual metadata"
```

## Task 7: Generate And Quick Inspector Pass

**Files:**

- Modify: `src/pages/GeneratePanel.tsx`
- Modify: `src/pages/QuickGeneratePanel.tsx`
- Modify: `src/components/generate/PromptArea.tsx`
- Modify: `src/components/generate/AdvancedGenerationSettings.tsx`
- Test: relevant existing generate/quick tests

**Step 1: Run existing generate tests**

Run:

```powershell
npx vitest run src/pages src/components/generate --project component
```

Expected: identify current coverage and failures.

**Step 2: Convert form-heavy panel to inspector treatment**

Keep functionality unchanged while adjusting structure:

- Prompt block at top.
- Model Router directly under prompt.
- Core settings in compact sections.
- Advanced settings collapsed.
- Use fewer nested cards.
- Replace red focus/selected states with accent-primary.
- Keep labels precise and product-facing.

**Step 3: Run generate tests**

Run:

```powershell
npx vitest run src/pages src/components/generate --project component
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/pages/GeneratePanel.tsx src/pages/QuickGeneratePanel.tsx src/components/generate
git commit -m "feat(ui): reshape generation panels as Carbon Pro inspectors"
```

## Task 8: Visual Verification Build

**Files:**

- No planned source changes unless verification exposes issues.

**Step 1: Run focused tests**

Run:

```powershell
npx vitest run src/components/ui src/components/layout src/components/generate src/pages --project unit --project component
```

Expected: PASS.

**Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: Vite production build succeeds.

**Step 3: Start dev server**

Run:

```powershell
npm run dev
```

Expected: Vite dev server starts. If port `5173` is occupied, use the printed
alternate port.

**Step 4: Capture visual screenshots**

Use Playwright to capture:

- Generate mode.
- Empty canvas.
- Open Model Router.
- Settings mode.

Save screenshots under `output/playwright/`.

**Step 5: Inspect screenshots**

Check:

- App no longer reads as red-glow dashboard.
- Header is quiet.
- Sidebar reads as mode rail.
- Canvas dominates.
- Model Router feels like a flagship control.
- Text contrast is readable.
- No obvious layout clipping.

**Step 6: Commit verification fixes**

If fixes are needed:

```powershell
git add <fixed-files>
git commit -m "fix(ui): polish Carbon Pro visual pass"
```

## Execution Notes

This plan intentionally avoids backend/provider/model-runtime changes. The first
Carbon Pro pass should make the product feel dramatically more credible while
keeping behavior stable.

After Phase 1 is merged, write follow-up plans for:

- Timeline and variant strip redesign.
- Studio Lobby/dashboard.
- Model Router data model backed by real runtime/provider metadata.
- Hardware-aware workflow/profile display.

