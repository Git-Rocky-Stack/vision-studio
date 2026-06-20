# M8 ComfyUI Interop Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vision Studio a first-class ComfyUI companion: import external Comfy graphs into the internal `WorkflowGraph` with structural round-trip fidelity, fix the export so its links are genuinely ComfyUI-loadable, run the user's authored first-class graph on a connected Comfy server (image and video), and treat every imported graph as untrusted input behind a hard safety gate.

**Architecture:** The **renderer** owns import (inverse of `comfyExport`), a named<->integer slot-reconciliation layer shared by import and a corrected export, a fidelity report, an advisory safety pre-check, a whole-graph store action, and the Import / Run-on-ComfyUI UI. **Electron main** owns one new IPC channel (`workflow:run-graph`) that posts the exported graph to the backend. The **backend** owns the authoritative safety gate (class-type allow-list + path sanitization before anything reaches ComfyUI) and Comfy graph/video execution (runs the user's graph, extracts image **and** video outputs, saves, returns asset URLs). ComfyUI stays out of the M6 routing fabric.

**Tech Stack:** TypeScript, Electron 33 (main + preload), React 19 + Tailwind v4 (renderer), Zustand store, Vitest (node + jsdom), Python 3 (FastAPI), `unittest` (backend), axios (HTTP). Design system: Carbon Pro (`DESIGN.md`).

## Global Constraints

- **TDD:** failing test first, implement to green. Backend uses `unittest.TestCase` (CI runs `unittest discover`); test modules prepend `BACKEND_ROOT` to `sys.path` (the `backend/tests/test_comfy_workflows.py` pattern) and, for routers, mount only the router under test on a `FastAPI()` `TestClient` (the `backend/tests/test_lora_api.py` pattern). No test starts a live ComfyUI server; the `ComfyUIClient` is mocked. Frontend/electron use Vitest with `axios` injected and mocked.
- **Branch:** work on `feat/comfy-interop-m8` (already created off `main`; the spec + roadmap tracker update are already committed there). Bite-sized task commits. Never commit to `main`.
- **Commits (Windows):** the husky pre-commit hook runs lint-staged (full Vitest + typecheck on staged `.ts/.tsx`; markdown/python-only commits are skipped). Commit via the **Bash tool**; before committing run `export PATH="/c/Program Files/nodejs:$PATH"` so the hook's `npx` resolves. Confirm `git branch --show-current` in the same step as the commit.
- **Green gates before merge:** `npm run typecheck` (`tsconfig.app.json` + `tsconfig.electron.json` + `tsconfig.node.json`), `npm test`, `npm run build`, and the backend suite (`cd backend && python -m unittest discover -s tests -p "test_*.py"`).
- **Codex gate (graph-execution safety):** imported graphs are untrusted. Enforce at two layers — renderer advisory pre-check + **authoritative** backend gate. The backend rejects any node whose `class_type` is not in the first-class allow-list and any path/model field that `sanitize_path`/`sanitize_model_name` would alter, with a **structured, leak-free** refusal (user-facing string, no path/token, no traceback) **before** the graph reaches `queue_prompt`. The backend never trusts the renderer's `executable` flag.
- **No M6 fabric change:** `shared/resolveRoute.ts` and `shared/providerRouting.ts` are untouched. ComfyUI is a backend-internal execution detail, not a `ProviderId`.
- **Docs in the same PR(s):** `docs/API_ENDPOINTS.md` hand-curated; `docs/api/openapi.json` hand-curated (a new backend route is added: `POST /api/v1/comfy/run-graph`); the IPC channel is mirrored across `electron/preload.ts`, `electron/services/mainIpc.ts` (or the handler registry it points to), and `src/types/electron.d.ts`.
- **Design system:** Carbon Pro tokens, `lucide-react` icons, **no emoji and no decorative middot/bullet/em-dash glyphs in `src/`** (`ui-glyphs.test.ts` bans `·•—–−×…`), 8pt grid, `.mono-label` for UI labels.

## Spec reference

Implements `docs/superpowers/specs/2026-06-19-m8-comfyui-interop-deepening-design.md`. Section numbers (S1-S15) below refer to that spec.

## Reality notes (verified in the codebase - honor these)

- `src/features/workflow/comfyExport.ts` exports `exportWorkflowGraphToComfyPrompt(graph)` and the `ComfyPrompt` type (`Record<nodeId, { class_type; inputs; _meta?: { title } }>`). Link inputs become `[nodeId, output]`. **Today `output` is the in-app NAMED slot (e.g. `'CONDITIONING'`); ComfyUI requires an integer slot index.** The `ComfyPrompt` input value type is `string | number | boolean | null | [string, string]` and must widen to allow `[string, string | number]`.
- `src/types/workflow.ts`: `WorkflowGraph { nodes: Record<id,Node>; edges: Edge[]; viewport? }`; `WorkflowGraphInput = { kind:'literal'; value } | { kind:'link'; nodeId; output: string }`; the graph **duplicates** each link as a node input AND a top-level `edge`.
- `src/features/workflow/nodeDefaults.ts`: `NODE_REGISTRY` knows only `CheckpointLoaderSimple`, `CLIPTextEncode`, `KSampler`, `PreviewImage`, `SaveImage`. `KSampler.defaultOutput` is wrongly `'IMAGE'` (its real ComfyUI output is `LATENT`). `CheckpointLoaderSimple` default `ckpt_name` is `'flux-dev.safetensors'`; the backend template uses `'flux1-dev.safetensors'`.
- `src/store/slices/workflowSlice.ts`: `createWorkflow(name)` calls `createDraftWorkflow(name)` then appends; `createWorkflowEdgeId(edge)` returns `edge-${crypto.randomUUID()}`. No whole-graph action exists. Action type decls live in `src/store/appStore.types.ts` (the `// Workflow` block ~L477).
- `src/components/workflow/WorkflowWorkbench.tsx` already imports `exportWorkflowGraphToComfyPrompt` (export panel ~L107) and `createWorkflowNodeFromClassType` (add-node ~L311). It reads the active workflow + store actions.
- Backend: routers follow `backend/api/lora.py` (`APIRouter(prefix=...)`, module globals, `@limiter.limit(LIMITS["generate"])`), registered in `backend/main.py`. Generation endpoints live in `main.py`: `generate_with_comfyui` (~L1203) builds the **hardcoded** `build_image_workflow` template; `process_video_generation` (~L1358) has **no** Comfy branch. `comfy_client` (`backend/utils/comfy_client.py`) exposes `queue_prompt(workflow)`, `get_history`, `get_image` (any file via `/view`), `wait_for_prompt_completion(...)`. `extract_history_image_outputs` reads only `node_output["images"]`. Structured failures use `ModelLoadRefusedError` (user-facing string, no paths).
- `backend/utils/sanitization.py`: `sanitize_path`, `sanitize_model_name`, `sanitize_prompt` exist and are pure; not yet wired to the Comfy generators.
- Main-process backend calls go through `electron/ipc-handlers/generation.ts`: `const BACKEND_URL = 'http://127.0.0.1:8000'`, `backendAuthHeaders()`, `requestBackend(() => axios.post(...))`. The renderer polls jobs via `generation:get-status` -> `GET /api/jobs/{job_id}`.

## File structure

**Create (PR1 - import + slot reconciliation + fidelity + safety):**
- `src/features/workflow/nodeSlots.ts` (+ `.test.ts`) - named<->integer output-slot map.
- `src/features/workflow/comfyImportSafety.ts` (+ `.test.ts`) - renderer advisory safety pre-check.
- `src/features/workflow/comfyImport.ts` (+ `.test.ts`, `comfyImport.roundtrip.test.ts`) - importer + fidelity report.
- `backend/utils/comfy_graph_guard.py` (+ `backend/tests/test_comfy_graph_guard.py`) - authoritative safety gate.

**Modify (PR1):**
- `src/features/workflow/nodeDefaults.ts` (+ existing-test updates) - extend registry, `FIRST_CLASS_NODES`, fix `KSampler` output + checkpoint default.
- `src/features/workflow/comfyExport.ts` (+ `comfyExport.test.ts`) - emit integer slots; widen `ComfyPrompt` tuple.
- `src/store/slices/workflowSlice.ts` + `src/store/appStore.types.ts` (+ `appStore.test.ts`) - `createWorkflowFromGraph`.
- `src/components/workflow/WorkflowWorkbench.tsx` (+ `.test.tsx`) - Import UI + fidelity panel.

**Create (PR2 - runtime parity):**
- `backend/api/comfy_graph.py` (+ `backend/tests/test_comfy_graph_api.py`) - `/api/v1/comfy/run-graph` router + `execute_comfy_graph`.

**Modify (PR2):**
- `backend/utils/comfy_workflows.py` (+ `test_comfy_workflows.py`) - `extract_history_outputs` generalization + `build_video_workflow`.
- `backend/utils/comfy_client.py` (+ `backend/tests/test_comfy_client.py`) - `wait_for_prompt_completion(kinds=...)`.
- `backend/main.py` - register the comfy router + configure it; add `generate_video_with_comfyui` + the `process_video_generation` Comfy dispatch branch.
- `electron/ipc-handlers/generation.ts` - `workflow:run-graph` handler.
- `electron/preload.ts`, `src/types/electron.d.ts` - the `workflow.runGraph` bridge.
- `src/components/workflow/WorkflowWorkbench.tsx` (+ `.test.tsx`) - Run-on-ComfyUI action gated on `executable`.
- `docs/API_ENDPOINTS.md`, `docs/api/openapi.json` - the comfy route + IPC channel.

---

## Phase A - PR1: import + slot reconciliation + fidelity + safety

### Task 1: Extend the node registry and first-class set

**Files:**
- Modify: `src/features/workflow/nodeDefaults.ts`
- Test: `src/features/workflow/nodeDefaults.test.ts` (create)

**Interfaces:**
- Produces: `FIRST_CLASS_NODES: Set<string>`; `NODE_REGISTRY` entries for `EmptyLatentImage`, `VAEDecode`, `LoraLoader`, `VAELoader`; `KSampler.defaultOutput === 'LATENT'`; `CheckpointLoaderSimple` default `ckpt_name === 'flux1-dev.safetensors'`.

- [ ] **Step 1: Write the failing test**

Create `src/features/workflow/nodeDefaults.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FIRST_CLASS_NODES, NODE_REGISTRY, createWorkflowNodeFromClassType } from './nodeDefaults';

describe('node registry (M8 first-class set)', () => {
  it('marks the core text-to-image pipeline first-class', () => {
    for (const classType of [
      'CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler',
      'VAEDecode', 'SaveImage', 'PreviewImage', 'LoraLoader', 'VAELoader',
    ]) {
      expect(FIRST_CLASS_NODES.has(classType)).toBe(true);
    }
    expect(FIRST_CLASS_NODES.has('SomeCustomNode')).toBe(false);
  });

  it('uses LATENT as the KSampler output (its real ComfyUI output)', () => {
    expect(NODE_REGISTRY.KSampler.defaultOutput).toBe('LATENT');
  });

  it('registers the new loader/decoder nodes', () => {
    expect(NODE_REGISTRY.EmptyLatentImage.defaultOutput).toBe('LATENT');
    expect(NODE_REGISTRY.VAEDecode.defaultOutput).toBe('IMAGE');
    expect(NODE_REGISTRY.LoraLoader.defaultOutput).toBe('MODEL');
    expect(NODE_REGISTRY.VAELoader.defaultOutput).toBe('VAE');
  });

  it('defaults a checkpoint node to the backend-aligned filename', () => {
    const node = createWorkflowNodeFromClassType('CheckpointLoaderSimple', 0);
    expect(node.inputs.ckpt_name).toEqual({ kind: 'literal', value: 'flux1-dev.safetensors' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/workflow/nodeDefaults.test.ts`
Expected: FAIL - `FIRST_CLASS_NODES` is not exported; `NODE_REGISTRY.KSampler.defaultOutput` is `'IMAGE'`.

- [ ] **Step 3: Implement the registry changes**

In `src/features/workflow/nodeDefaults.ts`, change `KSampler.defaultOutput` from `'IMAGE'` to `'LATENT'`, and add the four new registry entries inside `NODE_REGISTRY`:

```ts
  EmptyLatentImage: {
    label: 'Empty Latent',
    defaultOutput: 'LATENT',
    defaultInput: 'pixels',
  },
  VAEDecode: {
    label: 'VAE Decode',
    defaultOutput: 'IMAGE',
    defaultInput: 'samples',
  },
  LoraLoader: {
    label: 'LoRA Loader',
    defaultOutput: 'MODEL',
    defaultInput: 'model',
  },
  VAELoader: {
    label: 'VAE Loader',
    defaultOutput: 'VAE',
    defaultInput: 'vae_name',
  },
```

Add the first-class set near the top (after `NODE_REGISTRY`):

```ts
/**
 * The Comfy class types M8 treats as first-class: known output-slot map (faithful
 * round-trip), known path fields (safety), and executable on a connected Comfy
 * server. Every other node imports structurally but is not executable.
 */
export const FIRST_CLASS_NODES = new Set<string>([
  'CheckpointLoaderSimple',
  'CLIPTextEncode',
  'EmptyLatentImage',
  'KSampler',
  'VAEDecode',
  'SaveImage',
  'PreviewImage',
  'LoraLoader',
  'VAELoader',
]);
```

In `createWorkflowNodeFromClassType`, change the `CheckpointLoaderSimple` default input from `'flux-dev.safetensors'` to `'flux1-dev.safetensors'`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/workflow/nodeDefaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/features/workflow/nodeDefaults.ts src/features/workflow/nodeDefaults.test.ts
git commit -m "feat(m8): extend node registry with first-class set + fix KSampler output"
git branch --show-current
```

---

### Task 2: Slot-reconciliation layer + corrected export

**Files:**
- Create: `src/features/workflow/nodeSlots.ts`
- Create: `src/features/workflow/nodeSlots.test.ts`
- Modify: `src/features/workflow/comfyExport.ts`
- Modify: `src/features/workflow/comfyExport.test.ts`

**Interfaces:**
- Consumes: `NODE_OUTPUT_SLOTS` keyed by the first-class class types (Task 1).
- Produces: `NODE_OUTPUT_SLOTS: Record<string, string[]>`; `namedOutputToSlot(classType, output): number | null`; `slotToNamedOutput(classType, slot): string | null`. `exportWorkflowGraphToComfyPrompt` now emits `[nodeId, <integer slot>]` for first-class source nodes (verbatim for opaque). `ComfyPrompt` input tuple widens to `[string, string | number]`.

- [ ] **Step 1: Write the failing test for the slot map**

Create `src/features/workflow/nodeSlots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NODE_OUTPUT_SLOTS, namedOutputToSlot, slotToNamedOutput } from './nodeSlots';

