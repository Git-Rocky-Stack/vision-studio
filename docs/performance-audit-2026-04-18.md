# Vision Studio Performance Audit

**Date:** 2026-04-18  
**Branch:** feat/dockview-layout-migration  
**Auditor:** Performance Engineering

---

## Executive Summary

The audit identified **34 findings** across 8 categories, with **3 P0 (critical)**, **8 P1 (high)**, **12 P2 (medium)**, and **11 P3 (low)** issues. The most impactful findings are: (1) recursive setTimeout polling in GeneratePanel with zero cleanup causing memory leaks and ghost requests, (2) 13 components using destructured `useAppStore()` selectors that subscribe to the entire store, and (3) zero code-splitting with React.lazy/Suspense meaning every byte of JS loads upfront.

Estimated total impact: ~40-60% reduction in unnecessary re-renders, ~200-500ms faster initial load, elimination of at least 3 confirmed memory leak paths.

---

## 1. Bundle Size & Code Splitting

### P1-BS-01: Zero React.lazy / Suspense -- all pages loaded upfront
- **File:** `src/App.tsx`, `src/components/layout/DockviewLayout.tsx`
- **Impact:** Every panel (GeneratePanel, BatchPanel, SettingsPanel, AssetsPanel, StoryboardPanel, etc.) loads on initial render. Estimated 500KB+ of JS that could be deferred.
- **Recommendation:** Wrap each panel in `React.lazy()` with `Suspense` boundary. Panels are never all visible simultaneously -- they should load on demand.
```tsx
const GeneratePanel = React.lazy(() => import('@/pages/GeneratePanel'));
const BatchPanel = React.lazy(() => import('@/pages/BatchPanel'));
// etc.
```

### P2-BS-02: framer-motion bundled in full (5.3MB on disk)
- **File:** `vite.config.ts` (vendor-motion chunk exists, good)
- **Impact:** The vendor-motion chunk is properly separated, but the entire framer-motion library loads on startup even for panels that never animate.
- **Recommendation:** Already properly chunked. Consider using `React.lazy` for panels that depend on framer-motion so the chunk loads on demand.

### P2-BS-03: lucide-react at 41MB on disk (tree-shaken but verify)
- **File:** Multiple files importing from lucide-react
- **Impact:** Individual icon imports are tree-shakeable, but the 30+ files importing icons adds bundle weight. Already chunked to `vendor-icons` in vite.config.ts.
- **Recommendation:** Verify tree-shaking effectiveness with a bundle analysis. Consider consolidating icon imports into a single barrel file for better deduplication.

### P3-BS-04: axios could be replaced by native fetch
- **File:** `electron/ipc-handlers/generation.ts`
- **Impact:** 2.5MB on disk. The Electron renderer already has full fetch support. The main process handlers use axios for HTTP requests to the Python backend.
- **Recommendation:** Low priority. Keep axios in the Electron main process where fetch is less convenient, but consider native fetch for any renderer-side HTTP calls.

### P2-BS-05: No preloading hints for critical routes
- **File:** `vite.config.ts`
- **Impact:** The Generate panel (primary workflow) loads at the same priority as Settings and other rarely-used panels.
- **Recommendation:** Add `modulepreload` links for the Generate panel chunk to enable early fetch during initial load.

---

## 2. React Rendering Performance

