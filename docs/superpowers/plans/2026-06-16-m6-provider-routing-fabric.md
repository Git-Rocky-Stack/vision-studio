# M6 Provider Routing Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One coherent routing layer that decides where a generation or prompt-assist job runs (Local / OpenRouter / HuggingFace Inference), with an honest provider x modality capability matrix, local->hosted over-budget fallback, BYOK HF Inference at OpenRouter parity (image + LLM), hosted video + ControlNet + inpaint, and pre-commit usage surfacing.

**Architecture:** A single pure resolver in a shared, dependency-free `shared/` module is the decision authority. The renderer reads it for UX gating (gray out impossible combos, drive the fallback prompt); the Electron main process re-runs it at dispatch as the authoritative guard and refuses impossible/unconfigured routes. A new main-process `huggingfaceInference.ts` mirrors the existing `openRouter.ts` client (shared transport helpers), with `huggingface-*` job IDs that mirror the OpenRouter job model. No backend Python route changes — hosted routing runs entirely in main.

**Tech Stack:** TypeScript, Electron 33 (main + preload), React 19 + Tailwind v4 (renderer), Vitest (node + jsdom projects), axios (HTTP), `safeStorage` (BYOK encryption), framer-motion (dialog). Design system: Carbon Pro (`DESIGN.md`).

---

## Cross-cutting rails (inherited; do not relax)

From `docs/superpowers/specs/2026-06-15-vision-studio-path-to-v1-roadmap-design.md`:

- **TDD:** failing test first, implement to green. Frontend/electron use Vitest. No real network/hosted call in any test — `axios` is injected and mocked.
- **Branch:** work on `feat/routing-m6-provider-routing-fabric` (already created off `main`). Bite-sized task commits. Never commit to `main`.
- **Commits (Windows):** the husky pre-commit hook runs lint-staged (full Vitest + typecheck on staged `.ts/.tsx`). Commit via the Bash tool; before committing run `export PATH="/c/Program Files/nodejs:$PATH"` so the hook's `npx` resolves. Confirm `git branch --show-current` in the same step as the commit.
- **Green gates before merge:** `npm run typecheck` (runs `tsconfig.app.json` + `tsconfig.electron.json` + `tsconfig.node.json`), `npm test`, `npm run build`.
- **Security (Codex gate):** HF token encrypted at rest, used per-request, never logged, never returned to the renderer in plaintext; remote responses sanitized before any filesystem/PIL touch; structured errors (never silent-fail) on misconfigured routes; renderer never trusted as the authority.
- **Docs in the same PR:** `docs/API_ENDPOINTS.md` hand-curated; IPC channels mirrored across `electron/preload.ts`, `electron/services/mainIpc.ts`, and `src/types/electron.d.ts`.
- **Design system:** Carbon Pro tokens, `lucide-react` icons, no emoji, 8pt grid.

## Spec reference

Implements `docs/superpowers/specs/2026-06-16-m6-provider-routing-fabric-design.md`. Section numbers (S1-S17) below refer to that spec.

## Reality notes (verified in the codebase — honor these)

- There are **no Zustand slices** for accounts or settings. The renderer calls `window.electron.accounts.*` / `window.electron.settings.*` directly. Provider UI lives in `src/pages/SettingsPanel.tsx`.
- `settings:get` / `settings:update` (in `electron/services/mainIpc.ts`) **spread** the settings object, so a new `AppSettings` field flows through once added to the interface + `DEFAULT_SETTINGS` (in `electron/services/outputRoots.ts`).
- There is **no dedicated local inpaint REST endpoint**. Local inpaint/ControlNet ride existing local paths (`/api/v1/controlnet/generate` for ControlNet; inpaint via canvas control layers feeding `/api/generate/image`). HF adds hosted equivalents in its own client. M6 changes **no backend Python route**, so `docs/api/openapi.json` is not edited.
- `docs/api/openapi.json` is a hand-curated snapshot; the runtime FastAPI spec is the source of truth. No edit needed (no backend route added).
- Electron (`tsconfig.electron.json` -> `include: ["electron"]`, no `@` alias) and renderer (`tsconfig.app.json` -> `include: ["src"]`, `@/*` alias) are disjoint TS programs. The shared module needs both `include`s widened.

## File structure

**Create:**
- `shared/providerRouting.ts` - `ProviderId`, `RequestModality`, `FitVerdict`, `ProviderCapabilities`, `PROVIDER_CAPABILITIES`, `providerSupports`. Pure, no node/DOM imports.
- `shared/providerRouting.test.ts` - capability-matrix contract test.
- `shared/resolveRoute.ts` - `RouteDecision`, `RouteResolverInput`, `resolveRoute`. Pure.
- `shared/resolveRoute.test.ts` - resolver truth-table.
- `electron/services/hostedHttp.ts` - reusable transport: per-key concurrency semaphore, retry/backoff, `isRetryableError`, `getRetryAfterMs`, `delay`.
- `electron/services/hostedHttp.test.ts`.
- `electron/services/huggingfaceInference.ts` - HF Inference client (mirrors `openRouter.ts`).
- `electron/services/huggingfaceInference.test.ts`.
- `electron/ipc-handlers/huggingfaceImageJobs.ts` - HF image job store (mirrors `openRouterImageJobs.ts`).
- `electron/ipc-handlers/runHuggingFaceImageJob.ts` - HF image job runner.
- `electron/ipc-handlers/runHuggingFaceImageJob.test.ts`.
- `electron/ipc-handlers/hostedImageRouting.ts` - `routedJobProvider`, HF job prefix, generalized predicates.
- `electron/ipc-handlers/hostedImageRouting.test.ts`.
- `src/features/routing/buildRouteResolverInput.ts` - renderer adapter: account -> `RouteResolverInput` + `configuredHosted`.
- `src/features/routing/buildRouteResolverInput.test.ts`.
- `src/components/generate/OverBudgetFallbackDialog.tsx` - 3-action fallback modal (Carbon Pro, mirrors `ConfirmDialog`).
- `src/components/generate/OverBudgetFallbackDialog.test.tsx`.

**Modify:**
- `tsconfig.electron.json`, `tsconfig.app.json`, `vitest.config.ts` - include `shared/`.
- `electron/services/settings.ts` (+ `electron/services/outputRoots.ts` `DEFAULT_SETTINGS`) - add `autoRouteOnOverBudget`.
- `electron/services/userAccounts.ts` - `'huggingface'` provider, HF prefs + `fallbackProvider`, `huggingFace` block, `huggingFaceToken` secret, HF key methods.
- `electron/services/userAccounts.test.ts` - HF coverage.
- `electron/services/mainIpc.ts` - HF token IPC + extended `accounts:update` patch.
- `electron/preload.ts` - HF token channels.
- `src/types/electron.d.ts` - HF account fields + settings field + new channels.
- `electron/ipc-handlers/generation.ts` - resolver-driven dispatch switch + HF branch + generalized status/cancel.
- `src/pages/SettingsPanel.tsx` - HF provider option, HF key + model selects, `fallbackProvider` select, `autoRouteOnOverBudget` toggle, capability-driven gating.
- `src/pages/GeneratePanel.tsx` - over-budget fallback flow + usage surfacing.
- `src/features/accounts/providerRouting.ts` - widen `HostedProvider` to include `'huggingface'` (kept for existing call sites; superseded conceptually by the shared resolver).
- `docs/API_ENDPOINTS.md` - HuggingFace Inference section.

---

## Phase A - Shared routing foundation

### Task 1: Establish the shared module and capability registry

**Files:**
- Create: `shared/providerRouting.ts`
- Create: `shared/providerRouting.test.ts`
- Modify: `tsconfig.electron.json`, `tsconfig.app.json`, `vitest.config.ts`

- [ ] **Step 1: Widen the build to compile `shared/`**

`tsconfig.electron.json` - change the `include` line:

```json
  "include": ["electron", "shared"]
```

`tsconfig.app.json` - change the `include` line:

```json
  "include": ["src", "shared", "tests/setup.ts"]
```

`vitest.config.ts` - add `shared/**/*.test.ts` to the root `include` and the `unit` project `include`:

```ts
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'electron/**/*.test.ts',
      'shared/**/*.test.ts',
      'tests/**/*.test.{ts,tsx}',
    ],
```

and inside `projects[0]` (the `unit` project):

```ts
        test: {
          include: [
            'src/**/*.test.ts',
            'electron/**/*.test.ts',
            'shared/**/*.test.ts',
            'tests/**/*.test.ts',
          ],
          environment: 'node',
          name: 'unit',
        },
```

- [ ] **Step 2: Write the failing capability-matrix test**

Create `shared/providerRouting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PROVIDER_CAPABILITIES,
  providerSupports,
  type ProviderId,
  type RequestModality,
} from './providerRouting';

describe('PROVIDER_CAPABILITIES', () => {
  it('encodes the honest provider x modality matrix (S4)', () => {
    expect(PROVIDER_CAPABILITIES.local).toMatchObject({
      stillImage: true,
      controlNet: true,
      inpaint: true,
      video: true,
      llmAssist: true,
      reportsUsage: false,
    });
    expect(PROVIDER_CAPABILITIES.openrouter).toMatchObject({
      stillImage: true,
      controlNet: false,
      inpaint: false,
      video: false,
      llmAssist: true,
      reportsUsage: true,
    });
    expect(PROVIDER_CAPABILITIES.huggingface).toMatchObject({
      stillImage: true,
      controlNet: true,
      inpaint: true,
      video: true,
      llmAssist: true,
      reportsUsage: true,
    });
  });

  it('lists every provider id exactly once', () => {
    const ids: ProviderId[] = ['local', 'openrouter', 'huggingface'];
    expect(Object.keys(PROVIDER_CAPABILITIES).sort()).toEqual([...ids].sort());
  });
});

describe('providerSupports', () => {
  it('refuses OpenRouter for video, ControlNet, and inpaint', () => {
    const blocked: RequestModality[] = ['video', 'controlnet', 'inpaint'];
    for (const modality of blocked) {
      expect(providerSupports('openrouter', modality)).toBe(false);
    }
  });

  it('allows HuggingFace and Local for every modality', () => {
    const all: RequestModality[] = ['still-image', 'controlnet', 'inpaint', 'video', 'llm-assist'];
    for (const modality of all) {
      expect(providerSupports('huggingface', modality)).toBe(true);
      expect(providerSupports('local', modality)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run shared/providerRouting.test.ts`
Expected: FAIL — cannot resolve `./providerRouting`.

- [ ] **Step 4: Implement the registry**

Create `shared/providerRouting.ts`:

```ts
/**
 * Provider routing capability registry (M6 Provider Routing Fabric, S4).
 *
 * Pure, dependency-free, and compiled by BOTH tsconfig.app.json (renderer) and
 * tsconfig.electron.json (main) so the renderer's UX gating and the main
 * process's authoritative dispatch read one source of truth. No node, DOM, or
 * cross-layer imports may be added to this module.
 */

export type ProviderId = 'local' | 'openrouter' | 'huggingface';

export type RequestModality =
  | 'still-image'
  | 'controlnet'
  | 'inpaint'
  | 'video'
  | 'llm-assist';

export type FitVerdict = 'fits' | 'fits-with-offload' | 'over-budget' | 'cpu-only';

export interface ProviderCapabilities {
  stillImage: boolean;
  controlNet: boolean;
  inpaint: boolean;
  video: boolean;
  /** enhance / expand / negative-suggest / variations. Local is heuristic-backed. */
  llmAssist: boolean;
  /** Whether cost/quota can be surfaced for this provider (S10). */
  reportsUsage: boolean;
  /** Fixed provider resolution ceiling, or null when model-driven. */
  maxResolution: { width: number; height: number } | null;
}

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  local: {
    stillImage: true,
    controlNet: true,
    inpaint: true,
    video: true,
    llmAssist: true,
    reportsUsage: false,
    maxResolution: null,
  },
  openrouter: {
    stillImage: true,
    controlNet: false,
    inpaint: false,
    video: false,
    llmAssist: true,
    reportsUsage: true,
    maxResolution: null,
  },
  huggingface: {
    stillImage: true,
    controlNet: true,
    inpaint: true,
    video: true,
    llmAssist: true,
    reportsUsage: true,
    maxResolution: null,
  },
};

const MODALITY_CAPABILITY: Record<RequestModality, keyof ProviderCapabilities> = {
  'still-image': 'stillImage',
  controlnet: 'controlNet',
  inpaint: 'inpaint',
  video: 'video',
  'llm-assist': 'llmAssist',
};

/** True when `provider` can run `modality` per the capability matrix. */
export function providerSupports(provider: ProviderId, modality: RequestModality): boolean {
  return PROVIDER_CAPABILITIES[provider][MODALITY_CAPABILITY[modality]] === true;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run shared/providerRouting.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify both TS programs compile the shared module**

Run: `npm run typecheck`
Expected: PASS (the file is now in both `tsconfig.app.json` and `tsconfig.electron.json` programs).

- [ ] **Step 7: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add shared/providerRouting.ts shared/providerRouting.test.ts tsconfig.electron.json tsconfig.app.json vitest.config.ts
git branch --show-current
git commit -m "feat(routing): shared provider capability registry"
```

---

### Task 2: The pure route resolver

**Files:**
- Create: `shared/resolveRoute.ts`
- Create: `shared/resolveRoute.test.ts`

- [ ] **Step 1: Write the failing truth-table test**