describe('nodeSlots reconciliation', () => {
  it('maps checkpoint outputs to their ComfyUI slot order', () => {
    expect(NODE_OUTPUT_SLOTS.CheckpointLoaderSimple).toEqual(['MODEL', 'CLIP', 'VAE']);
    expect(namedOutputToSlot('CheckpointLoaderSimple', 'CLIP')).toBe(1);
    expect(slotToNamedOutput('CheckpointLoaderSimple', 2)).toBe('VAE');
  });

  it('round-trips every first-class output', () => {
    for (const [classType, slots] of Object.entries(NODE_OUTPUT_SLOTS)) {
      slots.forEach((name, slot) => {
        expect(namedOutputToSlot(classType, name)).toBe(slot);
        expect(slotToNamedOutput(classType, slot)).toBe(name);
      });
    }
  });

  it('returns null for unknown class types or outputs', () => {
    expect(namedOutputToSlot('CustomNode', 'OUT')).toBeNull();
    expect(namedOutputToSlot('KSampler', 'NOPE')).toBeNull();
    expect(slotToNamedOutput('KSampler', 9)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/workflow/nodeSlots.test.ts`
Expected: FAIL - cannot resolve `./nodeSlots`.

- [ ] **Step 3: Implement the slot map**

Create `src/features/workflow/nodeSlots.ts`:

```ts
/**
 * Named-output <-> integer-slot reconciliation for first-class Comfy nodes.
 * In-app graphs label links by named output (e.g. 'CONDITIONING'); ComfyUI link
 * tuples require the integer output-slot index. This map bridges the two so
 * exports are genuinely ComfyUI-loadable and imports stay internally consistent.
 * Slots follow ComfyUI's canonical output ordering for each node.
 */
export const NODE_OUTPUT_SLOTS: Record<string, string[]> = {
  CheckpointLoaderSimple: ['MODEL', 'CLIP', 'VAE'],
  CLIPTextEncode: ['CONDITIONING'],
  EmptyLatentImage: ['LATENT'],
  KSampler: ['LATENT'],
  VAEDecode: ['IMAGE'],
  VAELoader: ['VAE'],
  LoraLoader: ['MODEL', 'CLIP'],
  // SaveImage / PreviewImage are terminal (no outputs).
};

export function namedOutputToSlot(classType: string, output: string): number | null {
  const slots = NODE_OUTPUT_SLOTS[classType];
  if (!slots) return null;
  const index = slots.indexOf(output);
  return index === -1 ? null : index;
}

export function slotToNamedOutput(classType: string, slot: number): string | null {
  const slots = NODE_OUTPUT_SLOTS[classType];
  if (!slots) return null;
  return slots[slot] ?? null;
}
```

- [ ] **Step 4: Run the slot test to verify it passes**

Run: `npx vitest run src/features/workflow/nodeSlots.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the export test to expect integer slots**

In `src/features/workflow/comfyExport.test.ts`, change the linked-input expectation in the first test (`exports literal and linked inputs...`) from the named output to the integer slot, and add an opaque-passthrough case. Replace the `positive` expectation:

```ts
        inputs: {
          positive: ['prompt', 0],
          steps: 25,
        },
```

Add a new test at the end of the `describe` block:

```ts
  it('passes opaque-node link outputs through verbatim', () => {
    const opaqueGraph: WorkflowGraph = {
      nodes: {
        custom: {
          id: 'custom', classType: 'CustomSampler', label: 'Custom',
          position: { x: 0, y: 0 }, inputs: {},
        },
        sink: {
          id: 'sink', classType: 'SaveImage', label: 'Save',
          position: { x: 240, y: 0 },
          inputs: { images: { kind: 'link', nodeId: 'custom', output: 'WEIRD' } },
        },
      },
      edges: [{
        id: 'edge-custom-sink', sourceNodeId: 'custom', sourceOutput: 'WEIRD',
        targetNodeId: 'sink', targetInput: 'images',
      }],
    };
    expect(exportWorkflowGraphToComfyPrompt(opaqueGraph).sink.inputs.images).toEqual(['custom', 'WEIRD']);
  });
```

- [ ] **Step 6: Run the export test to verify it now fails**

Run: `npx vitest run src/features/workflow/comfyExport.test.ts`
Expected: FAIL - export still emits `['prompt', 'CONDITIONING']`, not `['prompt', 0]`.

- [ ] **Step 7: Correct the export to emit integer slots**

In `src/features/workflow/comfyExport.ts`, widen the `ComfyPrompt` tuple and resolve the slot per source node. Change the inputs type line:

```ts
    inputs: Record<string, string | number | boolean | null | [string, string | number]>;
```

Add a helper and use it in the link branch:

```ts
import { namedOutputToSlot } from './nodeSlots';

function resolveExportSlot(graph: WorkflowGraph, nodeId: string, output: string): string | number {
  const sourceClassType = graph.nodes[nodeId]?.classType;
  const slot = sourceClassType ? namedOutputToSlot(sourceClassType, output) : null;
  return slot ?? output; // first-class -> integer slot; opaque/unmapped -> verbatim
}
```

In the `inputs` mapping, replace the link branch:

```ts
            input.kind === 'link'
              ? [input.nodeId, resolveExportSlot(graph, input.nodeId, input.output)]
              : input.value,
```

- [ ] **Step 8: Run the export test to verify it passes**

Run: `npx vitest run src/features/workflow/comfyExport.test.ts src/features/workflow/nodeSlots.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/features/workflow/nodeSlots.ts src/features/workflow/nodeSlots.test.ts src/features/workflow/comfyExport.ts src/features/workflow/comfyExport.test.ts
git commit -m "feat(m8): slot reconciliation + emit ComfyUI-loadable integer slots"
git branch --show-current
```

---

### Task 3: Renderer safety pre-check

**Files:**
- Create: `src/features/workflow/comfyImportSafety.ts`
- Create: `src/features/workflow/comfyImportSafety.test.ts`

**Interfaces:**
- Consumes: `FIRST_CLASS_NODES` (Task 1); `ComfyPrompt` (Task 2's widened type).
- Produces: `SafetyIssue { nodeId: string; reason: string }`; `SafetyResult { safe: boolean; issues: SafetyIssue[] }`; `evaluateGraphSafety(prompt: ComfyPrompt): SafetyResult`.

- [ ] **Step 1: Write the failing test**

Create `src/features/workflow/comfyImportSafety.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateGraphSafety } from './comfyImportSafety';
import type { ComfyPrompt } from './comfyExport';

const safe: ComfyPrompt = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' } },
  '2': { class_type: 'SaveImage', inputs: { filename_prefix: 'vision_studio', images: ['1', 0] } },
};

describe('evaluateGraphSafety', () => {
  it('passes a first-class graph with clean paths', () => {
    expect(evaluateGraphSafety(safe)).toEqual({ safe: true, issues: [] });
  });

  it('flags an unsupported node type', () => {
    const result = evaluateGraphSafety({ '1': { class_type: 'ExecCustomNode', inputs: {} } });
    expect(result.safe).toBe(false);
    expect(result.issues[0].reason).toContain('unsupported node');
  });

  it('flags traversal, absolute, and drive-letter path inputs', () => {
    const result = evaluateGraphSafety({
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '../../etc/passwd' } },
      '2': { class_type: 'SaveImage', inputs: { filename_prefix: '/abs/path', images: ['1', 0] } },
      '3': { class_type: 'VAELoader', inputs: { vae_name: 'C:\\\\windows\\\\vae' } },
    });
    expect(result.safe).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/workflow/comfyImportSafety.test.ts`
Expected: FAIL - cannot resolve `./comfyImportSafety`.

- [ ] **Step 3: Implement the safety pre-check**

Create `src/features/workflow/comfyImportSafety.ts`:

```ts
import type { ComfyPrompt } from './comfyExport';
import { FIRST_CLASS_NODES } from './nodeDefaults';

/** File-path / model-name fields whose values must never escape the Comfy roots. */
const PATH_FIELDS = ['ckpt_name', 'lora_name', 'vae_name', 'filename_prefix', 'image'];

export interface SafetyIssue {
  nodeId: string;
  reason: string;
}

export interface SafetyResult {
  safe: boolean;
  issues: SafetyIssue[];
}

function isUnsafePath(value: string): boolean {
  return (
    value.includes('..') ||
    value.includes(' ') ||
    /^[a-zA-Z]:/.test(value) || // Windows drive letter
    /^[/\\]/.test(value) // absolute path
  );
}

/**
 * Advisory renderer-side pre-check. Flags (never silently drops) any opaque node
 * type and any path-shaped input that escapes the Comfy roots. The authoritative
 * gate is the backend (comfy_graph_guard.py); this only drives the UI executable
 * badge so the user sees why a graph cannot run.
 */
export function evaluateGraphSafety(prompt: ComfyPrompt): SafetyResult {
  const issues: SafetyIssue[] = [];

  for (const [nodeId, node] of Object.entries(prompt)) {
    if (!FIRST_CLASS_NODES.has(node.class_type)) {
      issues.push({ nodeId, reason: `unsupported node type "${node.class_type}"` });
    }
    for (const field of PATH_FIELDS) {
      const value = node.inputs[field];
      if (typeof value === 'string' && isUnsafePath(value)) {
        issues.push({ nodeId, reason: `unsafe path in "${field}"` });
      }
    }
  }

  return { safe: issues.length === 0, issues };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/workflow/comfyImportSafety.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/features/workflow/comfyImportSafety.ts src/features/workflow/comfyImportSafety.test.ts
git commit -m "feat(m8): renderer safety pre-check for imported graphs"
git branch --show-current
```

---

### Task 4: The importer + fidelity report

**Files:**
- Create: `src/features/workflow/comfyImport.ts`
- Create: `src/features/workflow/comfyImport.test.ts`

**Interfaces:**
- Consumes: `ComfyPrompt` (Task 2); `slotToNamedOutput` (Task 2); `FIRST_CLASS_NODES`, `NODE_REGISTRY` (Task 1); `evaluateGraphSafety` (Task 3); `WorkflowGraph`, `WorkflowGraphEdge`, `WorkflowGraphInput`, `WorkflowGraphNode` (`@/types/workflow`).
- Produces: `ImportFidelityReport`, `ImportResult`, `importComfyPromptToWorkflowGraph(prompt: ComfyPrompt, context: { knownModelFilenames: string[] }): ImportResult`.

- [ ] **Step 1: Write the failing test**

Create `src/features/workflow/comfyImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { importComfyPromptToWorkflowGraph } from './comfyImport';
import type { ComfyPrompt } from './comfyExport';

const nativePrompt: ComfyPrompt = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' }, _meta: { title: 'Loader' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a city', clip: ['1', 1] } },
  '3': { class_type: 'KSampler', inputs: { steps: 20, model: ['1', 0], positive: ['2', 0] } },
};

describe('importComfyPromptToWorkflowGraph', () => {
  it('maps integer slots back to named outputs and synthesizes consistent edges', () => {
    const { graph } = importComfyPromptToWorkflowGraph(nativePrompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    const clip = graph.nodes['2'].inputs.clip;
    expect(clip).toEqual({ kind: 'link', nodeId: '1', output: 'CLIP' });
    const modelLink = graph.nodes['3'].inputs.model;
    expect(modelLink).toEqual({ kind: 'link', nodeId: '1', output: 'MODEL' });
    // every link input has a matching edge
    const edgeKeys = graph.edges.map((e) => `${e.sourceNodeId}:${e.targetNodeId}:${e.targetInput}`);
    expect(edgeKeys).toContain('1:2:clip');
    expect(edgeKeys).toContain('1:3:model');
    expect(edgeKeys).toContain('2:3:positive');
  });

  it('preserves literals and node titles', () => {
    const { graph } = importComfyPromptToWorkflowGraph(nativePrompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    expect(graph.nodes['3'].inputs.steps).toEqual({ kind: 'literal', value: 20 });
    expect(graph.nodes['1'].label).toBe('Loader');
  });

  it('lays out nodes deterministically by link depth', () => {
    const { graph } = importComfyPromptToWorkflowGraph(nativePrompt, { knownModelFilenames: [] });
    expect(graph.nodes['1'].position.x).toBe(0); // depth 0
    expect(graph.nodes['2'].position.x).toBe(280); // depth 1
    expect(graph.nodes['3'].position.x).toBe(560); // depth 2
  });

  it('classifies opaque nodes and reports them as not executable', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' } },
      '2': { class_type: 'WeirdCustomNode', inputs: { x: 1 } },
    };
    const { report } = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    expect(report.opaqueNodes).toEqual([{ id: '2', classType: 'WeirdCustomNode' }]);
    expect(report.firstClassNodes).toBe(1);
    expect(report.executable).toBe(false);
  });

  it('reports unresolved models (advisory) but matches across known drift', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux-dev.safetensors' } },
    };
    const resolved = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['flux1-dev.safetensors'] });
    expect(resolved.report.unresolvedModels).toEqual([]); // flux-dev ~ flux1-dev
    const missing = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['sdxl_base.safetensors'] });
    expect(missing.report.unresolvedModels).toEqual([{ nodeId: '1', field: 'ckpt_name', value: 'flux-dev.safetensors' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/workflow/comfyImport.test.ts`
Expected: FAIL - cannot resolve `./comfyImport`.

- [ ] **Step 3: Implement the importer**

Create `src/features/workflow/comfyImport.ts`:

```ts
import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphInput,
  WorkflowGraphNode,
} from '@/types/workflow';
import type { ComfyPrompt } from './comfyExport';
import { FIRST_CLASS_NODES, NODE_REGISTRY } from './nodeDefaults';
import { slotToNamedOutput } from './nodeSlots';
import { evaluateGraphSafety } from './comfyImportSafety';

export interface ImportFidelityReport {
  totalNodes: number;
  firstClassNodes: number;
  opaqueNodes: { id: string; classType: string }[];
  unresolvedModels: { nodeId: string; field: string; value: string }[];
  warnings: string[];
  /** True iff every node is first-class, all model refs resolve, and the safety pre-check is clean. */
  executable: boolean;
}

export interface ImportResult {
  graph: WorkflowGraph;
  report: ImportFidelityReport;
}

const MODEL_FIELDS = ['ckpt_name', 'lora_name', 'vae_name'];
const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 160;

type ComfyInputValue = ComfyPrompt[string]['inputs'][string];

function isLinkTuple(value: ComfyInputValue, prompt: ComfyPrompt): value is [string, string | number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    (typeof value[1] === 'string' || typeof value[1] === 'number') &&
    prompt[value[0]] !== undefined
  );
}

/** Advisory drift-normalizer: lowercase, drop extension + separators, drop version
 *  digits that sit between letters (flux1dev -> fluxdev) so flux-dev ~ flux1-dev. */
function normalizeModelFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[-_ .]/g, '')
    .replace(/(?<=[a-z])\d+(?=[a-z])/g, '');
}

function computeDepths(prompt: ComfyPrompt): Record<string, number> {
  const memo: Record<string, number> = {};
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (memo[id] !== undefined) return memo[id];
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let d = 0;
    for (const value of Object.values(prompt[id]?.inputs ?? {})) {
      if (isLinkTuple(value, prompt)) d = Math.max(d, depth(value[0]) + 1);
    }
    visiting.delete(id);
    memo[id] = d;
    return d;
  };
  for (const id of Object.keys(prompt)) depth(id);
  return memo;
}

function layout(prompt: ComfyPrompt): Record<string, { x: number; y: number }> {
  const depths = computeDepths(prompt);
  const byColumn: Record<number, string[]> = {};
  for (const id of Object.keys(prompt).sort()) {
    (byColumn[depths[id]] ??= []).push(id);
  }
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [depth, ids] of Object.entries(byColumn)) {
    ids.forEach((id, row) => {
      positions[id] = { x: Number(depth) * COLUMN_WIDTH, y: row * ROW_HEIGHT };
    });
  }
  return positions;
}

export function importComfyPromptToWorkflowGraph(
  prompt: ComfyPrompt,
  context: { knownModelFilenames: string[] }
): ImportResult {
  const positions = layout(prompt);
  const knownModels = new Set(context.knownModelFilenames.map(normalizeModelFilename));
  const nodes: Record<string, WorkflowGraphNode> = {};
  const edges: WorkflowGraphEdge[] = [];
  const opaqueNodes: { id: string; classType: string }[] = [];
  const unresolvedModels: { nodeId: string; field: string; value: string }[] = [];
  const warnings: string[] = [];

  for (const [nodeId, node] of Object.entries(prompt)) {
    const isFirstClass = FIRST_CLASS_NODES.has(node.class_type);
    if (!isFirstClass) opaqueNodes.push({ id: nodeId, classType: node.class_type });

    const inputs: Record<string, WorkflowGraphInput> = {};
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isLinkTuple(value, prompt)) {
        const sourceClassType = prompt[value[0]].class_type;
        const slot = typeof value[1] === 'number' ? value[1] : Number(value[1]);
        const named = slotToNamedOutput(sourceClassType, slot);
        const output = named ?? String(value[1]);
        if (!named) warnings.push(`Node ${nodeId} link "${name}" kept raw output slot "${value[1]}"`);
        inputs[name] = { kind: 'link', nodeId: value[0], output };
        edges.push({
          id: `edge-${value[0]}-${nodeId}-${name}`,
          sourceNodeId: value[0],
          sourceOutput: output,
          targetNodeId: nodeId,
          targetInput: name,
        });
      } else {
        inputs[name] = { kind: 'literal', value: value as string | number | boolean | null };
        if (MODEL_FIELDS.includes(name) && typeof value === 'string') {
          if (!knownModels.has(normalizeModelFilename(value))) {
            unresolvedModels.push({ nodeId, field: name, value });
          }
        }
      }
    }

    nodes[nodeId] = {
      id: nodeId,
      classType: node.class_type,
      label: node._meta?.title ?? NODE_REGISTRY[node.class_type]?.label ?? node.class_type,
      inputs,
      position: positions[nodeId] ?? { x: 0, y: 0 },
      metadata: { state: 'pending' },
    };
  }

  const safety = evaluateGraphSafety(prompt);
  const report: ImportFidelityReport = {
    totalNodes: Object.keys(prompt).length,
    firstClassNodes: Object.keys(prompt).length - opaqueNodes.length,
    opaqueNodes,
    unresolvedModels,
    warnings,
    executable: safety.safe && unresolvedModels.length === 0,
  };

  return { graph: { nodes, edges }, report };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/workflow/comfyImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/features/workflow/comfyImport.ts src/features/workflow/comfyImport.test.ts
git commit -m "feat(m8): import Comfy graphs into WorkflowGraph with a fidelity report"
git branch --show-current
```

---

### Task 5: Round-trip fidelity tests

**Files:**
- Create: `src/features/workflow/comfyImport.roundtrip.test.ts`

**Interfaces:**
- Consumes: `exportWorkflowGraphToComfyPrompt` (Task 2), `importComfyPromptToWorkflowGraph` (Task 4).
- Produces: no new source - asserts the structural round-trip properties from spec S6.

- [ ] **Step 1: Write the failing test**

Create `src/features/workflow/comfyImport.roundtrip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkflowGraph } from '@/types/workflow';
import type { ComfyPrompt } from './comfyExport';
import { exportWorkflowGraphToComfyPrompt } from './comfyExport';
import { importComfyPromptToWorkflowGraph } from './comfyImport';

// Structural equality that ignores positions (export drops them; import re-lays-out).
function structural(graph: WorkflowGraph) {
  return Object.fromEntries(
    Object.entries(graph.nodes).map(([id, node]) => [
      id,
      { classType: node.classType, label: node.label, inputs: node.inputs },
    ])
  );
}

const firstClassGraph: WorkflowGraph = {
  nodes: {
    '1': { id: '1', classType: 'CheckpointLoaderSimple', label: 'Loader', position: { x: 0, y: 0 }, inputs: { ckpt_name: { kind: 'literal', value: 'flux1-dev.safetensors' } } },
    '2': { id: '2', classType: 'CLIPTextEncode', label: 'Prompt', position: { x: 0, y: 0 }, inputs: { text: { kind: 'literal', value: 'a city' }, clip: { kind: 'link', nodeId: '1', output: 'CLIP' } } },
  },
  edges: [{ id: 'e1', sourceNodeId: '1', sourceOutput: 'CLIP', targetNodeId: '2', targetInput: 'clip' }],
};

describe('round-trip fidelity (S6)', () => {
  it('import(export(g)) is structurally faithful (positions excluded)', () => {
    const reimported = importComfyPromptToWorkflowGraph(
      exportWorkflowGraphToComfyPrompt(firstClassGraph),
      { knownModelFilenames: ['flux1-dev.safetensors'] }
    ).graph;
    expect(structural(reimported)).toEqual(structural(firstClassGraph));
  });

  it('export(import(p)) reproduces a first-class prompt exactly', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' }, _meta: { title: 'Loader' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a city', clip: ['1', 1] }, _meta: { title: 'Prompt' } },
    };
    const reexported = exportWorkflowGraphToComfyPrompt(
      importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: ['flux1-dev.safetensors'] }).graph
    );
    expect(reexported).toEqual(prompt);
  });

  it('passes opaque-node slots through unchanged on export(import(p))', () => {
    const prompt: ComfyPrompt = {
      '1': { class_type: 'CustomLoader', inputs: {}, _meta: { title: 'Custom' } },
      '2': { class_type: 'SaveImage', inputs: { images: ['1', 3] }, _meta: { title: 'Save' } },
    };
    const reexported = exportWorkflowGraphToComfyPrompt(
      importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames: [] }).graph
    );
    expect(reexported['2'].inputs.images).toEqual(['1', '3']);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/features/workflow/comfyImport.roundtrip.test.ts`
Expected: PASS (the import/export implementations from Tasks 2 + 4 already satisfy these; if any assertion fails, fix the implementation, not the test). Note the opaque slot `3` round-trips as the string `'3'` - the documented coercion limitation (S6).

- [ ] **Step 3: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/features/workflow/comfyImport.roundtrip.test.ts
git commit -m "test(m8): assert structural round-trip fidelity both directions"
git branch --show-current
```

---

### Task 6: createWorkflowFromGraph store action

**Files:**
- Modify: `src/store/slices/workflowSlice.ts`
- Modify: `src/store/appStore.types.ts`
- Test: `src/store/appStore.test.ts` (append)

**Interfaces:**
- Consumes: `WorkflowGraph` (`@/types/workflow`), `createDraftWorkflow` (existing, `workflowSlice.ts`).
- Produces: `createWorkflowFromGraph(name: string, graph: WorkflowGraph): WorkflowRecord`.

- [ ] **Step 1: Write the failing test**

Append to `src/store/appStore.test.ts`:

```ts
  it('creates a workflow from an imported graph (M8)', () => {
    const graph = {
      nodes: {
        n1: { id: 'n1', classType: 'CheckpointLoaderSimple', label: 'Loader', position: { x: 0, y: 0 }, inputs: {} },
      },
      edges: [],
    };
    const record = useAppStore.getState().createWorkflowFromGraph('Imported', graph);
    expect(record.name).toBe('Imported');
    expect(record.graph.nodes.n1.classType).toBe('CheckpointLoaderSimple');
    expect(useAppStore.getState().activeWorkflowId).toBe(record.id);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/appStore.test.ts -t "imported graph"`
Expected: FAIL - `createWorkflowFromGraph` is not a function.

- [ ] **Step 3: Implement the action**

In `src/store/slices/workflowSlice.ts`, add inside the object returned by `createWorkflowActions`, right after `createWorkflow`:

```ts
    createWorkflowFromGraph: (name: string, graph: WorkflowGraph): WorkflowRecord => {
      const workflow: WorkflowRecord = { ...createDraftWorkflow(name), graph };
      set((state) => ({
        workflowRecords: [...state.workflowRecords, workflow],
        activeWorkflowId: workflow.id,
      }));
      return workflow;
    },
```

Ensure `WorkflowGraph` is imported in `workflowSlice.ts` (add to the existing `@/types/workflow` import if absent).

In `src/store/appStore.types.ts`, add to the `// Workflow` block after `createWorkflow`:

```ts
  createWorkflowFromGraph: (name: string, graph: WorkflowGraph) => WorkflowRecord;
```

Ensure `WorkflowGraph` is imported in `appStore.types.ts` (it imports `WorkflowRecord` etc. from `@/types/workflow`; add `WorkflowGraph` to that import if absent).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/store/appStore.test.ts -t "imported graph"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/store/slices/workflowSlice.ts src/store/appStore.types.ts src/store/appStore.test.ts
git commit -m "feat(m8): createWorkflowFromGraph store action for imported graphs"
git branch --show-current
```

---

### Task 7: WorkflowWorkbench import UI + fidelity panel

**Files:**
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`
- Test: `src/components/workflow/WorkflowWorkbench.test.tsx` (create if absent; otherwise append)

**Interfaces:**
- Consumes: `importComfyPromptToWorkflowGraph` (Task 4), `createWorkflowFromGraph` (Task 6), the active model list from the store.
- Produces: an Import affordance: a textarea for Comfy JSON, an "Import graph" button that parses + imports + installs via `createWorkflowFromGraph`, and a Carbon Pro fidelity panel listing opaque nodes / unresolved models with an executable badge.

- [ ] **Step 1: Write the failing test**

Create or append `src/components/workflow/WorkflowWorkbench.test.tsx`. (If the file is new, mirror the imports + render harness of an existing workbench/component test such as `src/components/layout/DockviewLayout.test.tsx`.)

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowWorkbench } from './WorkflowWorkbench';
import { useAppStore } from '@/store/appStore';

describe('WorkflowWorkbench import (M8)', () => {
  beforeEach(() => {
    useAppStore.setState({ workflowRecords: useAppStore.getState().workflowRecords });
  });

  it('imports a pasted Comfy graph and surfaces the fidelity report', async () => {
    render(<WorkflowWorkbench />);
    const json = JSON.stringify({
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev.safetensors' } },
      '2': { class_type: 'WeirdCustomNode', inputs: {} },
    });
    fireEvent.change(screen.getByLabelText(/comfy graph json/i), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: /import graph/i }));
    await waitFor(() => expect(screen.getByText(/WeirdCustomNode/)).toBeInTheDocument());
    expect(screen.getByText(/not executable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx`
Expected: FAIL - no import textarea / button exists yet.

- [ ] **Step 3: Implement the import UI**

In `src/components/workflow/WorkflowWorkbench.tsx`:

1. Add imports:

```tsx
import { importComfyPromptToWorkflowGraph, type ImportFidelityReport } from '@/features/workflow/comfyImport';
import type { ComfyPrompt } from '@/features/workflow/comfyExport';
```

2. Pull the store action and the known model filenames (use the existing model list the workbench already reads; if it reads `availableModels`, map to filenames - otherwise read `useAppStore((s) => s.availableModels ?? [])`). Add state:

```tsx
  const createWorkflowFromGraph = useAppStore((s) => s.createWorkflowFromGraph);
  const availableModels = useAppStore((s) => s.availableModels ?? []);
  const [importJson, setImportJson] = useState('');
  const [importReport, setImportReport] = useState<ImportFidelityReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportGraph = () => {
    setImportError(null);
    let prompt: ComfyPrompt;
    try {
      prompt = JSON.parse(importJson) as ComfyPrompt;
    } catch {
      setImportError('That is not valid JSON.');
      return;
    }
    const knownModelFilenames = availableModels
      .map((model: { id?: string; name?: string }) => model.name ?? model.id ?? '')
      .filter(Boolean);
    const { graph, report } = importComfyPromptToWorkflowGraph(prompt, { knownModelFilenames });
    createWorkflowFromGraph('Imported graph', graph);
    setImportReport(report);
  };
```

3. Render a Carbon Pro panel (reuse the existing export-panel styling classes in this file; `.raised-panel`, `.mono-label`, `lucide-react` icons - no emoji/decorative glyphs):

```tsx
      <section className="raised-panel">
        <span className="mono-label">Import ComfyUI graph</span>
        <label htmlFor="comfy-import" className="sr-only">Comfy graph JSON</label>
        <textarea
          id="comfy-import"
          aria-label="Comfy graph JSON"
          value={importJson}
          onChange={(event) => setImportJson(event.target.value)}
          placeholder="Paste a ComfyUI API-format prompt"
        />
        <button type="button" className="btn-chrome" onClick={handleImportGraph}>
          Import graph
        </button>
        {importError ? <p role="alert">{importError}</p> : null}
        {importReport ? (
          <div>
            <p className="mono-label">
              {importReport.executable ? 'Executable on ComfyUI' : 'Imported, not executable'}
            </p>
            {importReport.opaqueNodes.length > 0 ? (
              <ul>
                {importReport.opaqueNodes.map((node) => (
                  <li key={node.id}>{node.classType}</li>
                ))}
              </ul>
            ) : null}
            {importReport.unresolvedModels.length > 0 ? (
              <ul>
                {importReport.unresolvedModels.map((model) => (
                  <li key={`${model.nodeId}:${model.field}`}>{model.value}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
```

(Match the surrounding JSX structure/styling of the existing export panel; the snippet shows the required elements and copy, not final class names - follow `DESIGN.md` and the file's existing patterns.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full renderer suite + typecheck (catch glyph/type regressions)**

Run: `npm run typecheck && npx vitest run src/`
Expected: PASS, including `ui-glyphs.test.ts` (no banned glyphs introduced).

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(m8): WorkflowWorkbench import UI + fidelity report panel"
git branch --show-current
```

---

### Task 8: Backend authoritative safety gate

**Files:**
- Create: `backend/utils/comfy_graph_guard.py`
- Create: `backend/tests/test_comfy_graph_guard.py`

**Interfaces:**
- Consumes: `sanitize_path`, `sanitize_model_name` (`backend/utils/sanitization.py`).
- Produces: `FIRST_CLASS_NODES: set[str]`; `GraphValidationError(Exception)`; `validate_comfy_graph(graph: dict) -> None` (raises `GraphValidationError` with a leak-free message).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_comfy_graph_guard.py`:

```python
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_graph_guard import GraphValidationError, validate_comfy_graph  # type: ignore[import-not-found]

SAFE_GRAPH = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
    "2": {"class_type": "SaveImage", "inputs": {"filename_prefix": "vision_studio", "images": ["1", 0]}},
}


class GraphGuardTests(unittest.TestCase):
    def test_accepts_first_class_safe_graph(self):
        validate_comfy_graph(SAFE_GRAPH)  # must not raise

    def test_rejects_unsupported_node(self):
        with self.assertRaises(GraphValidationError) as ctx:
            validate_comfy_graph({"1": {"class_type": "ExecArbitraryCode", "inputs": {}}})
        self.assertNotIn("/", str(ctx.exception))  # leak-free

    def test_rejects_path_traversal_in_model_field(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "../../etc/passwd"}}})

    def test_rejects_absolute_filename_prefix(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "SaveImage", "inputs": {"filename_prefix": "/abs/evil"}}})

    def test_rejects_empty_or_malformed_graph(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({})
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": "not-a-node"})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_comfy_graph_guard -v`
Expected: FAIL - `utils.comfy_graph_guard` does not exist.

- [ ] **Step 3: Implement the guard**

Create `backend/utils/comfy_graph_guard.py`:

```python
"""
Authoritative safety gate for imported ComfyUI graphs (M8 Codex gate).

Imported graphs are untrusted input. Before any graph reaches the ComfyUI server,
every node's class_type must be in the first-class allow-list and every path/model
field must survive sanitization unchanged. Refusals are structured and leak-free:
the message is user-facing and never contains a path, token, or traceback.
"""

from __future__ import annotations

from typing import Dict

from utils.sanitization import sanitize_model_name, sanitize_path

FIRST_CLASS_NODES = {
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImage",
    "PreviewImage",
    "LoraLoader",
    "VAELoader",
}

_MODEL_FIELDS = ("ckpt_name", "lora_name", "vae_name")
_PATH_FIELDS = ("filename_prefix", "image")


class GraphValidationError(Exception):
    """Raised when an imported graph fails the safety gate. Message is user-facing."""


def validate_comfy_graph(graph: Dict) -> None:
    if not isinstance(graph, dict) or not graph:
        raise GraphValidationError("The workflow graph is empty or malformed.")

    for node in graph.values():
        if not isinstance(node, dict):
            raise GraphValidationError("The workflow graph has a malformed node.")

        class_type = node.get("class_type")
        if class_type not in FIRST_CLASS_NODES:
            raise GraphValidationError(
                f"This workflow uses an unsupported node ({class_type!r}) that cannot run safely."
            )

        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            raise GraphValidationError("The workflow graph has malformed node inputs.")

        for field in _MODEL_FIELDS:
            value = inputs.get(field)
            if isinstance(value, str) and sanitize_model_name(value) != value:
                raise GraphValidationError("The workflow references an unsafe model name.")

        for field in _PATH_FIELDS:
            value = inputs.get(field)
            if isinstance(value, str) and sanitize_path(value) != value:
                raise GraphValidationError("The workflow references an unsafe file path.")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m unittest tests.test_comfy_graph_guard -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/utils/comfy_graph_guard.py backend/tests/test_comfy_graph_guard.py
git commit -m "feat(m8): authoritative backend safety gate for imported graphs"
git branch --show-current
```

---

### Task 9: PR1 green gate + open PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run build
cd backend && python -m unittest discover -s tests -p "test_*.py" && cd ..
```
Expected: all green. Fix any failure before proceeding.

- [ ] **Step 2: Push and open PR1**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git push -u origin feat/comfy-interop-m8
gh pr create --title "M8 ComfyUI Interop PR1: import + slot fidelity + safety gate" \
  --body "PR1 of M8 (spec: docs/superpowers/specs/2026-06-19-m8-comfyui-interop-deepening-design.md). Adds Comfy-graph import into WorkflowGraph, the named<->integer slot-reconciliation layer that makes exports ComfyUI-loadable, structural round-trip fidelity, the renderer fidelity report + import UI, the createWorkflowFromGraph store action, and the authoritative backend safety gate. No live-runtime change. Codex gate: graph-execution safety (import boundary)."
gh pr checks --watch
```
Expected: CI green. Squash-merge after review per the ship process; do NOT delete the branch (PR2 continues on it) - or branch PR2 off the merge. Confirm with the user before merging.

---

## Phase B - PR2: runtime parity (run the user's graph + video-through-Comfy)

> PR2 continues on `feat/comfy-interop-m8` (or a fresh branch off the PR1 merge, per the user's choice in Task 9).

### Task 10: Generalize output extraction + add the video workflow builder

**Files:**
- Modify: `backend/utils/comfy_workflows.py`
- Modify: `backend/tests/test_comfy_workflows.py`

**Interfaces:**
- Produces: `extract_history_outputs(history, prompt_id, kinds=("images",)) -> list[dict]`; `extract_history_image_outputs` kept as a wrapper (`kinds=("images",)`); `build_video_workflow(model, prompt, image_filename, width, height, fps, steps, seed, file_prefix="vision_studio") -> tuple[dict, int]`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_comfy_workflows.py` (and add the imports at the top):

```python
from utils.comfy_workflows import (  # type: ignore[import-not-found]
    build_image_workflow,
    build_video_workflow,
    extract_history_image_outputs,
    extract_history_outputs,
)
```

```python
    def test_extract_history_outputs_collects_video_kinds(self):
        history = {
            "p1": {"outputs": {"7": {
                "gifs": [{"filename": "clip.webp", "subfolder": "vid", "type": "output"}],
                "videos": [{"filename": "clip.mp4", "subfolder": "vid", "type": "output"}],
            }}}
        }
        outputs = extract_history_outputs(history, "p1", kinds=("images", "gifs", "videos"))
        names = sorted(item["filename"] for item in outputs)
        self.assertEqual(names, ["clip.mp4", "clip.webp"])

    def test_image_extractor_stays_image_only(self):
        history = {"p1": {"outputs": {"7": {"gifs": [{"filename": "x.webp"}]}}}}
        self.assertEqual(extract_history_image_outputs(history, "p1"), [])

    def test_build_video_workflow_has_save_and_sampler(self):
        workflow, seed = build_video_workflow(
            model="svd", prompt="waves", image_filename="frame.png",
            width=1024, height=576, fps=8, steps=20, seed=99,
        )
        self.assertEqual(seed, 99)
        class_types = {node["class_type"] for node in workflow.values()}
        self.assertIn("KSampler", class_types)
        self.assertTrue(any(ct.startswith("Save") for ct in class_types))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m unittest tests.test_comfy_workflows -v`
Expected: FAIL - `extract_history_outputs` / `build_video_workflow` do not exist.

- [ ] **Step 3: Implement the generalization + builder**

In `backend/utils/comfy_workflows.py`, replace `extract_history_image_outputs` with a generalized extractor plus a thin back-compat wrapper, and add `build_video_workflow`:

```python
def extract_history_outputs(
    history: Dict, prompt_id: str, kinds: Tuple[str, ...] = ("images",)
) -> List[Dict[str, str]]:
    entry = history.get(prompt_id, {})
    outputs = entry.get("outputs", {})
    collected: List[Dict[str, str]] = []

    for node_output in outputs.values():
        for kind in kinds:
            for item in node_output.get(kind, []):
                if item.get("filename"):
                    collected.append(
                        {
                            "filename": item["filename"],
                            "subfolder": item.get("subfolder", ""),
                            "type": item.get("type", "output"),
                        }
                    )

    return collected


def extract_history_image_outputs(history: Dict, prompt_id: str) -> List[Dict[str, str]]:
    return extract_history_outputs(history, prompt_id, kinds=("images",))


def build_video_workflow(
    model: str,
    prompt: str,
    image_filename: str,
    width: int,
    height: int,
    fps: int,
    steps: int,
    seed: int | None,
    file_prefix: str = "vision_studio",
) -> Tuple[Dict[str, Dict], int]:
    """
    Build a Stable-Video-Diffusion image-to-video workflow. SaveAnimatedWEBP reports
    its result under the history "images" key; VHS custom nodes (if installed) report
    under "gifs"/"videos" - the dispatch extractor collects all three (S8).
    The exact video family is plan-time-tunable against the user's installed nodes.
    """
    normalized_seed = _normalize_seed(seed)

    workflow = {
        "1": {"inputs": {"ckpt_name": "svd_xt.safetensors"}, "class_type": "ImageOnlyCheckpointLoader"},
        "2": {"inputs": {"image": image_filename, "upload": "image"}, "class_type": "LoadImage"},
        "3": {
            "inputs": {
                "width": width,
                "height": height,
                "video_frames": 14,
                "motion_bucket_id": 127,
                "fps": fps,
                "augmentation_level": 0.0,
                "clip_vision": ["1", 1],
                "init_image": ["2", 0],
                "vae": ["1", 2],
            },
            "class_type": "SVD_img2vid_Conditioning",
        },
        "4": {"inputs": {"min_cfg": 1.0, "model": ["1", 0]}, "class_type": "VideoLinearCFGGuidance"},
        "5": {
            "inputs": {
                "seed": normalized_seed,
                "steps": steps,
                "cfg": 2.5,
                "sampler_name": "euler",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["3", 0],
                "negative": ["3", 1],
                "latent_image": ["3", 2],
            },
            "class_type": "KSampler",
        },
        "6": {"inputs": {"samples": ["5", 0], "vae": ["1", 2]}, "class_type": "VAEDecode"},
        "7": {
            "inputs": {"filename_prefix": file_prefix, "fps": fps, "images": ["6", 0]},
            "class_type": "SaveAnimatedWEBP",
        },
    }

    return workflow, normalized_seed
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_comfy_workflows -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/utils/comfy_workflows.py backend/tests/test_comfy_workflows.py
git commit -m "feat(m8): generalize Comfy output extraction + add video workflow builder"
git branch --show-current
```

---

### Task 11: Generalize the client poll for video kinds

**Files:**
- Modify: `backend/utils/comfy_client.py`
- Create: `backend/tests/test_comfy_client.py`

**Interfaces:**
- Consumes: `extract_history_outputs` (Task 10).
- Produces: `ComfyUIClient.wait_for_prompt_completion(..., kinds=("images",))` - passes `kinds` to the generalized extractor.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_comfy_client.py`:

```python
import asyncio
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_client import ComfyUIClient  # type: ignore[import-not-found]


class ComfyClientPollTests(unittest.TestCase):
    def test_wait_collects_video_kinds(self):
        client = ComfyUIClient()

        async def fake_history(prompt_id=None):
            return {"p1": {"outputs": {"7": {"gifs": [{"filename": "clip.webp"}]}}}}

        client.get_history = fake_history  # type: ignore[assignment]

        outputs = asyncio.run(
            client.wait_for_prompt_completion("p1", poll_interval=0.0, kinds=("images", "gifs", "videos"))
        )
        self.assertEqual(outputs[0]["filename"], "clip.webp")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_comfy_client -v`
Expected: FAIL - `wait_for_prompt_completion` has no `kinds` parameter (image-only).

- [ ] **Step 3: Implement the generalization**

In `backend/utils/comfy_client.py`, change the import at the top:

```python
from .comfy_workflows import extract_history_outputs
```

Change the `wait_for_prompt_completion` signature and the extractor call:

```python
    async def wait_for_prompt_completion(
        self,
        prompt_id: str,
        timeout_seconds: int = 600,
        poll_interval: float = 1.0,
        progress_callback: Optional[Callable[[float], None]] = None,
        kinds: tuple[str, ...] = ("images",),
    ) -> List[Dict[str, str]]:
        start = asyncio.get_running_loop().time()

        while True:
            history = await self.get_history(prompt_id)
            outputs = extract_history_outputs(history, prompt_id, kinds=kinds)
            if outputs:
                if progress_callback:
                    progress_callback(95.0)
                return outputs

            if asyncio.get_running_loop().time() - start > timeout_seconds:
                raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")

            if progress_callback:
                elapsed = asyncio.get_running_loop().time() - start
                progress_callback(min(90.0, 15.0 + elapsed * 2))

            await asyncio.sleep(poll_interval)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m unittest tests.test_comfy_client -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/utils/comfy_client.py backend/tests/test_comfy_client.py
git commit -m "feat(m8): poll ComfyUI for image and video output kinds"
git branch --show-current
```

---

### Task 12: Graph-execution router (run the user's authored graph)

**Files:**
- Create: `backend/api/comfy_graph.py`
- Create: `backend/tests/test_comfy_graph_api.py`
- Modify: `backend/main.py` (register + configure the router)
- Modify: `docs/api/openapi.json`

**Interfaces:**
- Consumes: `validate_comfy_graph`, `GraphValidationError` (Task 8); a configured comfy client, job manager, and output dir; `comfy_client.wait_for_prompt_completion(kinds=...)` (Task 11).
- Produces: `router` (`APIRouter(prefix="/api/v1/comfy")`); `configure(comfy_client_getter, job_manager, output_dir)`; `async def execute_comfy_graph(job_id, graph, generation_type)`; `POST /api/v1/comfy/run-graph`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_comfy_graph_api.py`:

```python
import asyncio
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.comfy_graph as comfy_graph  # type: ignore[import-not-found]

FIRST_CLASS = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
    "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "a city", "clip": ["1", 1]}},
    "3": {"class_type": "SaveImage", "inputs": {"filename_prefix": "vision_studio", "images": ["2", 0]}},
}


class FakeJobManager:
    def __init__(self):
        self.jobs = {}

    def add_job(self, job):
        self.jobs[getattr(job, "id", job["id"])] = job

    def update_job(self, job_id, **kwargs):
        self.jobs.setdefault(job_id, {}).update(kwargs)


class FakeClient:
    def __init__(self, connected=True):
        self.connected = connected
        self.queued = None

    async def queue_prompt(self, workflow, extra_data=None):
        self.queued = workflow
        return "prompt-1"

    async def wait_for_prompt_completion(self, prompt_id, progress_callback=None, kinds=("images",)):
        return [{"filename": "image_001.png", "subfolder": "", "type": "output"}]

    async def get_image(self, filename, subfolder="", folder_type="output"):
        return b"PNGDATA"


def build_app(client):
    app = FastAPI()
    comfy_graph.configure(lambda: client, FakeJobManager(), tempfile.mkdtemp())
    app.include_router(comfy_graph.router)
    return app


class ComfyGraphApiTests(unittest.TestCase):
    def test_rejects_unsupported_node(self):
        client = TestClient(build_app(FakeClient()))
        resp = client.post("/api/v1/comfy/run-graph", json={
            "graph": {"1": {"class_type": "EvilNode", "inputs": {}}}, "generation_type": "image",
        })
        self.assertEqual(resp.status_code, 422)

    def test_requires_connected_server(self):
        resp = TestClient(build_app(FakeClient(connected=False))).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "image"}
        )
        self.assertEqual(resp.status_code, 409)

    def test_accepts_first_class_graph(self):
        resp = TestClient(build_app(FakeClient())).post(
            "/api/v1/comfy/run-graph", json={"graph": FIRST_CLASS, "generation_type": "image"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("job_id", resp.json())

    def test_execute_submits_the_user_graph(self):
        fake = FakeClient()
        comfy_graph.configure(lambda: fake, FakeJobManager(), tempfile.mkdtemp())
        asyncio.run(comfy_graph.execute_comfy_graph("job-1", FIRST_CLASS, "image"))
        self.assertEqual(fake.queued, FIRST_CLASS)  # the user's graph, not a template


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m unittest tests.test_comfy_graph_api -v`
Expected: FAIL - `api.comfy_graph` does not exist.

- [ ] **Step 3: Implement the router**

Create `backend/api/comfy_graph.py`:

```python
"""
ComfyUI graph-execution router (M8).

Runs a user-authored ComfyUI graph as-is on a connected Comfy server (replacing
the hardcoded template for graph-originated runs). Validates the graph through the
authoritative safety gate before it reaches the server, then queues it, polls for
image OR video outputs, saves them, and returns asset URLs. ComfyUI stays out of
the M6 routing fabric - this is a backend-internal execution detail.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from middleware.rate_limit import LIMITS, limiter
from utils.comfy_graph_guard import GraphValidationError, validate_comfy_graph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/comfy", tags=["ComfyUI Interop"])

# Configured by main.py at startup (the lora.py module-global pattern, adapted to
# inject runtime references the endpoint cannot own).
_comfy_client_getter: Optional[Callable[[], object]] = None
_job_manager: object = None
_output_dir: str = "outputs"


def configure(comfy_client_getter: Callable[[], object], job_manager: object, output_dir: str) -> None:
    global _comfy_client_getter, _job_manager, _output_dir
    _comfy_client_getter = comfy_client_getter
    _job_manager = job_manager
    _output_dir = output_dir


class RunGraphRequest(BaseModel):
    graph: Dict = Field(..., description="ComfyUI API-format prompt graph")
    generation_type: str = Field("image", pattern="^(image|video)$")


class RunGraphResponse(BaseModel):
    job_id: str
    status: str
    message: str


def _kinds_for(generation_type: str) -> tuple[str, ...]:
    return ("images", "gifs", "videos") if generation_type == "video" else ("images",)


async def execute_comfy_graph(job_id: str, graph: Dict, generation_type: str) -> Dict:
    client = _comfy_client_getter() if _comfy_client_getter else None
    if client is None or not getattr(client, "connected", False):
        raise RuntimeError("ComfyUI is not connected.")

    prompt_id = await client.queue_prompt(graph)
    outputs = await client.wait_for_prompt_completion(
        prompt_id,
        progress_callback=lambda progress: _update(job_id, progress=progress),
        kinds=_kinds_for(generation_type),
    )

    output_dir = Path(_output_dir) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: List[str] = []
    for index, output in enumerate(outputs, start=1):
        data = await client.get_image(output["filename"], output.get("subfolder", ""), output.get("type", "output"))
        extension = Path(output["filename"]).suffix or ".png"
        local_name = f"output_{index:03d}{extension}"
        (output_dir / local_name).write_bytes(data)
        saved.append(f"/outputs/{job_id}/{local_name}")

    key = "videos" if generation_type == "video" else "images"
    result = {key: saved, "generation_type": generation_type}
    _update(job_id, status="completed", progress=100.0, result=result)
    return result


def _update(job_id: str, **kwargs) -> None:
    if _job_manager is not None:
        _job_manager.update_job(job_id, **kwargs)


@router.post("/run-graph", response_model=RunGraphResponse)
@limiter.limit(LIMITS["generate"])
async def run_graph(request: Request, body: RunGraphRequest, background_tasks: BackgroundTasks) -> RunGraphResponse:
    """Validate and run a user-authored ComfyUI graph on a connected Comfy server."""
    try:
        validate_comfy_graph(body.graph)
    except GraphValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    client = _comfy_client_getter() if _comfy_client_getter else None
    if client is None or not getattr(client, "connected", False):
        raise HTTPException(status_code=409, detail="Running a workflow graph requires a connected ComfyUI server.")

    job_id = str(uuid.uuid4())
    background_tasks.add_task(execute_comfy_graph, job_id, body.graph, body.generation_type)
    return RunGraphResponse(job_id=job_id, status="pending", message="ComfyUI graph job started")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m unittest tests.test_comfy_graph_api -v`
Expected: PASS.

- [ ] **Step 5: Register + configure the router in main.py**

In `backend/main.py`, near the other router registrations (where `lora`/retrieval routers are included), add:

```python
from api import comfy_graph  # type: ignore[import-not-found]

app.include_router(comfy_graph.router)
```

After `comfy_client` and `job_manager` are created and `OUTPUT_DIR` is defined (in the startup path), configure it:

```python
comfy_graph.configure(lambda: comfy_client, job_manager, OUTPUT_DIR)
```

- [ ] **Step 6: Update openapi.json**

In `docs/api/openapi.json`, add a `"/api/v1/comfy/run-graph"` path entry with a `post` operation: `tags: ["ComfyUI Interop"]`, request body `{ graph: object, generation_type: "image"|"video" }`, responses `200` (`{ job_id, status, message }`), `409` (server not connected), `422` (graph validation failure). Mirror the shape/level of detail of the existing `/api/generate/image` entry.

- [ ] **Step 7: Run the backend suite + commit**

Run: `cd backend && python -m unittest discover -s tests -p "test_*.py" && cd ..`
Expected: PASS.

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/api/comfy_graph.py backend/tests/test_comfy_graph_api.py backend/main.py docs/api/openapi.json
git commit -m "feat(m8): run-graph endpoint executes the user's authored Comfy graph"
git branch --show-current
```

---

### Task 13: Flat video-through-Comfy dispatch

**Files:**
- Modify: `backend/main.py` (add `generate_video_with_comfyui` + the dispatch branch)
- Test: `backend/tests/test_video_dispatch.py` (create)

**Interfaces:**
- Consumes: `build_video_workflow` (Task 10), `comfy_client.wait_for_prompt_completion(kinds=...)` (Task 11).
- Produces: `generate_video_with_comfyui(job_id, request) -> Dict`; `process_video_generation` chooses Comfy when connected, else `direct_video_generator`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_video_dispatch.py`. Because `process_video_generation` lives in `main.py` (heavy to import), test the **dispatch decision** as a small extracted predicate. First add the predicate to `main.py` (Step 3), then this test asserts it:

```python
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_workflows import build_video_workflow  # type: ignore[import-not-found]


class VideoDispatchHelperTests(unittest.TestCase):
    def test_video_workflow_is_queueable_shape(self):
        workflow, seed = build_video_workflow(
            model="svd", prompt="surf", image_filename="f.png",
            width=1024, height=576, fps=8, steps=20, seed=7,
        )
        # every node is a dict with class_type + inputs (ComfyUI prompt shape)
        for node in workflow.values():
            self.assertIn("class_type", node)
            self.assertIn("inputs", node)
        self.assertEqual(seed, 7)


if __name__ == "__main__":
    unittest.main()
```

(The full `process_video_generation` Comfy branch is integration-covered by Task 12's `execute_comfy_graph` test for graph runs and by manual/live testing for the flat path; CI has no live Comfy server, so the unit test asserts the builder's queueable shape - the part with logic.)

- [ ] **Step 2: Run the test to verify it fails (then passes once Task 10 is merged)**

Run: `cd backend && python -m unittest tests.test_video_dispatch -v`
Expected: PASS if Task 10 landed (builder exists). If you are doing Task 13 before Task 10's commit is present, it FAILs on import - do Task 10 first.

- [ ] **Step 3: Implement the flat Comfy video path in main.py**

In `backend/main.py`, add `build_video_workflow` to the `comfy_workflows` import, and add a Comfy video generator beside `generate_with_comfyui`:

```python
async def generate_video_with_comfyui(job_id: str, request: VideoGenerationRequest) -> Dict:
    """Generate video using a connected ComfyUI server (flat request path)."""
    if not comfy_client:
        raise RuntimeError("ComfyUI client is not available")

    image_filename = ""
    if request.image_path:
        image_filename = await comfy_client.upload_image(request.image_path)

    workflow, resolved_seed = build_video_workflow(
        model=request.model,
        prompt=request.prompt,
        image_filename=image_filename,
        width=request.width,
        height=request.height,
        fps=request.fps,
        steps=request.steps,
        seed=request.seed if request.seed != -1 else None,
        file_prefix=f"vision_studio/{job_id}/video",
    )

    prompt_id = await comfy_client.queue_prompt(workflow)
    job_manager.update_job(job_id, progress=10.0)
    outputs = await comfy_client.wait_for_prompt_completion(
        prompt_id,
        progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
        kinds=("images", "gifs", "videos"),
    )

    output_dir = Path(OUTPUT_DIR) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: List[str] = []
    for index, output in enumerate(outputs, start=1):
        data = await comfy_client.get_image(
            output["filename"], output.get("subfolder", ""), output.get("type", "output")
        )
        extension = Path(output["filename"]).suffix or ".webp"
        local_name = f"video_{index:03d}{extension}"
        (output_dir / local_name).write_bytes(data)
        saved.append(f"/outputs/{job_id}/{local_name}")

    return {"videos": saved, "seed": resolved_seed, "prompt": request.prompt, "model": request.model}
```

In `process_video_generation`, replace the body that calls `direct_video_generator` with a Comfy-first branch mirroring the image dispatch:

```python
        if comfy_client and comfy_client.connected:
            logger.info(f"[Job {job_id}] Using ComfyUI video generator")
            result = await generate_video_with_comfyui(job_id, request)
        else:
            if not direct_video_generator:
                raise RuntimeError(
                    "No video generation backend available. Install the required libraries "
                    "(pip install diffusers torch) for direct video generation."
                )
            result = await direct_video_generator.generate_video(
                job_id=job_id,
                prompt=request.prompt,
                image_path=request.image_path,
                width=request.width,
                height=request.height,
                fps=request.fps,
                duration=request.duration,
                steps=request.steps,
                model_name=request.model,
                seed=request.seed if request.seed != -1 else 0,
                progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
            )

        job_manager.update_job(
            job_id, status=JobStatus.COMPLETED, progress=100.0, result=result, completed_at=datetime.now()
        )
```

(Keep the existing `ModelLoadRefusedError` / `Exception` handlers below unchanged.)

- [ ] **Step 4: Run the backend suite to verify green**

Run: `cd backend && python -m unittest discover -s tests -p "test_*.py" && cd ..`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add backend/main.py backend/tests/test_video_dispatch.py
git commit -m "feat(m8): video-through-Comfy dispatch branch (Comfy-first, Direct fallback)"
git branch --show-current
```

---

### Task 14: Renderer Run-on-ComfyUI path

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Modify: `electron/ipc-handlers/generation.ts`
- Modify: `src/components/workflow/WorkflowWorkbench.tsx`
- Test: `src/components/workflow/WorkflowWorkbench.test.tsx` (append)

**Interfaces:**
- Consumes: `exportWorkflowGraphToComfyPrompt` (Task 2), `evaluateGraphSafety` (Task 3), `ImportFidelityReport.executable` / a freshly evaluated safety result.
- Produces: `window.electron.workflow.runGraph({ graph, generationType })`; IPC `workflow:run-graph` -> `POST /api/v1/comfy/run-graph` -> `{ job_id, status, message }`.

- [ ] **Step 1: Write the failing UI test**

Append to `src/components/workflow/WorkflowWorkbench.test.tsx`:

```tsx
  it('disables Run on ComfyUI when the graph is not executable', async () => {
    render(<WorkflowWorkbench />);
    const json = JSON.stringify({
      '1': { class_type: 'WeirdCustomNode', inputs: {} },
    });
    fireEvent.change(screen.getByLabelText(/comfy graph json/i), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: /import graph/i }));
    await waitFor(() => expect(screen.getByText(/not executable/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /run on comfyui/i })).toBeDisabled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx -t "Run on ComfyUI"`
Expected: FAIL - no "Run on ComfyUI" button.

- [ ] **Step 3: Add the preload bridge**

In `electron/preload.ts`, add a `workflow` namespace to the exposed API object (near the `generation` namespace):

```ts
  workflow: {
    runGraph: (params: { graph: unknown; generationType: 'image' | 'video' }) =>
      ipcRenderer.invoke('workflow:run-graph', params),
  },
```

- [ ] **Step 4: Add the typed surface**

In `src/types/electron.d.ts`, add to the `electron` interface (near `generation`):

```ts
    workflow: {
      runGraph(params: {
        graph: import('@/features/workflow/comfyExport').ComfyPrompt;
        generationType: 'image' | 'video';
      }): Promise<{ job_id: string; status: string; message: string }>;
    };
```

- [ ] **Step 5: Add the main handler**

In `electron/ipc-handlers/generation.ts`, register the handler near `generation:generate-image` (reusing `BACKEND_URL`, `backendAuthHeaders`, `requestBackend`):

```ts
ipcMain.handle('workflow:run-graph', async (_event, params: { graph: unknown; generationType: 'image' | 'video' }) => {
  const response = await requestBackend(() =>
    axios.post(
      `${BACKEND_URL}/api/v1/comfy/run-graph`,
      { graph: params.graph, generation_type: params.generationType },
      { headers: backendAuthHeaders() }
    )
  );
  return response.data;
});
```

- [ ] **Step 6: Add the Run-on-ComfyUI action to WorkflowWorkbench**

In `src/components/workflow/WorkflowWorkbench.tsx`, add (near the export panel) a button gated on a freshly evaluated safety result of the active graph's exported prompt:

```tsx
import { evaluateGraphSafety } from '@/features/workflow/comfyImportSafety';

// inside the component:
  const activePrompt = useMemo(
    () => (activeWorkflow ? exportWorkflowGraphToComfyPrompt(activeWorkflow.graph) : null),
    [activeWorkflow]
  );
  const runnable = activePrompt ? evaluateGraphSafety(activePrompt).safe : false;

  const handleRunOnComfy = async () => {
    if (!activePrompt) return;
    await window.electron.workflow.runGraph({ graph: activePrompt, generationType: 'image' });
  };
```

```tsx
        <button type="button" className="btn-chrome" disabled={!runnable} onClick={handleRunOnComfy}>
          Run on ComfyUI
        </button>
```

Note: the import test from Task 7 imports an opaque graph into a NEW active workflow, so `activeWorkflow` becomes that imported graph and `runnable` is `false` - the button is disabled, satisfying the test. Guard `window.electron` for the browser-dev test harness: `const electron = window.electron; ... onClick={() => electron?.workflow && handleRunOnComfy()}` following the existing guard pattern in this file.

- [ ] **Step 7: Run the test + typecheck**

Run: `npm run typecheck && npx vitest run src/components/workflow/WorkflowWorkbench.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/preload.ts src/types/electron.d.ts electron/ipc-handlers/generation.ts src/components/workflow/WorkflowWorkbench.tsx src/components/workflow/WorkflowWorkbench.test.tsx
git commit -m "feat(m8): Run on ComfyUI action wired through workflow:run-graph IPC"
git branch --show-current
```

---

### Task 15: Docs, Codex gate, PR2 green gate

**Files:**
- Modify: `docs/API_ENDPOINTS.md`

- [ ] **Step 1: Document the route + IPC channel**

In `docs/API_ENDPOINTS.md`, add a "ComfyUI Interop" section documenting `POST /api/v1/comfy/run-graph` (request `{ graph, generation_type }`, responses 200/409/422, the image|video output contract), the `workflow:run-graph` IPC channel, and the safety-refusal shape (structured, leak-free). Note that imported graphs are validated by `comfy_graph_guard.validate_comfy_graph` before execution, and that ComfyUI is out of the M6 routing fabric.

- [ ] **Step 2: Codex graph-execution-safety self-check**

Verify against the spec S7 / Codex gate:
- The backend gate (`comfy_graph_guard`) runs on EVERY graph before `queue_prompt` (Task 12 endpoint + a guard call is also safe to add at the top of `execute_comfy_graph` for defense-in-depth - add `validate_comfy_graph(graph)` as the first line of `execute_comfy_graph` if not already enforced by the endpoint).
- No refusal message contains a path or token (asserted in `test_comfy_graph_guard`).
- The renderer never executes opaque graphs (Run button gated on `evaluateGraphSafety(...).safe`).

If the defense-in-depth guard call is added to `execute_comfy_graph`, run `cd backend && python -m unittest tests.test_comfy_graph_api -v` to confirm still green, then commit that one-line change with the docs.

- [ ] **Step 3: Run every gate**

```bash
npm run typecheck
npm test
npm run build
cd backend && python -m unittest discover -s tests -p "test_*.py" && cd ..
```
Expected: all green.

- [ ] **Step 4: Commit + push + open/update PR2**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add docs/API_ENDPOINTS.md backend/api/comfy_graph.py
git commit -m "docs(m8): ComfyUI Interop endpoints + Codex graph-execution gate"
git branch --show-current
git push
gh pr create --title "M8 ComfyUI Interop PR2: run authored graphs + video-through-Comfy" \
  --body "PR2 of M8. Runs the user's authored first-class graph on a connected Comfy server (image and video) via POST /api/v1/comfy/run-graph, replacing the hardcoded template for graph runs; adds the Comfy video workflow builder, generalized image/video output extraction, and the video-through-Comfy dispatch branch. Codex gate: authoritative backend allow-list + path sanitization before queue_prompt." || gh pr checks --watch
```
Expected: CI green. Squash-merge per the ship process after review.

---

## Self-review

**Spec coverage (S1-S15):**
- S2 decision 1 (first-class set) -> Task 1 (`FIRST_CLASS_NODES`, registry) + Task 8 (backend allow-list).
- S2 decision 2 (Comfy out of fabric) -> Global Constraints (no `resolveRoute`/`providerRouting` change); honored throughout.
- S2 decision 3 (full video parity) -> Tasks 10-13.
- S4 (slot reconciliation / export fix) -> Task 2.
- S5 (importer + fidelity report + drift-normalizer + layout) -> Task 4.
- S6 (round-trip) -> Task 5.
- S7 (safety: renderer advisory + backend authoritative) -> Task 3 + Task 8 (+ Task 15 defense-in-depth).
- S8 (whole-graph action; run user's graph; video builder/extractor/dispatch) -> Task 6, Task 12, Tasks 10/11/13.
- S9 (IPC `workflow:run-graph`; no new settings) -> Task 14.
- S10 (test strategy) -> tests in every task; no live Comfy in CI.
- S11 (docs: API_ENDPOINTS, openapi, IPC mirroring) -> Task 12 (openapi) + Task 14 (IPC mirror) + Task 15 (API_ENDPOINTS).
- S12 (2-PR split) -> Phase A (Tasks 1-9) / Phase B (Tasks 10-15).
- S14 acceptance -> import (T4), round-trip + integer slots (T2/T5), run image+video (T12/T13), malicious corpus (T8), no fabric change (constraints), gates (T9/T15).
- S15 deferred items -> resolved inline (drift-normalizer in T4; SVD video family in T10; layout constants in T4; loaders shipped in PR1 T1).

**Placeholder scan:** no TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `ImportFidelityReport`/`ImportResult`/`importComfyPromptToWorkflowGraph` consistent across T4/T5/T7; `evaluateGraphSafety`/`SafetyResult` consistent across T3/T4/T14; `FIRST_CLASS_NODES` (renderer Set in T1, backend set in T8) names match; `extract_history_outputs(kinds=...)` consistent across T10/T11; `execute_comfy_graph`/`configure`/`run_graph` consistent in T12; `workflow.runGraph({ graph, generationType })` consistent across T14 preload/types/handler/UI; `generation_type` is the backend field name (snake) mapped from `generationType` in the handler (T14 Step 5).

---

_This plan implements the approved M8 design spec. Execution proceeds via subagent-driven-development or executing-plans, honoring the cross-cutting rails and the Codex graph-execution-safety gate._
