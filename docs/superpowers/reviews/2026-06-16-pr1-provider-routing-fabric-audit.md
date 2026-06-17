# PR1 Provider Routing Fabric Audit - 2026-06-16

## Scope

Reviewed branch `feat/routing-m6-provider-routing-fabric` against `origin/main` as the PR1 gate before PR2. The audit focused on the changed routing fabric, HuggingFace BYOK integration, Electron IPC boundaries, account/settings persistence, generation UI behavior, job lifecycle handling, tests, and release-readiness validation.

PR delta at review time:

- 40 files changed.
- Approximately 6,583 insertions and 449 deletions.
- Primary code surfaces: `electron/services`, `electron/ipc-handlers`, `shared`, `src/pages`, and `src/features/routing`.

## Gate Decision

**Do not proceed to PR2 yet.**

The core direction is solid, and the local/shared resolver design is promising, but PR1 is not merge-ready. There is one direct CI blocker and several cross-surface integration gaps that would create false product behavior if PR2 builds on top of this branch.

## Blocking Findings

### 1. Lint Fails On The PR Branch

**Severity:** Blocking  
**Category:** Build / CI hygiene  
**Location:** `src/pages/GeneratePanel.tsx:656`

`npm run lint` fails with:

```text
C:\vision-studio\src\pages\GeneratePanel.tsx
  656:11  error  The value assigned to 'fit' is not used in subsequent statements  no-useless-assignment
```

The issue is caused by initializing `fit` to `null`, then always assigning it again inside the `try` or `catch` before the resolver consumes it.

**Why this matters:** This blocks the normal quality gate even though typecheck and tests pass.

**Recommendation:** Compute `fit` through a helper or assign from an async IIFE so there is no unused initial assignment.

### 2. HuggingFace Prompt Routing Is Exposed But Not Wired

**Severity:** Blocking  
**Category:** Functional correctness / UX contract  
**Locations:**

- `src/pages/SettingsPanel.tsx:992`
- `electron/ipc-handlers/generation.ts:288`
- `electron/ipc-handlers/generation.ts:332`
- `docs/API_ENDPOINTS.md:1065`

Settings allows the user to select `promptEnhancementProvider: 'huggingface'`, and the docs state that prompt enhancement and negative-prompt suggestion use the account's `huggingFaceModel`.

The Electron IPC implementation only checks for OpenRouter:

- `generation:enhance-prompt` branches on `promptEnhancementProvider === 'openrouter'`; HuggingFace falls through to the local backend.
- `generation:suggest-negative-prompt` branches on `promptEnhancementProvider === 'openrouter'`; HuggingFace falls through to local heuristics.

**Why this matters:** A user can select HuggingFace for prompt tools and see Settings accept it, but the runtime does not honor the selection. That breaks the central PR1 promise that routing is authoritative and provider-backed.

**Recommendation:** Add HuggingFace branches in both IPC handlers using `huggingFaceService.enhancePrompt` and `huggingFaceService.suggestNegativePrompt`, with token/model validation and renderer-safe error messages. Add tests proving the selected HF prompt provider does not fall through to local behavior.

### 3. HuggingFace Jobs Are Missing From `generation:list-jobs`

**Severity:** Blocking  
**Category:** Job lifecycle / state visibility  
**Location:** `electron/ipc-handlers/generation.ts:636`

`generation:get-status` and `generation:cancel` route HuggingFace job IDs correctly, but `generation:list-jobs` only merges `openRouterImageJobStore.values()` with backend jobs.

Current behavior:

- OpenRouter hosted jobs appear in job lists.
- HuggingFace hosted jobs are tracked in `huggingFaceImageJobStore`.
- `generation:list-jobs` omits `huggingFaceImageJobStore.values()`.

**Why this matters:** HF generations can complete, but job history and queue surfaces cannot reliably show them. This is especially risky because the in-memory store is the only source for these hosted jobs.

**Recommendation:** Merge all local hosted job stores before backend jobs, for example `mergeJobsByCreatedAtDesc([...openRouterJobs, ...huggingFaceJobs], backendJobs, limit)`, preserving the existing status filter and offline fallback behavior. Add a regression test that creates both OpenRouter and HuggingFace jobs and verifies both appear in `list-jobs`.

## High Priority Findings

### 4. Batch Generation Ignores HuggingFace As An Image Provider

**Severity:** High  
**Category:** Functional correctness / cross-surface routing  
**Locations:**

- `src/pages/BatchPanel.tsx:165`
- `src/pages/BatchPanel.tsx:210`
- `electron/ipc-handlers/generation.ts:457`

The PR wires HuggingFace for single still-image generation, but batch generation only recognizes OpenRouter as a hosted provider. If the active account is set to HuggingFace:

- The batch UI does not show a HuggingFace hosted route.
- Offline validation still tells users to switch to OpenRouter.
- Online batch submission falls through to the local backend.
- The Electron batch IPC handler also branches only for OpenRouter before falling back to local backend submission.

**Why this matters:** Provider routing becomes inconsistent across first-class generation surfaces. A user can select HuggingFace for still images, then run a batch and silently get local backend behavior.

**Recommendation:** Either explicitly block HuggingFace batch routing with a clear product message for PR1, or wire it equivalently to OpenRouter by creating HuggingFace image jobs per prompt. The stronger fix is to generalize hosted batch dispatch by provider.

### 5. HuggingFace Capability Registry Overstates PR1 Support

**Severity:** High  
**Category:** Architecture / source-of-truth integrity  
**Location:** `shared/providerRouting.ts:53`