Create `shared/resolveRoute.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveRoute, type RouteResolverInput } from './resolveRoute';

function input(overrides: Partial<RouteResolverInput>): RouteResolverInput {
  return {
    modality: 'still-image',
    requested: 'local',
    configuredHosted: [],
    autoRouteOnOverBudget: false,
    fit: 'fits',
    fallbackProvider: null,
    ...overrides,
  };
}

describe('resolveRoute', () => {
  it('routes an explicit, capable, fitting local request', () => {
    expect(resolveRoute(input({ requested: 'local', fit: 'fits' }))).toEqual({
      ok: true,
      provider: 'local',
      reason: 'explicit',
    });
  });

  it('refuses an unsupported provider x modality combo (OpenRouter video)', () => {
    const decision = resolveRoute(input({ requested: 'openrouter', modality: 'video' }));
    expect(decision).toMatchObject({ ok: false, kind: 'unsupported' });
  });

  it('refuses a hosted route with no stored key/model', () => {
    const decision = resolveRoute(
      input({ requested: 'huggingface', modality: 'still-image', configuredHosted: [] }),
    );
    expect(decision).toMatchObject({ ok: false, kind: 'unconfigured' });
  });

  it('routes a configured hosted request explicitly', () => {
    expect(
      resolveRoute(
        input({ requested: 'openrouter', modality: 'still-image', configuredHosted: ['openrouter'] }),
      ),
    ).toEqual({ ok: true, provider: 'openrouter', reason: 'explicit' });
  });

  it('auto-routes an over-budget local job when the setting is on and the fallback is ready', () => {
    expect(
      resolveRoute(
        input({
          requested: 'local',
          fit: 'over-budget',
          autoRouteOnOverBudget: true,
          fallbackProvider: 'huggingface',
          configuredHosted: ['huggingface'],
        }),
      ),
    ).toEqual({ ok: true, provider: 'huggingface', reason: 'fallback-auto' });
  });

  it('prompts (with capable configured candidates) when over-budget and auto is off', () => {
    const decision = resolveRoute(
      input({
        requested: 'local',
        fit: 'over-budget',
        autoRouteOnOverBudget: false,
        configuredHosted: ['openrouter', 'huggingface'],
        modality: 'still-image',
      }),
    );
    expect(decision).toEqual({
      ok: false,
      kind: 'fallback-prompt',
      candidates: ['openrouter', 'huggingface'],
    });
  });

  it('excludes capability-incompatible providers from over-budget candidates (video)', () => {
    const decision = resolveRoute(
      input({
        requested: 'local',
        modality: 'video',
        fit: 'over-budget',
        configuredHosted: ['openrouter', 'huggingface'],
      }),
    );
    // OpenRouter cannot do video, so it must not be offered as a candidate.
    expect(decision).toEqual({ ok: false, kind: 'fallback-prompt', candidates: ['huggingface'] });
  });

  it('prompts even when auto is on but the chosen fallback is not configured', () => {
    const decision = resolveRoute(
      input({
        requested: 'local',
        fit: 'over-budget',
        autoRouteOnOverBudget: true,
        fallbackProvider: 'huggingface',
        configuredHosted: [],
      }),
    );
    expect(decision).toMatchObject({ ok: false, kind: 'fallback-prompt', candidates: [] });
  });

  it('treats cpu-only as a runnable local state, not an auto-fallback trigger', () => {
    expect(resolveRoute(input({ requested: 'local', fit: 'cpu-only' }))).toEqual({
      ok: true,
      provider: 'local',
      reason: 'explicit',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/resolveRoute.test.ts`
Expected: FAIL — cannot resolve `./resolveRoute`.

- [ ] **Step 3: Implement the resolver**

Create `shared/resolveRoute.ts`:

```ts
/**
 * Pure route resolver (M6, S5). The single decision authority. Read by the
 * renderer for UX gating and by the Electron main process at dispatch as the
 * authoritative guard. No node/DOM/cross-layer imports.
 */
import type { ProviderId, RequestModality, FitVerdict } from './providerRouting';
import { providerSupports } from './providerRouting';

const HOSTED_PROVIDERS: readonly ProviderId[] = ['openrouter', 'huggingface'];

export type RouteDecision =
  | { ok: true; provider: ProviderId; reason: 'explicit' | 'fallback-auto' }
  | { ok: false; kind: 'unsupported'; message: string }
  | { ok: false; kind: 'unconfigured'; message: string }
  | { ok: false; kind: 'fallback-prompt'; candidates: ProviderId[] };

export interface RouteResolverInput {
  modality: RequestModality;
  /** The per-modality provider the user selected. */
  requested: ProviderId;
  /** Hosted providers that have a stored key AND a selected model for this modality. */
  configuredHosted: ProviderId[];
  autoRouteOnOverBudget: boolean;
  /** RuntimePlan.fit; only meaningful when `requested === 'local'`. */
  fit?: FitVerdict | null;
  /** Per-account hosted fallback target for the over-budget path. */
  fallbackProvider?: ProviderId | null;
}

function isHosted(provider: ProviderId): boolean {
  return HOSTED_PROVIDERS.includes(provider);
}

export function resolveRoute(input: RouteResolverInput): RouteDecision {
  const { modality, requested, configuredHosted, autoRouteOnOverBudget, fit, fallbackProvider } =
    input;

  // 1. Capability — refuse impossible combinations honestly.
  if (!providerSupports(requested, modality)) {
    return {
      ok: false,
      kind: 'unsupported',
      message: `${requested} cannot run ${modality} requests.`,
    };
  }

  // 2. Configuration — hosted routes need a key + model; local is always runnable.
  if (isHosted(requested) && !configuredHosted.includes(requested)) {
    return {
      ok: false,
      kind: 'unconfigured',
      message: `${requested} needs a stored key and a selected model before it can run ${modality} requests.`,
    };
  }

  // 3. Local over-budget fallback.
  if (requested === 'local' && fit === 'over-budget') {
    const candidates = configuredHosted.filter((provider) => providerSupports(provider, modality));
    if (autoRouteOnOverBudget && fallbackProvider && candidates.includes(fallbackProvider)) {
      return { ok: true, provider: fallbackProvider, reason: 'fallback-auto' };
    }
    return { ok: false, kind: 'fallback-prompt', candidates };
  }

  // 4. Explicit route.
  return { ok: true, provider: requested, reason: 'explicit' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run shared/resolveRoute.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add shared/resolveRoute.ts shared/resolveRoute.test.ts
git branch --show-current
git commit -m "feat(routing): pure route resolver with over-budget fallback"
```

---

## Phase B - HuggingFace Inference client (main process)

### Task 3: Reusable hosted-HTTP transport

Extract the proven semaphore + retry helpers (currently closure-local in `openRouter.ts`) into a shared module the HF client consumes. The OpenRouter client is left untouched (no risky refactor of tested code).

**Files:**
- Create: `electron/services/hostedHttp.ts`
- Create: `electron/services/hostedHttp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/services/hostedHttp.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  createKeyConcurrencyLimit,
  retryHostedCall,
  isRetryableError,
  getRetryAfterMs,
} from './hostedHttp';

function httpError(status: number, headers: Record<string, string> = {}) {
  const error = new Error(`HTTP ${status}`) as Error & { response: unknown };
  (error as { response: unknown }).response = { status, headers, data: {} };
  return error;
}

describe('isRetryableError', () => {
  it('retries 429 and 5xx, not 4xx (except 429)', () => {
    expect(isRetryableError(httpError(429))).toBe(true);
    expect(isRetryableError(httpError(503))).toBe(true);
    expect(isRetryableError(httpError(400))).toBe(false);
    expect(isRetryableError(httpError(401))).toBe(false);
  });

  it('does not retry an AbortError', () => {
    expect(isRetryableError(new DOMException('Aborted', 'AbortError'))).toBe(false);
  });
});

describe('getRetryAfterMs', () => {
  it('reads a Retry-After header in seconds', () => {
    expect(getRetryAfterMs(httpError(429, { 'retry-after': '2' }))).toBe(2000);
  });

  it('returns null without the header', () => {
    expect(getRetryAfterMs(httpError(429))).toBeNull();
  });
});

describe('retryHostedCall', () => {
  it('retries up to maxAttempts on 429 then succeeds', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce('ok');
    const result = await retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on a non-retryable error', async () => {
    const op = vi.fn().mockRejectedValue(httpError(400));
    await expect(retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('HTTP 400');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('aborts before the first attempt when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const op = vi.fn();
    await expect(
      retryHostedCall(op, { maxAttempts: 3, baseDelayMs: 0, signal: controller.signal }),
    ).rejects.toThrow();
    expect(op).not.toHaveBeenCalled();
  });
});

describe('createKeyConcurrencyLimit', () => {
  it('serialises beyond the per-key cap and runs different keys independently', async () => {
    const limit = createKeyConcurrencyLimit(1);
    const order: string[] = [];
    const slow = (label: string) =>
      limit('key-a', async () => {
        order.push(`start:${label}`);
        await Promise.resolve();
        order.push(`end:${label}`);
      });
    await Promise.all([slow('1'), slow('2')]);
    // With cap 1 on the same key, task 2 cannot start before task 1 ends.
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run electron/services/hostedHttp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the transport helpers**

Create `electron/services/hostedHttp.ts`:

```ts
/**
 * Reusable transport primitives for hosted BYOK provider clients (M6).
 * Mirrors the proven helpers in openRouter.ts so the HuggingFace Inference
 * client inherits the same resilience: per-key concurrency capping, exponential
 * backoff honouring Retry-After, and abort-aware retries.
 */

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function responseStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function isRetryableError(error: unknown): boolean {
  if ((error as { name?: string } | null)?.name === 'AbortError') {
    return false;
  }
  const status = responseStatus(error);
  if (status === null) {
    // Network-level failure (no response) — worth a retry.
    return Boolean((error as { request?: unknown } | null)?.request) || !responseStatus(error)
      ? (error as { code?: string } | null)?.code !== undefined || status === null
      : false;
  }
  return RETRYABLE_STATUS.has(status);
}

export function getRetryAfterMs(error: unknown): number | null {
  const headers = (error as { response?: { headers?: Record<string, unknown> } } | null)?.response
    ?.headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (typeof raw !== 'string') {
    return null;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export async function retryHostedCall<T>(
  operation: () => Promise<T>,
  { maxAttempts, baseDelayMs, signal }: { maxAttempts: number; baseDelayMs: number; signal?: AbortSignal },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryableError(error)) {
        throw error;
      }
      const backoff = getRetryAfterMs(error) ?? baseDelayMs * 2 ** (attempt - 1);
      await delay(backoff, signal);
    }
  }
  throw lastError;
}

export function createKeyConcurrencyLimit(maxPerKey: number) {
  type KeyState = { active: number; waiters: Array<() => void> };
  const states = new Map<string, KeyState>();

  function getState(key: string): KeyState {
    let state = states.get(key);
    if (!state) {
      state = { active: 0, waiters: [] };
      states.set(key, state);
    }
    return state;
  }

  return async function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const state = getState(key);
    if (state.active >= maxPerKey) {
      await new Promise<void>((resolve) => state.waiters.push(resolve));
    }
    state.active += 1;
    try {
      return await work();
    } finally {
      state.active -= 1;
      const next = state.waiters.shift();
      if (next) next();
    }
  };
}
```

> Note on `isRetryableError`: the network-failure branch is deliberately conservative — retry only when there is no HTTP response. Keep the simpler form if the verbose expression above trips `noUnusedLocals`; the test asserts the externally observable behaviour (retry 429/5xx, not 4xx, not abort). A clean equivalent:
> ```ts
> export function isRetryableError(error: unknown): boolean {
>   if ((error as { name?: string } | null)?.name === 'AbortError') return false;
>   const status = responseStatus(error);
>   if (status === null) return true; // no HTTP response => network failure
>   return RETRYABLE_STATUS.has(status);
> }
> ```
> Use this clean form. (It is what the tests pin.)

- [ ] **Step 4: Replace `isRetryableError` with the clean form above, then run the test**

Run: `npx vitest run electron/services/hostedHttp.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/hostedHttp.ts electron/services/hostedHttp.test.ts
git branch --show-current
git commit -m "feat(routing): reusable hosted-HTTP transport (semaphore + retry)"
```

---

### Task 4: HF client — types, factory, key info, model listing

**Files:**
- Create: `electron/services/huggingfaceInference.ts`
- Create: `electron/services/huggingfaceInference.test.ts`

The HF router exposes an OpenAI-compatible surface at `https://router.huggingface.co/v1`. Key/quota: `GET https://huggingface.co/api/whoami-v2`. Models: filtered via the Hub (`huggingface_hub` listing is done in the backend already; here we accept a configured model id and validate at call time). For M6 the model lists are seeded from a small curated default plus user entry; this task implements `getKeyInfo` and a `listModels` that returns the curated defaults filtered by modality (no network needed for listing in v1).

- [ ] **Step 1: Write the failing test**

Create `electron/services/huggingfaceInference.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceInferenceService } from './huggingfaceInference';

describe('createHuggingFaceInferenceService.getKeyInfo', () => {
  it('reads the account label and never echoes the token', async () => {
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({ data: { name: 'rocky', fullname: 'Rocky E', auth: { accessToken: { displayName: 'vision-studio' } } } }),
      post: vi.fn(),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const info = await service.getKeyInfo('hf_secrettoken');

    expect(info.label).toBe('rocky');
    expect(JSON.stringify(info)).not.toContain('hf_secrettoken');
    const calledUrl = axiosInstance.get.mock.calls[0][0] as string;
    const calledHeaders = (axiosInstance.get.mock.calls[0][1] as { headers: Record<string, string> })
      .headers;
    expect(calledUrl).toContain('whoami');
    expect(calledHeaders.Authorization).toBe('Bearer hf_secrettoken');
  });

  it('maps an auth failure to a sanitized error that omits the token', async () => {
    const error = new Error('HTTP 401') as Error & { response: unknown };
    (error as { response: unknown }).response = { status: 401, headers: {}, data: { error: 'Invalid token hf_secrettoken' } };
    const axiosInstance = { get: vi.fn().mockRejectedValue(error), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    await expect(service.getKeyInfo('hf_secrettoken')).rejects.toThrow(/HuggingFace/);
    await service.getKeyInfo('hf_secrettoken').catch((thrown: unknown) => {
      expect(String(thrown)).not.toContain('hf_secrettoken');
    });
  });
});

describe('createHuggingFaceInferenceService.listImageModels', () => {
  it('returns curated image-capable defaults', async () => {
    const service = createHuggingFaceInferenceService({ axiosInstance: { get: vi.fn(), post: vi.fn() } });
    const models = await service.listImageModels('hf_token');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => typeof m.id === 'string' && m.id.includes('/'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types, factory, key info, model listing**

Create `electron/services/huggingfaceInference.ts`:

```ts
import axios from 'axios';
import { createKeyConcurrencyLimit, retryHostedCall } from './hostedHttp';