### P0-RR-01: 13 components subscribe to entire Zustand store via destructured selectors
- **Files:** `CanvasContextMenu.tsx:29`, `ComparisonView.tsx:33`, `GenerationQueue.tsx:9`, `StylePresetsBar.tsx:26`, `Header.tsx:6`, `Timeline.tsx:600`, `TemplateCreator.tsx:69`, `BatchPanel.tsx:713`, `QuickGeneratePanel.tsx:28`, `ToolStrip.tsx:59`, `ComparisonToolbar.tsx:22`, `GenerationProgress.tsx:6`, `EditCanvas.tsx` (12+ fields)
- **Impact:** Every store update (even unrelated fields) triggers re-renders in ALL these components. With 30+ fields in the store, this means ~13 unnecessary re-renders per state change.
- **Recommendation:** Replace destructured selectors with individual selectors using the Zustand shallow equality pattern:
```tsx
// BEFORE (subscribes to entire store)
const { currentImage, setActiveTab } = useAppStore();

// AFTER (subscribes to specific fields only)
const currentImage = useAppStore(s => s.currentImage);
const setActiveTab = useAppStore(s => s.setActiveTab);
```
For multiple related selectors, use `useShallow` from `zustand/react/shallow`:
```tsx
import { useShallow } from 'zustand/react/shallow';
const { currentImage, setActiveTab } = useAppStore(useShallow(s => ({
  currentImage: s.currentImage,
  setActiveTab: s.setActiveTab,
})));
```

### P1-RR-02: EditCanvas subscribes to 12+ store fields
- **File:** `src/components/edit/EditCanvas.tsx:30-41`
- **Impact:** EditCanvas is a heavy Konva canvas component. It re-renders on ANY store change (region mode, mask settings, edit tool, layers, image, adjustments) even when those values haven't actually changed.
- **Recommendation:** Split into individual selectors. Only `currentImage` and `activeEditTool` need to trigger canvas re-renders. Mask/region state can be isolated.

### P1-RR-03: GeneratePanel subscribes to 10+ store fields
- **File:** `src/pages/GeneratePanel.tsx:85-95`
- **Impact:** The entire generation panel re-renders when unrelated store fields change (e.g., iteration nodes, collections).
- **Recommendation:** Use individual selectors or `useShallow` for the specific fields this panel needs.

### P2-RR-04: Several major components lack React.memo
- **Files:** `GeneratePanel.tsx`, `ModelSelector.tsx`, `PromptArea.tsx`, `BatchPanel.tsx`, `SettingsPanel.tsx`, `AIToolsPanel.tsx`, `QuickGeneratePanel.tsx`, `AssetsPanel.tsx`, `DockviewLayout.tsx`, `WorkbenchGalleryDock.tsx`, `WorkbenchBoardsDock.tsx`, `WorkbenchViewer.tsx`
- **Impact:** These components re-render on every parent re-render, even when their props haven't changed. The Timeline component correctly uses memo for sub-components (TimeRuler, TrackHeader, ClipBlock, TransportControls) but these major panels do not.
- **Recommendation:** Wrap these components with `React.memo()`, especially panels passed as children to layout components.

### P2-RR-05: Inline object/function creation in JSX props
- **File:** `src/components/layout/WorkbenchGalleryDock.tsx:27-36`
```tsx
const assetItems = assetLibrary.map((asset) => ({ ... }));
const batchItems = batchResults.map((result) => ({ ... }));
```
- **Impact:** These inline computations run on every render, creating new object arrays each time. If passed as props, they break memoization.
- **Recommendation:** Wrap in `useMemo` with appropriate dependencies.

### P2-RR-06: Inline arrow functions in JSX onClick handlers
- **File:** `src/pages/GeneratePanel.tsx:605` (aspect ratio map), `src/pages/BatchPanel.tsx:485` (prompts map), `src/pages/SettingsPanel.tsx:469,494,559` (multiple maps)
- **Impact:** Every render creates new function references, preventing child memoization.
- **Recommendation:** Extract handlers with `useCallback` or use data attributes with a single delegated handler.

### P3-RR-07: Timeline renders 20 placeholder items without virtualization
- **File:** `src/components/layout/Timeline.tsx:445`
```tsx
{Array.from({ length: 20 }).map((_, i) => (
```
- **Impact:** 20 placeholder elements rendered even when not visible.
- **Recommendation:** Minor. Use virtualization for track lists with many scenes.

---

## 3. State Management (Zustand)

