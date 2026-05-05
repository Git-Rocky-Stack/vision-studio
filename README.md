# Vision Studio 🎨

[![PR Gate](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/pr-gate.yml/badge.svg)](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/pr-gate.yml)
[![Release](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/release.yml/badge.svg)](https://github.com/Git-Rocky-Stack/vision-studio/actions/workflows/release.yml)

A professional AI-powered desktop application for image and video generation. No cloud required - everything runs locally on your machine.

![Vision Studio](screenshot.png)

## ✨ Features

- **🎨 Image Generation** - FLUX.1, Stable Diffusion XL, SD 1.5
- **🎬 Video Generation** - LTX Video, Stable Video Diffusion, AnimateDiff
- **📦 Batch Processing** - Generate multiple images at once
- **📋 Templates** - YouTube, TikTok, Instagram presets
- **🖼️ Professional Editor** - Timeline, canvas, effects
- **🔒 Privacy First** - Everything runs locally

## 🚀 Quick Start (End Users)

### Option 1: Download Pre-built App (Easiest)

1. Download the latest release for your platform from [Releases](../../releases)
2. Run the installer
3. On first launch, the app will download PyTorch (~2-3 GB)
4. Start creating!

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/yourusername/vision-studio.git
cd vision-studio

# Quick start (Windows)
quickstart.bat

# Or manual setup:
npm install
npm run dev
```

## 🛠️ Developer Setup

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Python** 3.10+ (for backend development)
- **CUDA 12.1** (optional, for GPU acceleration)

### Setup Options

#### Option A: Bundled Backend (Recommended for Distribution)

Bundle PyTorch + CUDA into the app:

```bash
# Install frontend dependencies
npm install

# Build Python backend executable (4-6 GB bundle)
npm run build:backend

# Package the full app
npm run package:win    # or :mac, :linux
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

## 📦 Bundling Python Backend

We support multiple approaches for bundling the Python backend:

### Full Bundle (PyInstaller) ⭐ Recommended

Everything included in one package:

```bash
npm run build:backend   # Build Python executable
npm run package         # Package with Electron
```

**Size:** ~4-6 GB  
**Pros:** Works offline, no setup  
**Cons:** Large download

### Hybrid (Download on First Run)

Small initial download, PyTorch downloaded on first run:

```bash
# Skip PyTorch in build
npm run package
```

**Size:** ~200 MB initial, +2-3 GB download  
**Pros:** Fast initial download  
**Cons:** Needs internet on first run

See [BUNDLING.md](BUNDLING.md) for detailed documentation.

## 📁 Project Structure

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
├── build-backend.js       # Build script
├── quickstart.bat         # Windows quick start
└── package.json
```

## 🎨 Tech Stack

### Frontend
- **Electron 33** - Desktop shell
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management

### Backend
- **FastAPI** - API framework
- **PyTorch 2.1+** - ML framework
- **CUDA 12.1** - GPU acceleration
- **Diffusers** - HuggingFace pipelines
- **WebSocket** - Real-time progress

## 🖥️ System Requirements

### Minimum
- Windows 10 / macOS 12 / Ubuntu 20.04
- 8 GB RAM
- 10 GB free disk space
- Internet connection (first run)

### Recommended
- Windows 11 / macOS 14 / Ubuntu 22.04
- NVIDIA GPU with 8GB+ VRAM
- 16 GB RAM
- 50 GB free disk space (for models)

### GPU Support
| GPU | VRAM | Performance |
|-----|------|-------------|
| RTX 4090 | 24 GB | ⭐⭐⭐⭐⭐ Best |
| RTX 4080 | 16 GB | ⭐⭐⭐⭐ Great |
| RTX 4070 | 12 GB | ⭐⭐⭐ Good |
| RTX 3060 | 12 GB | ⭐⭐⭐ Good |
| GTX 1080 Ti | 11 GB | ⭐⭐ Fair |
| CPU Only | - | ⭐ Slow |

## 🔌 API

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

## 🔧 Troubleshooting

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

## 🧪 Testing

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

| Layer | Framework | Files | Tests |
|-------|-----------|-------|-------|
| Unit + Integration | Vitest 3.2 | 16 | 119 |
| E2E | Playwright | 3 | 13 |
| Backend | unittest | 7 | 35 (28 + 7 skipped) |

## 📚 Documentation

Full technical documentation lives in [`docs/`](docs/). Start with the index:

| Doc | What it covers |
|-----|----------------|
| [`docs/INDEX.md`](docs/INDEX.md) | Documentation entry point — read this first |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Process model, source layout, data flows, persistence, security, build, release |
| [`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md) | Electron IPC + backend REST + WebSocket + OpenRouter — every channel and endpoint |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | SQLite schema, ER diagram, migration runner, how to add a migration |
| [`docs/api/openapi.json`](docs/api/openapi.json) | Machine-readable OpenAPI 3.0 spec (paste into Swagger UI / Redoc) |
| [`docs/diagrams/diagrams.md`](docs/diagrams/diagrams.md) | Standalone Mermaid diagram library for slides and presentations |

The running backend also serves a live, fully introspectable spec at:

- **Swagger UI** — `http://127.0.0.1:8000/api/docs`
- **ReDoc** — `http://127.0.0.1:8000/api/redoc`
- **Raw JSON** — `http://127.0.0.1:8000/api/openapi.json`

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

```bash
# Fork and clone
git clone https://github.com/yourusername/vision-studio.git

# Create branch
git checkout -b feature/amazing-feature

# Commit and push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature

# Open Pull Request
```

## 📜 License

MIT License - see [LICENSE](LICENSE)

## 🙏 Acknowledgments

- [Black Forest Labs](https://blackforestlabs.ai/) - FLUX models
- [Stability AI](https://stability.ai/) - Stable Diffusion
- [Lightricks](https://www.lightricks.com/) - LTX Video
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - Node system

---

**Star ⭐ this repo if you find it useful!**

Built with ❤️ for creators who want AI without the cloud.
