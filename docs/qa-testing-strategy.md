# Vision Studio - QA Testing Strategy

> Risk-based quality engineering strategy for a three-tier Electron desktop application
> Created: 2026-03-13 | Status: Active

---

## 1. Executive Summary

Vision Studio is a desktop application built on **Electron + React 19 + Python FastAPI** for AI image/video generation and editing. The architecture introduces three trust boundaries (Renderer → Main Process → Python Backend) connected via IPC and HTTP/WebSocket, creating unique quality risks around process communication, asset integrity, and generation reliability.

**Current state:** 14 test files (8 frontend, 6 backend), 29 passing frontend tests, 10 passing backend tests (2 failing due to missing venv dependencies). All existing tests are **unit-level**, covering pure business logic. No component, integration, E2E, visual, accessibility, or performance tests exist. No CI/CD pipeline.

**Goal:** Establish a layered, risk-based test strategy that catches defects at the cheapest possible level, makes failures diagnosable, and enables confident releases.

---

## 2. Risk Analysis

### 2.1 Critical User Journeys

| # | Journey | Business Impact | Failure Severity |
|---|---------|----------------|-----------------|
| J1 | **Image Generation**: prompt → settings → generate → progress → result | Core product value. Failure = app is useless | CRITICAL |
| J2 | **Batch Generation**: multi-prompt → queue → sequential processing → results grid | Power-user workflow, retention driver | HIGH |
| J3 | **Asset Management**: browse library → preview → export/delete/reveal | Data integrity, user trust | HIGH |
| J4 | **Image Editing**: load → tool selection → layers → adjustments → save | Secondary workflow, differentiator | MEDIUM |
| J5 | **Model Management**: discover → download → install → select for generation | First-run blocker, heavy external deps | HIGH |
| J6 | **Settings & Configuration**: output paths → backend config → theme | Setup flow, backend restart logic | MEDIUM |

### 2.2 Failure Modes & Risk Matrix

| Risk | Likelihood | Impact | Layer | Mitigation |
|------|-----------|--------|-------|------------|
| Backend process fails to start or crashes | Medium | Critical | Integration | Health polling tests, process lifecycle tests |
| IPC message dropped or malformed between Electron ↔ Renderer | Low | Critical | Integration | Contract tests on preload API shape |
| HTTP/WS connection lost between Electron ↔ Python | Medium | High | Integration | Reconnection logic tests, timeout handling |
| Asset paths resolve incorrectly across output roots | Medium | High | Unit | Path resolution tests (already covered) |
| State persistence corrupts or loses data | Low | High | Unit | Serialization round-trip tests |
| Generation parameters invalid (dimensions, steps, cfg) | Medium | Medium | Unit | Validation logic tests (already covered) |
| Canvas rendering breaks on layer operations | Medium | Medium | Component | react-konva component tests |
| UI accessibility regressions (contrast, focus, keyboard) | High | Medium | Accessibility | axe-core automated checks |
| Theme/styling regressions in dark cinema design | Medium | Low | Visual | Visual regression snapshots |
| Performance degradation with large asset libraries | Low | Medium | Performance | Virtual scroll benchmarks |

### 2.3 Non-Functional Risks

| Category | Risk | Acceptance Criteria |
|----------|------|-------------------|
| **Startup time** | Backend spawn + readiness takes too long | App interactive within 8s on reference hardware |
| **Memory** | Asset library grows unbounded in localStorage | Max 500 records enforced, store < 5MB |
| **Disk I/O** | Large batch runs fill disk | Output directory validation before generation |
| **Security** | Preload script exposes unsafe APIs | contextBridge audit, no `nodeIntegration: true` |

---

## 3. Test Portfolio Design

### 3.1 Test Pyramid

```
              /\
             /E2E\              3-5 tests  | Critical journeys only
            /------\
           /Integr. \           10-15 tests | IPC, HTTP, WS boundaries
          /----------\
         / Component  \         15-25 tests | UI modules in isolation
        /--------------\
       /     Unit       \       40-60 tests | Logic, validation, transforms
      /------------------\
```

### 3.2 Layer Allocation

