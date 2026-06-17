# Vision Studio - M6 Provider Routing Fabric (Design Spec)

> **Status:** Approved design (2026-06-16). Elaborates the M6 section of the
> Path-to-v1 Program Roadmap
> (`docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md`).
> This spec is the just-in-time elaboration of an already-locked milestone; it
> does **not** re-open program scope. It inherits the program's cross-cutting
> engineering rails by reference and resolves M6's three open decisions. Next
> artifact: the implementation plan via the writing-plans skill.

## 1. Context and goal

Pillar 3 (Routing Fabric). **Goal:** one coherent routing layer that decides
*where* a generation or prompt-assist job runs - Local backend, OpenRouter, or
HuggingFace Inference - with per-modality provider selection, honest capability
negotiation, local<->hosted fallback, and cost/latency/usage surfaced before the
user commits.

**Current surface this unifies (verified against the code):**

- `src/features/accounts/providerRouting.ts` - two ad-hoc resolvers
  (`resolveStillImageRoute`, `resolvePromptEnhancementRoute`) over a
  `HostedProvider = 'local' | 'openrouter'` union; six call sites.
- `electron/ipc-handlers/generation.ts:122` - the real dispatch fork today:
  OpenRouter -> main-process `openrouter-image-<uuid>` job via
  `dispatchOpenRouterImageJob`; else -> local Python REST (`/api/generate/image`).
- `electron/ipc-handlers/openRouterImageRouting.ts` - `OPENROUTER_JOB_PREFIX`,
  `isOpenRouterJobId`, and `hasUnsupportedOpenRouterImageInputs` (today this is
  where ControlNet/mask/reference inputs are rejected for OpenRouter).
- `electron/services/openRouter.ts` - typed OpenRouter client (image + LLM
  prompt-assist), main process; per-key semaphore, exponential backoff,
  `Retry-After`, abort handling, 120s timeout. The template the HF client mirrors.
- `electron/services/userAccounts.ts` - per-account encrypted secrets
  (`secrets[accountId].openRouterApiKey` via `safeStorage`), provider preferences.
- `electron/services/secureStore.ts` - `safeStorage`-backed encryption used for
  all BYOK secrets.
- `electron/services/settings.ts` - `AppSettings` (no over-budget setting today).
- Foundry `resolve_model_runtime` -> `RuntimePlan.fit in {fits,
  fits-with-offload, over-budget, cpu-only}`, already surfaced to the renderer
  via `models:resolveRuntime` and rendered in
  `src/components/generate/PreflightFooter.tsx`. `over-budget` is the fallback
  trigger.
- HuggingFace today is **Hub-only** (search/download/cache/classifier); the HF
  token lives only in main-process memory as an `X-HF-Token` header. There is
  **no** existing HF *Inference* code. M6's HF Inference route is net-new.

## 2. Decisions locked for M6

1. **HF Inference scope:** full parity with OpenRouter - hosted text-to-image
   **and** LLM prompt-assist (enhance / expand / negative-suggest / variations).
2. **Over-budget fallback default:** always **prompt** the user; plus a new
   user setting `autoRouteOnOverBudget` that, when enabled, silently routes a
   Local over-budget job to a configured hosted fallback provider.
3. **Video + ControlNet/inpaint:** first-class **routable** modalities. The
   capability matrix expresses the providers' real abilities: Local and HF
   Inference can run them; OpenRouter honestly declares it cannot, and the UI
   never offers the impossible combination.
4. **Architecture:** Approach A - a declarative provider x modality capability
   registry plus a pure `resolveRoute` resolver that supersedes the ad-hoc
   checks. (Rejected: B per-provider adapter objects - heavier, leaks dispatch
   into clients; C bolt `'huggingface'` onto the existing checks - the ad-hoc
   debt the roadmap mandates removing.)

## 3. Architecture: one authority, two readers

A single **pure resolver** is the decision authority. Two consumers read it:

```
                +-------------------------------------------+
                |  routing/  (shared, dependency-free)      |
                |   - capabilities  (declarative registry)  |
                |   - resolveRoute  (pure function)         |
                +---------------+-------------+-------------+
   reads (UX gating) <----------+             +----------> reads (authoritative)
   Renderer: provider picker,            Main: generation.ts dispatch switch
   modality controls, fallback modal     (re-resolves; refuses impossible routes)
```

- The **renderer** reads the registry to disable/hide impossible combinations -
  a UX convenience, not a trust boundary.
- The **main process** re-runs the resolver at dispatch and is the
  **authoritative guard**. It never trusts the renderer to have filtered
  correctly: a renderer-supplied impossible or unconfigured route is refused
  with a structured error, never dispatched. This is a security property.
