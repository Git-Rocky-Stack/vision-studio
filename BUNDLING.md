# Bundling Python Backend with Vision Studio

This document explains the different approaches to bundle PyTorch, CUDA, and Python dependencies with the Electron app.

## 📦 Approach 1: Full Bundle (PyInstaller) - RECOMMENDED

This approach bundles everything including PyTorch and CUDA into a single executable.

### Pros
- ✅ Everything included, works offline
- ✅ Single download for users
- ✅ No setup required

### Cons
- ❌ Large file size (~4-6 GB with PyTorch CUDA)
- ❌ Longer build time
- ❌ Larger download for users

### Build Steps

```bash
# 1. Install frontend dependencies
npm install

# 2. Build Python backend executable
npm run build:backend

# 3. Build Electron app with bundled backend
npm run package:win
```

The `build-backend.cjs` script will:
1. Create a Python virtual environment
2. Install PyTorch with CUDA
3. Install all Python dependencies
4. Build a standalone executable with PyInstaller
5. Copy the executable to `resources/` folder
6. Package everything with Electron

## 📥 Approach 2: Download on First Run (Hybrid)

This approach bundles a lightweight backend and downloads PyTorch on first run.

### Pros
- ✅ Smaller initial download (~200 MB)
- ✅ Faster build time
- ✅ Optional GPU support (download CUDA version only if needed)

### Cons
- ❌ Requires internet on first run
- ❌ PyTorch download is large (~2-3 GB)
- ❌ First startup is slow

### Implementation

The app already supports this through the `backend/main.ts` logic:
- Checks for bundled executable first
- Falls back to system Python if not found
- Can download PyTorch via a setup wizard

## 🚀 Approach 3: Minimal Bundle + External Backend

Users bring their own Python/ComfyUI installation.

### Pros
- ✅ Smallest bundle size (~100 MB)
- ✅ Users can use existing ComfyUI setup
- ✅ Advanced users prefer this

### Cons
- ❌ Requires technical setup
- ❌ Not beginner-friendly

### Setup

1. Install ComfyUI separately
2. Set `COMFYUI_URL` in `.env`
3. The app will use external ComfyUI instead of bundled backend

## 📊 Size Comparison

| Approach | Bundle Size | User Download | First Run Time |
|----------|-------------|---------------|----------------|
| Full Bundle | 4-6 GB | 4-6 GB | Instant |
| Hybrid | 200 MB | 200 MB + 2-3 GB | 10-30 min |
| Minimal | 100 MB | 100 MB | Requires manual setup |

## 🎯 Recommendation

**For Distribution:** Use **Approach 1 (Full Bundle)** if:
- Your users have good internet (can download 4-6 GB)
- You want a "just works" experience
- Users are not technical

**For Development:** Use **Approach 3 (Minimal)** with local Python/ComfyUI

## 🔧 Build Configuration

### Including Python Backend in Build

The `package.json` build configuration includes:

```json
{
  "extraResources": [
    {
      "from": "resources/",
      "to": ".",
      "filter": ["**/*"]
    },
    {
      "from": "backend/",
      "to": "backend-source/",
      "filter": ["**/*", "!venv/**/*"]
    }
  ]
}
```

This copies:
- `resources/` → Contains the bundled Python executable
- `backend/` → Source code (fallback if bundled not available)

### Platform-Specific Notes

#### Windows
- Executable: `VisionStudio-Backend.exe`
- Requires Visual C++ Redistributables (usually pre-installed)

#### macOS
- Executable: `VisionStudio-Backend`
- May need to sign/notarize for distribution
- Apple Silicon requires different PyTorch build

#### Linux
- Executable: `VisionStudio-Backend`
- May need CUDA drivers installed separately
- Consider AppImage for distribution

## 🧪 Testing the Bundle

```bash
# 1. Build backend
npm run build:backend

# 2. Check if executable was created
ls resources/VisionStudio-Backend.exe  # Windows
ls resources/VisionStudio-Backend      # macOS/Linux

# 3. Test the executable directly
resources/VisionStudio-Backend.exe
# Should start the FastAPI server on http://localhost:8000

# 4. Build and test the full app
npm run package:win
# Test the built app in release/
```

## 🔍 Troubleshooting

### "Backend not found" Error
The app checks for the bundled backend in this order:
1. `resources/VisionStudio-Backend[.exe]` (production)
2. `backend/dist/VisionStudio-Backend[.exe]` (development)
3. System Python with backend source (fallback)

### Large Bundle Size
To reduce size, exclude unnecessary files:
- Edit `backend/main.spec` `excludes` list
- Remove unused PyTorch components
- Use `--onefile` vs `--onedir` (PyInstaller)

### Slow Startup
If the bundled app starts slowly:
- PyInstaller onefile mode extracts on each run
- Use onedir mode for faster startup
- Consider Approach 2 (hybrid) instead

## 📝 Advanced: Custom PyInstaller Spec

Edit `backend/main.spec` to customize:

```python
# Exclude large but unused modules
excludes=[
    'matplotlib',
    'tkinter',
    'unittest',
    'pdb',
    # ... more
]

# Include data files
datas=[
    ('models/*.json', 'models'),
    ('.env.example', '.'),
]
```

## 🌐 Alternative: Using Docker

For server deployments, consider Docker:

```dockerfile
FROM nvidia/cuda:12.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3 python3-pip
COPY backend/requirements.txt .
RUN pip3 install -r requirements.txt

COPY backend/ /app/
WORKDIR /app

EXPOSE 8000
CMD ["python3", "main.py"]
```

Run with:
```bash
docker run --gpus all -p 8000:8000 vision-studio-backend
```

## 📚 References

- [PyInstaller Documentation](https://pyinstaller.org/)
- [Electron Builder](https://www.electron.build/)
- [PyTorch CUDA Installation](https://pytorch.org/get-started/locally/)
