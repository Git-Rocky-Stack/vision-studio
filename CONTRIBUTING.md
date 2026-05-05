# Contributing to Vision Studio

Thank you for your interest in contributing to Vision Studio! This guide will help you set up your development environment, run tests, and submit contributions.

## Table of Contents

- [Development Setup](#development-setup)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [Code Style & Conventions](#code-style--conventions)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)

---

## Development Setup

### Prerequisites

Install the following software before getting started:

#### Required

- **Node.js 18+** - [Download](https://nodejs.org/)
  - Verify: `node --version` (should be v18.x or higher)
  - npm is included with Node.js

- **Python 3.10+** - [Download](https://www.python.org/downloads/)
  - Verify: `python --version` or `python3 --version`
  - Required for backend development and AI generation features

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

# Install backend dependencies (if using system Python)
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
cd ..
```

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

Run frontend and backend separately for debugging:

```bash
# Terminal 1 - Frontend only
npm run dev:frontend

# Terminal 2 - Backend only
npm run dev:backend
```

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

**Output:** `release/` directory contains the distributable (.exe, .dmg, .AppImage)

### Build Configuration

| Command | Description | Output Size |
|---------|-------------|-------------|
| `npm run build:backend` | Bundle Python with PyInstaller | ~4-6 GB |
| `npm run package` | Full Electron build | ~4-6 GB |
| `npm run package:win` | Windows-specific build | ~4-6 GB |

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

```bash
# Python unittest suite
cd backend
python -m unittest discover -s tests -v
```

### Test Coverage

| Layer | Framework | Files | Tests |
|-------|-----------|-------|-------|
| Unit + Integration | Vitest 3.2 | 16 | 119 |
| Component | Vitest + Testing Library | 8 | 58 |
| E2E | Playwright | 3 | 13 |
| Backend | unittest | 7 | 35 |

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
- App Version: [e.g., 0.1.0]

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
- **Security** - Email: security@visionstudio.app (do not use public issues)
- **Questions** - [Discussions](https://github.com/Git-Rocky-Stack/vision-studio/discussions)

---

## Questions?

- Check the [README](README.md) for general information
- Read [`docs/INDEX.md`](docs/INDEX.md) to find the right technical document — start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system overview, [`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md) for IPC + REST + WebSocket, and [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) for the SQLite schema
- See [BUNDLING.md](BUNDLING.md) for Python bundling details
- Review existing [issues](https://github.com/Git-Rocky-Stack/vision-studio/issues) for similar problems

Thank you for contributing to Vision Studio! 🎨
