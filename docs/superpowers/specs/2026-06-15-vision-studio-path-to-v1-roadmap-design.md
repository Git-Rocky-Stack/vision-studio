# Vision Studio - Path-to-v1 Program Roadmap (Design of Record)

> **Status:** Approved baseline (2026-06-15). This is the definitive plan for the
> balance of work after Model Foundry M5. It LOCKS scope boundaries, gates,
> dependencies, sequence, and acceptance criteria for milestones **M6 through
> M10**. It is authored once and revised only by explicit decision - not
> re-brainstormed between sprints.

## Why this document exists

The Model Foundry (Pillar 1) shipped its final milestone, M5, in PR #20. The
remaining work spans three more pillars plus a release-hardening pass. Authoring
each milestone's scope from a cold start *between* sprints bleeds momentum and
re-litigates decisions already implicitly made. This roadmap fixes that: it is a
**rolling-wave baseline**. All milestones are scoped, gated, and sequenced *now*,
definitively. Only the imminent milestone (M6) is elaborated to a full design
spec + implementation plan; each later milestone is elaborated just-in-time from
its already-locked section here, with **no scope re-brainstorm**.

This is rolling-wave / progressive-elaboration planning: firm decisions up front,
detailed implementation just-in-time, because M6's real outcomes would otherwise
invalidate speculative M9/M10 detail written today.

## Where we are (context)

Vision Studio is a local-first AI image/video generation desktop app: Electron 33
+ React 19 + TypeScript + Vite + Tailwind v4, with a Python (FastAPI / PyTorch +
diffusers) backend. Everything runs on the user's GPU by default; no cloud
dependency is required to function. Target license posture: MIT / open source -
"give the world the best, most comprehensive local-first tool possible."

**Pillar 1 - The Model Foundry - is complete (M1-M5):** HF-Hub-native model
search, download (`hf_transfer`, pause/resume/cancel, disk preflight, atomic
verified completion), tri-tier classifier with supply-chain rails, cache +
ComfyUI/A1111 indexing, single-file loading, truthful `HardwareProfile`, exact
VRAM fit math, and `resolve_model_runtime(record, hardware) -> RuntimePlan` -
the **plan contract** every later pillar consumes.

## The six-pillar architecture (from the Foundry design of record)

| Pillar | Name | Owns | Status |
|--------|------|------|--------|
| 1 | **Model Foundry** | What a model needs, whether it runs here, how it loads - *the plan* | Complete (M1-M5) |
| 2 | **Accelerator** | Making the plan run as fast as the silicon allows - *the execution* | M9 |
| 3 | **Routing Fabric** | Where a job runs: Local / OpenRouter / HF Inference | M6 |
| 4 | **Director** | Agentic + AI-assist intelligence: RAG, context optimization | M7 |
| 5 | **Provenance** | Recipe/provenance export beyond pinned repo_id+revision | (post-v1) |
| 6 | **Platform** | Plugins, custom pipelines, model/recipe sharing | (post-v1) |

ComfyUI interop (M8) is cross-cutting - it deepens Pillar 1's import surface and
the existing workflow system rather than introducing a new pillar.

## Cross-cutting engineering rails (enforced every milestone)

These are non-negotiable and apply to **all** of M6-M10. Each milestone's
just-in-time plan inherits them by reference; it does not restate or relax them.

1. **TDD discipline.** Backend: `unittest.TestCase` subclasses (CI runs unittest
   discover); `tests/conftest.py` auto-tags `test_*_api.py` as integration. No
   test loads real weights or hits the network; torch / diffusers / network
   probes are lazily imported and always mocked. Frontend: Vitest (jsdom/happy-dom
   mocks). Write the failing test first; implement to green.
2. **Branch off `main`, never commit to `main` directly.** One feature branch per
   milestone (`feat/<pillar>-m<n>-<slug>`), bite-sized task commits, PR, CI gate,
   `--squash --delete-branch` merge. Confirm `git branch --show-current` in the
   same step as any commit.
3. **CI gates are green before merge.** `pr-gate` runs on Linux; `release` runs on
   Windows (Node `path` APIs are host-specific - keep Windows-drive fixtures
   portable). Playwright visual suite runs on the Windows release path only.
4. **Codex independent second-opinion review at each milestone's defined gate**
   (below). Findings are closed (or explicitly waived with rationale) before the
   milestone is declared done - matching the Foundry's M2/M4/M5 review cadence.
