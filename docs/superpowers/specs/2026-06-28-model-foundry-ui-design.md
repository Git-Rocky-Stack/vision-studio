# Model Foundry UI - Design Spec

**Date:** 2026-06-28
**Task:** #135 (Phase 1, launch-readiness plan)
**Status:** Approved (design)

## Goal

Build the renderer **Model Foundry**: a first-class surface for discovering,
acquiring, and managing local AI models. It is a pure consumer of the
already-built and tested store/IPC/backend - no new store slice and no backend
work. It closes the largest launch-readiness gap: the entire Model Foundry
capability (M3-M5) exists underneath but has no UI, and `ModelSelector` already
points users at a "Foundry" screen that does not exist.

## Context (what already exists)

- **Store:** `src/store/slices/modelsSlice.ts` - actions for list/download
  lifecycle, library roots, hub search, NSFW opt-in, consent, convert, hardware
  profile, runtime preflight; transient state for all of the above.
- **IPC:** `window.electron.models.*` (`list`, `download`, `downloadPause`,
  `downloadResume`, `downloadCancel`, `downloadsList`, `subscribeDownloads`,
  `delete`, `importRoot`, `scan`, `librariesList`, `librariesRemove`,
  `librariesDetect`, `search`, `consent`, `convert`, `resolveRuntime`),
  `window.electron.hardware.get`, `window.electron.auth.setHfToken` /
  `setCivitaiToken`.
- **Types:** `src/types/model.ts` - `ModelRecord`, `SearchResult`,
  `SearchResponse`, `DownloadJob`, `LibraryRoot`, `DetectedRoot`, `LayoutHint`,
  `SearchSource`, `ConsentKind`, `HardwareProfile`, `VramEstimate`,
  `RuntimePlan`.
- **Existing model UI:** Settings -> AI & Models "Installed Models" (slim
  download/delete list) and the Generate `PreflightFooter` (per-model fit LED).
  Both stay; the Foundry becomes the home for full management.

## Scope (all in - nothing deferred)

1. HF + CivitAI hub search: source toggle, query, pagination, NSFW opt-in
   (CivitAI-only, session-only), offline degrade.
2. Acquire/download with security consent (`pickle` / `trust_remote_code`) and
   gated-license handling (`DownloadJob.gate_url`).
3. Download lifecycle: progress / speed / ETA, pause / resume / cancel.
4. Library roots: detect / add (folder + layout hint) / scan / remove
   (index-in-place; bytes referenced, never copied).
5. Installed model management: delete, convert (pickle -> safetensors).
6. Hardware profile + per-model runtime fit (`resolveRuntime` -> `RuntimePlan`).
7. HF / CivitAI token entry.

## Placement & routing

- New `ActiveTab` value `'foundry'` (`src/types/navigation.ts`).
- NavBar bottom cluster: `Assets - Collections - Foundry - Settings`
  (`src/components/layout/NavBar.tsx`), icon `Boxes` (lucide).
- `DockviewLayout` renders `<FoundryPage/>` full-width (same branch as
  Assets/Collections/Settings - no left/right dock, no center-view bar).
- `uiSlice.setActiveTab('foundry')` resets `activeSubMode` to `null` (same as
  assets/collections/settings).
- `activeTab` persistence already covers the new value (it is part of the
  persisted `uiSlice` state).

## Architecture / components

All new files under `src/pages/` and `src/components/foundry/`:

- `src/pages/FoundryPage.tsx` - page shell: header strip + in-page section
  switcher (Discover / Library / Hardware). Warms loaders on mount; owns the
  download poller.
- `src/components/foundry/FoundryHeaderBar.tsx` - compact GPU summary (from
  `hardwareProfile`) + `ModelTokensBar`.
- `src/components/foundry/ModelTokensBar.tsx` - HF + CivitAI token inputs ->
  `auth.setHfToken` / `setCivitaiToken`.
- `src/components/foundry/DiscoverSection.tsx` - search controls + results grid.
- `src/components/foundry/SearchResultCard.tsx` - one `SearchResult` + acquire +
  security badges.
