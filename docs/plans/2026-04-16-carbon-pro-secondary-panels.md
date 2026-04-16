# Carbon Pro Secondary Panels Implementation Plan

**Goal:** Bring Assets, Batch, Templates, and Settings into the Carbon Pro visual language so secondary panels no longer snap back to the old red-glow Dark Cinema treatment.

**Architecture:** Keep behavior unchanged and migrate styling through existing Tailwind utility classes and CSS tokens. Treat red as status/destructive only, use chrome accent tokens for focus/selection/primary states, and keep changes limited to secondary panels plus direct child components rendered inside them.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Vitest, Testing Library.

---

## Task 1: Secondary Panel Regression Tests

**Files:**

- Add: `src/pages/SecondaryPanelsCarbon.test.tsx`
- Modify only if necessary: test setup helpers

**Step 1: Write failing tests**

Add component tests that render `AssetsPanel`, `BatchPromptQueue`, `TemplatesPanel`, and `SettingsPanel` in their normal idle states.

Assert:

- Search/select/focusable controls use `focus:border-accent-primary` or equivalent accent focus classes.
- Primary selected filters or toggles use accent classes, not red classes.
- Error/destructive UI may still use status red classes.
- Idle panel roots do not expose `.text-red-primary`, `.bg-red-aura`, `.border-red-primary`, `.ring-red-primary`, `.glow-red`, or `.shadow-red-glow`.

**Step 2: Verify red**

Run:

```powershell
npx vitest run src/pages/SecondaryPanelsCarbon.test.tsx --project component
```

Expected: FAIL because the secondary panels still use old red primary classes.

## Task 2: Assets And Templates Carbon Pass

**Files:**

- Modify: `src/pages/AssetsPanel.tsx`
- Modify: `src/pages/TemplatesPanel.tsx`
- Modify: `src/components/templates/TemplateCreator.tsx`
- Test: `src/pages/SecondaryPanelsCarbon.test.tsx`

**Step 1: Migrate focus, selected, and active states**

Replace primary red usage with Carbon Pro tokens:

- `focus:border-red-primary` -> `focus:border-accent-primary`
- `focus:ring-red-primary/40` -> `focus:ring-accent-primary/40`
- selected filters/cards: `bg-accent-primary-muted text-accent-primary border-accent-primary-border`
- neutral hover: `hover:border-border-hover hover:text-text-primary`

Keep true error/delete states on `text-status-error`, `bg-status-error-muted`, or existing danger button variants.

**Step 2: Verify tests**

Run:

```powershell
npx vitest run src/pages/SecondaryPanelsCarbon.test.tsx --project component
```

Expected: Assets and Templates assertions PASS.

## Task 3: Batch And Settings Carbon Pass

**Files:**

- Modify: `src/pages/BatchPanel.tsx`
- Modify: `src/components/batch/ResultsGrid.tsx`
- Modify: `src/components/batch/ResultCard.tsx`
- Modify: `src/pages/SettingsPanel.tsx`
- Test: `src/pages/SecondaryPanelsCarbon.test.tsx`

**Step 1: Migrate primary controls and progress**

Replace primary red usage with Carbon Pro tokens for:

- batch mode tabs, prompt inputs, empty-state counters, and generate controls
- result card selected/favorite styling where it is not an error
- settings navigation selection, toggles, progress bars, and model selection

Keep failed-result, warning, destructive, and backend error surfaces as status red.

**Step 2: Verify tests**

Run:

```powershell
npx vitest run src/pages/SecondaryPanelsCarbon.test.tsx --project component
```

Expected: PASS.

## Task 4: Focused Verification And Visual Check

**Files:** no planned source changes unless verification exposes issues.

**Step 1: Run focused suites**

Run:

```powershell
npx vitest run src/pages src/components/batch src/components/templates --project component
npm run typecheck
```

Expected: PASS.

**Step 2: Build**

Run:

```powershell
npm run build
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

**Step 3: Browser screenshots**

Start Vite, mock Electron APIs in Playwright, and capture:

- Assets panel
- Batch panel
- Templates panel
- Settings panel

Save under `output/playwright/` and remove new local verification artifacts before final status unless the user asks to keep them.

## Task 5: Commit Boundary

**Files:** all modified source/tests/docs.

**Step 1: Review diff**

Run:

```powershell
git diff --stat
git diff --check
```

Expected: no whitespace errors and no generated build artifacts staged.

**Step 2: Commit if requested**

Use:

```powershell
git add docs/plans/2026-04-16-carbon-pro-secondary-panels.md src
git commit -m "feat(ui): align secondary panels with Carbon Pro"
```

Push only if explicitly requested.