5. **Docs updated in the same PR as the code.** `docs/API_ENDPOINTS.md` and
   `docs/api/openapi.json` are hand-curated - never regenerated. IPC channel names
   stay mirrored between `electron/preload.ts` and the handlers.
6. **Security disciplines.** Tokens/keys arrive per-request, are passed as local
   params, never stored or logged; BYOK keys are OS-keychain encrypted via
   `safeStorage` (`secureStore.ts`). All renderer/remote/model inputs are
   validated and sanitized before touching the filesystem or PIL. No
   `trust_remote_code=True` load path. No safetensors->pickle fallback.
7. **Design system + source hygiene.** `DESIGN.md` is canonical for any UI; no
   emoji in app source; `lucide-react` icons only; Carbon Pro tokens; 8pt grid.
8. **Balanced sprint sizing.** Each milestone decomposes (via the writing-plans
   skill) into bite-sized, independently-verifiable tasks with explicit
   verification steps. A milestone that cannot be balanced into a clean sprint is
   too big and must be re-cut before execution.

## Sequence and rationale

```
M6 Routing Fabric  ->  M7 Director (RAG+Context)  ->  M8 ComfyUI interop  ->  M9 Accelerator  ->  M10 Release hardening
   (substrate)            (rides on routing)            (interop breadth)       (perf, GPU)         (cleanup+docs+publish)
```

- **M6 first** because routing is the substrate the AI-assist features ride on:
  RAG/context (M7) and any hosted-model assist need a uniform provider-selection
  and fallback layer to target. It also completes the two integrations named as
  first priority (HuggingFace, OpenRouter) and is overwhelmingly testable without
  a GPU.
- **M7 next** because the Director's intelligence (retrieval + context assembly)
  consumes both the Foundry's model knowledge and M6's routing to decide *what*
  to run and *with what context*.
- **M8** deepens interop breadth once the core generation/routing/intelligence
  spine is stable; it is the most self-contained and can absorb schedule slack.
- **M9 (Accelerator)** is deliberately deferred to the end: performance work needs
  the feature surface to be final ("until the enhancements are absolute and
  delivered"), and it is the only milestone that requires CUDA silicon - now
  available on the workstation, removing the constraint that shaped M5.
- **M10** is the release gate: it presumes M6-M9 are feature-complete and exists
  to make the whole surface shippable, clean, documented, and published.

---

## M6 - Provider Routing Fabric (Pillar 3)

**Goal.** One coherent routing layer that decides *where* a generation or
prompt-assist job runs - Local backend, OpenRouter, or HuggingFace Inference -
with per-modality provider selection, capability negotiation, local<->hosted
fallback, and cost/latency/usage surfaced to the user.

**Why now.** Completes the two priority integrations and becomes the substrate
later pillars target. Builds directly on what already exists rather than greenfield.

**Current surface it unifies/extends.**
- `electron/services/openRouter.ts` - typed OpenRouter client (hosted still-image
  generation + LLM prompt-assist), runs in the Electron main process.
- `src/features/accounts/providerRouting.ts` - per-account `local | openrouter`
  resolution for still-image and prompt-enhancement routes.
- `electron/ipc-handlers/openRouterImage*.ts`, `generation.ts` - the existing
  OpenRouter image fan-out and job model.
- Foundry `resolve_model_runtime` + catalog - the Local route's capability source.

**In scope.**
- A single routing abstraction (provider x modality -> route) that supersedes the
  ad-hoc `local | openrouter` checks, extended to a third provider: **HuggingFace
  Inference API** (hosted HF models), behind the same BYOK/account model.
- **Capability negotiation:** each route declares what it supports (modalities,
  ControlNet/inpaint, max resolution, video) so the UI never offers an
  unsupported combination and the resolver refuses honestly.
- **Fallback policy:** explicit, user-visible rules (e.g. Local OOM / over-budget
  from the M5 fit verdict -> offer or auto-route to a configured hosted provider),
  recorded like the M5 fallback ladder.
- **Cost / latency / usage surfacing:** unify OpenRouter usage/limit data and add
  per-route estimates so the user sees the tradeoff before committing.
- Provider/key management consolidated through `secureStore.ts` + the accounts
  model; HF token handled with the same encryption + never-to-renderer rules.
- Docs + contracts: `API_ENDPOINTS.md`, `openapi.json`, IPC channel mirror.

**Explicitly out of scope (do not gold-plate).**
- RAG / context optimization (-> M7).
- Performance/quantization of the local route (-> M9).
- Provenance/recipe export of which provider ran a job (-> Pillar 5, post-v1).
- New hosted providers beyond Local / OpenRouter / HF Inference.
- ComfyUI as a route (-> M8 decides if Comfy runtime becomes a routable target).

**Codex gate.** Provider security: BYOK token handling for the new HF route,
remote-response sanitization before any filesystem/PIL touch, no key disclosure to
the renderer, structured-error (not silent-fail) on misconfigured routes.

**Test strategy.** Pure routing/capability/fallback logic unit-tested with mocked
provider clients (no network). IPC handlers tested with happy-dom mocks. Contract
tests assert the route/capability schemas. No real hosted call in CI.

**Acceptance criteria.**
- A user can select Local / OpenRouter / HF Inference per supported modality, and
  unsupported combinations are never offered.
- A Local job that the M5 fit verdict marks over-budget surfaces a defined
  hosted-fallback path (auto or prompted per user preference).
- Usage/cost/latency for the chosen route is shown before commit.
- HF Inference key stored encrypted, never returned to the renderer in plaintext.
- All rails green; Codex provider-security findings closed; docs/contracts updated.

**Open decisions for the M6 just-in-time brainstorm.**
- HF Inference scope: text-to-image only, or also LLM-assist parity with OpenRouter?
- Fallback default: auto-route on over-budget, or always prompt?
- Does OpenRouter video / ControlNet-inpaint enter M6, or stay a documented gap?

---

## M7 - AI Director: RAG + Context Optimization (Pillar 4)

**Goal.** A retrieval + context-assembly layer that makes the app's AI-assist
genuinely informed: retrieve relevant material (the user's asset library, prior
prompts/generations and their outcomes, model-specific prompting knowledge) and
assemble/optimize the context fed to the LLM-assist (and any future agentic
Director), within an explicit token budget.

**Why now.** It is the intelligence layer that rides on M6's routing (it must
target a chosen LLM route) and the Foundry's model knowledge. Net-new, fuzzier,
and high-value - it earns its own dedicated spec.