- The resolver is **pure** (no I/O, no network), so the entire
  routing / capability / fallback surface is unit-testable deterministically
  with no world-mocking.

**Shared-module placement.** The registry and resolver must be importable by
both `electron/` (authoritative) and `src/` (UX gating). Exact physical path is
constrained by the Vite-renderer vs. electron-main build boundary and is pinned
during plan-writing (candidate: a dependency-free module under `electron/shared/`
re-exported to `src/`, or a `src/`-importable pure module consumed by main).
The design commitment is invariant regardless of path: **one resolver, two
readers, main is authoritative.**

## 4. Capability registry (the honest matrix)

```ts
type ProviderId = 'local' | 'openrouter' | 'huggingface';

interface ProviderCapabilities {
  stillImage:   boolean;
  controlNet:   boolean;
  inpaint:      boolean;
  video:        boolean;
  llmAssist:    boolean;   // enhance / expand / negative-suggest / variations
  reportsUsage: boolean;   // can cost/quota be surfaced for this provider?
  maxResolution: { width: number; height: number } | null;
}

const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  local:       { stillImage:true, controlNet:true,  inpaint:true,  video:true,  llmAssist:true,  reportsUsage:false, maxResolution:null },
  openrouter:  { stillImage:true, controlNet:false, inpaint:false, video:false, llmAssist:true,  reportsUsage:true,  maxResolution:null },
  huggingface: { stillImage:true, controlNet:true,  inpaint:true,  video:true,  llmAssist:true,  reportsUsage:true,  maxResolution:null },
};
```

- This is the single place the asymmetry ("OpenRouter has no video/ControlNet")
  is encoded. A **contract test** asserts the matrix so it cannot silently drift
  (pattern mirrors `carbon-pro-tokens.test.ts`).
- `local.llmAssist` is the existing **heuristic** enhancer (no model). It is a
  real capability but is labeled heuristic-backed to distinguish it from
  OpenRouter / HF true-LLM assist; the UI must not imply a model where there is
  none.
- `maxResolution` is `null` where it is model-driven (resolved from the selected
  model rather than a fixed provider ceiling); the field exists so the resolver
  and UI can refuse over-ceiling requests once a model is chosen.

## 5. Resolver contract

```ts
type FitVerdict = 'fits' | 'fits-with-offload' | 'over-budget' | 'cpu-only';

type RequestModality =
  | 'still-image' | 'controlnet' | 'inpaint' | 'video' | 'llm-assist';

type RouteDecision =
  | { ok: true;  provider: ProviderId; reason: 'explicit' | 'fallback-auto' }
  | { ok: false; kind: 'unsupported';     message: string }
  | { ok: false; kind: 'unconfigured';    message: string }
  | { ok: false; kind: 'fallback-prompt'; candidates: ProviderId[] };

function resolveRoute(input: {
  modality: RequestModality;       // derived from params: control_image->controlnet,
                                   // mask->inpaint, video request->video, else still-image/llm
  requested: ProviderId;           // per-modality user preference
  account: UserAccountSummary | null;
  settings: { autoRouteOnOverBudget: boolean };
  fit?: FitVerdict | null;         // RuntimePlan.fit; only meaningful for the local route
  fallbackProvider?: ProviderId | null;
}): RouteDecision
```

**Decision order (deterministic):**

1. **Capability.** If `requested` cannot do `modality` -> `unsupported`. (The UI
   should have prevented this; the resolver refuses honestly as defense.)
2. **Configuration.** Hosted route without a stored key or a selected model ->
   `unconfigured` (structured, actionable message).
3. **Fit / fallback.** If `requested === 'local'` and `fit === 'over-budget'`:
   - if `autoRouteOnOverBudget` **and** a capable + configured hosted
     `fallbackProvider` exists -> `{ ok:true, provider:fallbackProvider,
     reason:'fallback-auto' }`;
   - else -> `{ ok:false, kind:'fallback-prompt', candidates:[capable+configured
     hosted providers] }`.
4. **Otherwise** -> `{ ok:true, provider:requested, reason:'explicit' }`.

`cpu-only` is treated as a runnable-but-discouraged local state (not an
auto-fallback trigger) - parity with the existing PreflightFooter semantics;
it does not force a hosted route.

## 6. HuggingFace Inference client - `electron/services/huggingfaceInference.ts`

A near-mirror of `openRouter.ts`, in the **main process**, so the local-Python
boundary stays clean and hosted secrets never reach the renderer.

```ts
createHuggingFaceInferenceService(opts?) => {
  getKeyInfo,
  listImageModels, listTextModels, listVideoModels,
  enhancePrompt, suggestNegativePrompt,
  generateImage, generateVideo, generateControlNet, generateInpaint,
}
```

