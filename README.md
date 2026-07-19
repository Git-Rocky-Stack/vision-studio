# Vision Studio-X

[![PR Gate](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/pr-gate.yml/badge.svg)](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/pr-gate.yml)
[![Release macOS + Linux](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/release-mac-linux.yml/badge.svg)](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/release-mac-linux.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20(Apple%20Silicon)%20%7C%20Linux-lightgrey.svg)](#-system-requirements)

A professional AI-powered desktop application for image and video generation. No cloud required - everything runs locally on your machine.

> **Current release: v3.2.0** — see [`CHANGELOG.md`](CHANGELOG.md) for what's new. Download at **[vision-studio-x.com/download](https://vision-studio-x.com/download)**.

## Features

- **Image Generation** - FLUX.1, Stable Diffusion XL, SD 3.5, SD 1.5
- **Video Generation** - LTX Video, Stable Video Diffusion, AnimateDiff
- **Guided Edit Tools** - background removal, AI upscale, face enhancement, generative fill, object removal, AI expand, background replace, and style transfer
- **Editor with Text Layers** - timeline + canvas + effects, with real text layers (font, color, shadow, stroke, blend) rendered on the canvas
- **LoRA, End to End** - install LoRAs through the Model Foundry, stack them in generation and in the workflow graph's LoRA Loader node; hosted flux LoRA via HuggingFace where the contract supports it
- **Model Foundry** - consent-gated, license-aware download and management of model weights
- **Workflow Graph** - import and run ComfyUI API-format graphs inside the workbench
- **Provider Routing** - run fully local or bring your own OpenRouter key (BYOK); route prompt tools and still images per account, with graceful over-budget fallback
- **AI Director** - retrieval-augmented prompt assistance grounded in your own project context
- **GPU Acceleration** - per-optimization Performance panel (SDPA, channels-last, torch.compile, quantization; TensorRT opt-in) tuned to your hardware
- **Batch Processing** - generate multiple images at once
- **Export Templates** - platform presets for YouTube, TikTok, Instagram, X, LinkedIn, and more
- **Privacy First** - everything runs locally; no telemetry, nothing leaves your machine

## Quick Start (End Users)

### Option 1: Download Pre-built App (Easiest)

1. Download for your platform from **[vision-studio-x.com/download](https://vision-studio-x.com/download)** — Windows x64, macOS on Apple Silicon, or Linux x64
2. Run the installer. The AI backend (PyTorch, diffusers, CUDA/MPS) is bundled — there is nothing extra to install
3. Builds are not yet code-signed: on Windows click **More info -> Run anyway**; on macOS **right-click -> Open** the first time
4. On first launch, download the model weights you want through the in-app **Foundry** (~2-24 GB per model, consent-gated) — then start creating

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/Git-Rocky-Stack/vision-studio.git
cd vision-studio

# Quick start (Windows)
quickstart.bat

# Or manual setup:
npm install
npm run dev
```

## Developer Setup

### Prerequisites

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Python** 3.10-3.12 (for backend development; PyTorch has no 3.13+ wheels yet)
- **CUDA 12.1** (optional, for NVIDIA GPU acceleration)

### Setup Options

#### Option A: Bundled Backend (the distribution build)

Build the native backend and package the app:

```bash
# Install frontend dependencies
npm install

# Build the native backend bundle (heavy-by-design; ~30-60 min)
npm run build:backend

# Package the full app
npm run package:win    # macOS/Linux are built in CI (PyInstaller can't cross-compile)
```

#### Option B: System Python (Development)

Use your system Python installation:

```bash
# Windows
setup-python.bat

# macOS/Linux
cd backend
python3 -m venv venv
source venv/bin/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
cd ..
npm install
npm run dev
```

#### Option C: External ComfyUI (Advanced)

Use an existing ComfyUI installation:

1. Install [ComfyUI](https://github.com/comfyanonymous/ComfyUI) separately
2. Create `.env` file:
```
COMFYUI_URL=http://127.0.0.1:8188
```
3. Start ComfyUI, then run `npm run dev`

## Bundling the Python Backend

Vision Studio is **heavy-by-design**: every package ships the native backend
(PyTorch + diffusers + CUDA/MPS). Packaging aborts if the bundle is missing —
there is no slim or "download on first run" variant. Model *weights* are the only
thing fetched later, through the consent-gated in-app Foundry.

```bash
npm run build:backend   # PyInstaller bundle -> resources/ (only if backend/ changed)
npm run build           # frontend -> dist/
npm run package:win     # nsis-web installer + portable zip
```

See [BUNDLING.md](BUNDLING.md) for how the bundle is produced and
[DEPLOYMENT.md](DEPLOYMENT.md) for cross-platform build + R2 delivery.

## Project Structure

```
vision-studio/
├── electron/              # Electron main process
│   ├── main.ts           # App entry, backend launcher
│   ├── preload.ts        # IPC bridge
│   └── ipc-handlers/     # API handlers
│
├── backend/               # Python FastAPI server
│   ├── main.py           # FastAPI app
│   ├── main.spec         # PyInstaller config
│   ├── requirements.txt  # Python deps
│   └── utils/            # Job manager, model manager
│
├── src/                   # React frontend
│   ├── components/       # UI components
│   ├── pages/            # Panel views
│   ├── store/            # Zustand state
│   └── App.tsx           # Main app
│
├── build-backend.cjs      # Build script
├── quickstart.bat         # Windows quick start
└── package.json
```

## Tech Stack

### Frontend
- **Electron 42** - Desktop shell
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management

### Backend
- **FastAPI** - API framework
- **PyTorch 2.5** (CUDA 12.1, or Metal/MPS on Apple Silicon) - ML runtime
- **Diffusers** - HuggingFace pipelines
- **WebSocket** - Real-time progress

## System Requirements

### Minimum
- Windows 10 x64 / macOS 13 (Apple Silicon) / Ubuntu 22.04 x64
- 8 GB RAM
- 10 GB free disk space
- Internet connection (first-run model downloads)

### Recommended
- Windows 11 / macOS 14 / Ubuntu 24.04
- NVIDIA GPU with 8GB+ VRAM, or Apple M-series (runs on Metal/MPS)
- 16 GB RAM
- 50 GB free disk space (for model weights)

macOS builds are **Apple Silicon (arm64) only** — PyTorch dropped macOS x64
wheels at 2.3. On Apple Silicon the engine runs on Metal (MPS); on Windows/Linux
it runs on NVIDIA CUDA, and falls back to CPU (slowly) when no GPU is present.

### GPU Support
| GPU | VRAM | Performance |
|-----|------|-------------|
| RTX 4090 | 24 GB | ⭐⭐⭐⭐⭐ Best |
| RTX 4080 | 16 GB | ⭐⭐⭐⭐ Great |
| RTX 4070 | 12 GB | ⭐⭐⭐ Good |
| RTX 3060 | 12 GB | ⭐⭐⭐ Good |
| GTX 1080 Ti | 11 GB | ⭐⭐ Fair |
| Apple M-series | unified | ⭐⭐⭐ Metal/MPS |
| CPU Only | - | ⭐ Slow |

## API

The Python backend exposes a REST API on `http://localhost:8000`:

```bash
# Generate image
POST /api/generate/image
{
  "prompt": "a beautiful landscape",
  "width": 1024,
  "height": 1024,
  "model": "flux-dev"
}

# Get job status
GET /api/jobs/{job_id}

# WebSocket for real-time updates
ws://localhost:8000/ws
```

## Troubleshooting

### "Backend not found"
- Make sure Python backend is built: `npm run build:backend`
- Or use system Python: `setup-python.bat`

### "CUDA out of memory"
- Reduce image resolution
- Close other GPU apps
- Use smaller models (SD 1.5 instead of FLUX)

### Slow generation
- Check GPU is detected in Settings
- Enable GPU acceleration
- Lower step count (25 → 20)

### Models not downloading
- Check internet connection
- Verify HuggingFace token in `.env` (for FLUX)
- Try manual download

## Testing

```bash
# Unit + component + integration tests (Vitest)
npm test

# Watch mode
npm run test:watch

# Specific test layers
npm run test:unit          # Pure logic + store + Electron services
npm run test:component     # React component tests (jsdom)
npm run test:integration   # API contracts, store persistence, workflows

# TypeScript type-check
npm run typecheck

# E2E tests (requires `npm run build` first)
npm run test:e2e           # Playwright + Electron
npm run test:e2e:headed    # With visible browser window
npm run test:a11y          # Accessibility smoke tests only

# Backend tests
cd backend && python -m unittest discover -s tests -v
```

| Layer | Framework | What it covers |
|-------|-----------|----------------|
| Unit + Component + Integration | Vitest 4 | 1,800+ frontend tests - pure logic, Zustand store, Electron services, React components, API/workflow contracts |
| E2E + Visual | Playwright | Electron end-to-end, accessibility, and Windows visual-regression suites |
| Backend | pytest / unittest | FastAPI + foundry + services; import-safe collection on CI, real model runs are local |

## Documentation

Full technical documentation lives in [`docs/`](docs/). Start with the index:

| Doc | What it covers |
|-----|----------------|
| [`docs/INDEX.md`](docs/INDEX.md) | Documentation entry point — read this first |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Process model, source layout, data flows, persistence, security, build, release |
| [`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md) | Electron IPC + backend REST + WebSocket + OpenRouter — every channel and endpoint |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | SQLite schema, ER diagram, migration runner, how to add a migration |
| [`docs/api/openapi.json`](docs/api/openapi.json) | Machine-readable OpenAPI 3.0 spec (paste into Swagger UI / Redoc) |
| [`docs/diagrams/diagrams.md`](docs/diagrams/diagrams.md) | Standalone Mermaid diagram library for slides and presentations |

Build & release: [`BUNDLING.md`](BUNDLING.md) · [`WINDOWS_BUILD.md`](WINDOWS_BUILD.md) · [`DEPLOYMENT.md`](DEPLOYMENT.md)

The running backend also serves a live, fully introspectable spec at:

- **Swagger UI** — `http://127.0.0.1:8000/api/docs`
- **ReDoc** — `http://127.0.0.1:8000/api/redoc`
- **Raw JSON** — `http://127.0.0.1:8000/api/openapi.json`

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

```bash
# Fork and clone
git clone https://github.com/Git-Rocky-Stack/vision-studio.git

# Create branch
git checkout -b feature/amazing-feature

# Commit and push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature

# Open Pull Request
```

## License

MIT License - see [LICENSE](LICENSE)

## Acknowledgments

- [Black Forest Labs](https://blackforestlabs.ai/) - FLUX models
- [Stability AI](https://stability.ai/) - Stable Diffusion
- [Lightricks](https://www.lightricks.com/) - LTX Video
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - Node system

---

**Star this repo if you find it useful!**

Built with ❤️ for creators who want AI without the cloud.
