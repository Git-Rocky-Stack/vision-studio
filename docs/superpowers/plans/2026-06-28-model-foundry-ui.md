# Model Foundry UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the renderer Model Foundry - a first-class `foundry` tab for discovering, acquiring, and managing local AI models - by wiring the existing (tested) `modelsSlice` + `window.electron.models/hardware/auth` IPC into UI.

**Architecture:** A new full-width page (`FoundryPage`) with three in-page sections (Discover / Library / Hardware) plus a Connections header. Pure consumer of existing store actions and IPC; no new store slice and no backend change. Follows the established full-width-tab pattern (Assets/Collections/Settings).

**Tech Stack:** React 19 + TypeScript, Zustand (`useAppStore`, `useShallow`), Tailwind v4 (Carbon Pro tokens), `lucide-react`, hardware primitives (`Led`, `recessed-well`, `raised-panel`), Vitest + Testing Library.

## Global Constraints

- Branch: `feat/model-foundry-ui`. Never commit to `main`; feature branch + PR.
- Frontend-only: do NOT modify `modelsSlice`, IPC, types, or backend. Consume them.
- Spec of record: `docs/superpowers/specs/2026-06-28-model-foundry-ui-design.md`.
- Icons: `lucide-react` only. No emoji or decorative middot/em-dash/bullet glyphs in `src/` (ui-glyphs guard).
- Design system: Carbon tokens, machined radii (`--radius-control/overlay/pill`), hardware depth classes; `.mono-label` for labels. Read `DESIGN.md` before visual work.
- Multi-field store reads use `useShallow`.
- Commit via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` and `git branch --show-current` in the same call; include `cd /c/vision-studio` is unnecessary (tool cwd is the repo) but run one foreground git call per message.
- Gates (must be green before PR): `npm run typecheck`, `npm test`, `npm run build`.
- Acquisition is `enqueueDownload(searchResult.id)` (store action -> `models.download(id)`); confirm the hub id is accepted during Task 5 and adjust if the backend expects `repo_id`.

## File Structure

**Create**
- `src/pages/FoundryPage.tsx` - page shell, section switcher, mount loaders, download poller.
- `src/components/foundry/foundryFit.ts` - shared fit verdict -> {tone,label} helper.
- `src/components/foundry/FitChip.tsx` - compact fit verdict chip (uses foundryFit + `Led`).
- `src/components/foundry/SecurityBadges.tsx` - format/trust_remote_code/gated/nsfw badges.
- `src/components/foundry/FoundryHeaderBar.tsx` - GPU summary + `ModelTokensBar`.
- `src/components/foundry/ModelTokensBar.tsx` - HF/CivitAI token inputs.
- `src/components/foundry/DiscoverSection.tsx` - search controls + results grid + states.
- `src/components/foundry/SearchResultCard.tsx` - one `SearchResult` + acquire.
- `src/components/foundry/ConsentDialog.tsx` - pickle/trust_remote_code consent gate.
- `src/components/foundry/DownloadRow.tsx` - one `DownloadJob` with controls + gate.
- `src/components/foundry/InstalledModelCard.tsx` - one installed `ModelRecord` + actions.
- `src/components/foundry/LibraryRootsManager.tsx` - roots list + add/remove/scan/detect.
- `src/components/foundry/LibrarySection.tsx` - composes downloads + installed + roots.
- `src/components/foundry/HardwareSection.tsx` - profile card + per-model fit table.
- Co-located `*.test.tsx` for each component + `src/pages/FoundryPage.test.tsx`.

**Modify**
- `src/types/navigation.ts` - add `'foundry'` to `ActiveTab`.
- `src/components/layout/NavBar.tsx` - add Foundry tab (bottom cluster, `Boxes` icon).
- `src/components/layout/DockviewLayout.tsx` - route `foundry` -> `<FoundryPage/>` in the full-width branch (the block rendering AssetsPanel/CollectionsPage/SettingsPanel by `activeTab`).
- `src/store/slices/uiSlice.ts` - `setActiveTab`: ensure `'foundry'` resets `activeSubMode` to `null` (it falls into the default no-submode case; add explicitly only if the switch enumerates tabs).
- `src/pages/SettingsPanel.tsx` - Installed Models section -> slim count + "Manage in Foundry" button.
- `src/components/generate/ModelSelector.tsx` - empty-state "open the Foundry" becomes a real link.

---

### Task 1: Navigation plumbing + Foundry tab

**Files:**
- Modify: `src/types/navigation.ts:1`
- Modify: `src/components/layout/NavBar.tsx:3-11,34-42`
- Modify: `src/components/layout/DockviewLayout.tsx` (full-width tab branch)
- Modify: `src/store/slices/uiSlice.ts` (`setActiveTab`)
- Create: `src/pages/FoundryPage.tsx` (temporary minimal stub, fleshed out in Task 3)
- Test: `src/components/layout/NavBar.test.tsx` (extend), `src/pages/FoundryPage.test.tsx` (create)

**Interfaces:**
- Produces: `ActiveTab` now includes `'foundry'`; `<FoundryPage/>` default export-less named export `export function FoundryPage()`.

- [ ] **Step 1: Write the failing test** (`src/pages/FoundryPage.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FoundryPage } from './FoundryPage';