| Layer | What to Test | Framework | Budget |
|-------|-------------|-----------|--------|
| **Unit** | Pure functions: validation, crop math, asset records, path resolution, theme, state selectors | Vitest | 50-60% of tests |
| **Component** | React components in isolation: PromptArea, ModelSelector, ResultsGrid, Slider, Button states | Vitest + @testing-library/react | 20-25% |
| **Integration** | Electron ↔ Python HTTP/WS, IPC handler contracts, Zustand store persistence round-trips | Vitest + msw (mock service worker) | 15-20% |
| **E2E** | Full generation flow, batch flow, asset export | Playwright + Electron | 3-5% |
| **Static** | TypeScript strict, ESLint, Tailwind class validation | tsc, eslint | Pre-commit gate |

### 3.3 Backend Test Layers

| Layer | What to Test | Framework | Budget |
|-------|-------------|-----------|--------|
| **Unit** | Workflow builders, image ops, prompt service, model path resolution | Python unittest / pytest | 60% |
| **Integration** | FastAPI endpoint responses, job manager lifecycle, WebSocket message format | pytest + httpx (TestClient) | 30% |
| **Contract** | API request/response schemas match frontend expectations | JSON Schema validation | 10% |

---

## 4. Detailed Test Plans by Layer

### 4.1 Unit Tests (Frontend)

**Already covered (keep and expand):**
- `features/generate/validation.ts` — SVD reference image validation
- `features/edit/crop.ts` — Crop box building and dimensions
- `features/assets/assetRecords.ts` — Asset upsert from job status
- `features/batch/resultActions.ts` — Batch path collection, draft hydration
- `features/theme/theme.ts` — Theme resolution and application
- `electron/services/assets.ts` — Path resolution, root validation
- `electron/services/backend.ts` — Readiness polling, status snapshots
- `electron/services/settings.ts` — Output path resolution, restart detection

**New unit tests to add (priority order):**

| Module | Tests Needed | Priority |
|--------|-------------|----------|
| `store/appStore.ts` — state selectors | Test derived state (filtered assets, sorted batches), action reducers in isolation | P0 |
| `features/generate/validation.ts` | Edge cases: zero dimensions, negative steps, empty prompt, maxed cfg_scale | P0 |
| `utils/colorUtils.ts` | hexToRgba edge cases: invalid hex, alpha boundaries | P1 |
| `utils/cn.ts` | Class merging with conflicting Tailwind classes | P1 |
| `features/assets/assetRecords.ts` | Max 500 cap enforcement, video metadata extraction | P1 |
| `features/edit/crop.ts` | All aspect ratios (4:3, 3:2, 9:16), zero-size images, rounding | P1 |
| `constants/strings.ts` | No empty/undefined string values (snapshot test) | P2 |

**Pattern to follow (AAA with descriptive names):**
```typescript
describe('validateGenerationParams', () => {
  it('rejects dimensions below minimum threshold', () => {
    // Arrange
    const params = { width: 32, height: 32, steps: 20 };
    // Act
    const error = validateGenerationParams(params);
    // Assert
    expect(error).toContain('dimension');
  });
});
```

### 4.2 Unit Tests (Backend)

**Already covered (fix import errors first):**
- `test_comfy_workflows.py` — Workflow node selection, history extraction
- `test_image_ops.py` — Crop dimensions, upscale sizing
- `test_model_manager.py` — CivitAI headers, diffusers path resolution
- `test_prompt_service.py` — Clarify mode, variations mode, unknown mode
- `test_server_config.py` — (FAILING: needs FastAPI in test env)
- `test_video_service.py` — (FAILING: needs imageio in test env)

**Fix import errors:**
- Backend tests that import `main.py` or heavy dependencies should mock those imports or use conditional imports
- Alternatively, run backend tests inside the venv: `backend/venv/Scripts/python -m unittest discover -s tests`

**New backend unit tests to add:**

| Module | Tests Needed | Priority |
|--------|-------------|----------|
| `utils/job_manager.py` | Job state transitions (pending→processing→completed/failed/cancelled), queue ordering, concurrent access | P0 |
| `utils/model_manager.py` | HuggingFace auth headers, download progress callback, disk space validation | P1 |
| `utils/comfy_client.py` | WebSocket message parsing, reconnection state, timeout behavior | P1 |
| `main.py` endpoints | Request validation for `/generate`, `/batch`, `/models` (extract into testable functions) | P1 |

### 4.3 Component Tests (Frontend — NEW)