- `src/components/foundry/ConsentDialog.tsx` - pickle / trust_remote_code
  consent gate (focus-trapped, reusing the app's dialog pattern).
- `src/components/foundry/LibrarySection.tsx` - downloads strip + installed
  models + library roots.
- `src/components/foundry/InstalledModelCard.tsx` - one installed `ModelRecord`
  with delete / convert / inline fit chip.
- `src/components/foundry/DownloadRow.tsx` - one `DownloadJob` with
  pause/resume/cancel + gate-url action.
- `src/components/foundry/LibraryRootsManager.tsx` - roots list + add / scan /
  detect.
- `src/components/foundry/HardwareSection.tsx` - `HardwareProfile` card +
  per-model `RuntimePlan` fit table.
- Shared: `SecurityBadges.tsx` (format/trust_remote_code/gated/nsfw) and a
  `FitChip` that reuses the `PreflightFooter` verdict -> LED-tone mapping.

## Sections

### Header / Connections
GPU summary chip (name + VRAM free/total from `hardwareProfile`). Token inputs
save via `auth.set*Token` with a confirmation toast. **Known limitation:** the
auth IPC exposes setters only (no "is a token stored?" getter), so token state
is write-with-confirmation; the UI will not claim a stored state it cannot read.

### Discover
- Source toggle HF / CivitAI; query box (submit on Enter / button); pagination
  (prev/next over `searchPage`).
- NSFW opt-in toggle, rendered only for CivitAI; bound to `nsfwOptIn`
  (session-only; resets safe each launch). HF searches always send `false`.
- `SearchResultCard` per `SearchResult`: name/author, capability +
  base-architecture, tier + `tier_reason`, downloads/likes, size, license,
  `SecurityBadges`, tags. **Acquire** -> `enqueueDownload(result.id)`.
  - If `format === 'pickle'` or `trust_remote_code`, acquire opens
    `ConsentDialog` -> `grantConsent(result.id, kind, true)` before the pull.
  - If the resulting `DownloadJob.gate_url` is set, show "Accept the license on
    HF/CivitAI" -> `app.openExternal(gate_url)`, then a retry affordance.
- States: idle (search prompt) / loading / ready / **offline** (degraded banner
  + `searchWarning`) / empty.

### Library
- **Downloads strip:** active `DownloadJob`s (progress/speed/ETA) with
  pause/resume/cancel; terminal states clear out.
- **Installed models:** `availableModels` as `InstalledModelCard`s -
  capability/runtime/quality/hardware-class badges, size, VRAM, source, security;
  **Delete** (confirm) and **Convert** (`convertModel`, shown when format is
  convertible); inline **fit chip** (`resolveRuntime`).
- **Library roots** (`LibraryRootsManager`): list (path, layout hint, added) with
  remove; **Add root** (folder picker + layout hint comfyui/a1111/generic ->
  `addLibraryRoot`); **Scan** (`scanLibraries`); **Detect** (`detectLibraries`
  -> offer `DetectedRoot`s to add).

### Hardware
- `HardwareProfile` card: GPU name, VRAM total/free, compute capability, CUDA,
  torch availability, system RAM, disk free.
- **Per-model fit table:** each installed model -> `resolveRuntime` ->
  `RuntimePlan`: verdict (fits / fits-with-offload / over-budget / cpu-only),
  VRAM estimate breakdown, precision, offload, missing components, fallback
  ladder, readiness, informational refusal. Verdict -> LED tone reuses the
  `PreflightFooter` mapping for consistency with Generate.

## Data flow

- `FoundryPage` on mount: `loadModels`, `refreshDownloads`, `loadLibraryRoots`,
  `loadHardwareProfile`. Downloads poll every ~2500 ms while any job is in an
  active state (mirrors the existing Settings poller); stops when idle.
- All reads/writes go through the existing `modelsSlice` actions and `auth.*`
  IPC. No new store slice, no backend change.
- Acquisition: `enqueueDownload(result.id)` (the backend turns a search hit into
  a registry record + download job). Consent precedes the pull when required.

## Error handling

- **Search offline:** `searchStatus === 'offline'` -> degraded banner +
  `searchWarning`; results cleared, controls stay usable.
- **Consent / convert / resolveRuntime:** these intentionally surface errors
  (the slice does not swallow them) -> inline error messaging; a rejection means
  the bridge failed.
- **Gated downloads:** `gate_url` -> open-external + retry; never silent.
- **Local-first:** list / roots / hardware refreshes swallow backend hiccups and
  keep last-known state (slice behavior); the UI shows last-known with a subtle
  "couldn't refresh" hint where useful.

## Settings integration

- Settings -> AI & Models "Installed Models" section: replace the management list
  with a slim count + **"Manage in Foundry ->"** button (`setActiveTab('foundry')`).
- `ModelSelector` empty-state "open the Foundry to add one" becomes a real link
  to the Foundry tab.

## Testing

Vitest component tests per section, mocking `window.electron.models/hardware/auth`
and the store (matching existing `*.test.tsx` patterns):

- Discover: search -> results render; offline degrade; acquire happy path;
  acquire gated behind ConsentDialog for pickle/trust_remote_code; gate_url path.
- Library: downloads progress + pause/resume/cancel; installed delete (confirm) +
  convert; roots add/remove/scan/detect.
- Hardware: profile render; per-model fit verdict -> tone.
- Tokens: save calls `auth.set*Token`.
- Navigation: Foundry tab routes to `FoundryPage`; Settings/ModelSelector links
  set `activeTab='foundry'`.

Design-system + a11y compliant: `lucide-react` icons only, no emoji
(ui-glyphs guard), machined radii + Carbon tokens, keyboard-navigable controls,
focus-trapped dialog.

## Known limitations (carried, not introduced)

- Auth IPC has setters only - tokens are write-with-confirmation (no stored-state
  readback). Documented in the UI copy.

## Acceptance criteria

- A Foundry tab exists, routes to a full-width page, and persists across restart.
- Users can search HF and CivitAI, see security/tier/popularity metadata, and
  acquire a model (with consent + gated handling) that then appears in Library.
- Users can pause/resume/cancel a download, delete and convert installed models,
  and add/remove/scan/detect library roots.
- Users can see their hardware profile and each installed model's fit verdict.
- Users can set HF/CivitAI tokens.
- Settings and the model picker link to the Foundry instead of dead-ending.
- `npm run typecheck`, `npm test`, `npm run build` green; backend untouched.
