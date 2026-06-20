# Vision Studio - M8 ComfyUI Interop Deepening (Design Spec)

> **Status:** Approved design (2026-06-19). Elaborates the M8 section of the
> Path-to-v1 Program Roadmap
> (`docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md`).
> This spec is the just-in-time elaboration of an already-locked milestone; it
> does **not** re-open program scope. It inherits the program's cross-cutting
> engineering rails by reference and resolves M8's open decisions. Next artifact:
> the implementation plan via the writing-plans skill.

## 1. Context and goal

The most self-contained milestone: make Vision Studio a first-class **ComfyUI
companion**. Today the app exports its internal `WorkflowGraph` to a ComfyUI
prompt and *can* run on a connected Comfy server, but three gaps keep it from
being a true companion: (1) there is no **import** path - external Comfy graphs
cannot be loaded into the app; (2) the export emits **named** output slots that a
real ComfyUI server rejects, so "round-trip" and "run external graph" do not
actually hold; (3) when a Comfy server is connected, image runs use a **hardcoded
7-node template** rather than the user's authored graph, and **video has no Comfy
path at all** (always `DirectVideoGenerator`).

**Goal:** import and run external ComfyUI graphs with structural round-trip
fidelity and surfaced limitations, fix the slot-encoding defect so exports are
genuinely ComfyUI-loadable, run the user's authored first-class graph on a
connected Comfy server (image and video), and treat every imported graph as
untrusted input behind a hard safety boundary.

**Current surface this builds on (verified against the code):**

- `src/features/workflow/comfyExport.ts` - `exportWorkflowGraphToComfyPrompt(graph)`
  -> `ComfyPrompt` (`Record<nodeId, { class_type; inputs; _meta?: { title } }>`).
  Link inputs become `[nodeId, output]`; literals pass through.
  `validateWorkflowGraphForComfyExport` rejects dangling links, self-edges, and
  duplicate links. Covered by `comfyExport.test.ts` (the round-trip fixtures M8
  reuses). **Defect:** `output` is the in-app **named** slot (e.g. `'CONDITIONING'`),
  but ComfyUI link tuples require the **integer slot index** (e.g. `0`).
- `src/types/workflow.ts` - `WorkflowGraph { nodes: Record<id,Node>; edges: Edge[];
  viewport? }`. `WorkflowGraphInput = { kind:'literal'; value } | { kind:'link';
  nodeId; output: string }`. The graph **duplicates** every link as both a node
  input (`kind:'link'`) and a top-level `edge` - the two must stay consistent.
- `src/features/workflow/nodeDefaults.ts` - `NODE_REGISTRY` knows only five class
  types (`CheckpointLoaderSimple`, `CLIPTextEncode`, `KSampler`, `PreviewImage`,
  `SaveImage`) and `createWorkflowNodeFromClassType`. The in-app checkpoint default
  is `flux-dev.safetensors`; the backend template uses `flux1-dev.safetensors`
  (a known filename drift).
- `src/store/slices/workflowSlice.ts` - `createWorkflow(name)` plus per-node and
  per-edge mutators (`connectWorkflowNodes` writes **both** the link input and the
  edge). There is **no** action to install a whole graph at once.
- `src/components/workflow/WorkflowWorkbench.tsx` - the workflow surface; already
  calls `exportWorkflowGraphToComfyPrompt` for the export panel (~L107) and
  `createWorkflowNodeFromClassType` for add-node (~L311). This is where Import and
  Run-on-ComfyUI UI attach.
- `backend/utils/comfy_workflows.py` - `build_image_workflow(...)` returns a
  **hardcoded** 7-node template (`CheckpointLoaderSimple`, 2x `CLIPTextEncode`,
  `EmptyLatentImage`, `KSampler`, `VAEDecode`, `SaveImage`);
  `extract_history_image_outputs(history, prompt_id)` reads **only**
  `node_output["images"]`.
- `backend/utils/comfy_client.py` - `ComfyUIClient` (:8188): `queue_prompt(workflow)`,
  `get_history`, `get_image` (fetches any file via `/view` as bytes),
  `wait_for_prompt_completion(...)` (calls the image-only extractor). `connected`
  flag gates dispatch.