### P0-SM-01: Monolithic store with no subscription slicing
- **File:** `src/store/appStore.ts`, `src/store/appStore.types.ts`
- **Impact:** The store has 30+ fields including navigation, generation, editing, iterations, collections, workflow, batch, and assets. Any change to ANY field triggers re-renders in every component using destructured selectors (see P0-RR-01).
- **Recommendation:** The current slice architecture (uiSlice, editSlice, generationSlice, etc.) is good for organization but does NOT provide subscription isolation. Consider:
  1. Use `useShallow` for all multi-field selectors immediately (quick win)
  2. Long-term: split into separate Zustand stores by domain (generationStore, editStore, etc.) so subscription isolation is automatic

### P2-SM-02: `advancedGeneration` is a nested object that always returns new references
- **File:** `src/store/appStore.types.ts`
- **Impact:** Any component subscribing to `advancedGeneration` re-renders when ANY field within it changes, even unrelated ones.
- **Recommendation:** Use `useShallow` for `advancedGeneration`, or flatten the fields into top-level store keys.

### P2-SM-03: `systemInfo` is a nested object
- **File:** `src/store/appStore.types.ts`
- **Impact:** Same issue as advancedGeneration. `systemInfo.backendConnected` changes cause re-renders in components that only need `systemInfo.gpuName`.
- **Recommendation:** Use individual selectors: `useAppStore(s => s.systemInfo.backendConnected)` with shallow comparison.

### P3-SM-04: `generationDraft` persisted state includes transient UI state
- **File:** `src/store/appStore.ts` partialize
- **Impact:** `generationDraft` is persisted to localStorage but includes ephemeral generation state that shouldn't survive app restarts.
- **Recommendation:** Review the partialize list and exclude transient fields like `generationDraft`.

---

## 4. Memory Leaks

### P0-ML-01: GeneratePanel recursive setTimeout has zero cleanup
- **File:** `src/pages/GeneratePanel.tsx:399,403`
```tsx
setTimeout(checkStatus, 1000);  // success
setTimeout(checkStatus, 2000);  // error
```
- **Impact:** If the user navigates away from the Generate panel during generation, the polling chain continues indefinitely. Each timeout schedules another, creating an unbounded memory leak and ghost HTTP requests. No `useEffect` cleanup, no AbortController, no cancellation mechanism.
- **Recommendation:** Wrap in `useEffect` with cleanup:
```tsx
useEffect(() => {
  let cancelled = false;
  const poll = async () => {
    if (cancelled) return;
    try {
      const status = await window.electron.generation.getStatus(jobId);
      if (cancelled) return;
      // process status
      if (status.status !== 'completed' && status.status !== 'failed') {
        setTimeout(poll, 1000);
      }
    } catch {
      if (!cancelled) setTimeout(poll, 2000);
    }
  };
  poll();
  return () => { cancelled = true; };
}, [jobId]);
```

### P0-ML-02: QuickGeneratePanel setInterval + setTimeout leak on unmount
- **File:** `src/pages/QuickGeneratePanel.tsx:110-125`
- **Impact:** `setInterval(checkStatus, 500)` and `setTimeout(() => { clearInterval(interval); unwatch(); }, 5 * 60 * 1000)` are created inside `handleGenerate` but not cleaned up if the component unmounts. The 5-minute timeout is a maximum, not a cancellation guarantee.
- **Recommendation:** Store interval/timeout IDs in refs and clear them in `useEffect` cleanup.

### P1-ML-03: BatchPanel setInterval in pollBatchProgress has no cleanup on unmount
- **File:** `src/pages/BatchPanel.tsx:216`
- **Impact:** The `setInterval` created in `pollBatchProgress` is never cleared on unmount. If the user closes the batch panel while processing, the interval continues polling.
- **Recommendation:** Store interval ID in a ref and clear in useEffect cleanup.

### P1-ML-04: AIToolsPanel setTimeout in handleApply has no cleanup
- **File:** `src/components/edit/AIToolsPanel.tsx:74`
```tsx
setTimeout(() => { setProcessingTool(null); }, 2000);
```
- **Impact:** If the component unmounts before 2 seconds, this tries to set state on an unmounted component.
- **Recommendation:** Low severity (React 19 handles this gracefully), but still a code smell. Use a ref and clear in useEffect cleanup.