describe('FoundryPage', () => {
  it('renders the Foundry heading and three section tabs', () => {
    render(<FoundryPage />);
    expect(screen.getByRole('heading', { name: /foundry/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /discover/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hardware/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it - expect FAIL** `npx vitest run src/pages/FoundryPage.test.tsx` (module not found / missing tabs).

- [ ] **Step 3: Add `'foundry'` to `ActiveTab`** in `src/types/navigation.ts:1`:

```ts
export type ActiveTab = 'generate' | 'canvas' | 'story' | 'workflows' | 'assets' | 'collections' | 'foundry' | 'settings';
```

- [ ] **Step 4: Add the NavBar tab.** In `NavBar.tsx` import `Boxes` from lucide and add to `navBarTabs` (bottom cluster, before settings):

```ts
{ id: 'collections', label: 'Collections', icon: Layers, cluster: 'bottom' },
{ id: 'foundry', label: 'Foundry', icon: Boxes, cluster: 'bottom' },
{ id: 'settings', label: 'Settings', icon: Settings, cluster: 'bottom' },
```

- [ ] **Step 5: Create the stub page** `src/pages/FoundryPage.tsx` (replaced in Task 3 by the full shell, but must satisfy the test now):

```tsx
export function FoundryPage() {
  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <h1 className="text-2xl font-semibold text-text-primary">Foundry</h1>
      <div role="tablist" aria-label="Foundry sections" className="mt-4 flex gap-2">
        <button role="tab" type="button">Discover</button>
        <button role="tab" type="button">Library</button>
        <button role="tab" type="button">Hardware</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Route it.** In `DockviewLayout.tsx`, in the full-width branch that switches on `activeTab` for assets/collections/settings, add a `foundry` case rendering `<FoundryPage/>` (import it). Mirror the existing AssetsPanel case exactly (same wrapper).

- [ ] **Step 7: uiSlice.** In `setActiveTab`, confirm `'foundry'` yields `activeSubMode: null`. If the function maps specific tabs to defaults and otherwise returns `null`, no change is needed; if it enumerates, add `foundry: null`.

- [ ] **Step 8: NavBar test.** Extend `NavBar.test.tsx` to assert the Foundry tab renders and click sets the tab:

```tsx
it('activates the Foundry tab on click', () => {
  render(<NavBar />);
  fireEvent.click(screen.getByTestId('nav-foundry'));
  expect(useAppStore.getState().activeTab).toBe('foundry');
});
```

- [ ] **Step 9: Run tests - expect PASS** `npx vitest run src/pages/FoundryPage.test.tsx src/components/layout/NavBar.test.tsx`.

- [ ] **Step 10: Commit** `feat(foundry): add Foundry nav tab + page shell stub (#135)`.

---

### Task 2: Shared presentational units - foundryFit, FitChip, SecurityBadges

**Files:**
- Create: `src/components/foundry/foundryFit.ts`, `FitChip.tsx`, `SecurityBadges.tsx`
- Test: `foundryFit.test.ts`, `SecurityBadges.test.tsx`

**Interfaces:**
- Produces:
  - `foundryFit(plan: RuntimePlan): { tone: 'play'|'cue'|'rec'|null; label: string }`
  - `<FitChip plan={RuntimePlan | null} loading?: boolean />`
  - `<SecurityBadges record={Pick<ModelRecord|SearchResult,'format'|'trust_remote_code'|'gated'|'nsfw'>} />`

- [ ] **Step 1: Failing test** (`foundryFit.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { foundryFit } from './foundryFit';
import type { RuntimePlan } from '@/types/model';

const base: RuntimePlan = { pipeline_class: null, precision: null, offload: false, vae_tiling: false, attention_slicing: false, single_file: false, config_catalog_id: null, vram_plan: null, fit: null, missing_components: [], fallback_ladder: [], readiness: '', refusal: null };

describe('foundryFit', () => {
  it('maps fit verdicts to LED tones', () => {
    expect(foundryFit({ ...base, fit: 'fits', readiness: 'Fits' }).tone).toBe('play');
    expect(foundryFit({ ...base, fit: 'fits-with-offload', readiness: 'Offload' }).tone).toBe('cue');
    expect(foundryFit({ ...base, fit: 'over-budget', readiness: 'Too big' }).tone).toBe('rec');
    expect(foundryFit({ ...base, fit: 'cpu-only', readiness: 'CPU' }).tone).toBe('rec');
  });
  it('prefers refusal/missing readiness over fit tone', () => {
    expect(foundryFit({ ...base, refusal: 'Blocked' }).tone).toBe('rec');
    expect(foundryFit({ ...base, missing_components: ['vae'], readiness: 'Missing vae' }).tone).toBe('cue');
  });
});
```

- [ ] **Step 2: Run - FAIL.** `npx vitest run src/components/foundry/foundryFit.test.ts`

- [ ] **Step 3: Implement `foundryFit.ts`** (reuses the `PreflightFooter` verdict semantics: fits=play, fits-with-offload=cue, over-budget/cpu-only=rec; refusal=rec; missing components=cue):

```ts
import type { RuntimePlan } from '@/types/model';

const FIT_TONE: Record<string, 'play' | 'cue' | 'rec'> = {
  fits: 'play', 'fits-with-offload': 'cue', 'over-budget': 'rec', 'cpu-only': 'rec',
};

export function foundryFit(plan: RuntimePlan): { tone: 'play' | 'cue' | 'rec' | null; label: string } {
  if (plan.refusal) return { tone: 'rec', label: plan.refusal };
  if (plan.missing_components.length > 0) return { tone: 'cue', label: plan.readiness || 'Missing components' };
  const tone = plan.fit ? FIT_TONE[plan.fit] ?? null : null;
  return { tone, label: plan.readiness || plan.fit || 'Unknown' };
}
```

- [ ] **Step 4: Implement `FitChip.tsx`** - renders `loading` spinner, else `<Led color={tone}/>` + label from `foundryFit(plan)`; `null` plan renders nothing. Use `Led` from `@/components/hardware`.

- [ ] **Step 5: Implement `SecurityBadges.tsx`** - render a `pickle` (warning) badge when `format==='pickle'`, a `trust_remote_code` (warning) badge when true, a `gated` (info) badge, an `nsfw` (warning) badge; safetensors renders a subtle "safetensors" tag. Use `.mono-label` + status token colors, lucide `ShieldAlert`/`Lock`.

- [ ] **Step 6: SecurityBadges test** - asserts pickle + trust_remote_code + gated + nsfw badges appear for a record with all flags, and none of the warning badges for a clean safetensors record.

- [ ] **Step 7: Run - PASS.** `npx vitest run src/components/foundry/foundryFit.test.ts src/components/foundry/SecurityBadges.test.tsx`

- [ ] **Step 8: Commit** `feat(foundry): fit + security presentational units (#135)`.

---

### Task 3: FoundryPage shell - section switcher, mount loaders, download poller

**Files:**
- Modify: `src/pages/FoundryPage.tsx` (replace stub)
- Modify: `src/pages/FoundryPage.test.tsx`

**Interfaces:**
- Consumes: store actions `loadModels`, `refreshDownloads`, `loadLibraryRoots`, `loadHardwareProfile`; `downloads` map for the poll predicate.
- Produces: section state `'discover' | 'library' | 'hardware'` rendered into the three section components (imported as they land; until then render placeholders with the section `name`).

- [ ] **Step 1: Failing test** - extend `FoundryPage.test.tsx` to assert mount calls the loaders and section switching swaps panels:

```tsx
it('warms loaders on mount', () => {
  const loadModels = vi.fn(); const refreshDownloads = vi.fn();
  const loadLibraryRoots = vi.fn(); const loadHardwareProfile = vi.fn();
  useAppStore.setState({ loadModels, refreshDownloads, loadLibraryRoots, loadHardwareProfile } as never);
  render(<FoundryPage />);
  expect(loadModels).toHaveBeenCalled();
  expect(refreshDownloads).toHaveBeenCalled();
  expect(loadLibraryRoots).toHaveBeenCalled();
  expect(loadHardwareProfile).toHaveBeenCalled();
});
it('switches sections', () => {
  render(<FoundryPage />);
  fireEvent.click(screen.getByRole('tab', { name: /library/i }));
  expect(screen.getByTestId('foundry-section-library')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run - FAIL.**

- [ ] **Step 3: Implement the shell.** `useEffect(()=>{ loadModels(); refreshDownloads(); loadLibraryRoots(); loadHardwareProfile(); },[...])` (select the four actions via `useShallow`). Add a download poll effect: `setInterval(refreshDownloads, 2500)` while any `downloads[id].status` is in `['queued','downloading','verifying','paused']`, cleared on unmount/idle (mirror `SettingsPanel.tsx` poller). Render `<FoundryHeaderBar/>` (Task 11; placeholder until then), a `role="tablist"` switcher, and the active section wrapped in `<div data-testid={`foundry-section-${section}`}>`.

- [ ] **Step 4: Run - PASS.**

- [ ] **Step 5: Commit** `feat(foundry): page shell with section switcher + loaders (#135)`.

---

### Task 4: DiscoverSection - search controls + states

**Files:** Create `DiscoverSection.tsx` + `DiscoverSection.test.tsx`

**Interfaces:**
- Consumes: `searchModels`, `setNsfwOptIn`, and state `searchResults`, `searchStatus`, `searchQuery`, `searchSource`, `searchPage`, `searchWarning`, `nsfwOptIn`. Renders `<SearchResultCard/>` per result (Task 5; until then a list of `result.name`).

- [ ] **Step 1: Failing test** - submitting calls `searchModels(query, source, page)`; NSFW toggle visible only for civitai and calls `setNsfwOptIn`; `searchStatus==='offline'` shows the warning banner:

```tsx
it('runs a search', () => {
  const searchModels = vi.fn();
  useAppStore.setState({ searchModels, searchSource: 'hf' } as never);
  render(<DiscoverSection />);
  fireEvent.change(screen.getByrole('searchbox'), { target: { value: 'sdxl' } });
  fireEvent.submit(screen.getByTestId('foundry-search-form'));
  expect(searchModels).toHaveBeenCalledWith('sdxl', 'hf', 1);
});
it('shows the offline banner', () => {
  useAppStore.setState({ searchStatus: 'offline', searchWarning: 'No network' } as never);
  render(<DiscoverSection />);
  expect(screen.getByText(/no network/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run - FAIL.**

- [ ] **Step 3: Implement.** Source toggle (HF/CivitAI buttons -> local query state + `searchSource`); a `<form data-testid="foundry-search-form">` with `role="searchbox"` input; submit -> `searchModels(query, source, 1)`. NSFW switch rendered only when `searchSource==='civitai'`, bound to `nsfwOptIn` -> `setNsfwOptIn`. Pagination prev/next -> `searchModels(query, source, page +/- 1)` (disable prev at page 1). State rendering: idle prompt, loading spinner, offline banner (`searchWarning`), empty ("No results"), ready -> grid of `<SearchResultCard result={r}/>`.

- [ ] **Step 4: Run - PASS.**

- [ ] **Step 5: Commit** `feat(foundry): Discover search controls + states (#135)`.

---

### Task 5: SearchResultCard + ConsentDialog - acquire, consent gate, gated handling

**Files:** Create `SearchResultCard.tsx`, `ConsentDialog.tsx` + tests

**Interfaces:**
- Consumes: `enqueueDownload`, `grantConsent`, `downloads` (to reflect a started/gated job), `window.electron.app.openExternal`.
- `<ConsentDialog open kind={ConsentKind} modelName onConfirm onCancel />` (focus-trapped).

- [ ] **Step 1: Failing test** - clean result acquires directly; pickle/trust_remote_code result opens the consent dialog and only acquires after grant; a job with `gate_url` shows an "Accept license" action:

```tsx
it('acquires a clean result directly', () => {
  const enqueueDownload = vi.fn();
  useAppStore.setState({ enqueueDownload, downloads: {} } as never);
  render(<SearchResultCard result={cleanResult} />);
  fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
  expect(enqueueDownload).toHaveBeenCalledWith(cleanResult.id);
});
it('gates a pickle result behind consent', async () => {
  const enqueueDownload = vi.fn(); const grantConsent = vi.fn().mockResolvedValue({ success: true });
  useAppStore.setState({ enqueueDownload, grantConsent, downloads: {} } as never);
  render(<SearchResultCard result={{ ...cleanResult, format: 'pickle' }} />);
  fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
  expect(enqueueDownload).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: /i understand|grant|continue/i }));
  expect(grantConsent).toHaveBeenCalledWith(cleanResult.id, 'pickle', true);
});
```

- [ ] **Step 2: Run - FAIL.**

- [ ] **Step 3: Implement `ConsentDialog.tsx`** - a focus-trapped overlay (reuse the app's existing `ConfirmDialog` pattern / `OverBudgetFallbackDialog` structure) explaining the risk for `kind` (`pickle` = arbitrary-code-on-load; `trust_remote_code` = runs repo code), with Cancel + Confirm.

- [ ] **Step 4: Implement `SearchResultCard.tsx`** - metadata + `<SecurityBadges/>`; an **Acquire** button. `needsConsent = result.format === 'pickle' || result.trust_remote_code`. Acquire: if `needsConsent` open ConsentDialog -> on confirm `await grantConsent(result.id, kind, true)` then `enqueueDownload(result.id)`; else `enqueueDownload(result.id)` directly. If `downloads[result.id]?.gate_url`, render an "Accept license" button -> `window.electron.app.openExternal(gate_url)`; reflect job status (queued/downloading) inline.

- [ ] **Step 5: Run - PASS.**

- [ ] **Step 6: Commit** `feat(foundry): acquire flow with consent + gated handling (#135)`.

---

### Task 6: DownloadRow - active download controls

**Files:** Create `DownloadRow.tsx` + test

**Interfaces:**
- Consumes: `pauseDownload`, `resumeDownload`, `cancelDownload`. Props: `job: DownloadJob`, `modelName: string`.

- [ ] **Step 1: Failing test** - renders progress; pause/resume/cancel call the matching actions with `job.model_id`; a `gate_url` job shows the accept-license action.

```tsx
it('controls a download', () => {
  const cancelDownload = vi.fn();
  useAppStore.setState({ cancelDownload, pauseDownload: vi.fn(), resumeDownload: vi.fn() } as never);
  render(<DownloadRow job={{ ...job, status: 'downloading', progress: 42 }} modelName="X" />);
  expect(screen.getByText(/42%/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(cancelDownload).toHaveBeenCalledWith(job.model_id);
});
```

- [ ] **Step 2-4:** Run FAIL -> implement (progress bar from `job.progress`, speed/eta formatting, Pause when `downloading`, Resume when `paused`, Cancel otherwise-active; `gate_url` -> open-external) -> run PASS.

- [ ] **Step 5: Commit** `feat(foundry): download row controls (#135)`.

---

### Task 7: InstalledModelCard - delete, convert, fit chip

**Files:** Create `InstalledModelCard.tsx` + test

**Interfaces:**
- Consumes: `window.electron.models.delete` (via existing store `loadModels` refresh; reuse the SettingsPanel delete pattern), `convertModel`, `resolveRuntime` (for the inline `<FitChip/>`). Props: `model: ModelRecord`.

- [ ] **Step 1: Failing test** - badges render; Delete opens confirm then calls delete + reloads; Convert calls `convertModel(model.id)`; fit chip resolves on demand.

- [ ] **Step 2-4:** Run FAIL -> implement (capability/runtime/quality/hardware badges + `<SecurityBadges/>`, size/vram; Delete via `ConfirmDialog` -> `models.delete` -> `loadModels`; Convert button shown when `model.format === 'pickle'`; a "Check fit" affordance that calls `resolveRuntime(model.id)` and renders `<FitChip/>`) -> run PASS.

- [ ] **Step 5: Commit** `feat(foundry): installed model card (delete/convert/fit) (#135)`.

---

### Task 8: LibraryRootsManager - detect/add/scan/remove

**Files:** Create `LibraryRootsManager.tsx` + test

**Interfaces:**
- Consumes: `libraryRoots`, `detectedRoots`, `addLibraryRoot`, `removeLibraryRoot`, `scanLibraries`, `detectLibraries`, `window.electron.dialog.selectFolder`.

- [ ] **Step 1: Failing test** - Add opens the folder picker then calls `addLibraryRoot(path, hint)`; Remove calls `removeLibraryRoot(id)`; Scan calls `scanLibraries`; Detect calls `detectLibraries` and lists offers.

- [ ] **Step 2-4:** Run FAIL -> implement (roots list with remove; Add root = `selectFolder()` + a layout-hint select (`comfyui`/`a1111`/`generic`) -> `addLibraryRoot`; Scan button; Detect button -> render `detectedRoots` offers each with an "Add" that calls `addLibraryRoot(offer.path, offer.layout_hint)`) -> run PASS.

- [ ] **Step 5: Commit** `feat(foundry): library roots manager (#135)`.

---

### Task 9: LibrarySection - compose downloads + installed + roots

**Files:** Create `LibrarySection.tsx` + test

**Interfaces:**
- Consumes: `availableModels`, `downloads` (via `useShallow`), renders `<DownloadRow/>` per active job, `<InstalledModelCard/>` per model, `<LibraryRootsManager/>`.

- [ ] **Step 1: Failing test** - with one active download + one installed model + one root, all three subsections render (`data-testid` per subsection).

- [ ] **Step 2-4:** Run FAIL -> implement (Downloads subsection lists active jobs mapped to model names from `availableModels`; Installed subsection grids `InstalledModelCard`; Roots subsection mounts `LibraryRootsManager`; empty states for each) -> run PASS.

- [ ] **Step 5: Commit** `feat(foundry): Library section assembly (#135)`.

---

### Task 10: HardwareSection - profile + per-model fit

**Files:** Create `HardwareSection.tsx` + test

**Interfaces:**
- Consumes: `hardwareProfile`, `availableModels`, `resolveRuntime`. Renders a profile card + a per-model row with `<FitChip/>`.

- [ ] **Step 1: Failing test** - profile fields render (GPU name, formatted VRAM); each installed model row resolves a fit chip; empty profile shows a "hardware unavailable" hint.

- [ ] **Step 2-4:** Run FAIL -> implement (profile card from `hardwareProfile` with byte formatting; a table/list of installed models, each resolving `resolveRuntime(model.id)` lazily into `<FitChip/>`; a Refresh that calls `loadHardwareProfile`) -> run PASS.

- [ ] **Step 5: Commit** `feat(foundry): Hardware section (profile + fit) (#135)`.

---

### Task 11: FoundryHeaderBar + ModelTokensBar; wire sections into the page

**Files:** Create `FoundryHeaderBar.tsx`, `ModelTokensBar.tsx` + tests; Modify `FoundryPage.tsx`

**Interfaces:**
- Consumes: `hardwareProfile` (summary); `window.electron.auth.setHfToken`, `setCivitaiToken`.

- [ ] **Step 1: Failing test** (`ModelTokensBar.test.tsx`) - entering a token + Save calls `auth.setHfToken(token)` (and CivitAI equivalent), then shows a saved confirmation:

```tsx
it('saves the HF token', async () => {
  const setHfToken = vi.fn().mockResolvedValue({ success: true });
  (window as any).electron = { ...(window as any).electron, auth: { setHfToken, setCivitaiToken: vi.fn() } };
  render(<ModelTokensBar />);
  fireEvent.change(screen.getByLabelText(/hugging face token/i), { target: { value: 'hf_x' } });
  fireEvent.click(screen.getByRole('button', { name: /save hugging face/i }));
  expect(setHfToken).toHaveBeenCalledWith('hf_x');
});
```

- [ ] **Step 2: Run - FAIL.**

- [ ] **Step 3: Implement `ModelTokensBar.tsx`** (password inputs + Save per provider -> `auth.set*Token`; write-with-confirmation copy noting state can't be read back) and `FoundryHeaderBar.tsx` (GPU summary chip from `hardwareProfile` + `<ModelTokensBar/>`).

- [ ] **Step 4: Wire sections.** Replace the section placeholders in `FoundryPage.tsx` with `<DiscoverSection/>`, `<LibrarySection/>`, `<HardwareSection/>`, and mount `<FoundryHeaderBar/>` in the header.

- [ ] **Step 5: Run - PASS** (`FoundryPage.test.tsx` + `ModelTokensBar.test.tsx`).

- [ ] **Step 6: Commit** `feat(foundry): header + tokens; wire all sections (#135)`.

---

### Task 12: Settings + ModelSelector integration

**Files:**
- Modify: `src/pages/SettingsPanel.tsx` (Installed Models section)
- Modify: `src/components/generate/ModelSelector.tsx` (empty-state copy/link)
- Test: extend `SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `setActiveTab` from the store.

- [ ] **Step 1: Failing test** - Settings Installed Models shows a "Manage in Foundry" control that calls `setActiveTab('foundry')`; ModelSelector empty state links to the Foundry.

- [ ] **Step 2-4:** Run FAIL -> implement (replace the SettingsPanel Installed Models management list with a count summary + a "Manage in Foundry" button -> `setActiveTab('foundry')`; change `ModelSelector` empty-state into a button -> `setActiveTab('foundry')`) -> run PASS.

- [ ] **Step 5: Commit** `feat(foundry): Settings + model-picker link to Foundry (#135)`.

---

### Task 13: Green gates + PR

- [ ] **Step 1:** `export PATH="/c/Program Files/nodejs:$PATH" && npm run typecheck`
- [ ] **Step 2:** `npm test` (full Vitest suite green)
- [ ] **Step 3:** `npm run build` (renderer + electron main + preload green)
- [ ] **Step 4:** Push `feat/model-foundry-ui`; open PR "Phase 1: Model Foundry UI (#135)"; `gh pr checks --watch`; PAUSE for review before squash-merge.

---

## Self-Review

**Spec coverage:** Discover/search+NSFW+offline (T4), acquire+consent+gated (T5), download lifecycle (T6, T9), installed delete/convert+fit (T7, T10), library roots detect/add/scan/remove (T8), hardware profile+fit (T2 FitChip, T10), tokens (T11), placement/routing (T1), Settings+ModelSelector integration (T12), testing+gates (every task + T13). All spec sections mapped.

**Placeholder scan:** No TBD/TODO; each code step shows real code or an exact, named implementation contract; JSX-heavy steps name the exact store actions, IPC calls, props, and test assertions.

**Type consistency:** `foundryFit(plan)`, `FitChip` props (`plan`/`loading`), `SecurityBadges` record shape, `ConsentDialog` props, and the store action names (`enqueueDownload`, `grantConsent`, `convertModel`, `resolveRuntime`, `addLibraryRoot`, `removeLibraryRoot`, `scanLibraries`, `detectLibraries`, `pauseDownload`/`resumeDownload`/`cancelDownload`, `loadModels`/`refreshDownloads`/`loadLibraryRoots`/`loadHardwareProfile`, `setNsfwOptIn`, `searchModels`) match `modelsSlice.ts` exactly; IPC names (`auth.setHfToken`/`setCivitaiToken`, `app.openExternal`, `dialog.selectFolder`, `models.delete`) match `electron.d.ts`.