const DEFAULT_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_HUB_BASE_URL = 'https://huggingface.co';
const DEFAULT_MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_MAX_CONCURRENT_PER_KEY = 4;
const METADATA_TIMEOUT_MS = 15_000;
const GENERATION_TIMEOUT_MS = 120_000;
export const HF_MAX_PROMPT_CHARS = 8_000;

export interface HuggingFaceKeyInfo {
  label: string | null;
  fullName: string | null;
  tokenDisplayName: string | null;
}

export interface HuggingFaceModelSummary {
  id: string;
  name: string;
  modality: 'image' | 'video' | 'text' | 'controlnet' | 'inpaint';
}

export interface HuggingFaceUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

export interface HuggingFaceImageResult {
  dataUrl: string;
  mimeType: string;
}

export interface HuggingFaceImageGenerationResult {
  model: string | null;
  images: HuggingFaceImageResult[];
  usage: HuggingFaceUsage | null;
}

export interface HuggingFaceVideoGenerationResult {
  model: string | null;
  /** Base64 data URL of the returned video (mp4/webm). Persisted by the runner. */
  dataUrl: string;
  mimeType: string;
}

export interface HuggingFacePromptEnhancementResult {
  prompt: string;
  variations: string[];
  usage: HuggingFaceUsage | null;
}

export interface HuggingFaceNegativePromptSuggestionResult {
  negativePrompt: string;
  suggestions: string[];
  usage: HuggingFaceUsage | null;
}

type AxiosLike = {
  get: (url: string, config?: unknown) => Promise<{ data: unknown }>;
  post: (url: string, body?: unknown, config?: unknown) => Promise<{ data: unknown }>;
};

type Logger = { warn: (...args: unknown[]) => void };

type CreateHuggingFaceInferenceServiceOptions = {
  axiosInstance?: AxiosLike;
  routerBaseUrl?: string;
  hubBaseUrl?: string;
  retryBaseDelayMs?: number;
  maxRetryAttempts?: number;
  maxConcurrentPerKey?: number;
  logger?: Logger;
};

/** Curated v1 defaults; users may also type any model id in Settings. */
const CURATED_IMAGE_MODELS: HuggingFaceModelSummary[] = [
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 schnell', modality: 'image' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL 1.0', modality: 'image' },
];
const CURATED_VIDEO_MODELS: HuggingFaceModelSummary[] = [
  { id: 'Lightricks/LTX-Video', name: 'LTX-Video', modality: 'video' },
];
const CURATED_TEXT_MODELS: HuggingFaceModelSummary[] = [
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', modality: 'text' },
];

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  } as const;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Sanitize a thrown transport error into a renderer-safe message. NEVER include
 * the token or raw upstream body verbatim (Codex gate).
 */
function createHuggingFaceError(error: unknown, fallback: string): Error {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if ((error as { name?: string } | null)?.name === 'AbortError') {
    return new Error('HuggingFace request was cancelled.');
  }
  if (status === 401 || status === 403) {
    return new Error('HuggingFace rejected the token. Check the BYOK token in Settings.');
  }
  if (status === 404) {
    return new Error('HuggingFace could not find that model for the requested task.');
  }
  if (typeof status === 'number') {
    return new Error(`HuggingFace request failed (HTTP ${status}).`);
  }
  return new Error(fallback);
}

function assertPromptLength(value: string, label: string) {
  if (value.length > HF_MAX_PROMPT_CHARS) {
    throw new Error(`${label} exceeds the ${HF_MAX_PROMPT_CHARS}-character limit.`);
  }
}

export function createHuggingFaceInferenceService({
  axiosInstance = axios as unknown as AxiosLike,
  routerBaseUrl = DEFAULT_ROUTER_BASE_URL,
  hubBaseUrl = DEFAULT_HUB_BASE_URL,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  maxConcurrentPerKey = DEFAULT_MAX_CONCURRENT_PER_KEY,
  logger = console,
}: CreateHuggingFaceInferenceServiceOptions = {}) {
  const limit = createKeyConcurrencyLimit(maxConcurrentPerKey);

  function withRetry<T>(token: string, operation: () => Promise<T>, signal?: AbortSignal) {
    return limit(token, () =>
      retryHostedCall(operation, { maxAttempts: maxRetryAttempts, baseDelayMs: retryBaseDelayMs, signal }),
    );
  }

  async function getKeyInfo(token: string): Promise<HuggingFaceKeyInfo> {
    try {
      const response = await withRetry(token, () =>
        axiosInstance.get(`${hubBaseUrl}/api/whoami-v2`, {
          headers: buildHeaders(token),
          timeout: METADATA_TIMEOUT_MS,
        }),
      );
      const data = (response.data ?? {}) as {
        name?: unknown;
        fullname?: unknown;
        auth?: { accessToken?: { displayName?: unknown } };
      };
      return {
        label: asString(data.name),
        fullName: asString(data.fullname),
        tokenDisplayName: asString(data.auth?.accessToken?.displayName),
      };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace connection failed.');
    }
  }

  async function listImageModels(_token: string): Promise<HuggingFaceModelSummary[]> {
    return CURATED_IMAGE_MODELS;
  }

  async function listVideoModels(_token: string): Promise<HuggingFaceModelSummary[]> {
    return CURATED_VIDEO_MODELS;
  }

  async function listTextModels(_token: string): Promise<HuggingFaceModelSummary[]> {
    return CURATED_TEXT_MODELS;
  }

  return {
    getKeyInfo,
    listImageModels,
    listVideoModels,
    listTextModels,
    // generation methods are added in Tasks 5-7
    _internal: { withRetry, buildHeaders, createHuggingFaceError, assertPromptLength, routerBaseUrl, axiosInstance, GENERATION_TIMEOUT_MS },
  };
}
```

> The `_internal` export is a temporary seam so Tasks 5-7 extend the same closure cohesively; the final task (7) folds the generation methods into the returned object and removes `_internal`. Keep it until then.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/huggingfaceInference.ts electron/services/huggingfaceInference.test.ts
git branch --show-current
git commit -m "feat(hf): HuggingFace Inference client scaffold (key info + model lists)"
```

---

### Task 5: HF client — prompt enhancement + negative suggestion (LLM parity)

**Files:**
- Modify: `electron/services/huggingfaceInference.ts`
- Modify: `electron/services/huggingfaceInference.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `electron/services/huggingfaceInference.test.ts`:

```ts
describe('createHuggingFaceInferenceService.enhancePrompt', () => {
  it('calls the OpenAI-compatible chat endpoint and parses JSON output', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [
            { message: { content: JSON.stringify({ prompt: 'dramatic portrait, crisp detail', variations: [] }) } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        },
      }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const result = await service.enhancePrompt({
      token: 'hf_token',
      prompt: 'dramatic portrait',
      mode: 'clarify',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
    });

    expect(result.prompt).toBe('dramatic portrait, crisp detail');
    expect(result.usage?.totalTokens).toBe(18);
    const url = axiosInstance.post.mock.calls[0][0] as string;
    expect(url).toContain('/chat/completions');
  });

  it('rejects an over-long prompt before any network call', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.enhancePrompt({ token: 'hf_token', prompt: 'x'.repeat(9000), mode: 'clarify' }),
    ).rejects.toThrow(/character limit/);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});