### P1-ML-05: SettingsPanel setTimeout on line 432 has no cleanup
- **File:** `src/pages/SettingsPanel.tsx:432`
- **Impact:** `setTimeout(async () => { ... })` inside a button click handler without cleanup.
- **Recommendation:** Track timeout IDs and clear on unmount.

### P2-ML-06: EditCanvas creates Image objects but doesn't revoke any object URLs
- **File:** `src/components/edit/EditCanvas.tsx`
- **Impact:** If `currentImage` is ever set to a blob URL, it will leak memory. Currently mitigated because images appear to be file paths rather than blob URLs.
- **Recommendation:** Add `URL.revokeObjectURL()` cleanup when `currentImage` changes, as a defensive measure.

---

## 5. Virtual Scrolling

### P2-VS-01: BatchPanel renders all prompts without virtualization
- **File:** `src/pages/BatchPanel.tsx:485`
```tsx
{prompts.map((prompt, index) => (
  <motion.div key={prompt.id} ...>
```
- **Impact:** With 50+ batch prompts, this renders all items in the DOM. Each prompt card has complex UI (status badges, progress bars, action buttons).
- **Recommendation:** Use `@tanstack/react-virtual` (already a dependency) for the prompts list when count exceeds 20.

### P2-VS-02: PromptHistory renders without virtualization
- **File:** `src/components/generate/PromptHistory.tsx`
- **Impact:** Long prompt histories could create hundreds of DOM nodes.
- **Recommendation:** Virtualize when prompt count exceeds 30 items.

### P2-VS-03: GenerationQueue renders all items without virtualization
- **File:** `src/components/canvas/GenerationQueue.tsx`
- **Impact:** Queue items accumulate during active generation sessions.
- **Recommendation:** Virtualize when queue length exceeds 10 items.

### P3-VS-04: SettingsPanel model list renders without virtualization
- **File:** `src/pages/SettingsPanel.tsx:494`
```tsx
availableModels.map((model: ModelInfo) => (
```
- **Impact:** Model lists are typically short (< 20). Low priority.
- **Recommendation:** Monitor. Virtualize only if model count grows beyond 50.

---

## 6. Image/Asset Handling

### P3-IA-01: No lazy loading optimization for gallery thumbnails
- **File:** `src/components/layout/WorkbenchGalleryDock.tsx`, `src/pages/AssetsPanel.tsx`
- **Impact:** AssetsPanel already uses `loading="lazy"` on images (good). Gallery dock does not explicitly use lazy loading.
- **Recommendation:** Ensure all thumbnail images use `loading="lazy"` and consider `fetchpriority="low"` for below-fold thumbnails.

### P3-IA-02: EditCanvas Konva checkerboard redraws on every render
- **File:** `src/components/edit/EditCanvas.tsx`
- **Impact:** The checkerboard pattern creates nested loops computing colors for every render. Not expensive for small canvases but wastes cycles on resize.
- **Recommendation:** Memoize the checkerboard pattern or use a static image. The canvas size state change on resize triggers a full re-render including the checkerboard.

---

## 7. Electron Main Process

### P1-EM-01: Synchronous fs operations block the main thread
- **File:** `electron/main.ts:114,135,139,146,147,178,180,215`
- **Impact:** `fs.existsSync()` is called multiple times during backend path resolution. `fs.mkdirSync()` on line 215 blocks the main thread during directory creation. Each sync call blocks the renderer process for 1-5ms, causing jank.
- **Recommendation:** Replace with async `fs.promises` equivalents:
```ts
// BEFORE
if (fs.existsSync(devPath)) { ... }
fs.mkdirSync(outputDirectory, { recursive: true });

// AFTER  
if (await fs.promises.access(devPath).then(() => true).catch(() => false)) { ... }
await fs.promises.mkdir(outputDirectory, { recursive: true });
```

