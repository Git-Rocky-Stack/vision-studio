# Code Quality Review — 2026-04-17

**Scope:** Last 5 commits (workflow feature: graph editor, comfy export, workbench)  
**Files:** 10 changed, ~1,347 insertions, ~207 deletions  
**Reviewer:** Automated quality analysis  

---

## Executive Summary

| Dimension | Score | Status |
|-----------|-------|--------|
| Code Smells | 6/10 | Needs attention |
| Complexity | 7/10 | Acceptable |
| Maintainability | 5/10 | Action needed |
| Design Patterns | 7/10 | Good |
| Best Practices | 7/10 | Good |
| Type Safety | 6/10 | Needs attention |

**Overall: 6.3/10 — Acceptable for feature velocity, but technical debt is accumulating.**

---

## P0 — Critical Issues

### 1. `appStore.ts` is a 1,743-line monolith

**Location:** `src/store/appStore.ts`  
**Severity:** P0 — Bloater / Change Preventer

The store file exports 9 interfaces/types, defines seed data, implements 30+ actions, and manages 5+ domain slices (projects, scenes, workflows, assets, generation). The new workflow actions add ~250 lines of deeply nested map/spread patterns.

**Why it matters:** Every store modification requires navigating a 1,700+ line file. Merge conflicts are inevitable. The deeply nested immutable updates (4-5 levels of `.map()` + spread) are fragile and hard to review.

**Recommendation:** Split into domain slices using Zustand slices pattern:
- `src/store/slices/workflowSlice.ts` — WorkflowGraph, WorkflowRecord, workflow actions
- `src/store/slices/projectSlice.ts` — Project, Scene, RegionLock actions
- `src/store/slices/assetSlice.ts` — Asset library actions
- `src/store/slices/generationSlice.ts` — Generation queue, batch, prompt history
- Export workflow types (`WorkflowGraph`, `WorkflowGraphNode`, `WorkflowGraphEdge`, `WorkflowGraphInput`) from `src/types/workflow.ts`, not the store

### 2. `throw new Error` in Zustand setters — unhandled exceptions in React

**Location:** `appStore.ts:881, 918, 940, 972, 1003-1011`  
**Severity:** P0 — Unhandled Exception Risk

Nine `throw new Error()` calls inside Zustand `set()` callbacks. If these execute during a React render cycle (e.g., `useEffect`-triggered store calls), the error propagates unhandled and can crash the app. Zustand does not catch setter errors.

**Why it matters:** These are pre-condition checks (node not found, self-referencing edge) that are developer-facing invariants, not user-facing errors. A typo in a workflow ID crashes the entire app.

**Recommendation:**
- Move pre-condition validation out of `set()` callbacks — validate in the action body before calling `set()`, and return early / return a result type instead of throwing
- For UI-triggered actions (like `connectWorkflowNodes`), return `{ ok: boolean; error?: string }` so the component can show a user-friendly message
- Only throw for truly impossible states (programmer errors), not for invalid user input

---

## P1 — Major Issues

### 3. `any` types in production code

**Location:** `appStore.ts:45, 50, 548, 639`  
**Severity:** P1 — Type Safety Gap

```
params: Record<string, any>;        // line 45 — GenerationJob
[key: string]: any;                 // line 50 — GenerationJob.result
availableModels: any[];             // line 548 — AppState
setAvailableModels: (models: any[]) => void;  // line 639
```

**Recommendation:** Replace with proper types:
- `params: Record<string, string | number | boolean>` (or a union of known param shapes)
- `result: GenerationResult` (define the interface)
- `availableModels: ModelInfo[]` (define ModelInfo with name, type, size, etc.)

### 4. Duplicated node default definitions

**Location:** `WorkflowWorkbench.tsx:24-85` vs `appStore.ts` seed data  
**Severity:** P1 — DRY Violation / Change Preventer

`createWorkflowNodeFromClassType()` in WorkflowWorkbench defines default configs for 5 node types (CLIPTextEncode, CheckpointLoaderSimple, KSampler, PreviewImage, SaveImage). The `addWorkflowNode` store action also processes these. If a node's defaults change, both locations must be updated.

**Recommendation:** Extract node defaults to a single source of truth:
```
src/features/workflow/nodeDefaults.ts
```
Import in both WorkflowWorkbench and appStore.

### 5. Manual deep cloning instead of structured helpers

**Location:** `appStore.ts:1120-1160` (cloneWorkflowGraph, cloneWorkflow)  
**Severity:** P1 — Fragile / Error-Prone

The `cloneWorkflowGraph()` and `cloneWorkflow()` functions manually spread every nested property. If a new field is added to `WorkflowGraphNode` or `WorkflowGraph` but the clone function isn't updated, the clone silently drops data.

**Recommendation:** Use `structuredClone()` (available in all modern browsers and Node 18+) for deep cloning, or use Immer middleware with Zustand for immutable updates.

### 6. Workflow types co-located with store