describe('createHuggingFaceInferenceService.suggestNegativePrompt', () => {
  it('parses a structured negative-prompt suggestion', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: { choices: [{ message: { content: JSON.stringify({ negativePrompt: 'blurry, low quality', suggestions: ['blurry', 'low quality'] }) } }] },
      }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.suggestNegativePrompt({ token: 'hf_token', prompt: 'a castle' });
    expect(result.negativePrompt).toBe('blurry, low quality');
    expect(result.suggestions).toEqual(['blurry', 'low quality']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts -t enhancePrompt`
Expected: FAIL — `enhancePrompt` is not a function.

- [ ] **Step 3: Implement the LLM methods**

In `electron/services/huggingfaceInference.ts`, add these helpers above the factory's `return`, and add the methods to the returned object (replace the `_internal` placeholder return from Task 4 by including these in the returned object):

```ts
  const PROMPT_ENHANCEMENT_SYSTEM_PROMPT =
    'You refine image-generation prompts. Reply ONLY with compact JSON of shape {"prompt": string, "variations": string[]}. Preserve intent; improve clarity and visual specificity.';
  const NEGATIVE_PROMPT_SYSTEM_PROMPT =
    'You suggest negative prompts for image generation. Reply ONLY with compact JSON of shape {"negativePrompt": string, "suggestions": string[]}.';

  function extractMessageContent(message: unknown): string {
    const content = (message as { content?: unknown } | null)?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
        .join('');
    }
    return '';
  }

  function parseJsonObject(raw: string): Record<string, unknown> {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      logger.warn('[HuggingFace] Could not parse JSON content; returning raw text.');
      return {};
    }
  }

  function extractUsage(data: unknown): HuggingFaceUsage | null {
    const usage = (data as { usage?: Record<string, unknown> } | null)?.usage;
    if (!usage) return null;
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      promptTokens: num(usage.prompt_tokens),
      completionTokens: num(usage.completion_tokens),
      totalTokens: num(usage.total_tokens),
      cost: num(usage.cost),
    };
  }

  async function chatJson(token: string, model: string | undefined, system: string, user: string, signal?: AbortSignal) {
    const response = await withRetry(
      token,
      () =>
        axiosInstance.post(
          `${routerBaseUrl}/chat/completions`,
          {
            ...(model ? { model } : {}),
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          },
          { headers: buildHeaders(token), timeout: GENERATION_TIMEOUT_MS, signal },
        ),
      signal,
    );
    const data = response.data as { choices?: Array<{ message?: unknown }> };
    const content = extractMessageContent(data.choices?.[0]?.message);
    return { parsed: parseJsonObject(content), usage: extractUsage(data) };
  }

  async function enhancePrompt({
    token,
    prompt,
    mode,
    model,
    signal,
  }: {
    token: string;
    prompt: string;
    mode: 'clarify' | 'cinematic' | 'concise' | 'expand' | 'variations';
    model?: string;
    signal?: AbortSignal;
  }): Promise<HuggingFacePromptEnhancementResult> {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalized, 'Prompt');
    try {
      const { parsed, usage } = await chatJson(
        token,
        model,
        PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
        JSON.stringify({ mode, prompt: normalized }),
        signal,
      );
      return {
        prompt: typeof parsed.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt : normalized,
        variations: Array.isArray(parsed.variations) ? (parsed.variations.filter((v) => typeof v === 'string') as string[]) : [],
        usage,
      };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace prompt enhancement failed.');
    }
  }

  async function suggestNegativePrompt({
    token,
    prompt,
    negativePrompt,
    model,
    signal,
  }: {
    token: string;
    prompt: string;
    negativePrompt?: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<HuggingFaceNegativePromptSuggestionResult> {
    const normalized = prompt.trim();
    if (!normalized) throw new Error('Prompt cannot be empty.');
    assertPromptLength(normalized, 'Prompt');
    try {
      const { parsed, usage } = await chatJson(
        token,
        model,
        NEGATIVE_PROMPT_SYSTEM_PROMPT,
        JSON.stringify({ prompt: normalized, current: negativePrompt ?? '' }),
        signal,
      );
      return {
        negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt : '',
        suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions.filter((s) => typeof s === 'string') as string[]) : [],
        usage,
      };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace negative-prompt suggestion failed.');
    }
  }
```

Update the returned object to include `enhancePrompt` and `suggestNegativePrompt` (keep `_internal` until Task 7):

```ts
  return {
    getKeyInfo,
    listImageModels,
    listVideoModels,
    listTextModels,
    enhancePrompt,
    suggestNegativePrompt,
    _internal: { withRetry, buildHeaders, createHuggingFaceError, assertPromptLength, routerBaseUrl, axiosInstance },
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/huggingfaceInference.ts electron/services/huggingfaceInference.test.ts
git branch --show-current
git commit -m "feat(hf): prompt enhancement + negative suggestion (LLM parity)"
```

---

### Task 6: HF client — image generation (normalize to {dataUrl, mimeType})

**Files:**
- Modify: `electron/services/huggingfaceInference.ts`
- Modify: `electron/services/huggingfaceInference.test.ts`

HF serverless text-to-image returns raw image bytes (Content-Type `image/*`). The client requests `responseType: 'arraybuffer'`, validates the bytes look like a known image magic number (sanitization before the runner ever writes to disk), and normalizes to a base64 data URL.

- [ ] **Step 1: Add the failing tests**

Append to `electron/services/huggingfaceInference.test.ts`:

```ts
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe('createHuggingFaceInferenceService.generateImage', () => {
  it('normalizes returned bytes to a png data URL', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: PNG_MAGIC, headers: { 'content-type': 'image/png' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const result = await service.generateImage({
      token: 'hf_token',
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: 'a tree',
      width: 1024,
      height: 1024,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].mimeType).toBe('image/png');
    expect(result.images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('rejects a non-image response body (sanitization)', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: Buffer.from('{"error":"loading"}'), headers: { 'content-type': 'application/json' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateImage({ token: 'hf_token', model: 'm/x', prompt: 'a tree', width: 512, height: 512 }),
    ).rejects.toThrow(/did not return a valid image|failed/i);
  });

  it('rejects an empty prompt before any network call', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateImage({ token: 'hf_token', model: 'm/x', prompt: '   ', width: 512, height: 512 }),
    ).rejects.toThrow(/empty/i);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts -t generateImage`
Expected: FAIL — `generateImage` is not a function.

- [ ] **Step 3: Implement image generation + byte sanitization**

In `electron/services/huggingfaceInference.ts`, add the image helpers and method inside the factory, before `return`:

```ts
  const IMAGE_MAGIC: Array<{ mime: string; bytes: number[] }> = [
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
    { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  ];

  function sniffImageMime(buffer: Buffer): string | null {
    for (const candidate of IMAGE_MAGIC) {
      if (candidate.bytes.every((byte, index) => buffer[index] === byte)) {
        return candidate.mime;
      }
    }
    return null;
  }

  function toImageResult(data: unknown): HuggingFaceImageResult {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    const mime = sniffImageMime(buffer);
    if (!mime) {
      throw new Error('HuggingFace did not return a valid image payload.');
    }
    return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, mimeType: mime };
  }

  async function generateImage({
    token,
    model,
    prompt,
    negativePrompt,
    width,
    height,
    seed,
    signal,
  }: {
    token: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceImageGenerationResult> {
    const normalizedPrompt = prompt.trim();
    const normalizedModel = model.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    if (!normalizedModel) throw new Error('HuggingFace image model is required.');
    assertPromptLength(normalizedPrompt, 'Prompt');
    try {
      const response = await withRetry(
        token,
        () =>
          axiosInstance.post(
            `${hubBaseUrl}/api/inference-proxy/models/${normalizedModel}`,
            {
              inputs: normalizedPrompt,
              parameters: {
                ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
                width,
                height,
                ...(typeof seed === 'number' ? { seed } : {}),
              },
            },
            {
              headers: buildHeaders(token),
              timeout: GENERATION_TIMEOUT_MS,
              responseType: 'arraybuffer',
              signal,
            },
          ),
        signal,
      );
      return { model: normalizedModel, images: [toImageResult((response as { data: unknown }).data)], usage: null };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace image generation failed.');
    }
  }
```

> Endpoint note: `hubBaseUrl + /api/inference-proxy/models/<id>` is the serverless text-to-image surface; the exact route may be tuned during live validation (Task 18). The contract this plan pins — request `responseType: 'arraybuffer'`, sniff magic bytes, normalize to a data URL — is what the tests assert and does not change.

Add `generateImage` to the returned object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/huggingfaceInference.ts electron/services/huggingfaceInference.test.ts
git branch --show-current
git commit -m "feat(hf): text-to-image generation with byte sanitization"
```

---

### Task 7: HF client — video, ControlNet, inpaint + finalize surface

**Files:**
- Modify: `electron/services/huggingfaceInference.ts`
- Modify: `electron/services/huggingfaceInference.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `electron/services/huggingfaceInference.test.ts`:

```ts
const MP4_BYTES = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8)]);

describe('createHuggingFaceInferenceService.generateVideo', () => {
  it('normalizes returned bytes to an mp4 data URL', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: MP4_BYTES, headers: { 'content-type': 'video/mp4' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.generateVideo({ token: 'hf_token', model: 'Lightricks/LTX-Video', prompt: 'a wave', durationSeconds: 5 });
    expect(result.mimeType).toBe('video/mp4');
    expect(result.dataUrl.startsWith('data:video/mp4;base64,')).toBe(true);
  });
});

describe('createHuggingFaceInferenceService.generateControlNet / generateInpaint', () => {
  it('returns a normalized image for ControlNet', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: PNG_MAGIC, headers: { 'content-type': 'image/png' } }) };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.generateControlNet({
      token: 'hf_token',
      model: 'm/cn',
      prompt: 'a city',
      controlImageBase64: 'aGVsbG8=',
      width: 512,
      height: 512,
    });
    expect(result.images[0].mimeType).toBe('image/png');
  });

  it('returns a normalized image for inpaint', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: PNG_MAGIC, headers: { 'content-type': 'image/png' } }) };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.generateInpaint({
      token: 'hf_token',
      model: 'm/inpaint',
      prompt: 'a dog',
      initImageBase64: 'aGVsbG8=',
      maskImageBase64: 'aGVsbG8=',
      width: 512,
      height: 512,
    });
    expect(result.images[0].mimeType).toBe('image/png');
  });
});

describe('createHuggingFaceInferenceService surface', () => {
  it('exposes the full generation surface without leaking internals', () => {
    const service = createHuggingFaceInferenceService({ axiosInstance: { get: vi.fn(), post: vi.fn() } });
    expect(Object.keys(service).sort()).toEqual(
      [
        'enhancePrompt',
        'generateControlNet',
        'generateImage',
        'generateInpaint',
        'generateVideo',
        'getKeyInfo',
        'listImageModels',
        'listTextModels',
        'listVideoModels',
        'suggestNegativePrompt',
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts -t generateVideo`
Expected: FAIL.

- [ ] **Step 3: Implement video/ControlNet/inpaint + remove the `_internal` seam**

In `electron/services/huggingfaceInference.ts`, add before `return`:

```ts
  const VIDEO_MAGIC: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
    { mime: 'video/mp4', test: (b) => b.slice(4, 8).toString('ascii') === 'ftyp' },
    { mime: 'video/webm', test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  ];

  function toVideoResult(model: string, data: unknown): HuggingFaceVideoGenerationResult {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    const match = VIDEO_MAGIC.find((candidate) => candidate.test(buffer));
    if (!match) {
      throw new Error('HuggingFace did not return a valid video payload.');
    }
    return { model, dataUrl: `data:${match.mime};base64,${buffer.toString('base64')}`, mimeType: match.mime };
  }

  async function postForImage(token: string, model: string, body: unknown, signal?: AbortSignal) {
    const response = await withRetry(
      token,
      () =>
        axiosInstance.post(`${hubBaseUrl}/api/inference-proxy/models/${model}`, body, {
          headers: buildHeaders(token),
          timeout: GENERATION_TIMEOUT_MS,
          responseType: 'arraybuffer',
          signal,
        }),
      signal,
    );
    return toImageResult((response as { data: unknown }).data);
  }

  async function generateVideo({
    token,
    model,
    prompt,
    durationSeconds,
    signal,
  }: {
    token: string;
    model: string;
    prompt: string;
    durationSeconds?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceVideoGenerationResult> {
    const normalizedPrompt = prompt.trim();
    const normalizedModel = model.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    if (!normalizedModel) throw new Error('HuggingFace video model is required.');
    assertPromptLength(normalizedPrompt, 'Prompt');
    try {
      const response = await withRetry(
        token,
        () =>
          axiosInstance.post(
            `${hubBaseUrl}/api/inference-proxy/models/${normalizedModel}`,
            { inputs: normalizedPrompt, parameters: { ...(durationSeconds ? { num_frames: durationSeconds * 24 } : {}) } },
            { headers: buildHeaders(token), timeout: GENERATION_TIMEOUT_MS, responseType: 'arraybuffer', signal },
          ),
        signal,
      );
      return toVideoResult(normalizedModel, (response as { data: unknown }).data);
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace video generation failed.');
    }
  }

  async function generateControlNet({
    token,
    model,
    prompt,
    controlImageBase64,
    negativePrompt,
    width,
    height,
    seed,
    signal,
  }: {
    token: string;
    model: string;
    prompt: string;
    controlImageBase64: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceImageGenerationResult> {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    if (!model.trim()) throw new Error('HuggingFace ControlNet model is required.');
    if (!controlImageBase64) throw new Error('A control image is required.');
    assertPromptLength(normalizedPrompt, 'Prompt');
    try {
      const image = await postForImage(token, model.trim(), {
        inputs: normalizedPrompt,
        parameters: {
          control_image: controlImageBase64,
          ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
          width,
          height,
          ...(typeof seed === 'number' ? { seed } : {}),
        },
      }, signal);
      return { model: model.trim(), images: [image], usage: null };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace ControlNet generation failed.');
    }
  }

  async function generateInpaint({
    token,
    model,
    prompt,
    initImageBase64,
    maskImageBase64,
    negativePrompt,
    width,
    height,
    seed,
    signal,
  }: {
    token: string;
    model: string;
    prompt: string;
    initImageBase64: string;
    maskImageBase64: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }): Promise<HuggingFaceImageGenerationResult> {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) throw new Error('Prompt cannot be empty.');
    if (!model.trim()) throw new Error('HuggingFace inpaint model is required.');
    if (!initImageBase64 || !maskImageBase64) throw new Error('An init image and a mask are required.');
    assertPromptLength(normalizedPrompt, 'Prompt');
    try {
      const image = await postForImage(token, model.trim(), {
        inputs: normalizedPrompt,
        parameters: {
          image: initImageBase64,
          mask_image: maskImageBase64,
          ...(negativePrompt?.trim() ? { negative_prompt: negativePrompt.trim() } : {}),
          width,
          height,
          ...(typeof seed === 'number' ? { seed } : {}),
        },
      }, signal);
      return { model: model.trim(), images: [image], usage: null };
    } catch (error) {
      throw createHuggingFaceError(error, 'HuggingFace inpaint generation failed.');
    }
  }
```

Replace the returned object (remove `_internal`):

```ts
  return {
    getKeyInfo,
    listImageModels,
    listVideoModels,
    listTextModels,
    enhancePrompt,
    suggestNegativePrompt,
    generateImage,
    generateVideo,
    generateControlNet,
    generateInpaint,
  };
```

- [ ] **Step 4: Run the full HF client suite**

Run: `npx vitest run electron/services/huggingfaceInference.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/huggingfaceInference.ts electron/services/huggingfaceInference.test.ts
git branch --show-current
git commit -m "feat(hf): video, ControlNet, inpaint generation + finalized client surface"
```

---

## Phase C - Accounts & settings persistence

### Task 8: Add the `autoRouteOnOverBudget` setting

**Files:**
- Modify: `electron/services/settings.ts`
- Modify: `electron/services/outputRoots.ts`
- Modify: `electron/services/settings.test.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/settings.test.ts`:

```ts
import { DEFAULT_SETTINGS } from './outputRoots';

describe('autoRouteOnOverBudget setting', () => {
  it('defaults to false (always-prompt is the default fallback policy)', () => {
    expect(DEFAULT_SETTINGS.autoRouteOnOverBudget).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run electron/services/settings.test.ts -t autoRouteOnOverBudget`
Expected: FAIL — property does not exist on `DEFAULT_SETTINGS`.

- [ ] **Step 3: Add the field**

In `electron/services/settings.ts`, add to `AppSettings`:

```ts
export interface AppSettings {
  theme?: 'dark' | 'light' | 'system';
  autoSave?: boolean;
  defaultOutputPath?: string;
  backendAutostart?: boolean;
  notifyOnGenerationComplete?: boolean;
  notifyOnGenerationFailed?: boolean;
  notifyOnModelDownloads?: boolean;
  pythonPath?: string;
  /** When true, a Local over-budget job silently routes to the account fallback provider (M6 S8). */
  autoRouteOnOverBudget?: boolean;
}
```

In `electron/services/outputRoots.ts`, extend `DEFAULT_SETTINGS`:

```ts
export const DEFAULT_SETTINGS: Required<Omit<AppSettings, 'pythonPath'>> = {
  theme: 'dark',
  autoSave: true,
  defaultOutputPath: '',
  backendAutostart: true,
  notifyOnGenerationComplete: true,
  notifyOnGenerationFailed: true,
  notifyOnModelDownloads: true,
  autoRouteOnOverBudget: false,
};
```

In `src/types/electron.d.ts`, add `autoRouteOnOverBudget: boolean;` to each of the `settings.get`/`update`/`reset` return literals (three occurrences).

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run electron/services/settings.test.ts` then `npm run typecheck`
Expected: PASS both. (`settings:get/update` already spread, so no handler change is needed.)

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/settings.ts electron/services/outputRoots.ts electron/services/settings.test.ts src/types/electron.d.ts
git branch --show-current
git commit -m "feat(settings): add autoRouteOnOverBudget (default false)"
```

---

### Task 9: Extend the accounts model for HuggingFace + fallback provider

**Files:**
- Modify: `electron/services/userAccounts.ts`
- Modify: `electron/services/userAccounts.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `electron/services/userAccounts.test.ts`:

```ts
describe('HuggingFace BYOK token', () => {
  it('stores and decrypts an HF token without exposing it in account metadata', () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = service.setHuggingFaceToken(accountId, 'hf_secrettoken');

    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(true);
    expect(service.getHuggingFaceToken(accountId)).toBe('hf_secrettoken');
    const persisted = store.peek().userAccounts as { secrets: Record<string, { huggingFaceToken?: string }> };
    expect(persisted.secrets[accountId].huggingFaceToken).not.toContain('hf_secrettoken');
  });

  it('reverts huggingface provider preferences to local when the HF token is cleared', () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    service.updateAccount(accountId, { imageGenerationProvider: 'huggingface', huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell' });
    service.setHuggingFaceToken(accountId, 'hf_secrettoken');

    const snapshot = service.clearHuggingFaceToken(accountId);

    expect(snapshot.accounts[0].huggingFace.tokenStored).toBe(false);
    expect(snapshot.accounts[0].preferences.imageGenerationProvider).toBe('local');
    expect(service.getHuggingFaceToken(accountId)).toBeNull();
  });

  it('persists a fallbackProvider preference', () => {
    const store = createStore();
    const service = createUserAccountsService({ store, safeStorage: createSafeStorage() });
    const accountId = service.listAccounts().accounts[0].id;

    const snapshot = service.updateAccount(accountId, { fallbackProvider: 'huggingface' });

    expect(snapshot.accounts[0].preferences.fallbackProvider).toBe('huggingface');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run electron/services/userAccounts.test.ts -t HuggingFace`
Expected: FAIL — `setHuggingFaceToken` is not a function.

- [ ] **Step 3: Extend the account model**

In `electron/services/userAccounts.ts`:

(a) Widen the provider unions and add fields:

```ts
export type PromptEnhancementProvider = 'local' | 'openrouter' | 'huggingface';
export type ImageGenerationProvider = 'local' | 'openrouter' | 'huggingface';
export type FallbackProvider = 'openrouter' | 'huggingface';
```

(b) Extend `UserAccountRecord`:

```ts
export interface UserAccountRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preferences: {
    promptEnhancementProvider: PromptEnhancementProvider;
    openRouterModel: string;
    imageGenerationProvider: ImageGenerationProvider;
    openRouterImageModel: string;
    huggingFaceModel: string;
    huggingFaceImageModel: string;
    huggingFaceVideoModel: string;
    fallbackProvider: FallbackProvider | null;
  };
  openRouter: {
    apiKeyStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
  huggingFace: {
    tokenStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
}
```

(c) Extend the secrets shape:

```ts
export interface UserAccountsState {
  activeAccountId: string | null;
  accounts: UserAccountRecord[];
  secrets: Record<string, { openRouterApiKey?: string; huggingFaceToken?: string }>;
}
```

(d) Extend `UserAccountUpdatePatch`:

```ts
type UserAccountUpdatePatch = {
  name?: string;
  promptEnhancementProvider?: PromptEnhancementProvider;
  openRouterModel?: string;
  imageGenerationProvider?: ImageGenerationProvider;
  openRouterImageModel?: string;
  huggingFaceModel?: string;
  huggingFaceImageModel?: string;
  huggingFaceVideoModel?: string;
  fallbackProvider?: FallbackProvider | null;
};
```

(e) In `cloneAccount`, clone the new block:

```ts
function cloneAccount(account: UserAccountRecord): UserAccountRecord {
  return {
    ...account,
    preferences: { ...account.preferences },
    openRouter: { ...account.openRouter },
    huggingFace: { ...account.huggingFace },
  };
}
```

(f) In `createAccountRecord`, seed defaults:

```ts
    preferences: {
      promptEnhancementProvider: 'local',
      openRouterModel: '',
      imageGenerationProvider: 'local',
      openRouterImageModel: '',
      huggingFaceModel: '',
      huggingFaceImageModel: '',
      huggingFaceVideoModel: '',
      fallbackProvider: null,
    },
    openRouter: {
      apiKeyStored: false,
      keyLabel: null,
      lastValidatedAt: null,
    },
    huggingFace: {
      tokenStored: false,
      keyLabel: null,
      lastValidatedAt: null,
    },
```

(g) In `readState`, normalize the new fields (mirror the existing block):

```ts
        preferences: {
          promptEnhancementProvider: account.preferences?.promptEnhancementProvider ?? 'local',
          openRouterModel: account.preferences?.openRouterModel ?? '',
          imageGenerationProvider: account.preferences?.imageGenerationProvider ?? 'local',
          openRouterImageModel: account.preferences?.openRouterImageModel ?? '',
          huggingFaceModel: account.preferences?.huggingFaceModel ?? '',
          huggingFaceImageModel: account.preferences?.huggingFaceImageModel ?? '',
          huggingFaceVideoModel: account.preferences?.huggingFaceVideoModel ?? '',
          fallbackProvider: account.preferences?.fallbackProvider ?? null,
        },
        openRouter: {
          apiKeyStored: Boolean(account.openRouter?.apiKeyStored),
          keyLabel: account.openRouter?.keyLabel ?? null,
          lastValidatedAt: account.openRouter?.lastValidatedAt ?? null,
        },
        huggingFace: {
          tokenStored: Boolean(account.huggingFace?.tokenStored),
          keyLabel: account.huggingFace?.keyLabel ?? null,
          lastValidatedAt: account.huggingFace?.lastValidatedAt ?? null,
        },
```

(h) In `updateAccount`, thread the new preference fields and carry `huggingFace`:

```ts
      preferences: {
        promptEnhancementProvider:
          patch.promptEnhancementProvider ?? account.preferences.promptEnhancementProvider,
        openRouterModel:
          patch.openRouterModel !== undefined ? patch.openRouterModel.trim() : account.preferences.openRouterModel,
        imageGenerationProvider:
          patch.imageGenerationProvider ?? account.preferences.imageGenerationProvider,
        openRouterImageModel:
          patch.openRouterImageModel !== undefined ? patch.openRouterImageModel.trim() : account.preferences.openRouterImageModel,
        huggingFaceModel:
          patch.huggingFaceModel !== undefined ? patch.huggingFaceModel.trim() : account.preferences.huggingFaceModel,
        huggingFaceImageModel:
          patch.huggingFaceImageModel !== undefined ? patch.huggingFaceImageModel.trim() : account.preferences.huggingFaceImageModel,
        huggingFaceVideoModel:
          patch.huggingFaceVideoModel !== undefined ? patch.huggingFaceVideoModel.trim() : account.preferences.huggingFaceVideoModel,
        fallbackProvider:
          patch.fallbackProvider !== undefined ? patch.fallbackProvider : account.preferences.fallbackProvider,
      },
      openRouter: { ...account.openRouter },
      huggingFace: { ...account.huggingFace },
```

(i) Add the HF key methods (mirror the OpenRouter ones) before `return`:

```ts
  function setHuggingFaceToken(accountId: string, token: string) {
    const normalized = token.trim();
    if (!normalized) {
      throw new Error('HuggingFace token cannot be empty.');
    }
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextSecrets = {
      ...state.secrets,
      [accountId]: { ...(state.secrets[accountId] ?? {}), huggingFaceToken: encryptSecret(normalized) },
    };
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      huggingFace: { ...account.huggingFace, tokenStored: true, keyLabel: null, lastValidatedAt: null },
    };
    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) => (candidate.id === accountId ? nextAccount : candidate)),
      secrets: nextSecrets,
    });
  }

  function clearHuggingFaceToken(accountId: string) {
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextSecrets = { ...state.secrets };
    if (nextSecrets[accountId]) {
      const { huggingFaceToken: _removed, ...rest } = nextSecrets[accountId];
      nextSecrets[accountId] = rest;
    }
    const revert = (provider: ImageGenerationProvider | PromptEnhancementProvider) =>
      provider === 'huggingface' ? 'local' : provider;
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      huggingFace: { tokenStored: false, keyLabel: null, lastValidatedAt: null },
      preferences: {
        ...account.preferences,
        promptEnhancementProvider: revert(account.preferences.promptEnhancementProvider),
        imageGenerationProvider: revert(account.preferences.imageGenerationProvider),
        fallbackProvider: account.preferences.fallbackProvider === 'huggingface' ? null : account.preferences.fallbackProvider,
      },
    };
    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) => (candidate.id === accountId ? nextAccount : candidate)),
      secrets: nextSecrets,
    });
  }

  function getHuggingFaceToken(accountId?: string | null) {
    const state = readState();
    const resolvedAccountId = accountId ?? state.activeAccountId;
    if (!resolvedAccountId) {
      return null;
    }
    return decryptSecret(state.secrets[resolvedAccountId]?.huggingFaceToken);
  }

  function markHuggingFaceVerified(accountId: string, details: { label?: string | null }) {
    const state = readState();
    const account = resolveAccount(state, accountId);
    const nextAccount: UserAccountRecord = {
      ...account,
      updatedAt: new Date().toISOString(),
      huggingFace: {
        ...account.huggingFace,
        tokenStored: true,
        keyLabel: details.label?.trim() || account.huggingFace.keyLabel,
        lastValidatedAt: new Date().toISOString(),
      },
    };
    return writeState({
      ...state,
      accounts: state.accounts.map((candidate) => (candidate.id === accountId ? nextAccount : candidate)),
    });
  }
```

(j) Add them to the returned object:

```ts
    setHuggingFaceToken,
    clearHuggingFaceToken,
    getHuggingFaceToken,
    markHuggingFaceVerified,
```

Note: the `encryptSecret` error message mentions "OpenRouter keys"; broaden it to "BYOK keys cannot be stored." for accuracy.

- [ ] **Step 4: Update the existing test fixture (it asserts the account shape indirectly)**

The existing `clearOpenRouterApiKey` test in `userAccounts.test.ts` still passes (no shape assertion on huggingFace). Run the full file:

Run: `npx vitest run electron/services/userAccounts.test.ts`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/userAccounts.ts electron/services/userAccounts.test.ts
git branch --show-current
git commit -m "feat(accounts): HuggingFace BYOK token + HF model prefs + fallbackProvider"
```

---

### Task 10: Wire HF token + extended account IPC

**Files:**
- Modify: `electron/services/mainIpc.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: Add the IPC handlers**

In `electron/services/mainIpc.ts`, extend the `accounts:update` patch type and add the HF token handlers next to the OpenRouter ones:

```ts
  ipcMain.handle(
    'accounts:update',
    (
      _event,
      accountId: string,
      patch: {
        name?: string;
        promptEnhancementProvider?: PromptEnhancementProvider;
        openRouterModel?: string;
        imageGenerationProvider?: ImageGenerationProvider;
        openRouterImageModel?: string;
        huggingFaceModel?: string;
        huggingFaceImageModel?: string;
        huggingFaceVideoModel?: string;
        fallbackProvider?: 'openrouter' | 'huggingface' | null;
      },
    ) => userAccounts.updateAccount(accountId, patch),
  );

  ipcMain.handle(
    'accounts:set-huggingface-token',
    (_event, payload: { accountId: string; token: string }) => {
      return userAccounts.setHuggingFaceToken(payload.accountId, payload.token);
    },
  );

  ipcMain.handle('accounts:clear-huggingface-token', (_event, accountId: string) => {
    return userAccounts.clearHuggingFaceToken(accountId);
  });
```

- [ ] **Step 2: Expose via preload**

In `electron/preload.ts`, add to the `accounts` object:

```ts
    setHuggingFaceToken: (payload) => ipcRenderer.invoke('accounts:set-huggingface-token', payload),
    clearHuggingFaceToken: (accountId) => ipcRenderer.invoke('accounts:clear-huggingface-token', accountId),
```

- [ ] **Step 3: Type the renderer surface**

In `src/types/electron.d.ts`, extend `UserAccountSummary` to mirror the new record shape, extend the `accounts.update` patch type, and add the two channels:

```ts
export interface UserAccountSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preferences: {
    promptEnhancementProvider: 'local' | 'openrouter' | 'huggingface';
    openRouterModel: string;
    imageGenerationProvider: 'local' | 'openrouter' | 'huggingface';
    openRouterImageModel: string;
    huggingFaceModel: string;
    huggingFaceImageModel: string;
    huggingFaceVideoModel: string;
    fallbackProvider: 'openrouter' | 'huggingface' | null;
  };
  openRouter: {
    apiKeyStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
  huggingFace: {
    tokenStored: boolean;
    keyLabel: string | null;
    lastValidatedAt: string | null;
  };
}
```

In the `accounts` interface, update the `update` patch and add channels:

```ts
    update: (
      accountId: string,
      patch: {
        name?: string;
        promptEnhancementProvider?: 'local' | 'openrouter' | 'huggingface';
        openRouterModel?: string;
        imageGenerationProvider?: 'local' | 'openrouter' | 'huggingface';
        openRouterImageModel?: string;
        huggingFaceModel?: string;
        huggingFaceImageModel?: string;
        huggingFaceVideoModel?: string;
        fallbackProvider?: 'openrouter' | 'huggingface' | null;
      }
    ) => Promise<UserAccountsSnapshot>;
    setHuggingFaceToken: (payload: { accountId: string; token: string }) => Promise<UserAccountsSnapshot>;
    clearHuggingFaceToken: (accountId: string) => Promise<UserAccountsSnapshot>;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (channel names mirrored across preload, handlers, and types).

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/services/mainIpc.ts electron/preload.ts src/types/electron.d.ts
git branch --show-current
git commit -m "feat(accounts): HF token IPC channels + extended update patch"
```

---

## Phase D - Dispatch integration (main process)

### Task 11: Generalized hosted job routing + HF image job store/runner

**Files:**
- Create: `electron/ipc-handlers/hostedImageRouting.ts`
- Create: `electron/ipc-handlers/hostedImageRouting.test.ts`
- Create: `electron/ipc-handlers/huggingfaceImageJobs.ts`
- Create: `electron/ipc-handlers/runHuggingFaceImageJob.ts`
- Create: `electron/ipc-handlers/runHuggingFaceImageJob.test.ts`

- [ ] **Step 1: Write the failing routing test**

Create `electron/ipc-handlers/hostedImageRouting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HUGGINGFACE_JOB_PREFIX, isHuggingFaceJobId, routedJobProvider } from './hostedImageRouting';

describe('hostedImageRouting', () => {
  it('discriminates HuggingFace job ids by prefix + separator', () => {
    expect(isHuggingFaceJobId(`${HUGGINGFACE_JOB_PREFIX}-abc`)).toBe(true);
    expect(isHuggingFaceJobId('huggingface-images-abc')).toBe(false);
  });

  it('maps a job id to its provider', () => {
    expect(routedJobProvider('openrouter-image-1')).toBe('openrouter');
    expect(routedJobProvider('huggingface-image-1')).toBe('huggingface');
    expect(routedJobProvider('backend-uuid-1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run electron/ipc-handlers/hostedImageRouting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generalized routing helpers**

Create `electron/ipc-handlers/hostedImageRouting.ts`:

```ts
import { OPENROUTER_JOB_PREFIX, isOpenRouterJobId } from './openRouterImageRouting';
import type { ProviderId } from '../../shared/providerRouting';

export const HUGGINGFACE_JOB_PREFIX = 'huggingface-image';

export function isHuggingFaceJobId(jobId: string): boolean {
  return jobId.startsWith(`${HUGGINGFACE_JOB_PREFIX}-`);
}

/** Returns the hosted provider that owns a job id, or null for backend jobs. */
export function routedJobProvider(jobId: string): Exclude<ProviderId, 'local'> | null {
  if (isOpenRouterJobId(jobId)) return 'openrouter';
  if (isHuggingFaceJobId(jobId)) return 'huggingface';
  return null;
}

export { OPENROUTER_JOB_PREFIX };
```

- [ ] **Step 4: Run the routing test to pass**

Run: `npx vitest run electron/ipc-handlers/hostedImageRouting.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the HF image job store**

Create `electron/ipc-handlers/huggingfaceImageJobs.ts` (mirror of `openRouterImageJobs.ts`):

```ts
import type { OpenRouterImageJobStatus } from './openRouterImageRouting';

export type HuggingFaceImageJob = {
  job_id: string;
  status: OpenRouterImageJobStatus;
  progress: number;
  type: 'image';
  created_at: string;
  completed_at?: string;
  error?: string;
  result?: {
    images?: string[];
    seed?: number;
    provider?: 'huggingface';
    model?: string | null;
  };
  params?: Record<string, unknown>;
  abortController?: AbortController;
};

export type HuggingFaceImageJobSnapshot = Omit<HuggingFaceImageJob, 'abortController'>;
export type HuggingFaceImageJobEmit = (channel: string, payload: unknown) => void;

export type HuggingFaceImageJobStore = {
  get(jobId: string): HuggingFaceImageJob | null;
  getStatus(jobId: string): HuggingFaceImageJobSnapshot | null;
  set(job: HuggingFaceImageJob): HuggingFaceImageJob;
  patch(jobId: string, patch: Partial<HuggingFaceImageJob>): HuggingFaceImageJob | null;
  values(): HuggingFaceImageJobSnapshot[];
};

function snapshot(job: HuggingFaceImageJob): HuggingFaceImageJobSnapshot {
  const { abortController: _abortController, ...rest } = job;
  return rest;
}

export function createHuggingFaceImageJobStore({ emit }: { emit: HuggingFaceImageJobEmit }): HuggingFaceImageJobStore {
  const jobs = new Map<string, HuggingFaceImageJob>();
  function emitProgress(job: HuggingFaceImageJob) {
    emit('generation:progress', { type: 'job_update', job_id: job.job_id, status: job.status, progress: job.progress });
  }
  return {
    get(jobId) {
      return jobs.get(jobId) ?? null;
    },
    getStatus(jobId) {
      const job = jobs.get(jobId);
      return job ? snapshot(job) : null;
    },
    set(job) {
      jobs.set(job.job_id, job);
      emitProgress(job);
      return job;
    },
    patch(jobId, patch) {
      const current = jobs.get(jobId);
      if (!current) return null;
      const nextJob: HuggingFaceImageJob = {
        ...current,
        ...patch,
        result: patch.result ? { ...current.result, ...patch.result } : current.result,
      };
      jobs.set(jobId, nextJob);
      emitProgress(nextJob);
      return nextJob;
    },
    values() {
      return Array.from(jobs.values()).map(snapshot);
    },
  };
}
```

- [ ] **Step 6: Write the failing runner test**

Create `electron/ipc-handlers/runHuggingFaceImageJob.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { runHuggingFaceImageJob } from './runHuggingFaceImageJob';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}`;

function makeAccount() {
  return {
    id: 'account-1',
    preferences: { huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell' },
    huggingFace: { tokenStored: true },
  };
}

function setup({ tempRoot = '' } = {}) {
  const emit = vi.fn();
  const store = createHuggingFaceImageJobStore({ emit });
  const userAccounts = { getAccount: vi.fn(() => makeAccount()), getHuggingFaceToken: vi.fn(() => 'hf_token') };
  const huggingFace = { generateImage: vi.fn(async () => ({ model: 'm', images: [{ dataUrl: PNG_DATA_URL, mimeType: 'image/png' }], usage: null })) };
  const outputRoots = { getResolvedOutputDirectory: vi.fn(() => tempRoot), rememberOutputRoot: vi.fn() };
  return { emit, store, deps: { store, userAccounts, huggingFace, outputRoots } };
}

describe('runHuggingFaceImageJob', () => {
  it('fails the job with a sanitized error when no token is configured', async () => {
    const h = setup();
    h.deps.userAccounts.getHuggingFaceToken = vi.fn(() => null);
    h.store.set({ job_id: 'huggingface-image-1', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob('huggingface-image-1', { prompt: 'a tree', width: 512, height: 512, __huggingFaceAccountId: 'account-1' }, h.deps);
    const job = h.store.get('huggingface-image-1');
    expect(job?.status).toBe('failed');
    expect(job?.error).toBeTruthy();
    expect(JSON.stringify(job)).not.toContain('hf_token');
  });

  it('runs the lifecycle to completed and never persists the token', async () => {
    const h = setup();
    h.store.set({ job_id: 'huggingface-image-2', status: 'pending', progress: 0, type: 'image', created_at: '2026-06-16T00:00:00.000Z' });
    await runHuggingFaceImageJob('huggingface-image-2', { prompt: 'a tree', width: 512, height: 512, seed: 7, __huggingFaceAccountId: 'account-1' }, h.deps);
    const job = h.store.get('huggingface-image-2');
    expect(job?.status).toBe('completed');
    expect(job?.progress).toBe(100);
    expect(job?.result?.provider).toBe('huggingface');
    expect(JSON.stringify(job)).not.toContain('hf_token');
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run electron/ipc-handlers/runHuggingFaceImageJob.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement the runner**

Create `electron/ipc-handlers/runHuggingFaceImageJob.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { HUGGINGFACE_JOB_PREFIX } from './hostedImageRouting';

type RunDeps = {
  store: HuggingFaceImageJobStore;
  userAccounts: {
    getAccount: (id?: string | null) => { id: string; preferences: { huggingFaceImageModel: string }; huggingFace: { tokenStored: boolean } } | null;
    getHuggingFaceToken: (id?: string | null) => string | null;
  };
  huggingFace: {
    generateImage: (args: {
      token: string;
      model: string;
      prompt: string;
      negativePrompt?: string;
      width: number;
      height: number;
      seed?: number;
      signal?: AbortSignal;
    }) => Promise<{ model: string | null; images: Array<{ dataUrl: string; mimeType: string }>; usage: unknown }>;
  };
  outputRoots: { getResolvedOutputDirectory: () => string; rememberOutputRoot: (dir: string) => void };
};

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function failJob(store: HuggingFaceImageJobStore, jobId: string, message: string) {
  store.patch(jobId, { status: 'failed', progress: 100, completed_at: new Date().toISOString(), error: message, abortController: undefined });
}

async function persistDataUrl(dir: string, jobId: string, index: number, dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Malformed image payload.');
  }
  const ext = MIME_EXT[match[1].toLowerCase()] ?? 'png';
  const today = new Date().toISOString().slice(0, 10);
  const targetDir = path.join(dir, 'huggingface', today);
  await fs.mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${jobId}-${index}.${ext}`);
  await fs.writeFile(filePath, Buffer.from(match[2], 'base64'));
  return filePath.replace(/\\/g, '/');
}

export async function runHuggingFaceImageJob(jobId: string, params: Record<string, unknown>, deps: RunDeps): Promise<void> {
  const { store, userAccounts, huggingFace, outputRoots } = deps;
  const accountId = typeof params.__huggingFaceAccountId === 'string' ? params.__huggingFaceAccountId : null;
  try {
    const account = userAccounts.getAccount(accountId);
    const token = userAccounts.getHuggingFaceToken(accountId);
    if (!account || !account.huggingFace.tokenStored || !token) {
      failJob(store, jobId, 'HuggingFace is selected, but no token is stored for the active account.');
      return;
    }
    const model = (typeof params.model === 'string' && params.model.trim()) || account.preferences.huggingFaceImageModel.trim();
    if (!model) {
      failJob(store, jobId, 'Select a HuggingFace image model before generating.');
      return;
    }
    const controller = new AbortController();
    store.patch(jobId, { status: 'processing', progress: 12, abortController: controller });

    const outputDir = outputRoots.getResolvedOutputDirectory();
    const result = await huggingFace.generateImage({
      token,
      model,
      prompt: String(params.prompt ?? ''),
      negativePrompt: typeof params.negative_prompt === 'string' ? params.negative_prompt : undefined,
      width: typeof params.width === 'number' ? params.width : 1024,
      height: typeof params.height === 'number' ? params.height : 1024,
      seed: typeof params.seed === 'number' && params.seed >= 0 ? params.seed : undefined,
      signal: controller.signal,
    });

    store.patch(jobId, { progress: 72 });
    const images: string[] = [];
    if (outputDir) {
      for (let index = 0; index < result.images.length; index += 1) {
        images.push(await persistDataUrl(outputDir, jobId, index, result.images[index].dataUrl));
      }
      outputRoots.rememberOutputRoot(outputDir);
    } else {
      images.push(...result.images.map((image) => image.dataUrl));
    }

    store.patch(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      abortController: undefined,
      result: { images, provider: 'huggingface', model: result.model, seed: typeof params.seed === 'number' ? params.seed : undefined },
    });
  } catch (error) {
    const message = (error as { name?: string } | null)?.name === 'AbortError'
      ? 'HuggingFace image generation was cancelled.'
      : error instanceof Error
        ? error.message
        : 'HuggingFace image generation failed.';
    failJob(store, jobId, message);
  }
}

export { HUGGINGFACE_JOB_PREFIX };
```

- [ ] **Step 9: Run the runner test to pass**

Run: `npx vitest run electron/ipc-handlers/runHuggingFaceImageJob.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/ipc-handlers/hostedImageRouting.ts electron/ipc-handlers/hostedImageRouting.test.ts electron/ipc-handlers/huggingfaceImageJobs.ts electron/ipc-handlers/runHuggingFaceImageJob.ts electron/ipc-handlers/runHuggingFaceImageJob.test.ts
git branch --show-current
git commit -m "feat(dispatch): HF image job store + runner + generalized job routing"
```

---

### Task 12: Resolver-driven dispatch in generation.ts

**Files:**
- Modify: `electron/ipc-handlers/generation.ts`

The existing OpenRouter path stays. This task adds the HF branch and routes status/cancel by `routedJobProvider`. The capability/over-budget decision is enforced in the renderer (Task 15) and re-checked here for hosted requests; the main process refuses an HF request that lacks a token/model via the runner's structured failure (Task 11).

- [ ] **Step 1: Add the HF service dependency and dispatcher**

In `electron/ipc-handlers/generation.ts`, extend imports and service wiring:

```ts
import type { createHuggingFaceInferenceService } from '../services/huggingfaceInference';
import { createHuggingFaceImageJobStore } from './huggingfaceImageJobs';
import { runHuggingFaceImageJob } from './runHuggingFaceImageJob';
import { HUGGINGFACE_JOB_PREFIX, routedJobProvider } from './hostedImageRouting';
```

```ts
type HuggingFaceService = ReturnType<typeof createHuggingFaceInferenceService>;
let huggingFaceService: HuggingFaceService | null = null;

const huggingFaceImageJobStore = createHuggingFaceImageJobStore({
  emit: (channel, payload) => mainWindow?.webContents.send(channel, payload),
});

function dispatchHuggingFaceImageJob(jobId: string, params: Record<string, unknown>) {
  if (!userAccountsService || !huggingFaceService || !outputRootService) {
    huggingFaceImageJobStore.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'HuggingFace is selected, but the active account is not fully configured.',
    });
    return;
  }
  void runHuggingFaceImageJob(jobId, params, {
    store: huggingFaceImageJobStore,
    userAccounts: userAccountsService,
    huggingFace: huggingFaceService,
    outputRoots: outputRootService,
  });
}
```

Extend `configureGenerationHandlerServices` to accept and store `huggingFace`:

```ts
export function configureGenerationHandlerServices({
  userAccounts,
  openRouter,
  huggingFace,
  outputRoots,
}: {
  userAccounts: UserAccountsService;
  openRouter: OpenRouterService;
  huggingFace: HuggingFaceService;
  outputRoots: OutputRootService;
}) {
  userAccountsService = userAccounts;
  openRouterService = openRouter;
  huggingFaceService = huggingFace;
  outputRootService = outputRoots;
}
```

> Update the single call site of `configureGenerationHandlerServices` (in `electron/main.ts` or `electron/services/mainIpc.ts` — grep for it) to construct and pass `createHuggingFaceInferenceService()`. Add `import { createHuggingFaceInferenceService } from './services/huggingfaceInference';` there and pass `huggingFace: createHuggingFaceInferenceService()`.

- [ ] **Step 2: Add the HF branch in `generation:generate-image`**

Insert a HuggingFace branch after the OpenRouter branch and before the local fallback:

```ts
  if (activeAccount?.preferences.imageGenerationProvider === 'huggingface') {
    if (!activeAccount.huggingFace.tokenStored) {
      return { success: false, error: 'HuggingFace is selected for still images, but no token is stored for the active account.' };
    }
    const requestedModel =
      (typeof params?.model === 'string' && params.model.trim()) || activeAccount.preferences.huggingFaceImageModel.trim();
    if (!requestedModel) {
      return { success: false, error: 'Select a HuggingFace image model for the active account before generating.' };
    }
    const jobId = `${HUGGINGFACE_JOB_PREFIX}-${crypto.randomUUID()}`;
    huggingFaceImageJobStore.set({ job_id: jobId, status: 'pending', progress: 0, type: 'image', created_at: new Date().toISOString(), params });
    dispatchHuggingFaceImageJob(jobId, { ...params, model: requestedModel, __huggingFaceAccountId: activeAccount.id });
    return { success: true, jobId };
  }
```

- [ ] **Step 3: Route status/cancel by provider**

In `generation:get-status`, replace the OpenRouter-only check with provider routing:

```ts
ipcMain.handle('generation:get-status', async (_event, jobId: string) => {
  const provider = routedJobProvider(jobId);
  if (provider === 'openrouter') {
    const status = openRouterImageJobStore.getStatus(jobId);
    if (status) return status;
  }
  if (provider === 'huggingface') {
    const status = huggingFaceImageJobStore.getStatus(jobId);
    if (status) return status;
  }
  // ...existing backend fetch unchanged
```

In `generation:cancel`, add the HF arm mirroring the OpenRouter arm (abort the controller, patch to `cancelled`). Use `routedJobProvider(jobId) === 'huggingface'` and `huggingFaceImageJobStore`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full electron suite (regression)**

Run: `npx vitest run electron`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add electron/ipc-handlers/generation.ts electron/services/mainIpc.ts electron/main.ts
git branch --show-current
git commit -m "feat(dispatch): route still-image generation to HuggingFace Inference"
```

---

## Phase E - Renderer (capability gating, fallback, usage)

### Task 13: Renderer route-input adapter

**Files:**
- Create: `src/features/routing/buildRouteResolverInput.ts`
- Create: `src/features/routing/buildRouteResolverInput.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/routing/buildRouteResolverInput.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UserAccountSummary } from '@/types/electron';
import { configuredHostedProviders, buildRouteResolverInput } from './buildRouteResolverInput';

function account(overrides?: Partial<UserAccountSummary>): UserAccountSummary {
  return {
    id: 'a1',
    name: 'Primary',
    createdAt: '',
    updatedAt: '',
    preferences: {
      promptEnhancementProvider: 'local',
      openRouterModel: '',
      imageGenerationProvider: 'local',
      openRouterImageModel: '',
      huggingFaceModel: '',
      huggingFaceImageModel: '',
      huggingFaceVideoModel: '',
      fallbackProvider: null,
      ...overrides?.preferences,
    },
    openRouter: { apiKeyStored: false, keyLabel: null, lastValidatedAt: null, ...overrides?.openRouter },
    huggingFace: { tokenStored: false, keyLabel: null, lastValidatedAt: null, ...overrides?.huggingFace },
  };
}

describe('configuredHostedProviders', () => {
  it('reports a hosted provider configured only with a key AND a model for the modality', () => {
    const ready = account({
      openRouter: { apiKeyStored: true, keyLabel: null, lastValidatedAt: null },
      preferences: {
        promptEnhancementProvider: 'local', openRouterModel: '', imageGenerationProvider: 'local',
        openRouterImageModel: 'x/y', huggingFaceModel: '', huggingFaceImageModel: '', huggingFaceVideoModel: '', fallbackProvider: null,
      },
    });
    expect(configuredHostedProviders(ready, 'still-image')).toEqual(['openrouter']);
  });

  it('treats HF as configured for video only with a token + video model', () => {
    const ready = account({
      huggingFace: { tokenStored: true, keyLabel: null, lastValidatedAt: null },
      preferences: {
        promptEnhancementProvider: 'local', openRouterModel: '', imageGenerationProvider: 'local',
        openRouterImageModel: '', huggingFaceModel: '', huggingFaceImageModel: '', huggingFaceVideoModel: 'Lightricks/LTX-Video', fallbackProvider: 'huggingface',
      },
    });
    expect(configuredHostedProviders(ready, 'video')).toEqual(['huggingface']);
  });
});

describe('buildRouteResolverInput', () => {
  it('assembles a resolver input from the account + settings + fit', () => {
    const input = buildRouteResolverInput({
      account: account({ preferences: { promptEnhancementProvider: 'local', openRouterModel: '', imageGenerationProvider: 'local', openRouterImageModel: '', huggingFaceModel: '', huggingFaceImageModel: '', huggingFaceVideoModel: '', fallbackProvider: 'huggingface' } }),
      modality: 'still-image',
      requested: 'local',
      autoRouteOnOverBudget: true,
      fit: 'over-budget',
    });
    expect(input).toMatchObject({ modality: 'still-image', requested: 'local', autoRouteOnOverBudget: true, fit: 'over-budget', fallbackProvider: 'huggingface' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/routing/buildRouteResolverInput.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

Create `src/features/routing/buildRouteResolverInput.ts`:

```ts
import type { UserAccountSummary } from '@/types/electron';
import type { ProviderId, RequestModality, FitVerdict } from '../../../shared/providerRouting';
import type { RouteResolverInput } from '../../../shared/resolveRoute';

function hostedHasModelForModality(account: UserAccountSummary, provider: Exclude<ProviderId, 'local'>, modality: RequestModality): boolean {
  if (provider === 'openrouter') {
    // OpenRouter supports still-image + llm only; capability gating handles the rest.
    if (modality === 'still-image') return Boolean(account.preferences.openRouterImageModel.trim());
    if (modality === 'llm-assist') return Boolean(account.preferences.openRouterModel.trim());
    return false;
  }
  // huggingface
  if (modality === 'video') return Boolean(account.preferences.huggingFaceVideoModel.trim());
  if (modality === 'llm-assist') return Boolean(account.preferences.huggingFaceModel.trim());
  // still-image / controlnet / inpaint share the image model
  return Boolean(account.preferences.huggingFaceImageModel.trim());
}

export function configuredHostedProviders(account: UserAccountSummary | null, modality: RequestModality): ProviderId[] {
  if (!account) return [];
  const result: ProviderId[] = [];
  if (account.openRouter.apiKeyStored && hostedHasModelForModality(account, 'openrouter', modality)) {
    result.push('openrouter');
  }
  if (account.huggingFace.tokenStored && hostedHasModelForModality(account, 'huggingface', modality)) {
    result.push('huggingface');
  }
  return result;
}

export function buildRouteResolverInput({
  account,
  modality,
  requested,
  autoRouteOnOverBudget,
  fit,
}: {
  account: UserAccountSummary | null;
  modality: RequestModality;
  requested: ProviderId;
  autoRouteOnOverBudget: boolean;
  fit?: FitVerdict | null;
}): RouteResolverInput {
  return {
    modality,
    requested,
    configuredHosted: configuredHostedProviders(account, modality),
    autoRouteOnOverBudget,
    fit: fit ?? null,
    fallbackProvider: account?.preferences.fallbackProvider ?? null,
  };
}
```

- [ ] **Step 4: Run the test to pass + typecheck**

Run: `npx vitest run src/features/routing/buildRouteResolverInput.test.ts` then `npm run typecheck`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/features/routing/buildRouteResolverInput.ts src/features/routing/buildRouteResolverInput.test.ts
git branch --show-current
git commit -m "feat(routing): renderer route-input adapter"
```

---

### Task 14: Over-budget fallback dialog (3 actions)

**Files:**
- Create: `src/components/generate/OverBudgetFallbackDialog.tsx`
- Create: `src/components/generate/OverBudgetFallbackDialog.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/generate/OverBudgetFallbackDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverBudgetFallbackDialog } from './OverBudgetFallbackDialog';

describe('OverBudgetFallbackDialog', () => {
  it('offers each capable candidate plus run-locally and cancel', () => {
    const onRouteTo = vi.fn();
    const onRunLocally = vi.fn();
    const onCancel = vi.fn();
    render(
      <OverBudgetFallbackDialog
        open
        candidates={['openrouter', 'huggingface']}
        onRouteTo={onRouteTo}
        onRunLocally={onRunLocally}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fallback-route-huggingface'));
    expect(onRouteTo).toHaveBeenCalledWith('huggingface');
    fireEvent.click(screen.getByTestId('fallback-run-locally'));
    expect(onRunLocally).toHaveBeenCalled();
  });

  it('shows a no-fallback note when there are no candidates', () => {
    render(<OverBudgetFallbackDialog open candidates={[]} onRouteTo={vi.fn()} onRunLocally={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('fallback-no-candidates')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/generate/OverBudgetFallbackDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog (mirrors `ConfirmDialog` pattern, Carbon Pro)**

Create `src/components/generate/OverBudgetFallbackDialog.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ProviderId } from '../../../shared/providerRouting';

const PROVIDER_LABEL: Record<Exclude<ProviderId, 'local'>, string> = {
  openrouter: 'OpenRouter',
  huggingface: 'HuggingFace',
};

interface OverBudgetFallbackDialogProps {
  open: boolean;
  candidates: ProviderId[];
  onRouteTo: (provider: ProviderId) => void;
  onRunLocally: () => void;
  onCancel: () => void;
}

/**
 * Surfaces the M5 over-budget verdict (S8): run locally anyway (likely OOM),
 * route to a capable configured hosted provider, or cancel. Mirrors
 * ConfirmDialog's focus-trap + Carbon Pro overlay pattern.
 */
export function OverBudgetFallbackDialog({ open, candidates, onRouteTo, onRunLocally, onCancel }: OverBudgetFallbackDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  const hosted = candidates.filter((candidate): candidate is Exclude<ProviderId, 'local'> => candidate !== 'local');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-label="Local run is over budget"
        >
          <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(event) => event.stopPropagation()}
            className="relative mx-4 w-full max-w-md rounded-lg border border-border bg-elevated p-6 shadow-cinematic"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-status-warning-muted">
                <AlertTriangle className="h-5 w-5 text-status-warning" />
              </div>
              <div className="min-w-0">
                <h3 className="type-section text-text-primary">This run is over your GPU budget</h3>
                <p className="mt-1 type-ui leading-relaxed text-text-body">
                  The selected model is unlikely to fit in VRAM. Route it to a configured hosted provider, or run locally anyway.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {hosted.length > 0 ? (
                hosted.map((provider) => (
                  <Button
                    key={provider}
                    variant="primary"
                    size="sm"
                    data-testid={`fallback-route-${provider}`}
                    onClick={() => onRouteTo(provider)}
                  >
                    Route to {PROVIDER_LABEL[provider]}
                  </Button>
                ))
              ) : (
                <p data-testid="fallback-no-candidates" className="type-caption text-text-muted">
                  No configured hosted provider can run this request. Add a key and model in Settings, or run locally anyway.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" data-testid="fallback-run-locally" onClick={onRunLocally}>
                Run locally anyway
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run the component test to pass**

Run: `npx vitest run src/components/generate/OverBudgetFallbackDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
export PATH="/c/Program Files/nodejs:$PATH"
git add src/components/generate/OverBudgetFallbackDialog.tsx src/components/generate/OverBudgetFallbackDialog.test.tsx
git branch --show-current
git commit -m "feat(ui): over-budget hosted fallback dialog"
```

---

### Task 15: Settings UI — HF provider, key, models, fallback, auto-route

**Files:**
- Modify: `src/pages/SettingsPanel.tsx`
- Modify: `src/features/accounts/providerRouting.ts`

- [ ] **Step 1: Widen `HostedProvider` for existing call sites**

In `src/features/accounts/providerRouting.ts`:

```ts
export type HostedProvider = 'local' | 'openrouter' | 'huggingface';
```

(The existing functions still return `'local'` for any non-`'openrouter'` provider; the shared resolver is the authority for HF. No behavioural change to the two existing resolvers — they remain for their current call sites.)

- [ ] **Step 2: Add the HuggingFace provider option to both provider toggles**

In `src/pages/SettingsPanel.tsx`, add a third option object `{ value: 'huggingface', label: 'HuggingFace', description: "Use the active account's HuggingFace BYOK token + models." }` to the `promptEnhancementProvider` and `imageGenerationProvider` button arrays, and change the grid to `grid-cols-3`. Disable the HuggingFace button when `!activeAccount.huggingFace.tokenStored` (capability/config gating), mirroring how OpenRouter selects are gated:

```tsx
      <button
        key={provider.value}
        type="button"
        disabled={provider.value !== 'local' && !providerReady(provider.value)}
        onClick={() => void handleUpdateActiveAccount({ imageGenerationProvider: provider.value })}
        className={cn(
          'rounded-md border px-3 py-3 text-left transition-all',
          activeAccount.preferences.imageGenerationProvider === provider.value
            ? 'border-accent-primary-border bg-accent-primary-muted'
            : 'border-border bg-surface hover:border-border-hover',
          provider.value !== 'local' && !providerReady(provider.value) ? 'cursor-not-allowed opacity-50' : '',
        )}
      >
```

with a local helper near the component top:

```tsx
  const providerReady = (provider: 'local' | 'openrouter' | 'huggingface') => {
    if (provider === 'openrouter') return activeAccount.openRouter.apiKeyStored;
    if (provider === 'huggingface') return activeAccount.huggingFace.tokenStored;
    return true;
  };
```

- [ ] **Step 3: Add the HuggingFace token + model panel**

Add a panel mirroring the OpenRouter key panel (password input, Save/Verify/Clear buttons wired to `window.electron.accounts.setHuggingFaceToken` / a `getKeyInfo`-backed verify / `clearHuggingFaceToken`), plus an HF image model select bound to `huggingFaceImageModel` and an HF video model select bound to `huggingFaceVideoModel` and an HF prompt model select bound to `huggingFaceModel`. Reuse the exact Carbon Pro structure of the OpenRouter panel (`raised-panel`, `recessed-well`, `Button` variants, `mono-label`). Populate model options from `window.electron`-less curated defaults exposed by the HF client is main-process only; for the renderer, seed the same curated ids as static `<option>`s, plus an editable text input fallback:

```tsx
    <select
      id="huggingface-image-model-select"
      value={activeAccount.preferences.huggingFaceImageModel}
      onChange={(event) => void handleUpdateActiveAccount({ huggingFaceImageModel: event.target.value })}
      disabled={!activeAccount.huggingFace.tokenStored}
      className="recessed-well w-full px-3 py-2 text-sm text-text-primary"
    >
      <option value="">Select a HuggingFace image model</option>
      <option value="black-forest-labs/FLUX.1-schnell">FLUX.1 schnell (black-forest-labs/FLUX.1-schnell)</option>
      <option value="stabilityai/stable-diffusion-xl-base-1.0">SDXL 1.0 (stabilityai/stable-diffusion-xl-base-1.0)</option>
    </select>
```

- [ ] **Step 4: Add the fallback provider + auto-route controls**

Add an over-budget policy panel: a `fallbackProvider` select (`None` / `OpenRouter` / `HuggingFace`, bound to `handleUpdateActiveAccount({ fallbackProvider })`) and an `autoRouteOnOverBudget` toggle that reads/writes `window.electron.settings`:

```tsx
    <label className="flex items-center gap-3">
      <input
        type="checkbox"
        checked={autoRouteOnOverBudget}
        onChange={(event) => void handleUpdateAutoRoute(event.target.checked)}
      />
      <span className="type-ui text-text-body">
        Auto-route over-budget local jobs to the fallback provider (skip the prompt)
      </span>
    </label>
```

with handlers:

```tsx
  const [autoRouteOnOverBudget, setAutoRouteOnOverBudget] = useState(false);
  useEffect(() => {
    void window.electron.settings.get().then((settings) => setAutoRouteOnOverBudget(Boolean(settings.autoRouteOnOverBudget)));
  }, []);
  const handleUpdateAutoRoute = async (next: boolean) => {
    setAutoRouteOnOverBudget(next);
    await window.electron.settings.update({ autoRouteOnOverBudget: next });
  };
```

- [ ] **Step 5: Typecheck + manual render sanity**

Run: `npm run typecheck`
Expected: PASS. (SettingsPanel has no dedicated unit test; the typecheck + the existing component smoke tests are the guard. Verify visually in `npm run dev` that the HuggingFace option, key panel, model selects, fallback select, and auto-route toggle render and persist.)

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/pages/SettingsPanel.tsx src/features/accounts/providerRouting.ts
git branch --show-current
git commit -m "feat(ui): HuggingFace provider, token, models, fallback + auto-route settings"
```

---

### Task 16: GeneratePanel — over-budget fallback flow + usage surfacing

**Files:**
- Modify: `src/pages/GeneratePanel.tsx`

- [ ] **Step 1: Wire the resolver + fallback dialog into the generate flow**

In `src/pages/GeneratePanel.tsx`, before dispatching a local image job, derive the route decision and intercept over-budget:

```tsx
import { resolveRoute } from '../../shared/resolveRoute';
import { buildRouteResolverInput } from '@/features/routing/buildRouteResolverInput';
import { OverBudgetFallbackDialog } from '@/components/generate/OverBudgetFallbackDialog';
```

```tsx
  const [fallbackPrompt, setFallbackPrompt] = useState<{ candidates: ProviderId[] } | null>(null);
```

In `handleGenerate`, for the local image path, after the preflight plan is known (`plan.fit`), compute the decision:

```tsx
    const decision = resolveRoute(
      buildRouteResolverInput({
        account: latestActiveAccount ?? null,
        modality: 'still-image',
        requested: useOpenRouterImage ? 'openrouter' : useHuggingFaceImage ? 'huggingface' : 'local',
        autoRouteOnOverBudget,
        fit: currentFit, // from the preflight resolveRuntime result for the selected local model
      }),
    );
    if (!decision.ok && decision.kind === 'fallback-prompt') {
      setFallbackPrompt({ candidates: decision.candidates });
      isGeneratingRef.current = false;
      return;
    }
    if (!decision.ok && (decision.kind === 'unsupported' || decision.kind === 'unconfigured')) {
      updateGenStatus({ status: 'error', errorMessage: decision.message, isGenerating: false });
      isGeneratingRef.current = false;
      return;
    }
    // decision.ok: proceed; if decision.reason === 'fallback-auto', switch the request to decision.provider.
```

Render the dialog near the panel root:

```tsx
      <OverBudgetFallbackDialog
        open={fallbackPrompt !== null}
        candidates={fallbackPrompt?.candidates ?? []}
        onRouteTo={(provider) => {
          setFallbackPrompt(null);
          void runGenerationWithProvider(provider); // re-dispatch helper that sets the per-request provider override
        }}
        onRunLocally={() => {
          setFallbackPrompt(null);
          void runGenerationWithProvider('local');
        }}
        onCancel={() => setFallbackPrompt(null)}
      />
```

> `runGenerationWithProvider` is a small refactor of the existing dispatch tail of `handleGenerate` that takes an explicit provider and skips the over-budget recomputation (the user has now chosen). Extract the post-decision dispatch body into this helper so both the initial path and the dialog path share it. Keep all existing OpenRouter/HF/local request construction intact.

- [ ] **Step 2: Surface usage before commit**

When the resolved route is hosted and `PROVIDER_CAPABILITIES[provider].reportsUsage` is true, show a compact pre-commit line near the generate button. Source the data from the existing OpenRouter key-info call (already loaded in Settings) and the HF `getKeyInfo` via a new lightweight read; for v1 render the provider + an "estimated" cost/latency hint label honestly:

```tsx
      {routeUsageHint ? (
        <p className="type-caption text-text-muted">{routeUsageHint}</p>
      ) : null}
```

where `routeUsageHint` is `\`${PROVIDER_LABEL[provider]} - usage-metered - est. latency network-bound\`` for HF and the existing OpenRouter usage string for OpenRouter. (Exact cost numbers come from the provider's pricing where exposed; label estimates as estimated per the M5 honesty rule.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full renderer + electron suite (regression)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add src/pages/GeneratePanel.tsx
git branch --show-current
git commit -m "feat(ui): over-budget fallback flow + pre-commit usage surfacing"
```

---

## Phase F - Docs & contracts

### Task 17: Document the HuggingFace Inference route

**Files:**
- Modify: `docs/API_ENDPOINTS.md`

- [ ] **Step 1: Add the HuggingFace Inference section**

Append a section after "Part 4 - OpenRouter integration", mirroring its structure:

```markdown
## Part 5 - HuggingFace Inference integration

When the active account's `imageGenerationProvider === 'huggingface'` (or a Local over-budget job is routed to HuggingFace), image, video, ControlNet, and inpaint jobs run **entirely in the Main process** without calling the Python backend. They:

1. Use `HuggingFaceInferenceService` (`electron/services/huggingfaceInference.ts`) with the per-account BYOK token (decrypted via `safeStorage`); the token is used per-request and never returned to the renderer or logged.
2. Normalize returned bytes (image/video) to a data URL after a magic-byte sanitization check, then persist under `<outputRoot>/huggingface/YYYY-MM-DD/<jobId>-<n>.<ext>`.
3. Track jobs in an in-memory store; IDs are prefixed `huggingface-image-<uuid>` so `getStatus`/`cancel` discriminate via `routedJobProvider`.
4. Emit `generation:progress` so the renderer's progress UI is provider-agnostic.

Capability matrix (the routing authority lives in `shared/providerRouting.ts`):

| Modality | Local | OpenRouter | HuggingFace |
|----------|:-----:|:----------:|:-----------:|
| Still image | yes | yes | yes |
| ControlNet | yes | no | yes |
| Inpaint | yes | no | yes |
| Video | yes | no | yes |
| LLM prompt-assist | yes (heuristic) | yes | yes |

Routing and fallback:

- The pure resolver `resolveRoute` (`shared/resolveRoute.ts`) decides Local / OpenRouter / HuggingFace per modality. The renderer reads it for UX gating; the Main process re-checks it at dispatch and refuses unsupported/unconfigured routes with a structured error.
- A Local job the M5 fit verdict marks `over-budget` triggers a fallback: when `autoRouteOnOverBudget` (Settings) is on and the account's `fallbackProvider` is capable + configured, it routes silently; otherwise the renderer prompts (run locally / route to a hosted provider / cancel).

New IPC channels: `accounts:set-huggingface-token`, `accounts:clear-huggingface-token`. The `accounts:update` patch gains `huggingFaceModel`, `huggingFaceImageModel`, `huggingFaceVideoModel`, and `fallbackProvider`. `settings` gains `autoRouteOnOverBudget`.

This route adds **no backend Python endpoint**, so `docs/api/openapi.json` is unchanged.
```

Update the Table of Contents at the top of the file to include "Part 5 - HuggingFace Inference integration" (and renumber Examples/Status if those were Parts 5/6).

- [ ] **Step 2: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git add docs/API_ENDPOINTS.md
git branch --show-current
git commit -m "docs(api): document HuggingFace Inference route + capability matrix"
```

---

## Phase G - Gate

### Task 18: Green gates, live validation, Codex provider-security review

**Files:** none (verification + review)

- [ ] **Step 1: Full green gates**

Run:
```bash
npm run typecheck
npm test
npm run build
```
Expected: all PASS. Fix any failure before proceeding.

- [ ] **Step 2: Live BYOK validation (out of CI, manual)**

With a real HuggingFace token in a dev session, verify against the live API: key verify, an image generation, a video generation, a ControlNet pass, an inpaint pass, and a prompt enhancement. Confirm outputs persist under `<outputRoot>/huggingface/...`, the token never appears in logs, and the over-budget prompt routes correctly. Record results in the PR description. If the live image/video endpoint path differs from the pinned `inference-proxy` route, adjust only the URL in `huggingfaceInference.ts` (the request/sanitize/normalize contract and all tests stay green).

- [ ] **Step 3: Codex provider-security review**

Submit the branch for the Codex second-opinion review focused on the M6 gate (S11): HF token encrypted at rest + never to renderer + never logged; remote-response sanitization (magic-byte checks) before any filesystem write; structured errors on misconfigured routes; the Main-process resolver as the authority (renderer never trusted). Close or explicitly waive (with rationale) every finding before merge.

- [ ] **Step 4: Final commit of any review fixes + open PR**

```bash
export PATH="/c/Program Files/nodejs:$PATH"
git branch --show-current
git status --short
# after any fixes:
git add -A && git commit -m "chore(routing): address Codex provider-security findings"
```

Open the PR per the established process (`gh pr create`), watch CI (`gh pr checks --watch`) on both the Linux `pr-gate` and Windows `release` paths, then `--squash --delete-branch` once green and the Codex gate is closed.

---

## Self-review (completed during plan authoring)

**Spec coverage (S1-S17):** S3 one-authority-two-readers -> Tasks 1, 2, 12, 13, 16. S4 capability matrix -> Task 1. S5 resolver -> Task 2. S6 HF client (image + LLM + video + CN + inpaint) -> Tasks 4-7. S7 dispatch switch + job model + status routing -> Tasks 11-12. S8 over-budget fallback (auto + prompt) -> Tasks 2, 8, 14, 16. S9 accounts/settings (HF token, prefs, fallbackProvider, autoRouteOnOverBudget, IPC) -> Tasks 8-10. S10 usage surfacing -> Task 16. S11 security/Codex gate -> Tasks 4-7 (sanitize/secret discipline), 18. S12 tests -> every task is test-first; truth-table in Task 2; mocked HTTP in Tasks 3-7. S13 docs/contracts -> Tasks 10, 17. S14 decomposition -> phases A-G. S15 out-of-scope -> nothing in the plan adds RAG/perf/provenance/new providers/Comfy-route. S16 acceptance -> Task 18 validates. S17 deferred items: shared-module path -> resolved (Task 1, top-level `shared/`); HF endpoints/models -> Tasks 4-7 with live-validation tuning in Task 18; Hub-token consolidation -> left documented (not built), honoring "optional".

**Placeholder scan:** No "TBD"/"implement later". Two intentional refactor seams are flagged with exact instructions: the `_internal` export in the HF client (removed in Task 7) and `runGenerationWithProvider` (an explicit extraction of the existing dispatch tail in Task 16). The `isRetryableError` clean form is specified verbatim and is the one the tests pin.

**Type consistency:** `ProviderId`, `RequestModality`, `FitVerdict`, `RouteDecision`, `RouteResolverInput`, `resolveRoute`, `providerSupports`, `PROVIDER_CAPABILITIES` are defined in Tasks 1-2 and imported unchanged thereafter. HF account fields (`huggingFace.tokenStored`, `preferences.huggingFaceImageModel`/`huggingFaceVideoModel`/`huggingFaceModel`/`fallbackProvider`) and methods (`setHuggingFaceToken`/`getHuggingFaceToken`/`clearHuggingFaceToken`/`markHuggingFaceVerified`) match across Tasks 9-13. Job prefix `huggingface-image` and `routedJobProvider` are consistent across Tasks 11-12. `autoRouteOnOverBudget` is consistent across Tasks 8, 15, 16.

**Known divergence flagged honestly:** OpenRouter and HF live endpoint URLs are pinned to the best-known surface; Task 18 confirms against the live API and permits a URL-only adjustment without disturbing the tested contract. This is the only network-shape uncertainty and is contained.