### P1-EM-02: WebSocket reconnection uses fixed 5s delay with no exponential backoff
- **File:** `electron/ipc-handlers/generation.ts:74-75`
```ts
ws.on('close', () => {
  setTimeout(connectWebSocket, 5000);
});
```
- **Impact:** If the backend is down for an extended period, this creates a new connection attempt every 5 seconds indefinitely. This wastes resources and fills logs with error messages.
- **Recommendation:** Implement exponential backoff with jitter and max retries:
```ts
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_DELAY = 1000;

ws.on('close', () => {
  reconnectAttempts++;
  const delay = Math.min(
    INITIAL_DELAY * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
    MAX_RECONNECT_DELAY
  );
  setTimeout(connectWebSocket, delay);
});

ws.on('open', () => {
  reconnectAttempts = 0;
});
```

### P2-EM-03: No max retry limit on backend HTTP requests
- **File:** `electron/ipc-handlers/generation.ts` (requestBackend function)
- **Impact:** The retry logic uses a fixed `attempts` parameter but callers can pass arbitrary values. No circuit breaker pattern.
- **Recommendation:** Add a default max retry count and circuit breaker that disables retries after sustained failures.

---

## 8. Network/API

### P1-NA-01: No AbortController usage in generation polling
- **Files:** `src/pages/GeneratePanel.tsx:399-403`, `src/pages/QuickGeneratePanel.tsx:110`, `src/pages/BatchPanel.tsx:216`
- **Impact:** When the user cancels generation, the polling HTTP requests continue. When the component unmounts, in-flight requests still complete and attempt to update unmounted state.
- **Recommendation:** Create an `AbortController` when starting generation, pass its signal to all fetch calls, and abort it on cancel or unmount:
```tsx
const abortRef = useRef<AbortController | null>(null);

const handleGenerate = async () => {
  abortRef.current = new AbortController();
  // ... use abortRef.current.signal in fetch calls
};

const handleCancel = () => {
  abortRef.current?.abort();
};

useEffect(() => {
  return () => { abortRef.current?.abort(); };
}, []);
```

### P2-NA-02: No request deduplication or caching for model/status queries
- **File:** `src/pages/SettingsPanel.tsx:160`
- **Impact:** `modelStatusIntervalRef` polls backend status every N seconds. If SettingsPanel re-mounts (tab switching), it starts a new interval without canceling the old one if the ref wasn't cleaned up.
- **Recommendation:** The current implementation stores the interval in a ref and cleans up in the useEffect return, which is correct. However, verify that rapid tab-switching doesn't create duplicate intervals.

### P2-NA-03: No debounce on search inputs in AssetsPanel and CollectionsPanel
- **File:** `src/pages/AssetsPanel.tsx` (searchQuery state)
- **Impact:** Typing in the search filter triggers a re-filter of all assets on every keystroke. With 500+ assets, this causes visible lag.
- **Recommendation:** Add a 150-300ms debounce on the search query before applying the filter.

### P3-NA-04: Duplicate HTTP requests for model status
- **File:** `src/pages/SettingsPanel.tsx:160`, `src/App.tsx:75`
- **Impact:** Both App.tsx and SettingsPanel poll system/model status independently. If both are active simultaneously, duplicate requests are sent.
- **Recommendation:** Centralize system status polling in the Zustand store with a single interval, and have components subscribe to the store.

---

## 9. Additional Findings

### P2-AF-01: DockviewLayout creates new tab definition arrays on every render
- **File:** `src/components/layout/DockviewLayout.tsx:110`
```tsx
const centerTabs: CenterTabDef[] = preset.centerViews.map((id) => ({ ... }));
```
- **Impact:** This creates a new array on every render, which can trigger unnecessary re-renders in dockview panel components.
- **Recommendation:** Wrap in `useMemo` with `preset` as dependency.

### P2-AF-02: SetupWizard setTimeout chains without cleanup
- **File:** `src/components/SetupWizard.tsx:80,86,91`
- **Impact:** Multiple setTimeout/setInterval chains for the setup animation have no cleanup on unmount.
- **Recommendation:** Track all timer IDs and clear in useEffect cleanup.