**Current surface it builds on.**
- `src/components/studio/PromptStudioPanel.tsx`, `PromptEnhancementToolkit.tsx` -
  existing LLM prompt-assist (enhance/expand/cinematic/concise/variations).
- `electron/ipc-handlers/negativePromptHeuristics.ts`, `src/utils/promptTokenizer.ts`
  - existing heuristics + token budgeting.
- OpenRouter/HF LLM routes from M6.

**In scope.**
- A retrieval store (embeddings + index) over user-local content: asset metadata,
  prior prompts and their generation outcomes, and a curated model-prompting
  knowledge base. Local-first - no content leaves the machine for indexing.
- A **context optimizer**: given a task + token budget, select, rank, compress,
  and assemble the most useful context (RAG injection) for the LLM route.
- Injection points into the existing prompt-assist flows; the assist becomes
  retrieval-augmented rather than zero-context.
- Trust-boundary handling: retrieved/model-authored text is data, never trusted
  instructions (prompt-injection defense).

**Explicitly out of scope.**
- Full agentic multi-step orchestration / tool-use Director loop (post-v1 unless
  re-scoped) - M7 delivers retrieval + context, not autonomous orchestration.
- Cloud/shared knowledge bases (-> Pillar 6).
- Routing changes (owned by M6).

**Codex gate.** Trust boundary / prompt-injection: retrieved and model-authored
content cannot escalate to instructions; data-handling and local-index privacy;
no secret/credential leakage into the index.

**Test strategy.** Retrieval ranking, context-budget assembly, and injection
composition unit-tested deterministically (fixed fixtures, mocked embeddings). No
real embedding-model or network call in CI; the embedding backend is lazily
loaded and mocked like the Foundry's torch pattern.

**Acceptance criteria.**
- Prompt-assist demonstrably uses retrieved context (assert injected context in
  the assembled request) within a respected token budget.
- Retrieval is local-first and privacy-preserving; index excludes secrets.
- Prompt-injection test corpus: retrieved adversarial text never alters control
  flow. All rails green; Codex findings closed; docs updated.

**Open decisions for the M7 just-in-time brainstorm.**
- Embedding backend (local model vs. routed) and vector index choice.
- What counts as the "model-prompting knowledge base" and how it is sourced/curated.
- Retrieval scope defaults and user controls.

---

## M8 - ComfyUI Interop Deepening (cross-cutting)