**Location:** `appStore.ts:108-138`  
**Severity:** P1 — Coupling / Single Responsibility

`WorkflowGraph`, `WorkflowGraphNode`, `WorkflowGraphInput`, `WorkflowGraphEdge`, and `WorkflowRecord` are all exported from the store file. Components and the `comfyExport` module import types from the store, creating a circular dependency pressure.

**Recommendation:** Move to `src/types/workflow.ts`. The store should import types, not export them.

---

## P2 — Minor Issues

### 7. `addNodeActions` coupled to ComfyUI class types

**Location:** `WorkflowGraphEditor.tsx:25-31`  
**Severity:** P2 — Coupling

The `addNodeActions` array and the `getDefault*` functions hardcode 5 ComfyUI node types. Adding a new node type requires changes in 3 places: addNodeActions, getDefaultOutputForClassType, getDefaultInputForClassType.

**Recommendation:** Create a node registry map:
```ts
const NODE_REGISTRY: Record<string, { label: string; defaultOutput: string; defaultInput: string }> = { ... }
```
Derive addNodeActions and getDefault functions from it.

### 8. `createWorkflowEdgeId` is not collision-safe

**Location:** `appStore.ts` (referenced in `connectWorkflowNodes`)  
**Severity:** P2 — Correctness Risk

The edge ID generator uses source/target/output names. If two edges share the same source+target+output (which is prevented by validation), the ID would collide. More practically, the ID format ties identity to content, making it impossible to have parallel edges between the same ports.

**Recommendation:** Use `crypto.randomUUID()` for edge IDs to guarantee uniqueness and allow future parallel-edges scenarios.

### 9. `formatLabel` and `formatTimestamp` are generic utilities

**Location:** `WorkflowWorkbench.tsx:9-17`  
**Severity:** P2 — Placement

These are reusable formatting functions that could be needed elsewhere.

**Recommendation:** Move to `src/utils/formatUtils.ts` (or add to `src/utils/` as individual files).

### 10. `useEffect` dependency on `activeWorkflow.graph`

**Location:** `WorkflowWorkbench.tsx:116-119`  
**Severity:** P2 — Potential Re-render Loop

```ts
useEffect(() => {
  setExportedJson(null);
  setExportError(null);
}, [activeWorkflow.id, activeWorkflow.graph]);
```

`activeWorkflow.graph` is a new object reference on every store update (due to spread), which means this effect fires on every graph mutation — even drag moves. The intent is to clear the export when switching workflows, not on every graph edit.

**Recommendation:** Only depend on `activeWorkflow.id`:
```ts
useEffect(() => {
  setExportedJson(null);
  setExportError(null);
}, [activeWorkflow.id]);
```

---

## P3 — Suggestions

### 11. `comfyExport` test coverage gap

**Location:** `src/features/workflow/comfyExport.test.ts`  
Only 2 tests: happy path and missing source node. Missing coverage for:
- Self-referencing edge validation
- Duplicate link validation
- Missing source/target nodes in edges
- Empty graph export

### 12. WorkflowGraphEditor lacks pan/zoom

The graph canvas uses fixed pixel dimensions (`h-[640px] min-w-[980px]`). For larger workflows, this will need pan/zoom. The `viewport` field exists on `WorkflowGraph` but isn't used yet.

### 13. Accessibility gap — edge buttons

Edge hit-targets are 24x24px buttons (line 244). This meets the 44px touch target minimum only on desktop. Mobile/tablet users will struggle.

---

## Positive Observations

- **comfyExport.ts** is well-designed: separate validation function, proper error messages with context, pure function with no side effects
- **WorkflowGraphEditor** has clean prop interface, good ARIA labeling, and proper pointer event handling with cleanup
- **Error handling in Workbench** — the `handleExportComfyJson` try/catch with user-facing error display is well done
- **Design token usage** — consistent use of `accent-primary-border`, `accent-primary-muted`, no legacy `red-primary` tokens
- **Test patterns** — store tests use `getInitialState()` reset, component tests check ARIA roles properly

---

## Metrics Summary

| Metric | Current | Target |
|--------|---------|--------|
| appStore.ts lines | 1,743 | <400 per slice |
| `any` types | 4 | 0 |
| `throw` in setters | 9 | 0 |
| Cyclomatic complexity (worst: `deleteWorkflowNode`) | ~8 | <10 OK |
| Test files for changed code | 4/4 | 4/4 |
| Types exported from store | 9 | 0 (move to types/) |

---

## Technical Debt Estimate

| Issue | Effort |
|-------|--------|
| Store slice extraction | 4-6 hours |
| Remove throws from setters | 2-3 hours |
| Replace `any` types | 1-2 hours |
| Extract node defaults | 1 hour |
| Move types to types/workflow.ts | 1 hour |
| Expand comfyExport tests | 30 min |
| Fix useEffect dependency | 5 min |

**Total: ~10-13 hours**