**Setup required:**
```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Update `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    environment: 'jsdom', // for component tests
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
    environmentMatchGlobs: [
      ['electron/**', 'node'], // keep node env for electron tests
    ],
  },
});
```

**Priority component tests:**

| Component | What to Test | Priority |
|-----------|-------------|----------|
| `ui/Button.tsx` | Renders variants (primary, secondary, ghost), disabled state, click handler fires | P0 |
| `ui/Slider.tsx` | Renders value, min/max bounds, onChange callback with correct value | P0 |
| `ui/Switch.tsx` | Toggle on/off, keyboard activation (Space/Enter), aria-checked | P0 |
| `ui/Input.tsx` | Renders value, placeholder, onChange, disabled state | P1 |
| `ui/Tooltip.tsx` | Shows on hover/focus, hides on blur, correct positioning | P1 |
| `ui/ConfirmDialog.tsx` | Renders title/message, confirm/cancel callbacks, keyboard Escape | P1 |
| `ui/ErrorBoundary.tsx` | Catches render errors, displays fallback UI | P0 |
| `generate/PromptArea.tsx` | Text input, character count, submit on Enter, empty validation | P1 |
| `generate/ModelSelector.tsx` | Renders model list, selection callback, disabled when generating | P1 |
| `generate/StylePresetsBar.tsx` | Renders presets, selection toggles, scroll behavior | P2 |
| `batch/ResultsGrid.tsx` | Renders result cards, sort/filter controls, empty state | P1 |
| `batch/ResultCard.tsx` | Displays image/metadata, favorite toggle, context menu | P2 |
| `edit/ToolStrip.tsx` | Tool selection, active tool highlighting, keyboard shortcuts | P2 |
| `layout/Sidebar.tsx` | Navigation items, collapsed state, active panel indicator | P2 |
| `shared/ImagePreviewModal.tsx` | Opens/closes, keyboard navigation, zoom controls | P2 |

### 4.4 Integration Tests

#### 4.4.1 Frontend ↔ Backend HTTP Contract Tests

**Setup:** Use `msw` (Mock Service Worker) to verify the frontend makes correct HTTP requests and handles responses properly.

```bash
npm install -D msw
```

**Tests to write:**

| Scenario | What to Verify | Priority |
|----------|---------------|----------|
| Generation request | POST body matches backend schema (prompt, width, height, steps, cfg_scale, model) | P0 |
| Generation progress | WebSocket message format (job_id, progress, status, result) parsed correctly | P0 |
| Batch submission | Array of prompts serialized correctly, batch_id assigned | P0 |
| Model list fetch | GET /models response parsed into ModelSelector options | P1 |
| Asset export | Correct file path sent to backend, success/error handled | P1 |
| Health check | GET /health response triggers backend-ready state | P1 |
| Error responses | 4xx/5xx mapped to user-visible error messages | P1 |

#### 4.4.2 Zustand Store Integration Tests

| Scenario | What to Verify | Priority |
|----------|---------------|----------|
| Persistence round-trip | `persist` middleware serializes/deserializes correctly for all persisted slices | P0 |
| Max asset cap | Adding asset #501 evicts oldest record | P0 |
| Prompt history | Adding duplicate prompt updates timestamp, doesn't duplicate | P1 |
| Batch result accumulation | Results from WebSocket updates merge correctly into store | P1 |
| Edit history undo/redo | Push, undo, redo operations maintain correct index and stack | P1 |

#### 4.4.3 Backend API Integration Tests

**Setup:** Use `pytest` + `httpx.AsyncClient` with FastAPI's `TestClient`.

```bash
pip install pytest pytest-asyncio httpx
```

| Endpoint | What to Verify | Priority |
|----------|---------------|----------|
| `POST /generate` | Validates params, creates job, returns job_id | P0 |
| `POST /batch` | Accepts prompt array, creates queued jobs | P0 |
| `GET /jobs/{id}` | Returns correct status for pending/completed/failed jobs | P0 |
| `DELETE /jobs/{id}` | Cancels pending job, returns 404 for unknown | P1 |
| `POST /crop` | Returns cropped image with correct dimensions | P1 |
| `GET /models` | Returns installed model list with metadata | P1 |
| `WebSocket /ws` | Sends progress updates matching expected schema | P0 |

### 4.5 E2E Tests (Critical Journeys Only)

**Setup:** Playwright with Electron support.

```bash
npm install -D @playwright/test electron
```

**playwright.config.ts:**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

**E2E tests (3-5 maximum):**

| Test | Steps | Priority |
|------|-------|----------|
| **Happy-path generation** | Launch app → wait for backend → enter prompt → click Generate → verify progress bar → verify result appears in canvas | P0 |
| **Batch generation** | Switch to Batch → enter 2 prompts → run batch → verify results grid shows 2 results | P1 |
| **Asset lifecycle** | Generate image → verify appears in Assets → export → verify file exists on disk | P1 |
| **Settings persistence** | Change output path → restart app → verify setting persisted | P2 |

**Page Object Model:**
```typescript
// e2e/pages/GeneratePage.ts
class GeneratePage {
  constructor(private page: Page) {}