**Goal.** Make Vision Studio a first-class ComfyUI companion: import and run
external Comfy graphs with node round-trip fidelity, and close the runtime parity
gaps (notably video).

**Why now.** Interop breadth is most valuable once the core
generation/routing/intelligence spine is stable; it is the most self-contained
milestone and can absorb schedule slack.

**Current surface it builds on.**
- `src/features/workflow/comfyExport.ts` - WorkflowGraph -> Comfy prompt export.
- Backend optional `ComfyUIClient` (runtime via a running Comfy server on :8188,
  with `DirectGenerator` fallback for images).
- Foundry `library_roots.py` + `index_service.py` - Comfy/A1111 model import/link.

**In scope.**
- **Import:** load arbitrary external ComfyUI graphs into the internal
  WorkflowGraph model (the inverse of `comfyExport`), with fidelity reporting for
  unsupported nodes.
- **Round-trip fidelity:** export->import->export stability for supported node
  sets, with explicit, surfaced limitations.
- **Runtime parity:** close the documented gaps - video-through-Comfy (today
  always `DirectVideoGenerator`, no Comfy fallback) and node coverage parity.
- Decide whether a running ComfyUI server becomes a routable target in the M6
  fabric (deferred decision, resolved here).

**Explicitly out of scope.**
- A full visual node-graph editor rebuild (only what import/round-trip needs).
- Custom-node plugin ecosystem (-> Pillar 6).
- Non-Comfy external tool interop (A1111 runtime, etc.).

**Codex gate.** Graph-execution safety: imported external graphs are untrusted
input - validate/sandbox node parameters; no arbitrary code/path execution via a
malicious graph; same sanitization rails as all renderer/remote input.

**Test strategy.** Import/export round-trip on fixture graphs (deterministic);
unsupported-node fidelity reporting asserted; runtime routing decisions unit-tested
with a mocked Comfy client. No live Comfy server in CI.

**Acceptance criteria.**
- A representative external Comfy graph imports, runs (image and video), and
  round-trips with surfaced fidelity notes.
- Video-through-Comfy works or is an explicit, tested, documented limitation.
- Malicious-graph test corpus cannot trigger unsafe execution. Rails green; Codex
  findings closed; docs updated.

**Open decisions for the M8 just-in-time brainstorm.**
- Node-coverage target set for v1 (which Comfy nodes are first-class).
- Comfy-as-route: in or out of the routing fabric.

---

## M9 - Accelerator + Inference Enhancement (Pillar 2)

**Goal.** Make the Local route run as fast as the silicon allows, consuming M5's
`RuntimePlan` and making each fallback-ladder rung (precision -> offload -> tiling
-> slicing) genuinely fast - measured on real CUDA hardware.

**Why now (last among features).** Performance work needs the feature surface
final, and it is the only milestone requiring CUDA silicon, now available on the
workstation. Deferring it avoids re-optimizing a moving target.

**Current surface it builds on.**
- `backend/foundry/runtime_resolver.py` (`RuntimePlan`), `backend/utils/direct_generator.py`,
  `direct_video_generator.py` - where optimizations are applied today
  (`enable_model_cpu_offload`, `vae_tiling`, `attention_slicing`, optional xformers).
- `backend/tools/calibrate_vram.py` - the CUDA-gated harness pattern to mirror for
  measured speedups.

**In scope.**
- An acceleration layer that, given a `RuntimePlan` + `HardwareProfile`, decides
  and applies optimizations: `torch.compile` / SDPA / fused attention, channels-last,
  quantization where safe, and ladder-rung speedups.
- A **benchmark harness** (CUDA-gated, mirroring `calibrate_vram.py`) producing
  measured numbers; estimated-vs-measured labeling preserved everywhere (M5 rule).
- Feed measured VRAM/perf back into the verified catalog as data edits.

**Explicitly out of scope.**
- TensorRT / vendor-specific compilers beyond what is safe and broadly applicable
  for v1 (candidate for a post-v1 perf pass; record if cut).
- Changing the plan contract or routing (owned by M5/M6).