The shared capability registry marks HuggingFace as supporting:

- `controlNet: true`
- `inpaint: true`
- `video: true`

But PR1 runtime behavior and docs state that the HuggingFace still-image route is prompt-only and that ControlNet, inpaint, mask, reference-image, and video support land later.

**Why this matters:** The registry is intended to be the shared source of truth for renderer UX gating and main-process dispatch. If it claims capabilities that the dispatch layer rejects or does not implement yet, future PR2 routing work may offer impossible paths.

**Recommendation:** Split capability truth into `advertised/provider potential` versus `implemented in this build`, or set PR1 implemented capabilities accurately. The resolver should gate on what the app can execute today, not what a provider ecosystem might support in theory.

### 6. HuggingFace Image Endpoint Needs Proof Or Replacement With Documented API

**Severity:** High  
**Category:** Platform compatibility / external API correctness  
**Location:** `electron/services/huggingfaceInference.ts:367`

The new client posts image generation requests to:

```text
https://huggingface.co/api/inference-proxy/models/{model}
```

Current HuggingFace documentation for text-to-image Inference Providers points to the router / `hf-inference` provider flow and documents text-to-image requests as `inputs` plus optional `parameters`, returning image bytes.

References checked during review:

- https://huggingface.co/docs/inference-providers/tasks/text-to-image
- https://huggingface.co/docs/inference-providers/providers/hf-inference

**Why this matters:** If this endpoint is internal, deprecated, or unavailable for BYOK tokens in production, the PR can pass unit tests but fail every real HF image generation request.

**Recommendation:** Either prove this endpoint with a live integration smoke using a real token and document why it is the correct endpoint, or move the image route to the documented HF Inference Providers endpoint. Add one transport-level test that asserts the exact URL expected for the documented route.

## Medium Priority Findings

### 7. Account Routing Helpers Still Model Only Local/OpenRouter

**Severity:** Medium  
**Category:** Maintainability / stale abstractions  
**Location:** `src/features/accounts/providerRouting.ts:3`

`HostedProvider` is still typed as `'local' | 'openrouter'`, and the helper functions treat any non-OpenRouter provider as local. That means HuggingFace-aware screens that reuse these helpers will misclassify HF routes.

**Recommendation:** Update these helpers to consume the shared `ProviderId` type or replace them with the new shared resolver adapter.

### 8. HuggingFace Service Has No Public IPC Namespace For Verification Or Model Catalog

**Severity:** Medium  
**Category:** UX completeness / dead service surface  
**Locations:**

- `electron/services/huggingfaceInference.ts`
- `electron/services/mainIpc.ts:301`
- `electron/preload.ts:385`
- `src/pages/SettingsPanel.tsx:1387`

The HF service implements `getKeyInfo`, `listImageModels`, and `listTextModels`, but the registered IPC/preload surface only exposes token storage/clearing. Settings uses hardcoded model options and cannot verify/display HF token identity.

**Recommendation:** Either add `huggingface:test-connection`, `huggingface:get-key-info`, `huggingface:list-models`, and `huggingface:list-image-models`, or remove/defer the service methods until the UI can consume them. For PR1, token verification would materially improve confidence.

## Positive Observations

- Shared pure resolver direction is good: `shared/resolveRoute.ts` is dependency-free and covered by focused unit tests.
- Secret handling is moving in the right direction: HF tokens are stored through `safeStorage`, and the image job records do not persist raw tokens.
- Hosted job cancellation and `get-status` are correctly generalized for HuggingFace job IDs.
- Image payload sanitization checks magic bytes before persistence.
- The PR includes meaningful focused tests across routing, transport retry, HF inference parsing, and job persistence.
- Production dependency audit is clean after the `form-data` transitive patch.

## Validation Results

Commands run from `C:\vision-studio`:

```text
npm run typecheck
```

Result: passed.

```text
npm test -- shared/providerRouting.test.ts shared/resolveRoute.test.ts src/features/routing/buildRouteResolverInput.test.ts electron/services/huggingfaceInference.test.ts electron/services/hostedHttp.test.ts electron/ipc-handlers/runHuggingFaceImageJob.test.ts electron/ipc-handlers/hostedImageRouting.test.ts src/components/generate/OverBudgetFallbackDialog.test.tsx
```

Result: passed, 8 files / 40 tests.

```text
npm test -- src/pages/GeneratePanel.test.tsx src/pages/SettingsPanel.test.tsx src/features/accounts/providerRouting.test.ts electron/services/userAccounts.test.ts electron/services/settings.test.ts
```

Result: passed, 5 files / 28 tests.

```text
npm test
```

Result: passed, 152 files / 1315 tests.

```text
npm run audit:prod
```

Result: passed, 0 high production vulnerabilities.

```text
npm run lint
```

Result: failed on `src/pages/GeneratePanel.tsx:656`.

Note: `npm test -- --runInBand` was attempted first out of habit from Jest workflows, but Vitest in this repo does not support that flag. It failed before running tests and was replaced with the repo's actual `npm test` command.

## PR2 Readiness Checklist

Before PR2 starts, PR1 should:

- Pass `npm run lint`.
- Route HuggingFace prompt enhancement and negative prompt suggestions through the HF service when selected.
- Include HuggingFace local hosted jobs in `generation:list-jobs`.
- Decide and enforce HuggingFace batch behavior: implemented or explicitly blocked.
- Make the capability registry reflect implemented runtime truth.
- Validate or replace the HuggingFace image generation endpoint against official docs and at least one live smoke path.
- Add integration tests for the above cross-surface routing behavior, not only pure resolver tests.