- `backend/main.py` - image dispatch (~L1167): `if comfy_client and
  comfy_client.connected -> generate_with_comfyui` (the hardcoded template, ~L1203)
  else `generate_direct`. **Video** dispatch (`process_video_generation`, ~L1358)
  has **no** Comfy branch - only `direct_video_generator`. Structured failures use
  the `ModelLoadRefusedError` idiom (user-facing string, no paths/tracebacks).
- `backend/utils/sanitization.py` - `sanitize_path` (strips traversal, absolute
  paths, drive letters, null bytes, dangerous chars), `sanitize_model_name`,
  `sanitize_prompt`. **Not** currently wired to the Comfy generators.
- `backend/foundry/index_service.py` - `_filename_reconciliation()` -> `Dict[str,str]`
  filename->canonical map (with an `_AMBIGUOUS_FILENAMES` refusal set); the
  authoritative source for resolving a graph's `ckpt_name`/`lora_name` to an
  installed model.

**What does not exist yet (greenfield for M8):** any graph **import**; any
named-slot<->integer-slot reconciliation; any whole-graph store action; any
graph-execution endpoint (runs the user's graph, not a template); any **video**
Comfy workflow builder, video output extraction, or video Comfy dispatch.

## 2. Decisions locked for M8

The roadmap left two open decisions; the brainstorm resolved them plus the
runtime-depth fork the roadmap flagged ("video-through-Comfy works **or** is a
documented limitation").

1. **Node-coverage target set:** a **core text-to-image pipeline is first-class**;
   every other node is **imported structurally and flagged**. The first-class set:
   `CheckpointLoaderSimple`, `CLIPTextEncode`, `EmptyLatentImage`, `KSampler`,
   `VAEDecode`, `SaveImage`, `PreviewImage`, `LoraLoader`, `VAELoader`. First-class
   means: known integer output-slot map (faithful round-trip), known path-input
   fields (safety), and **executable** on a connected Comfy server. Opaque nodes
   round-trip **verbatim** (raw slots preserved) so no data is lost, but a graph
   containing any opaque node is **not executable** and says so. (Rejected: a broad
   "import everything as executable" set - we cannot know arbitrary nodes' slot maps
   or path fields, so we could neither round-trip them faithfully nor sandbox them;
   that is exactly the untrusted-execution risk the Codex gate forbids.)
2. **Comfy-as-route:** a running ComfyUI server is **out of the M6 routing fabric**.
   It stays a **backend-internal execution detail** reached from the workflow-run
   path, **not** a `ProviderId` in `shared/providerRouting.ts` and **not** a branch
   in `shared/resolveRoute.ts`. M8 makes **zero** changes to the M6 fabric.
   (Rejected: Comfy as a routable target - the fabric routes *model* requests by
   capability/cost/budget; an arbitrary user **graph** is not a model request, and
   forcing it into the fabric's request shape would either flatten the graph away
   or distort the fabric's contract. Comfy execution is graph-shaped and local-only,
   so it belongs beside the fabric, not inside it.)
3. **Runtime-parity depth:** **full parity, including video-through-Comfy.** When a
   Comfy server is connected, the user's first-class graph runs **as authored**
   (image and video), replacing the hardcoded template for graph-originated runs;
   video gains a Comfy builder, video output extraction, and a Comfy dispatch
   branch mirroring the image path. (The roadmap's documented-limitation escape
   hatch is **not** taken.)

## 3. Architecture: import, fidelity, safety, runtime

```
  Renderer (src/)                    Electron main (electron/)        Backend (Python)
  +-----------------------------+ IPC +----------------------+ HTTP +----------------------+
  | comfyImport.ts (inverse)    |---->| workflow:run-graph   |----->| /api/v1/comfy        |
  | nodeSlots.ts (slot map)     |     |  IPC -> POST run-graph|      |  comfy_graph_guard   |
  | comfyImportSafety.ts        |     |                      |<-----|  (allow-list+sanitize|
  | createWorkflowFromGraph     |     |                      | asset|   = the safety gate) |
  | WorkflowWorkbench (Import +  |<----|                      |      |  generate_*_comfyui  |
  |  Run-on-ComfyUI + report)   |result|                     |      |   (runs USER graph)  |
  +-----------------------------+     +----------------------+      |  comfy_workflows.py  |
        owns: import, slot                owns: graph-run IPC        |   build_video_workflow|
        reconciliation, fidelity          transport                 |   extract_history_*   |
        report, safety pre-check,                                    |  comfy_client (:8188) |
        whole-graph install, UI                                     +----------------------+
                                                                       owns: authoritative
                                                                       safety gate + Comfy
                                                                       graph/video execution
```

- **Renderer** owns **import** (inverse of `comfyExport`), the **slot-reconciliation**
  layer shared by import and a corrected export, the **fidelity report**, a
  **safety pre-check** (advisory flags), the **whole-graph store action**, and the
  Import / Run-on-ComfyUI UI. It never talks to the backend directly.
- **Electron main** owns the **graph-run IPC transport** (`workflow:run-graph` ->
  `POST /api/v1/comfy/run-graph`), mirroring the established renderer -> IPC ->
  main -> backend-HTTP path. It adds no business logic.
- **Backend** owns the **authoritative safety gate** (a graph is validated server-
  side before it ever reaches `queue_prompt`) and **Comfy graph/video execution**
  (runs the user's graph, extracts image **and** video outputs, saves, returns
  asset URLs). The renderer's safety verdict is advisory; the backend never trusts
  it.

**Relationship to M6 routing.** Per decision 2, no `resolveRoute`/`providerRouting`
changes. The new `/api/v1/comfy/*` endpoints sit beside, not inside, the fabric.

## 4. The slot-reconciliation layer (the fidelity fix)

`src/features/workflow/nodeSlots.ts` - a per-first-class-class-type map between
**named outputs** (how in-app graphs and the existing export label links) and
**integer output slots** (what ComfyUI link tuples require).

```ts
// Forward (named -> integer slot) and reverse (slot -> named) for first-class nodes.
// Slots follow ComfyUI's canonical output ordering for each node.
export const NODE_OUTPUT_SLOTS: Record<string, string[]> = {
  CheckpointLoaderSimple: ['MODEL', 'CLIP', 'VAE'],     // 0,1,2
  CLIPTextEncode: ['CONDITIONING'],                     // 0
  EmptyLatentImage: ['LATENT'],                         // 0
  KSampler: ['LATENT'],                                 // 0
  VAEDecode: ['IMAGE'],                                 // 0
  VAELoader: ['VAE'],                                   // 0
  LoraLoader: ['MODEL', 'CLIP'],                        // 0,1
  // SaveImage / PreviewImage are terminal (no outputs)
};
export function namedOutputToSlot(classType: string, output: string): number | null;
export function slotToNamedOutput(classType: string, slot: number): string | null;
```

- **Export (corrected):** for a **first-class** source node, `comfyExport` emits
  `[nodeId, <integer slot>]` via `namedOutputToSlot`; for an **opaque** source
  node (or an unmapped named output), it emits the slot **verbatim** (preserving
  whatever was imported) and records a fidelity note. This makes first-class
  exports genuinely ComfyUI-loadable - the defect fix.
- **Import:** a ComfyUI link tuple `[nodeId, <int slot>]` on a **first-class**
  source node becomes a `kind:'link'` input whose `output` is the **named** slot
  via `slotToNamedOutput`; on an **opaque** source node the raw slot is stringified
  and preserved verbatim. The reverse-mapped name keeps in-app graphs internally
  consistent (named outputs everywhere) while exports re-encode to integers.

The existing `comfyExport.test.ts` fixtures that assert named-output emission are
updated to assert integer slots for first-class nodes (the intentional fidelity
fix), with a verbatim-passthrough case for opaque nodes.

## 5. The importer (renderer)

`src/features/workflow/comfyImport.ts` - the inverse of `comfyExport`.

```ts
interface ImportFidelityReport {
  totalNodes: number;
  firstClassNodes: number;
  opaqueNodes: { id: string; classType: string }[];        // preserved, not executable
  unresolvedModels: { nodeId: string; field: string; value: string }[]; // advisory
  warnings: string[];        // coerced slots, dangling-link drops, ambiguous inputs
  executable: boolean;       // true iff all first-class AND models resolve AND safety pre-check clean
}
interface ImportResult { graph: WorkflowGraph; report: ImportFidelityReport; }

function importComfyPromptToWorkflowGraph(
  prompt: ComfyPrompt,
  context: { knownModelFilenames: string[] }
): ImportResult;
```

Per node (key = Comfy node id):
- `classType = class_type`; `label = _meta?.title ?? NODE_REGISTRY[classType]?.label
  ?? class_type`.
- **Inputs.** A value is a **link** iff it is a 2-element array whose first element
  is a string matching an existing node id (Comfy's own link-resolution rule;
  Comfy inputs are otherwise scalars, so this is unambiguous). Links ->
  `{ kind:'link', nodeId, output: slotToNamedOutput(...) ?? String(slot) }`; all
  other values -> `{ kind:'literal', value }`.
- **Edges.** Synthesized from the same link tuples, so node inputs and top-level
  `edges` are built **once, from one source** and cannot disagree (resolving the
  duplication risk). Edge ids reuse the store's `createWorkflowEdgeId` shape.
- **Layout.** The Comfy **API-prompt** format carries no positions, so the importer
  assigns a **deterministic layered layout** (column = longest-path depth from
  source nodes, row = stable index within a column). Deterministic so tests and
  round-trips are stable; positions are explicitly **not** part of round-trip
  equality.
- **Classification.** `classType in FIRST_CLASS_NODES` -> first-class, else opaque
  (still imported).
- **Model resolution (advisory).** `ckpt_name`/`lora_name`/`vae_name` are checked
  against `context.knownModelFilenames` with a small drift-normalizer (e.g.
  `flux-dev` ~ `flux1-dev`); misses populate `unresolvedModels`. This is renderer-
  side best-effort; the **authoritative** resolution is the backend Foundry
  reconciliation at execute time (S8).

## 6. Round-trip fidelity (honest, structural)

The acceptance bar is **structural**, never behavioral - there is no in-app graph
*executor*, so "behavioral identity" is explicitly not claimed and is documented.

- **`import(export(g))` is structurally faithful:** equal `nodes` (id, classType,
  inputs incl. link named-outputs), equal `edges`, equal labels. **Positions are
  excluded** (export drops them; import re-lays-out). Tested on the `comfyExport`
  fixtures.
- **`export(import(p))` reproduces `p` for first-class graphs:** integer slots
  survive (import slot->name, export name->slot). For graphs containing opaque
  nodes, raw slots pass through verbatim, so re-export is exact for them too.
- **Surfaced limitations:** the fidelity report names every opaque node, every
  unresolved model, every coerced/dropped element. A graph round-trips *with its
  limitations shown*, satisfying the roadmap's "explicit, surfaced limitations."

## 7. Safety boundary (Codex gate: graph-execution safety)

Imported graphs are untrusted. Two enforcement layers; the backend is authoritative.

- **Renderer pre-check (`src/features/workflow/comfyImportSafety.ts`) - advisory.**
  On import, flags (does not silently drop): any **opaque** class type (not
  executable), and any path-shaped input (`ckpt_name`, `lora_name`, `vae_name`,
  `filename_prefix`, `image`, plus a `*_name`/`*_path` heuristic) containing
  traversal (`..`), an absolute path, a drive letter, or a null byte. Unsafe or
  opaque -> `report.executable = false` with reasons surfaced in the UI.
- **Backend gate (`backend/utils/comfy_graph_guard.py`) - authoritative.** Before
  **any** graph reaches `queue_prompt`: (a) every node's `class_type` must be in
  the backend **allow-list** (the first-class set); (b) every known path field is
  run through `sanitize_path` / `sanitize_model_name` and rejected if it changes
  (i.e. it was unsafe); (c) unknown class types or unsafe paths -> a **structured
  refusal** in the `ModelLoadRefusedError` idiom (user-facing reason, **no path or
  token leaked**, no traceback). The backend **never** trusts the renderer's
  `executable` flag; it re-validates from scratch. This guarantees no arbitrary
  class type and no path traversal can reach the Comfy server.

An **adversarial graph corpus** drives the tests: opaque/code-exec-shaped class
types, `../`/absolute/drive-letter/null-byte path inputs, oversized graphs - each
asserted to be refused (structured, leak-free) and never submitted.

## 8. Runtime parity: run the user's graph (image and video)

**Whole-graph install (renderer).** `createWorkflowFromGraph(name, graph) ->
WorkflowRecord` is added to `workflowSlice.ts` (and `appStore.types.ts`): it
scaffolds a record like `createWorkflow` but installs the imported `graph` whole
(nodes + the consistent synthesized edges). This is the single new store mutator
M8 needs; in-place replacement of an existing graph is deferred (YAGNI - import
targets a new workflow, never destroying current work).

**Graph execution (the template replacement).** A new path runs the user's
authored graph instead of the hardcoded template:

1. Renderer: the **Run on ComfyUI** action exports the active first-class graph via
   the corrected `comfyExport` and sends it through `workflow:run-graph` IPC with a
   `generationType` (`'image' | 'video'`). The action is **disabled** unless
   `report.executable` (first-class + safe + models resolve).
2. Main: `workflow:run-graph` -> `POST /api/v1/comfy/run-graph` (`backend/api/comfy_graph.py`).
3. Backend: `comfy_graph_guard` validates (S7); if `comfy_client.connected`,
   `generate_with_comfyui_graph(job_id, graph, generation_type)` submits the
   **user's graph** via `queue_prompt`, polls, extracts outputs (image **or**
   video), saves under the job dir, returns asset URLs - reusing the existing
   job-manager progress + `/outputs/...` conventions. If Comfy is **not** connected,
   a structured error explains that arbitrary-graph execution requires a Comfy
   server (there is no diffusers fallback for an arbitrary graph - the flat
   `DirectGenerator` path only understands a flat request, not a node graph).

The hardcoded `build_image_workflow` template **remains** for **flat** (non-graph)
Comfy requests from Prompt Studio - a flat request has no graph to run, so the
template is correct there. M8's change is that **graph-originated** runs no longer
flatten through the template; they execute as authored. Backend Foundry
`_filename_reconciliation` resolves `ckpt_name`/`lora_name` to installed files at
this point (authoritative model resolution).

**Video-through-Comfy.** Three additions mirror the image path:
- `comfy_workflows.py`: `build_video_workflow(...)` - a family-keyed Comfy video
  template (mirroring `build_image_workflow`'s checkpoint selection) for the
  **flat** video path; and `extract_history_outputs(history, prompt_id,
  kinds=('images',))` generalizing the current extractor to also collect
  `gifs`/`videos`. `extract_history_image_outputs` becomes a thin wrapper
  (`kinds=('images',)`) so existing tests/callers stay green.
- `comfy_client.py`: `wait_for_prompt_completion(..., kinds=('images',))` passes
  `kinds` to the generalized extractor; `get_image` already returns arbitrary
  `/view` bytes, so it serves video files unchanged.
- `main.py`: `process_video_generation` gains a Comfy branch -
  `if comfy_client and comfy_client.connected -> generate_video_with_comfyui(job_id,
  request)` else the existing `direct_video_generator` - exactly mirroring the image
  dispatch, with the same `ModelLoadRefusedError` handling.

## 9. IPC, settings, contracts

- **IPC:** one new channel, `workflow:run-graph` (`{ graph: ComfyPrompt;
  generationType: 'image' | 'video' } -> { jobId }`), mirrored across
  `electron/preload.ts`, `electron/services/mainIpc.ts`, and
  `src/types/electron.d.ts` (the established mirroring rail; CLAUDE.md keeps these
  in sync).
- **Shared types:** `ComfyPrompt` (already in `comfyExport.ts`) is the wire shape
  for the graph payload; no new shared module is required (unlike M7).
- **No new settings.** Import/run are user actions, not persisted preferences;
  `AppSettings` is unchanged.
- **No `resolveRoute`/`providerRouting` change** (decision 2).

## 10. Test strategy

Deterministic, no live Comfy server in CI (roadmap rail). Failing test first.

- **Renderer (Vitest):**
  - `nodeSlots`: named<->slot round-trips for every first-class node; unknown
    class/output -> `null`.
  - `comfyImport`: native Comfy prompt -> graph (link-tuple detection, literal
    passthrough, opaque classification, deterministic layered layout, label from
    `_meta`); fidelity report (opaque list, unresolved models, `executable`).
  - **Round-trip:** `import(export(g))` structural equality (positions excluded) on
    the `comfyExport` fixtures; `export(import(p))` exact for first-class **and**
    opaque-passthrough prompts.
  - `comfyImportSafety`: traversal/absolute/drive-letter/null-byte path inputs and
    opaque class types each flip `executable=false` with reasons.
  - `createWorkflowFromGraph`: installs nodes + consistent edges; run-graph action
    disabled unless `executable`.
- **Backend (`unittest.TestCase`, mocked `ComfyUIClient`):**
  - `comfy_graph_guard`: allow-list rejects non-first-class class types;
    `sanitize_path`/`sanitize_model_name` reject unsafe model/path fields;
    structured refusal carries no path/token; the **adversarial corpus** is never
    submitted.
  - `/api/v1/comfy/run-graph`: mount only the comfy router on a `TestClient`
    (`lora.py` pattern); assert the **user's** graph (not the template) is queued;
    image **and** video output extraction; Comfy-not-connected -> structured error.
  - `build_video_workflow`: valid node dict, family-keyed checkpoint.
  - `extract_history_outputs`: images, gifs, videos; the image wrapper stays
    image-only (back-compat).
  - Video dispatch: Comfy branch chosen when `connected`, Direct when not.

## 11. Docs and contracts

- `docs/API_ENDPOINTS.md` - new "ComfyUI Interop" section: `POST /api/v1/comfy/run-graph`
  (request/response, the image|video output contract, the safety-refusal shape) and
  the `workflow:run-graph` IPC channel.
- `docs/api/openapi.json` - hand-curated; add the `/api/v1/comfy/run-graph` route
  (a new backend REST route, as in M7).
- IPC names mirrored across `preload.ts`, `mainIpc.ts`, `electron.d.ts`.
- Roadmap status tracker updated (M7 -> Complete, M8 -> In progress/Next) folded
  into this milestone's first PR.
- No `DATABASE_SCHEMA.md` change - execution reuses the existing job-manager and
  `/outputs/...` file conventions; no new tables.

## 12. Component decomposition (balanced sprint units)

**PR1 - import + fidelity + safety (renderer + backend validation; no live-runtime
change):**
1. `nodeDefaults.ts` - extend `NODE_REGISTRY`/first-class set
   (`EmptyLatentImage`, `VAEDecode`, `LoraLoader`, `VAELoader`); fix the
   `flux-dev`/`flux1-dev` default drift; correct `KSampler.defaultOutput`
   (`IMAGE` -> `LATENT`, its real ComfyUI output, which the slot map relies on) +
   node-defaults tests.
2. `nodeSlots.ts` - the named<->integer slot map + tests; correct `comfyExport`
   to emit integer slots for first-class nodes (verbatim for opaque) and update
   `comfyExport.test.ts`.
3. `comfyImport.ts` - importer, fidelity report, deterministic layout,
   classification, round-trip tests (reuse export fixtures).
4. `comfyImportSafety.ts` - renderer pre-check + tests.
5. `createWorkflowFromGraph` store action (`workflowSlice.ts` + `appStore.types.ts`)
   + tests.
6. `WorkflowWorkbench` Import UI - paste/load Comfy JSON -> import -> Carbon Pro
   fidelity-report panel (opaque nodes, unresolved models, executable badge) +
   tests.
7. `comfy_graph_guard.py` - allow-list + path sanitization + structured refusal +
   adversarial-corpus tests.

**PR2 - runtime parity (run the user's graph; video-through-Comfy):**
8. `comfy_workflows.py` - `extract_history_outputs` generalization (+ image
   back-compat wrapper) + `build_video_workflow` + tests.
9. `comfy_client.py` - `wait_for_prompt_completion(kinds=...)` generalization + tests.
10. `backend/api/comfy_graph.py` - `POST /api/v1/comfy/run-graph`
    (guard -> queue **user graph** -> poll -> extract image/video -> save) +
    `generate_with_comfyui_graph(job_id, graph, generation_type)` (graph-originated
    image **and** video) + tests; openapi.json.
11. `main.py` - the **flat** video Comfy path: `generate_video_with_comfyui(job_id,
    request)` (uses `build_video_workflow`) + the `process_video_generation` Comfy
    dispatch branch mirroring the image branch + tests.
12. Renderer **Run on ComfyUI** path - `workflow:run-graph` IPC
    (preload/mainIpc/electron.d.ts), the WorkflowWorkbench run action gated on
    `report.executable`, fidelity surfacing + tests; `docs/API_ENDPOINTS.md`;
    Codex graph-execution gate.

Each unit is independently testable with a clear interface and explicit
verification. The PR1/PR2 split mirrors M6/M7 (PR1 = pure logic + validation, fully
tested, no runtime change; PR2 = the wiring that makes graphs execute).

## 13. Out of scope (restated from the baseline)

- A full visual node-graph editor rebuild - only what import/round-trip/run needs.
- A custom-node plugin ecosystem (-> Pillar 6).
- Non-Comfy external-tool runtime interop (A1111 runtime, etc.).
- Comfy as a routable target in the M6 fabric (decision 2).
- An in-app graph **executor** (behavioral round-trip) - structural fidelity only;
  execution happens on the Comfy server.
- In-place replacement of an existing workflow's graph on import (import -> new
  workflow only).
- Executing opaque/custom nodes - imported and preserved, never run.

## 14. Acceptance criteria

- A representative external Comfy graph **imports** into a `WorkflowGraph`, with a
  fidelity report naming opaque nodes and unresolved models.
- **Round-trip** holds: `import(export(g))` is structurally equal (positions
  excluded) and `export(import(p))` reproduces a first-class prompt; exports emit
  **integer** output slots and are genuinely ComfyUI-loadable.
- A first-class graph **runs on a connected Comfy server** as authored (not the
  hardcoded template), for **image and video**; video-through-Comfy works (not a
  documented limitation).
- The **malicious-graph corpus** cannot trigger unsafe execution: the backend gate
  refuses unknown class types and unsafe paths with a structured, leak-free error,
  and never submits them.
- No M6 fabric change; `resolveRoute`/`providerRouting` untouched.
- All cross-cutting rails green (`npm run typecheck`, `npm test`, `npm run build`,
  backend `unittest`); Codex graph-execution findings closed; docs and contracts
  updated in the same PR(s).

## 15. Items deliberately deferred to plan-time

Implementation details, resolved while writing the plan, not re-brainstormed:

- The exact `build_video_workflow` node set and which video family ships first
  (image-to-video vs text-to-video), chosen against what a stock ComfyUI provides.
- The precise drift-normalizer rules for model-filename matching (beyond the
  `flux-dev`/`flux1-dev` case) and whether the renderer pulls `knownModelFilenames`
  from the existing model list or a dedicated query.
- The exact layered-layout spacing constants and tie-break ordering.
- Whether `LoraLoader`/`VAELoader` ship in PR1's first-class set or are gated behind
  a follow-up if their slot maps need validation against a live ComfyUI.
- The Run-on-ComfyUI UX affordance (button placement, disabled-state copy) within
  `WorkflowWorkbench`, per `DESIGN.md`.

---

_This spec elaborates one already-locked milestone of the approved program
baseline. It honors the cross-cutting engineering rails and the Codex
graph-execution gate by reference. Implementation proceeds via the writing-plans
skill._
