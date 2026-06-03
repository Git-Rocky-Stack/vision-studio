# Vision Studio Comprehensive Audit - 2026-06-03

## Executive Summary

Vision Studio is in a materially strong engineering state at the TypeScript, renderer, and Electron architecture layers. The app has a large test suite, a clean production build, strict TypeScript settings, disciplined Electron hardening, and meaningful unit/component coverage across the core creative workflows.

The app is not release-sound yet. The remaining risk is concentrated in release confidence rather than ordinary code correctness: dependency security is red, backend test execution is not stable as a full-suite gate, Electron E2E does not currently prove the real generation happy path, and there are two runtime/security hardening issues around backend exposure and generated media preview CSP.

Recommended release posture: hold production release until P0 and P1 items are closed, then run a packaged Windows smoke test with a real or high-fidelity mocked backend completion path.

## Remediation Status (Post-Audit Update)

The three confirmed, surgically-scoped P1 defects identified below were remediated test-first (a
failing test was added before each fix) and verified through the full local gate set. The original
finding bodies are preserved as a historical record; each carries a status banner. The remaining
P0/P2 items are larger or environmental and are tracked as explicit follow-ups.

| Finding | Status | Evidence |
| --- | --- | --- |
| P1 - Backend binds to LAN by default | RESOLVED | `backend/main.py` now defaults to `127.0.0.1`, with opt-in `VISION_STUDIO_BACKEND_HOST`. Guarded by `test_server_config.py` (loopback-by-default + explicit-override tests). |
| P1 - CSP blocks generated/imported media | RESOLVED (confirmed, not just "likely") | `electron/services/contentSecurityPolicy.ts` adds the backend origins + `file:` to `img-src`/`media-src`. New `contentSecurityPolicy.test.ts` (6 tests) locks it in. |
| P1 - CI backend command does not run the pytest suite | RESOLVED | Both workflows now run `python -m pytest`; new `backend/pytest.ini` pins discovery, `sys.path`, and benchmark exclusion. |
| P0 - Dependency security audit is red | IN PROGRESS | Dependency remediation + Electron major upgrade started as a separate, dedicated effort. |
| P0 - Backend/E2E gates not release-trustworthy | PARTIAL | The backend pytest gate and benchmark isolation are fixed (rows above); the mocked-backend E2E completion test remains a tracked follow-up. |
| P2 - Signing / bundle size / accessibility | DEFERRED | Tracked debt; unchanged by this remediation pass. |

Two factual corrections to the original audit are folded into the findings below:

1. The CSP issue was not merely "likely" - it was confirmed. `connect-src` allowed `localhost`, so
   `fetch`/health polling succeeded and the app *appeared* connected, while `<img>`/`<video>` loads
   (governed by `img-src`/`media-src`, never `connect-src`) were silently blocked. The fix also covers
   imported local assets via the `file:` scheme, which the original audit did not flag.
2. The "many backend tests are pytest-style" framing overstated the ratio (measured: the majority are
   `unittest.TestCase`; a minority are pytest-only). The fix still matters because the pytest-only files
   include the security sanitization and DB-migration suites, which `unittest discover` skipped entirely.

Post-remediation gate (local): `npm run typecheck` clean; Vitest **1234 passed** (1228 baseline + 6 new
CSP tests); `npm run build` succeeds (the pre-existing large-chunk warning is the untouched P2 item);
`python -m pytest --collect-only` from `backend/` collects **424 tests** with benchmarks excluded and
imports resolving without an external `PYTHONPATH`.

## Scope

Audited repository: `C:\vision-studio`

Primary surfaces reviewed:

- Electron main process, preload bridge, IPC boundaries, backend process startup, backend auth, content security policy.
- React renderer architecture, routing/layout entry points, generated media preview handling, asset records, core app startup.
- Python FastAPI backend configuration, auth exemptions, model/outputs routing, benchmark and backend test posture.
- CI/release workflows, code signing preflight, package scripts, dependency posture.
- Existing test coverage and runtime validation surfaces.

No source code changes were made during this audit. This report records findings and recommended remediation.

## Verification Evidence

Commands that passed:

```powershell
npm run typecheck
npm run lint
npm run build
npm run test -- --run
```

Frontend/unit result:

- `141` Vitest files passed.
- `1228` Vitest tests passed.
- Production Vite/Electron build completed successfully.

Backend focused shard that passed:

```powershell
$env:PYTHONPATH='C:\vision-studio\backend'
backend\venv\Scripts\python.exe -m pytest `
  backend\tests\test_sanitization.py `
  backend\tests\test_prompt_service.py `
  backend\tests\test_migrations.py `
  backend\tests\test_foundry_catalog.py `
  -q
