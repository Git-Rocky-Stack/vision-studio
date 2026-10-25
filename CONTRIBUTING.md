# Contributing to Vision Studio

Thank you for your interest in contributing to Vision Studio! This guide will help you set up your development environment, run tests, and submit contributions.

Before you start, two documents govern how we work together:

- [**Code of Conduct**](CODE_OF_CONDUCT.md) - what is expected of everyone taking
  part. Note the project-specific clause: this app generates images, and issue
  attachments are public.
- [**Security Policy**](SECURITY.md) - **never report a vulnerability in a public
  issue.** It sets out what counts as one, what is explicitly out of scope, and
  how to disclose privately.

## Table of Contents

- [Development Setup](#development-setup)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [Code Style & Conventions](#code-style--conventions)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

---

## Development Setup

### Prerequisites

Install the following software before getting started:

#### Required

- **Node.js `^20.19.0 || ^22.13.0 || >=24`** - [Download](https://nodejs.org/)
  - Verify: `node --version`
  - The range is the `engines` field in `package.json`. It comes from the
    toolchain, not from preference: jsdom 28 and ESLint 10 do not run on older
    releases, so `npm test` and `npm run lint` fail there
  - Node 22 LTS is recommended (`.nvmrc`; `nvm use` picks it up). CI builds and
    tests on Node 20 (the `node-version` in `.github/workflows/pr-gate.yml`)
  - npm is included with Node.js

- **Python 3.12** - [Download](https://www.python.org/downloads/)
  - Verify: `python --version` or `python3 --version`
  - Required for backend development and AI generation features
  - Every workflow that builds or tests the backend pins 3.12 (the
    `python-version` in `.github/workflows/pr-gate.yml`, `release.yml` and
    `release-mac-linux.yml`). 3.10 and 3.11 also work. The torch build this
    pairs with - 2.5.1+cu121 - publishes no cp313 wheels, so a 3.13 interpreter
    fails at `pip install torch`

#### Optional (GPU Acceleration)

- **CUDA 12.1** - [Download](https://developer.nvidia.com/cuda-12-1-0-download-archive)
  - Only required if you want GPU-accelerated image/video generation
  - NVIDIA GPU with 8GB+ VRAM recommended
  - Verify: `nvidia-smi` (should show CUDA version)

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/Git-Rocky-Stack/vision-studio.git
cd vision-studio

# Install frontend dependencies
npm install
```

Then set up the Python backend in `backend/venv`. `npm run dev` starts the
backend with that venv's Python whenever it exists, so it does not have to be
activated in the shell that runs the app.

**Any platform, one step** - runs `build-backend.cjs`'s own install steps (the
pinned PyTorch, `requirements.txt`, then the generation stack) and finishes with
the release build's import check. On Windows, `setup-python.bat` runs the same
script. Without an NVIDIA GPU it installs the smaller CPU torch wheels. It looks
for a Python 3.10-3.12 interpreter through `uv`, then the Windows `py` launcher,
then `python` on `PATH` - on Linux or macOS, where `python` may be missing or
too new, install one with `uv python install 3.12` or use the manual steps.

```bash
node scripts/setup-dev-backend.cjs
```

**Or by hand** - the same pins, step by step:

```bash
cd backend
python3.12 -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# NVIDIA (Windows/Linux):
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121
# macOS (Apple Silicon) - the cu121 index has no macOS wheels:
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1

pip install -r requirements.txt

# The generation stack the release build bundles (BUNDLED_RUNTIME_PACKAGES in
# build-backend.cjs). requirements.txt holds only the server and test
# dependencies; without this the backend starts but cannot generate.
pip install "diffusers>=0.25.0" "transformers>=4.35.0" "accelerate>=0.24.0" "peft>=0.11.0" \
  "controlnet-aux>=0.0.10" "onnxruntime>=1.17" "spandrel>=0.4.0" "facexlib>=0.3.0" "aiohttp>=3.9"
cd ..
```

The package list lives in `build-backend.cjs` (`TORCH_PIN` and
`BUNDLED_RUNTIME_PACKAGES`); if it ever disagrees with this page, the script is
right.

### Verify Setup

```bash
# Run type check
npm run typecheck

# Run tests
npm test
```

---

## Running the Application

### Development Mode

Start both frontend and backend in development mode:

```bash
# Start Vite dev server + Python backend (port 5173 + 8000)
npm run dev
```

This command:
- Starts Vite development server on `http://localhost:5173`
- Launches Electron with the React app
- Starts the Python FastAPI backend on `http://localhost:8000`

### Separate Processes

There is no `dev:frontend` / `dev:backend` script - `npm run dev` starts Vite,
which launches Electron through `vite-plugin-electron` (the `electron()` plugin
in `vite.config.ts`), and Electron spawns the backend (the `spawn(...)` call in
`createBackendProcessService`, `electron/services/backendProcess.ts`). To run the
backend yourself instead, start it standalone and tell the shell not to spawn its
own:

```bash
# Terminal 1 - backend only (uvicorn; backend/main.py __main__)
cd backend
python main.py

# Terminal 2 - shell, using the backend you started
VISION_STUDIO_SKIP_BACKEND=1 \
VISION_STUDIO_BACKEND_EXTERNAL=1 \
VISION_STUDIO_BACKEND_AUTH_TOKEN=<same-token-in-both-terminals> \
npm run dev
```

| Variable | Read at | Effect |
|----------|---------|--------|
| `VISION_STUDIO_SKIP_BACKEND` | `start()` in `electron/services/mainProcess.ts` | Electron does not autostart a backend child when truthy (`1`, `true`, `yes`, `on`); `0`, `false`, `off`, `no` and empty leave autostart on |
| `VISION_STUDIO_BACKEND_EXTERNAL` | `isExternalBackendEnabled()` in `electron/services/backendProcess.ts` | Probe an out-of-process backend over HTTP so it reads as connected. Any value except `0`, `false`, `off`, `no`, or empty enables it |
| `VISION_STUDIO_BACKEND_AUTH_TOKEN` | `getBackendAuthToken()` in `electron/services/backendAuth.ts`; `BACKEND_AUTH_TOKEN` in `backend/main.py` | **Must match in both terminals.** Otherwise each side mints its own token and every authenticated request fails with HTTP 403 while `/health` still succeeds - the app reads as "disconnected" with the backend plainly up. `externalBackendTokenWarning()` logs a warning when external mode is on without it |
| `VISION_STUDIO_BACKEND_HOST` | `get_uvicorn_config()` in `backend/main.py` | Bind address; defaults to `127.0.0.1` |

These are referenced by file and symbol rather than line number, so they stay
findable as the files change.

### Building for Production

```bash
# Build Python backend executable (bundles PyTorch + CUDA)
npm run build:backend

# Package distributable application
npm run package          # Auto-detects platform
npm run package:win      # Windows only
npm run package:mac      # macOS only
npm run package:linux    # Linux only
```

**Output:** the `release/` directory. Windows writes the nsis-web installer to
`release/nsis-web/` and a portable zip to `release/`; macOS writes a `.dmg` and
`.zip`; Linux writes an `.AppImage`. macOS and Linux packages are built in CI
(PyInstaller cannot cross-compile) - see [DEPLOYMENT.md](DEPLOYMENT.md).

### Build Configuration

Approximate sizes, from the release artifacts listed in
[DEPLOYMENT.md](DEPLOYMENT.md#file-sizes-v320):

| Command | Description | Output |
|---------|-------------|--------|
| `npm run build:backend` | PyInstaller backend bundle -> `resources/` (roughly 30-60 min) | ~2.6 GB on Windows |
| `npm run package:win` | nsis-web installer + portable zip | ~1 MB `Setup.exe` stub, ~2.56 GB `.nsis.7z` app package, ~2.6 GB portable zip |
| `npm run package:mac` | Apple Silicon `.dmg` + `.zip` (CI) | ~527 MB dmg |
| `npm run package:linux` | x64 `.AppImage` (CI) | ~3.3 GB |
| `npm run package` | electron-builder for the platform you are on | as above |

See [BUNDLING.md](BUNDLING.md) for detailed bundling options.

---

## Running Tests

Vision Studio uses a comprehensive testing strategy with multiple layers:

### Frontend Tests

```bash
# Run all Vitest tests (unit + component + integration)
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Run specific test layers
npm run test:unit          # Pure logic, store, Electron services
npm run test:component     # React components (jsdom)
npm run test:integration   # API contracts, workflows, persistence

# Run tests related to staged files (pre-commit hook)
npx lint-staged
```

### End-to-End Tests

```bash
# Playwright E2E tests (headless)
npm run test:e2e

# With visible browser window (debugging)
npm run test:e2e:headed

# Accessibility tests only
npm run test:a11y
```

**Note:** E2E tests require a production build first:
```bash
npm run build
npm run test:e2e
```

### Backend Tests

The backend suite runs under **pytest** (a superset of the `unittest.TestCase`
suites that also collects the pytest-style fixture/monkeypatch tests). Run it
from the `backend/` directory; config lives in `backend/pytest.ini` and tier
auto-tagging in `backend/tests/conftest.py`.

```bash
cd backend
python -m pytest                 # unit + integration tiers (benchmarks excluded)
python -m pytest -m unit         # fast isolated logic only
python -m pytest -m integration  # FastAPI / HTTP-boundary tests only

# Benchmark / model-loading tier (opt-in; needs the GPU/model stack):
python -m pytest tests/benchmarks -o addopts="" --benchmark-only
```

> Do **not** use `python -m unittest discover` — it silently skips the
> pytest-style tests (including the security-sanitization and DB-migration
> suites). CI runs `python -m pytest`.

### Test Coverage

This page does not quote test counts: they change with almost every pull
request, and a hard-coded figure is wrong within days. Each command below prints
the current number for its layer.

| Layer | Framework | Count it with |
|-------|-----------|---------------|
| Frontend (unit + component + integration + repo gates) | Vitest 4.1 | `npx vitest run` (summary line: test files and tests) |
| E2E | Playwright 1.58 | `npx playwright test --list` |
| Backend (unit + integration) | pytest | `cd backend && python -m pytest --collect-only -q` |
| Backend (benchmark, opt-in) | pytest-benchmark | `cd backend && python -m pytest tests/benchmarks -o addopts="" --benchmark-only --collect-only -q` |

The E2E figure counts every spec Playwright can collect, including the
Windows-authored visual-regression suite. Snapshot comparisons are only
meaningful on the platform that authored them.

### TypeScript Type Check

```bash
# Verify TypeScript types (no emit)
npm run typecheck
```

---

## Code Style & Conventions

### TypeScript

- **Strict mode enabled** - No `any` types without explicit justification
- **Functional components** - Use hooks, avoid class components
- **Explicit return types** - Required for exported functions

```typescript
// ✅ Good
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

// ❌ Avoid
const formatDate = (date: any) => {
  return date.toString();
};
```

### Tailwind CSS

- **8-point grid system** - All spacing uses multiples of 8px (4px for fine adjustments)
- **Utility-first** - Prefer Tailwind classes over custom CSS
- **Design tokens** - Use `@theme` values from `src/index.css`

```tsx
// ✅ Good - uses design tokens
<div className="p-4 gap-2 bg-surface border-border rounded-lg">
  <h2 className="text-heading-lg font-semibold text-text-primary">
    Title
  </h2>
</div>
```

### Component Naming

| Type | File Name | Component Name | Example |
|------|-----------|----------------|---------|
| Components | `PascalCase.tsx` | `PascalCase` | `Button.tsx` → `export function Button()` |
| Utilities | `camelCase.ts` | `camelCase` | `formatDate.ts` → `export function formatDate()` |
| Constants | `UPPER_CASE.ts` | `UPPER_CASE` | `strings.ts` → `export const BUTTON_LABELS` |
| Hooks | `useSomething.ts` | `useSomething` | `useToast.ts` → `export function useToast()` |

### State Management (Zustand)

```typescript
// Store pattern (src/store/appStore.ts)
interface AppState {
  isLoading: boolean;
  prompts: Prompt[];
  setPrompts: (prompts: Prompt[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isLoading: false,
  prompts: [],
  setPrompts: (prompts) => set({ prompts }),
}));
```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, no code change
- `refactor` - Code restructuring, no behavior change
- `test` - Adding or updating tests
- `chore` - Maintenance, config changes

**Examples:**
```
feat(generate): Add batch processing for multiple images
fix(a11y): Resolve color contrast issues in SettingsPanel
docs(readme): Update installation instructions for macOS
refactor(store): Simplify prompt state management
```

---

## Pull Request Process

### Branch Naming

Use descriptive branch names with prefixes:

```
feature/add-batch-processing      # New features
fix/contrast-issues                # Bug fixes
chore/update-deps                  # Maintenance
test/add-tooltip-tests             # Test additions
docs/update-api-docs               # Documentation
```

### PR Title Format

Keep PR titles under 70 characters, following the same format as commits:

```
feat(editor): Add layer blending modes
fix(generate): Resolve WebSocket connection timeout
```

### Required Checks

All PRs must pass:

- ✅ **TypeScript** - `npm run typecheck`
- ✅ **Tests** - `npm test` (all layers passing)
- ✅ **E2E** - `npm run test:e2e` (for UI changes)
- ✅ **Lint-staged** - Pre-commit hooks run related tests

### Review Expectations

- **Respond to feedback** within 48 hours
- **Mark conversations** as resolved after addressing
- **Request re-review** after making significant changes
- **Keep PRs focused** - One feature/fix per PR

### Before Submitting

```bash
# Run full QA checklist
npm run typecheck
npm test
npm run test:e2e

# Verify no console errors in dev mode
npm run dev
```

---

## Issue Reporting

### Bug Reports

Use the GitHub issue template or include:

```markdown
**Describe the bug**
Clear description of what went wrong.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What should have happened.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g., Windows 11]
- Node: [e.g., v20.10.0]
- Python: [e.g., 3.11.5]
- GPU: [e.g., RTX 4070]
- App Version: [e.g., 3.0.0]

**Logs**
```
Paste relevant logs from console or backend.
```

**Additional context**
Any other details.
```

### Feature Requests

```markdown
**Is your feature request related to a problem?**
Describe the pain point (e.g., "I'm frustrated when...").

**Describe the solution you'd like**
Clear description of desired functionality.

**Describe alternatives you've considered**
Other approaches you thought about.

**Use case**
Who would use this? How often?

**Additional context**
Mockups, examples, or references.
```

### Where to Report

- **Bugs** - [GitHub Issues](https://github.com/Git-Rocky-Stack/vision-studio/issues)
- **Security** - Email: security@vision-studio-x.com, or open a
  [private advisory](https://github.com/Git-Rocky-Stack/vision-studio/security/advisories/new).
  Never use public issues - see [SECURITY.md](SECURITY.md) for scope and disclosure timelines
- **Questions** - [Discussions](https://github.com/Git-Rocky-Stack/vision-studio/discussions)

---

## Questions?

- Check the [README](README.md) for general information
- Read [`docs/INDEX.md`](docs/INDEX.md) to find the right technical document — start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system overview, [`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md) for IPC + REST + WebSocket, and [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) for the SQLite schema
- See [BUNDLING.md](BUNDLING.md) for Python bundling details
- Review existing [issues](https://github.com/Git-Rocky-Stack/vision-studio/issues) for similar problems

Thank you for contributing to Vision Studio! 🎨