**Codex gate.** Final perf + correctness sweep: optimizations must not change
output correctness; no silent precision corruption (honor M5's no-fp16 families);
benchmark methodology sound and reproducible.

**Test strategy.** Decision logic (what to apply given plan+hardware) unit-tested
with mocked torch (CI, no GPU). Measured speedups run via the CUDA-gated harness
on the workstation, outside CI, recorded as data.

**Acceptance criteria.**
- Decision layer unit-tested green in CI without a GPU.
- Measured before/after speedups recorded on the workstation for each supported
  family; outputs verified unchanged within tolerance.
- Estimated-vs-measured labels intact. Rails green; Codex findings closed; docs updated.

**Open decisions for the M9 just-in-time brainstorm.**
- Quantization scope/safety per family; `torch.compile` cache/warmup UX.
- Whether TensorRT makes the v1 cut.

---

## M10 - Release Hardening, Cleanup & Documentation

**Goal.** Make the whole surface shippable: universally green, stub-free, clean,
fully documented, and published.

**Why now.** It presumes M6-M9 feature-complete; it is the final gate before a v1
tag.

**In scope.**
- **Universal green gates:** `npm run typecheck`, `npm test`, `npm run build`, full
  backend unittest suite, and CI (Linux pr-gate + Windows release incl. Playwright
  visual) all green.
- **Zero loose ends:** no outstanding TODOs, no incomplete stubs, no unfinished or
  dead modules. Audited and either completed or removed.
- **Repo cleanup:** remove temp files, junk, stale build artifacts, deprecated
  files, and tracked technical debt; verify `.gitignore` coverage.
- **Documentation:** comprehensive user-guide documentation; build documentation
  (`BUNDLING.md`, `WINDOWS_BUILD.md`, `DEPLOYMENT.md` current); release
  documentation (`CHANGELOG.md`, version bump, signing/notes).
- **README refresh + publish to GitHub:** accurate features, install, supported
  GPUs, screenshots; published per the established release process.

**Explicitly out of scope.**
- New features (any feature gap surfaced here is logged for post-v1, not built).
- Post-v1 pillars (5 Provenance, 6 Platform).

**Codex gate.** Final full-surface review before tag: security, supply-chain,
licensing (MIT/open-source posture, third-party attributions), and doc accuracy.

**Test strategy.** The whole suite is the test. Plus a stub/TODO audit pass and a
clean-clone build-from-scratch verification.

**Acceptance criteria.**
- Every gate green on both CI paths; clean-clone build succeeds.
- TODO/stub/dead-module audit returns zero (or explicitly waived-with-issue).
- Docs complete and accurate; README published; v1 tagged per the release process.
- Codex final-sweep findings closed.

**Open decisions for the M10 just-in-time brainstorm.**
- Version number for the public release; screenshot/asset refresh scope.
- Licensing/attribution finalization (LICENSE, NOTICE).

---

## Program-level risks & mitigations

| Risk | Mitigation |
|------|------------|
| Hosted-provider integration leaks keys or trusts remote responses | M6 Codex provider-security gate; `secureStore` encryption; sanitize-before-use rails |
| RAG index leaks secrets or enables prompt injection | M7 trust-boundary gate; index exclusion rules; adversarial-retrieval test corpus |
| Imported Comfy graphs execute unsafely | M8 graph-execution-safety gate; validate/sandbox node params as untrusted input |
| Perf work destabilizes correctness | M9 correctness sweep; outputs verified unchanged within tolerance; honor no-fp16 families |
| Scope creep reintroduces the momentum problem | This baseline is the contract; scope changes are explicit revisions here, not ad-hoc per sprint |
| Windows/Linux CI path divergence | Portable fixtures; both CI paths green before merge (standing rail) |

## Between-sprint workflow (the momentum contract)

When a milestone lands, **do not re-brainstorm scope.** The next milestone's scope,
gates, and acceptance are already locked above. The standing loop is:

1. Open the next milestone's locked section here.
2. Resolve only its listed "open decisions" (a short, bounded just-in-time brainstorm).
3. Elaborate it into a milestone design spec (if needed) + implementation plan via
   the writing-plans skill.
4. Execute the sprint against the cross-cutting rails.
5. Pass the milestone's Codex gate; squash-merge; update the status tracker below.

## Status tracker

| Milestone | Slice | State |
|-----------|-------|-------|
| M1-M5 | Model Foundry (Pillar 1) | Complete |
| **M6** | Provider Routing Fabric | **Next - elaborating to design spec + plan** |
| M7 | Director: RAG + Context | Baselined |
| M8 | ComfyUI Interop Deepening | Baselined |
| M9 | Accelerator + Inference | Baselined |
| M10 | Release Hardening + Docs | Baselined |

---

_This roadmap is the approved program baseline. Per-milestone elaboration proceeds
via the writing-plans skill, honoring the cross-cutting rails and Codex gates
above. Revisions to scope are made here, explicitly, or not at all._