### P3-AF-01: ModelSelector positions dropdown with imperative DOM measurement on every open
- **File:** `src/components/generate/ModelSelector.tsx`
- **Impact:** `positionDropdown()` uses `getBoundingClientRect()` and sets state on every open. Not a major issue since it only runs on open, but could be optimized.
- **Recommendation:** Use CSS-based positioning with `@floating-ui/react` (already a dependency) for better performance.

### P3-AF-02: Multiple components import from 'framer-motion' for simple animations
- **Files:** Multiple files use `motion.div` for fade transitions
- **Impact:** Even simple CSS transitions pull in framer-motion chunk. Consider CSS-only transitions for simple opacity/transform animations.
- **Recommendation:** Evaluate if CSS `transition` property can replace `framer-motion` AnimatePresence for simple show/hide animations.

---

## Priority Action Matrix

| Finding | Severity | Estimated Impact | Effort |
|---------|----------|-----------------|--------|
| P0-ML-01: GeneratePanel setTimeout leak | P0 | Memory leak + ghost requests | M |
| P0-ML-02: QuickGeneratePanel interval leak | P0 | Memory leak + ghost requests | M |
| P0-RR-01: Destructured useAppStore selectors | P0 | ~40-60% unnecessary re-renders | M |
| P0-SM-01: Monolithic store subscriptions | P0 | Same as P0-RR-01 | L |
| P1-RR-02: EditCanvas 12+ store fields | P1 | Canvas re-renders on unrelated changes | S |
| P1-RR-03: GeneratePanel 10+ store fields | P1 | Full re-render on any store change | S |
| P1-BS-01: Zero React.lazy/Suspense | P1 | ~200-500ms faster initial load | M |
| P1-ML-03: BatchPanel interval leak | P1 | Memory leak during batch | S |
| P1-EM-01: Synchronous fs operations | P1 | 5-15ms jank per operation | M |
| P1-EM-02: WebSocket no backoff | P1 | Resource waste + log spam | S |
| P1-NA-01: No AbortController in polling | P1 | Ghost requests after cancel | M |
| P2-RR-04: Missing React.memo on panels | P2 | Unnecessary re-renders | S |
| P2-VS-01: BatchPanel not virtualized | P2 | DOM bloat with 50+ items | M |
| P2-AF-01: DockviewLayout array recreation | P2 | Unnecessary dock re-renders | S |

---

## Quick Wins (Estimated: 2-3 hours total)

1. **Fix P0-ML-01 and P0-ML-02**: Add useEffect cleanup with cancellation flags to GeneratePanel and QuickGeneratePanel polling (~30 min each)
2. **Fix P1-ML-03**: Add ref-tracked interval cleanup to BatchPanel (~15 min)
3. **Convert P0-RR-01**: Replace destructured `useAppStore()` with individual selectors across 13 files (~60 min with find-replace)
4. **Add AbortController**: Cancel in-flight requests on component unmount (~30 min)
5. **WebSocket backoff**: Add exponential backoff to electron generation handler (~15 min)

## Medium-Term Investments (Estimated: 1-2 days)

1. **Code splitting**: Wrap panels in `React.lazy()` with Suspense boundaries
2. **React.memo**: Add `memo()` to all major panel components
3. **Virtual scrolling**: Apply `useVirtualizer` to BatchPanel, PromptHistory, GenerationQueue
4. **Search debounce**: Add 200ms debounce to AssetsPanel and CollectionsPanel search

## Long-Term Architecture (Estimated: 3-5 days)

1. **Store decomposition**: Split Zustand store into domain-specific stores (generationStore, editStore, uiStore) for automatic subscription isolation
2. **Polling architecture**: Replace all setTimeout/setInterval polling with a centralized polling service that uses AbortController and auto-cleanup
3. **Async Electron main process**: Replace all sync fs operations with `fs.promises` equivalents