- **LLM-assist parity is cheap:** HF's router exposes an OpenAI-compatible
  `chat/completions` surface (`router.huggingface.co/v1/...`), so `enhancePrompt`
  and `suggestNegativePrompt` reuse OpenRouter's exact request and JSON-response
  shape (system message + `response_format: json_object`).
- **Resilience parity:** per-key semaphore, exponential backoff with
  `Retry-After`, abort handling, bounded timeout - copied from the OpenRouter
  client's proven behavior.
- **Normalization:** HF returns raw image bytes / a video blob; the client
  normalizes to the same `{ dataUrl, mimeType }` (image) and saved-file-path
  (video) shapes the rest of the app already consumes. Remote bytes are
  **validated and sanitized before any PIL / filesystem touch**.
- **Secret discipline:** the token is read in main from the encrypted store per
  request, passed as a local parameter, **never logged, never returned to the
  renderer in plaintext**.

## 7. Dispatch integration - `generation.ts`

The inline `if (openrouter)` fork at `generation.ts:122` becomes a thin switch on
`resolveRoute(...).provider`:

- `local` -> existing Python REST paths (image, ControlNet, inpaint, video -
  all already exist in the backend).
- `openrouter` -> existing `dispatchOpenRouterImageJob` + prompt-assist handlers.
- `huggingface` -> new `dispatchHuggingFaceJob` with a
  `huggingface-<modality>-<uuid>` job prefix and a main-process job store
  mirroring `openRouterImageJobStore`.