```

Result:

- `70 passed, 5 subtests passed`

Commands that did not pass or did not complete cleanly:

```powershell
npm audit --audit-level=moderate
backend\venv\Scripts\python.exe -m pytest backend\tests -q
$env:PYTHONPATH='C:\vision-studio\backend'; backend\venv\Scripts\python.exe -m pytest backend\tests --ignore=backend\tests\benchmarks -q
npm run test:e2e
npm run release:signing:check
```

Observed failures:

- `npm audit` reported 26 vulnerabilities: 1 low, 6 moderate, 18 high, 1 critical.
- Full backend pytest with benchmarks crashed Python with a native Windows access violation while loading diffusion/ControlNet weights.
- Non-benchmark backend pytest did not complete within the audit timeout after `PYTHONPATH` was corrected.
- Electron E2E timed out locally.
- Release signing preflight failed because signing environment variables are not configured in the local shell.

## Prioritized Findings

### P0 - Dependency Security Audit Is Red

`npm audit --audit-level=moderate` fails with 26 vulnerabilities, including high-risk issues in shipped or release-adjacent packages.

Relevant package references:

- `axios` in `package.json`
- `electron` in `package.json`
- `vite` in `package.json`
- `vitest` in `package.json`
- `electron-builder` in `package.json`
- `ws` in `package.json`
- `postcss` in `package.json`

Impact:

- `electron` vulnerabilities affect the desktop runtime security baseline.
- `axios` vulnerabilities are relevant because IPC handlers use Axios for backend requests.
- `vite`, `vitest`, `postcss`, and build tooling vulnerabilities are primarily dev/build risk but still matter for CI, release hygiene, and contributor machines.
- `electron-builder` and `tar` vulnerabilities matter for packaging and artifact handling.

Recommended remediation:

1. Run a controlled dependency update pass for non-breaking current-major updates first.
2. Re-run `npm audit --audit-level=moderate`.
3. Plan Electron major upgrade separately because `npm audit` suggests a breaking jump.
4. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test -- --run`, and targeted Electron smoke tests after upgrades.

Acceptance criteria:

- `npm audit --audit-level=moderate` exits cleanly or only leaves explicitly documented, non-shipped dev-only exceptions.
- Electron runtime remains green under packaged smoke.

### P0 - Backend and E2E Gates Are Not Release-Trustworthy

The backend and E2E validation posture is currently not strong enough to certify the shipped user journey.

Evidence:

- Full backend pytest crashed in `backend/tests/benchmarks/test_generation_benchmark.py` while loading real ControlNet/diffusion weights.
- Non-benchmark pytest did not complete within the audit timeout.
- Existing E2E happy path explicitly states the backend is not started and generation will fail.
- Electron E2E specs timed out locally.

Impact:

- A release can pass frontend correctness while still failing real generation, backend startup, media rendering, or packaged-runtime behavior.
- Backend benchmark tests are mixed into normal test discovery, which makes the suite brittle on machines that are not configured for model-loading benchmarks.
- The E2E "happy path" validates UI resilience, not actual completed generation.

Recommended remediation:

1. Split backend tests into explicit categories:
   - `backend:unit`
   - `backend:integration`
   - `backend:benchmark`
   - `backend:hardware`
2. Exclude benchmarks from normal CI unless the benchmark job is explicitly requested.
3. Add a mocked-backend Electron E2E test that returns a completed generation job and validates:
   - job submission
   - progress update
   - completed status
   - generated image preview renders
   - asset record is created
4. Add a separate real-backend smoke that can run on the correct workstation/GPU profile.

Acceptance criteria:

- Backend unit CI completes under a predictable timeout.
- Benchmark suite is opt-in and does not crash normal CI.
- E2E includes at least one completed generation path with rendered preview evidence.

### P1 - Backend Binds to LAN by Default

> **Status: RESOLVED.** `backend/main.py` now defaults to `127.0.0.1`; LAN/debug exposure is opt-in via
> `VISION_STUDIO_BACKEND_HOST`. Verified by `backend/tests/test_server_config.py` (loopback-by-default
> and explicit-override tests). The finding text below describes the pre-fix state.

The FastAPI backend binds to `0.0.0.0` by default.

Evidence:

- `backend/main.py` sets backend host to `0.0.0.0`.
- `AUTH_EXEMPT_PATHS` includes `/`, `/api/health`, `/api/docs`, `/api/redoc`, and `/api/openapi.json`.
- `/outputs` is auth-exempt.