  async enterPrompt(text: string) {
    await this.page.fill('[data-testid="prompt-input"]', text);
  }

  async clickGenerate() {
    await this.page.click('[data-testid="generate-button"]');
  }

  async waitForResult() {
    await this.page.waitForSelector('[data-testid="generation-result"]', {
      timeout: 30_000,
    });
  }
}
```

**Prerequisite:** Add `data-testid` attributes to critical interactive elements to decouple tests from CSS/structure changes.

### 4.6 Static Analysis (Shift-Left Gate)

| Check | Tool | When |
|-------|------|------|
| Type safety | `tsc --noEmit` | Pre-commit |
| Lint | `eslint src/ electron/` | Pre-commit |
| Unused exports | `ts-prune` | Weekly |
| Dependency audit | `npm audit` | Pre-commit |
| Secret scanning | `gitleaks` | Pre-commit |
| Python type hints | `mypy backend/` | Pre-commit |

### 4.7 Accessibility Tests

**Automated (axe-core):**
```bash
npm install -D @axe-core/playwright  # for E2E
npm install -D vitest-axe             # for component tests
```

| Check | Scope | Priority |
|-------|-------|----------|
| Color contrast (WCAG AA 4.5:1) | All text elements in dark cinema theme | P0 |
| Keyboard navigation | Sidebar, ToolStrip, modal dialogs | P0 |
| ARIA labels | Icon-only buttons, sliders, switches | P1 |
| Focus management | Modal open/close, panel switching | P1 |
| Screen reader announcements | Generation progress, error messages | P2 |

### 4.8 Visual Regression Tests (Future)

Not recommended as an immediate priority given the active design iteration phase. Revisit after the design system stabilizes post-review.

---

## 5. Quality Gates

### 5.1 Pre-Merge (PR Gate)

| Gate | Tool | Budget | Blocking? |
|------|------|--------|-----------|
| TypeScript compiles | `tsc --noEmit` | < 30s | Yes |
| Unit + component tests pass | `vitest run` | < 30s | Yes |
| Backend unit tests pass | `python -m pytest tests/` | < 15s | Yes |
| No lint errors | `eslint` | < 15s | Yes |
| **Total PR gate** | | **< 2 min** | |

### 5.2 Pre-Release (Deploy Gate)

| Gate | Tool | Budget | Blocking? |
|------|------|--------|-----------|
| All unit + component + integration tests | `vitest run` | < 1 min | Yes |
| Backend full test suite | `pytest` | < 30s | Yes |
| E2E critical journeys | `playwright test` | < 3 min | Yes |
| Accessibility smoke | `axe-core` | < 30s | Yes |
| Package builds successfully | `npm run build` | < 2 min | Yes |
| **Total release gate** | | **< 7 min** | |

### 5.3 Release Criteria

- All P0/P1 tests green
- No known critical or high-severity bugs
- E2E happy-path generation succeeds on clean install
- Backend health check responds within 5s of launch
- No TypeScript errors, no ESLint errors

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1-2) -- COMPLETED

| Task | Status | Result |
|------|--------|--------|
| Fix backend test imports | Done | `test_server_config.py` and `test_video_service.py` skip gracefully |
| Install component test deps | Done | `@testing-library/react`, `jsdom`, vitest workspace config |
| Add `data-testid` attributes | Done | 10+ attributes on critical UI elements |
| Write 5 new unit tests | Done | appStore (16), colorUtils (6), validation edge cases |
| Write 3 component tests | Done | Button (7), ErrorBoundary (4), Slider (10) |
| Set up npm test scripts | Done | `test:unit`, `test:component`, `test:all`, `typecheck` |

### Phase 2: Integration & Contracts (Week 3-4) -- COMPLETED

| Task | Status | Result |
|------|--------|--------|
| Install msw | Done | msw@2.12 installed |
| API contract tests | Done | `tests/integration/api-contracts.test.ts` — 27 tests |
| Store persistence tests | Done | `tests/integration/store-persistence.test.ts` — 9 tests |
| Store action workflow tests | Done | `tests/integration/store-actions.test.ts` — 8 tests |
| Backend JobManager tests | Done | `backend/tests/test_job_manager.py` — 18 tests |
| WebSocket contract test | Done | Included in api-contracts.test.ts |

### Phase 3: E2E & Automation (Week 5-6) -- COMPLETED

| Task | Status | Result |
|------|--------|--------|
| Set up Playwright for Electron | Done | `playwright.config.ts`, electron fixture, 3 page objects |
| Write happy-path E2E test | Done | `tests/e2e/generate-happy-path.spec.ts` — 6 tests |
| Write batch E2E test | Done | `tests/e2e/batch-flow.spec.ts` — 3 tests |
| Accessibility smoke test | Done | `tests/e2e/accessibility.spec.ts` — 4 tests (axe-core injection) |
| Pre-commit hooks | Done | Husky + lint-staged (`vitest related --run` on staged .ts/.tsx) |
| Backend skip for E2E | Done | `VISION_STUDIO_SKIP_BACKEND` env var in `electron/main.ts` |
| Known a11y baseline | Done | 3 known violations documented (color-contrast, aria-required-children, nested-interactive) |

### Phase 4: CI/CD (Week 7+) -- COMPLETED

| Task | Status | Result |
|------|--------|--------|
| GitHub Actions PR gate | Done | `.github/workflows/pr-gate.yml` — typecheck + frontend tests + backend tests (parallel jobs) |
| Release workflow | Done | `.github/workflows/release.yml` — full suite + E2E + build Windows/Linux + GitHub Release publish |
| Test result dashboard | Done | JUnit reporter in CI, status badges in README, test counts in README |

---

## 7. Test Organization

### 7.1 Directory Structure

```
vision-studio/
├── src/
│   ├── features/
│   │   ├── assets/
│   │   │   ├── assetRecords.ts
│   │   │   └── assetRecords.test.ts      # Unit tests (co-located)
│   │   └── ...
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   └── Button.test.tsx            # Component tests (co-located)
│   │   └── ...
│   └── store/
│       ├── appStore.ts
│       └── appStore.test.ts               # Store unit tests
├── electron/
│   └── services/
│       ├── backend.ts
│       └── backend.test.ts                # Electron service tests
├── tests/
│   ├── integration/                       # Integration tests
│   │   ├── api-contracts.test.ts
│   │   ├── store-persistence.test.ts
│   │   └── websocket-progress.test.ts
│   └── mocks/
│       └── handlers.ts                    # msw request handlers
├── e2e/                                   # E2E tests (separate dir)
│   ├── pages/
│   │   ├── GeneratePage.ts
│   │   └── BatchPage.ts
│   ├── generation.spec.ts
│   └── batch.spec.ts
├── backend/
│   └── tests/                             # Python backend tests
│       ├── test_comfy_workflows.py
│       ├── test_endpoints.py              # API integration tests
│       └── ...
├── vitest.config.ts
└── playwright.config.ts
```

### 7.2 Naming Conventions

| Convention | Example |
|-----------|---------|
| Unit test files | `*.test.ts` (co-located with source) |
| Component test files | `*.test.tsx` (co-located with component) |
| Integration test files | `tests/integration/*.test.ts` |
| E2E test files | `e2e/*.spec.ts` |
| Backend test files | `backend/tests/test_*.py` |
| Test descriptions | `it('rejects dimensions below minimum threshold')` — behavior, not implementation |

### 7.3 Test Scripts (package.json)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run --reporter=verbose src/features electron/services",
    "test:component": "vitest run --reporter=verbose src/components",
    "test:integration": "vitest run --reporter=verbose tests/integration",
    "test:e2e": "playwright test",
    "test:all": "vitest run && playwright test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ electron/",
    "precommit": "npm run typecheck && npm run test"
  }
}
```

---

## 8. Flake Management

### 8.1 Policy

- **SLO:** Suite flake rate ≤ 1% weekly
- **Definition:** A test that fails without a product change and passes on rerun
- **Quarantine:** Flaky tests get `it.skip` with a `// FLAKY:` comment, an owner, and a 7-day expiry date
- **Deflake process:** Investigate root cause → fix or delete → remove quarantine

### 8.2 Common Flake Sources in This Stack

| Source | Mitigation |
|--------|-----------|
| WebSocket timing in integration tests | Use event-based waits, never `setTimeout` |
| File system operations in asset tests | Use temp directories, clean up in `afterEach` |
| Zustand persist middleware race conditions | Reset store between tests with `useStore.setState()` |
| Electron window creation timing in E2E | Wait for `did-finish-load` event |
| Backend startup time in E2E | Poll health endpoint with exponential backoff |

---

## 9. Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do This Instead |
|-------------|-------------|-----------------|
| Testing react-konva canvas pixels | Brittle, slow, flaky | Test layer data model, not rendered pixels |
| E2E for every setting toggle | Slow, redundant | Component test for UI, unit test for logic |
| Mocking Zustand internals | Couples tests to implementation | Test store actions and resulting state |
| `sleep()` for backend readiness | Slow, unreliable | Poll with timeout + exponential backoff |
| Snapshot testing entire pages | Brittle, noisy diffs | Snapshot only stable data structures |
| Testing Tailwind class names | Implementation detail | Test visual behavior or computed styles |

---

## 10. Tooling Summary

| Purpose | Tool | Status |
|---------|------|--------|
| Unit + component tests (frontend) | Vitest 3.2.4 | Installed |
| Component rendering | @testing-library/react | To install |
| DOM environment | jsdom | To install |
| HTTP mocking | msw | To install |
| E2E tests | Playwright | To install |
| Accessibility | @axe-core/playwright, vitest-axe | To install |
| Backend unit tests | Python unittest | Installed |
| Backend integration tests | pytest + httpx | To install |
| Type checking | TypeScript (tsc) | Installed |
| Linting | ESLint | Installed |
| Pre-commit hooks | Husky + lint-staged | To install |
| CI/CD | GitHub Actions | To create |

---

## 11. Key Metrics

| Metric | Target | Measurement |
|--------|--------|------------|
| PR gate duration | p50 ≤ 1 min, p95 ≤ 2 min | CI timing |
| Unit test count | ≥ 50 within 4 weeks | `vitest run --reporter=verbose` |
| Component test count | ≥ 15 within 4 weeks | `vitest run --reporter=verbose` |
| Integration test count | ≥ 10 within 6 weeks | `vitest run --reporter=verbose` |
| E2E test count | 3-5 stable tests | `playwright test` |
| Suite flake rate | ≤ 1% weekly | Manual tracking initially |
| Backend test pass rate | 100% (fix import errors) | `pytest --tb=short` |
| TypeScript strict compliance | 0 errors | `tsc --noEmit` |

---

## Appendix A: Immediate Action Items

1. **Fix backend test import errors** — Run `test_server_config.py` and `test_video_service.py` inside the venv, or refactor to mock heavy imports
2. **Install `@testing-library/react` + `jsdom`** — Enable component testing
3. **Add `data-testid` to critical elements** — Decouple E2E tests from DOM structure
4. **Write Zustand store unit tests** — Highest-value new test target (complex state logic, persistence)
5. **Establish pre-commit hook** — `tsc --noEmit && vitest run` as minimum quality gate

## Appendix B: Test Data Strategy

- **Generation params:** Use factory functions that produce valid defaults, with overrides for edge cases
- **Asset records:** Build from `upsertAssetsFromJobStatus` (already tested) — compose test data from known-good builders
- **File paths:** Use OS-agnostic path helpers; test both forward-slash and backslash variants for Windows compatibility
- **Images:** Use 1x1 pixel PNGs (base64-encoded constants) for tests that need image data without I/O
- **Temp files:** Always use `os.tmpdir()` / `tempfile.mkdtemp()` with cleanup in `afterEach` / `tearDown`