`isOpenRouterJobId` generalizes to a provider-discriminating helper
(`routedJobProvider(jobId): ProviderId | null`) so `generation:get-status`
routes polling to the right store. The switch re-resolves and returns a
**structured** `unsupported` / `unconfigured` error rather than ever dispatching
an impossible job. `hasUnsupportedOpenRouterImageInputs` is subsumed by the
capability matrix (OpenRouter's `controlNet:false / inpaint:false / video:false`).

## 8. Over-budget fallback policy and UX

The renderer already holds `fit` at preflight (`PreflightFooter`). On a Local
job with `fit === 'over-budget'`:

- **auto on + fallback configured** -> route to the fallback provider silently
  (`reason:'fallback-auto'`), surfaced as a small "routed to {provider}
  (over budget)" note for transparency.
- **otherwise** -> a pre-generation modal:
  *Run locally anyway (likely OOM)* / *Route to {capable, configured hosted}* /
  *Cancel*. The chosen provider re-dispatches.

`AppSettings.autoRouteOnOverBudget` defaults to **false** (the always-prompt
default). The fallback **target** is a per-account `fallbackProvider`
preference. The decision is recorded the way the M5 fallback ladder is recorded -
visible, not silent.

## 9. Accounts and settings model

- `UserAccountRecord.preferences`: add `'huggingface'` to the
  `promptEnhancementProvider` and `imageGenerationProvider` unions; add
  `huggingFaceImageModel`, `huggingFaceVideoModel`, `huggingFaceModel` (LLM), and
  `fallbackProvider?: ProviderId | null`.
- `UserAccountRecord.huggingFace: { tokenStored, keyLabel, lastValidatedAt }` -
  mirrors the existing `openRouter` block.
- `secrets[accountId].huggingFaceToken` - encrypted via `safeStorage`, the same
  path as the OpenRouter key; never returned to the renderer in plaintext.
- New IPC: `accounts:set-huggingface-token`, `accounts:clear-huggingface-token`;
  `accounts.update` accepts the new fields; `settings.get` / `settings.update`
  carry `autoRouteOnOverBudget`. All channel names mirrored in
  `electron/preload.ts` and the handlers, and reflected in `src/types/electron.d.ts`.
- **Optional consolidation (flagged, not built as gold-plating):** the stored HF
  token may seed the existing session-scoped Hub `X-HF-Token` flow. M6 owns
  Inference-token storage only; Hub unification remains a documented, optional
  nicety so scope does not creep.

## 10. Cost / latency / usage surfacing

Normalize `OpenRouterKeyInfo` usage/limit data and HF quota into a single shape:

```ts
interface RouteUsageInfo {
  provider: ProviderId;
  remaining?: number | null;
  estimatedCost?: number | null;
  currency?: string | null;
  latencyHint?: string | null;   // coarse, honestly labeled
}
```

Shown **before commit** in the provider picker / preflight (e.g.,
`OpenRouter - ~$0.003 - ~4s`). Local cost is `$0`; local latency is
fit-dependent. Estimated-vs-actual labeling is preserved everywhere (the M5
honesty rule). Cost estimates derive from model pricing where the provider
exposes it (OpenRouter `pricing`; HF per-provider pricing where available, else
"usage-metered").

## 11. Security and error handling (Codex gate)

Codex gate focus (from the roadmap): **provider security**.

- HF BYOK token handling (encrypt at rest, per-request use, never logged, never
  to renderer).
- Remote-response sanitization before any filesystem / PIL touch.
- No key disclosure to the renderer in any path (including error messages -
  `toSafeRendererError` strips provider internals).
- Structured error, never silent-fail, on a misconfigured route
  (`unsupported` / `unconfigured` are explicit, actionable results).
- No `trust_remote_code=True`; no safetensors->pickle fallback (unchanged rails).
- All renderer/remote inputs validated and sanitized before use.

## 12. Test strategy

No real hosted call in CI; network and the HF client transport are mocked.

- **Resolver:** exhaustive truth-table - every `provider x modality x fit x
  autoRoute x configured` permutation asserts the exact `RouteDecision`.
- **Registry:** contract test asserting the capability matrix; a test that the
  UI gating derives from the registry (no hand-duplicated capability logic).
- **HF client:** mocked HTTP transport - success, retry/backoff, `Retry-After`,
  abort, response sanitization, and "token never appears in logs/errors".
- **IPC handlers:** happy-dom mocks; `huggingface-*` job-prefix discrimination;
  status polling routes to the correct store.
- **Accounts/settings:** encryption round-trip with mocked `safeStorage`;
  assertion that the HF token never leaves main in plaintext;
  `autoRouteOnOverBudget` persistence.
- **Security:** the main resolver refuses a renderer-supplied impossible or
  unconfigured route (defense-in-depth assertion).

Backend follows the rail: `unittest.TestCase`, lazily-imported and mocked
torch/diffusers/network; frontend Vitest. Failing test first, implement to green.

## 13. Docs and contracts

- `docs/API_ENDPOINTS.md` - new HuggingFace Inference section mirroring the
  OpenRouter section (routes, job model, limitations); document the routing /
  fallback contract and the capability matrix.
- IPC channel names mirrored across `electron/preload.ts`, the handlers, and
  `src/types/electron.d.ts`.
- `docs/api/openapi.json` - touched only if a backend REST endpoint changes
  (hosted routing is main-process; backend image/controlnet/inpaint/video
  endpoints already exist). Hand-curated, never regenerated.

## 14. Component decomposition (balanced sprint units)

1. `routing/capabilities` - pure declarative registry (data) + contract test.
2. `routing/resolveRoute` - pure resolver (logic) + truth-table tests.
3. `electron/services/huggingfaceInference.ts` - HF client, mirrors OpenRouter.
4. Accounts + settings persistence - HF token, HF model prefs,
   `fallbackProvider`, `autoRouteOnOverBudget`, IPC + types.
5. `generation.ts` dispatch switch + HF job store/runner + status routing.
6. UI - provider picker capability-gating, over-budget fallback modal, usage
   surfacing.
7. Docs + contracts.

Each unit is independently testable with a clear interface and explicit
verification - a balanced sprint per the rails.

## 15. Out of scope (restated from the baseline)

- RAG / context optimization (-> M7).
- Performance / quantization of the local route (-> M9).
- Provenance/recipe export of which provider ran a job (-> Pillar 5, post-v1).
- New hosted providers beyond Local / OpenRouter / HF Inference.
- ComfyUI as a route (-> M8 decides if Comfy runtime becomes a routable target).

## 16. Acceptance criteria

- A user can select Local / OpenRouter / HF Inference per supported modality, and
  unsupported combinations are never offered (UI) and refused (main resolver).
- A Local job the M5 fit verdict marks `over-budget` surfaces a defined
  hosted-fallback path: auto when `autoRouteOnOverBudget` and a capable
  configured fallback exist, otherwise a prompt.
- Video and ControlNet/inpaint are routable to HF Inference and Local; OpenRouter
  declares them unsupported and they never appear as an OpenRouter option.
- Usage / cost / latency for the chosen route is shown before commit.
- The HF Inference token is stored encrypted and never returned to the renderer
  in plaintext.
- All cross-cutting rails green; Codex provider-security findings closed; docs and
  contracts updated in the same PR.

## 17. Items deliberately deferred to plan-time

These are implementation details, not open scope - resolved while writing the
plan, not re-brainstormed:

- Exact shared-module physical path (build-boundary dependent; principle fixed in
  Section 3).
- The concrete HF Inference endpoint(s) per modality and the default model lists
  per route (serverless vs. router-provider surface).
- Whether the optional Hub-token consolidation (Section 9) is taken now or left
  documented.

---

_This spec elaborates one already-locked milestone of the approved program
baseline. It honors the cross-cutting engineering rails and the Codex
provider-security gate by reference. Implementation proceeds via the
writing-plans skill._