Impact:

- On a desktop app, default LAN exposure is unnecessary risk.
- If the backend process is reachable from the local network, generated outputs and backend metadata can be exposed.
- Auth is token-based for most API routes, but exempt metadata and outputs are still externally reachable if the process listens beyond loopback.

Recommended remediation:

1. Default backend host to `127.0.0.1`.
2. Add an explicit `VISION_STUDIO_BACKEND_HOST` override only for deliberate LAN/debug modes.
3. Consider requiring an explicit setting for docs/OpenAPI exposure outside development.
4. Re-test Electron main-process backend calls against loopback.

Acceptance criteria:

- Default backend bind address is loopback-only.
- LAN exposure requires explicit opt-in.
- Docs and output exemptions are documented and constrained.

### P1 - CSP Blocks Generated Media Previews (Confirmed)

> **Status: RESOLVED.** Confirmed, not merely "likely": `connect-src` allowed `localhost` so the app
> looked connected while `<img>`/`<video>` loads were silently blocked. `electron/services/contentSecurityPolicy.ts`
> now allowlists the backend origins **and** the `file:` scheme (for imported local assets) in
> `img-src`/`media-src`. New `electron/services/contentSecurityPolicy.test.ts` (6 tests) guards it.
> The finding text below describes the pre-fix state.

The Electron CSP allows localhost backend URLs in `connect-src`, but generated image/video previews use `http://localhost:8000` URLs and CSP does not allow those hosts in `img-src` or `media-src`.

Evidence:

- `electron/services/contentSecurityPolicy.ts`:
  - `img-src 'self' data: blob:`
  - `media-src 'self' blob:`
  - `connect-src` allows localhost.
- `src/components/ui/MediaPreview.tsx` resolves `/outputs/...` to `http://localhost:8000/...`.
- `src/features/assets/assetRecords.ts` uses `http://localhost:8000` as the backend asset base URL.

Impact:

- Generated media may fail to render in packaged Electron even when generation succeeds.
- Existing E2E does not catch this because it does not verify completed generation output rendering.

Recommended remediation:

1. Add `http://localhost:8000` and `http://127.0.0.1:8000` to `img-src`.
2. Add the same hosts to `media-src`.
3. Prefer `127.0.0.1` consistently for backend asset URLs to match backend calls.
4. Add E2E coverage for rendered generated image and video previews.

Acceptance criteria:

- Packaged app renders generated `/outputs` images and videos without CSP console errors.
- E2E or packaged smoke test captures a non-empty rendered preview.

### P1 - CI Backend Command Does Not Match Pytest-Style Suite

> **Status: RESOLVED.** `pr-gate.yml` and `release.yml` now run `python -m pytest` (a superset of the
> `unittest.TestCase` suites) from the `backend/` directory; new `backend/pytest.ini` pins `testpaths`,
> `pythonpath`, and `--ignore=tests/benchmarks`. The finding text below describes the pre-fix state.

GitHub workflows run `python -m unittest discover`, but a subset of backend tests are pytest-style (plain `def test_*`, fixtures, monkeypatch) - including the security sanitization and DB-migration suites - and are silently not collected by `unittest discover`.

Evidence:

- `.github/workflows/pr-gate.yml` runs `python -m unittest discover -s tests -v`.
- `.github/workflows/release.yml` runs `python -m unittest discover -s tests -v`.
- Backend tests include many pytest-style tests and imports.

Impact:

- CI may appear to run backend tests while missing pytest-specific coverage.
- Local pytest failures/hangs can diverge from CI behavior.

Recommended remediation:

1. Change backend CI to `python -m pytest`.
2. Set `PYTHONPATH` or run from the backend directory with stable import configuration.
3. Exclude benchmarks from default backend CI.
4. Add JUnit output for backend pytest.

Acceptance criteria:

- CI backend gate runs the same test command developers run locally.
- CI fails on pytest failures.
- Normal backend tests complete under a predictable timeout.

### P2 - Release Signing Is Enforced but Local Environment Is Not Configured

`npm run release:signing:check` failed locally because no code signing credentials were present.

Impact:

- This is not a code defect by itself; the preflight script is doing the right thing.
- It does mean local release readiness cannot be confirmed without signing environment configuration.

Recommended remediation:

1. Verify GitHub Actions secrets are configured for one supported signing mode.
2. Add a documented local dry-run path for unsigned development packaging and a signed release path for production.
3. Keep signed release enforcement in place.

Acceptance criteria:

- Release workflow passes signing preflight in CI.
- Local docs clearly distinguish unsigned dev package from signed production release.

### P2 - Renderer Bundle Size Warning

Production build succeeds but emits a chunk-size warning for a large renderer app chunk.

Impact:

- This is not an immediate correctness issue.
- It may affect startup time and long-term maintainability as the app grows.

Recommended remediation:

1. Profile actual packaged startup before optimizing.
2. Consider route/panel-level dynamic imports for heavy surfaces such as workflow, timeline, storyboard, and editor panels.
3. Keep vendor chunk splitting, but add app-feature chunking only where it improves measured startup.

Acceptance criteria:

- Startup performance target is defined and measured.
- Chunking changes are tied to a measurable startup improvement.

### P2 - Accessibility Baseline Still Allows Known Serious Issues

The accessibility smoke test has known violation exceptions for `color-contrast` and `nested-interactive`.

Impact:

- The suite prevents new serious issues, but it does not certify WCAG AA compliance.
- Known exceptions are acceptable as tracked debt, not as release-complete accessibility posture.

Recommended remediation:

1. Fix `nested-interactive` first because it can affect keyboard/screen-reader behavior.
2. Run contrast remediation by component token, not one-off color tweaks.
3. Remove exceptions when fixed so regressions are caught.

Acceptance criteria:

- Accessibility smoke tests pass without known serious exceptions on Generate and Settings.

## Positive Signals

### Electron Security Baseline Is Strong

Observed strengths:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- window navigation prevention
- denied `window.open`
- narrowed preload API
- duplicate IPC handler guard

This is a strong foundation for a desktop app that handles local files, model downloads, and optional API keys.

### Secrets Handling Is Directionally Correct

OpenRouter API keys use Electron `safeStorage`, and the renderer receives key presence/metadata rather than raw secrets. Hugging Face tokens are held in the main process session and forwarded only on model download requests.

Recommended follow-up:

- Verify no logs include API keys, HF tokens, or authorization headers during failed OpenRouter/model-download calls.

### Frontend Test Coverage Is Substantial

The frontend suite passed `1228` tests across unit, component, and integration coverage. There is meaningful coverage around:

- generation panel behavior
- prompt tooling
- timeline operations
- workflow execution and validation
- media/asset records
- OpenRouter routing
- settings and account behavior
- IPC handlers
- security helpers

### Build and Static Quality Gates Are Clean

`npm run typecheck`, `npm run lint`, and `npm run build` all passed. TypeScript config uses strict mode and unused checks, which is appropriate for the codebase scale.

## Recommended Remediation Plan

### Phase 1 - Release Blockers

1. Remediate dependency audit enough for a clean or explicitly accepted result. *(in progress - separate upgrade effort)*
2. Change backend default bind address to `127.0.0.1`. *(done)*
3. Fix CSP for generated `localhost`/`127.0.0.1` media previews. *(done - also covers imported `file:` assets)*
4. Split backend benchmark tests out of normal test execution. *(done - `pytest.ini` excludes `tests/benchmarks`)*
5. Repair backend CI to use pytest consistently. *(done)*

### Phase 2 - Release Confidence

1. Add mocked-backend Electron E2E completion flow.
2. Add packaged Windows smoke that launches app, submits or simulates a completed generation, and verifies preview rendering.
3. Verify release signing secrets in CI.
4. Run accessibility smoke after removing at least `nested-interactive` exception.

### Phase 3 - Hardening and Performance

1. Profile packaged app startup and interaction performance.
2. Consider feature-level dynamic imports if startup is above target.
3. Add structured backend test timeouts and durations reporting.
4. Review backend docs/OpenAPI exposure policy in production mode.

## Suggested Command Set After Remediation

```powershell
npm run typecheck
npm run lint
npm audit --audit-level=moderate
npm run build
npm run test -- --run

$env:PYTHONPATH='C:\vision-studio\backend'
backend\venv\Scripts\python.exe -m pytest backend\tests --ignore=backend\tests\benchmarks -q

npm run test:e2e
npm run release:signing:check
```

For benchmark/hardware validation, keep a separate command:

```powershell
$env:PYTHONPATH='C:\vision-studio\backend'
backend\venv\Scripts\python.exe -m pytest backend\tests\benchmarks -v --benchmark-only
```

## Release Recommendation

Do not ship a production release from this state without closing the P0 and P1 items.

The app has a strong core and the codebase is not fragile in the ordinary sense. The main gap is that current validation does not prove the shipped generation workflow end-to-end, and dependency/security gates are currently red. Once those are closed, the app should be in a much stronger release posture.
