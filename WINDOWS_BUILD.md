# Vision Studio - Windows Build Guide

Complete guide for building the Windows installer for Vision Studio.

## 📋 Prerequisites

Before you start, ensure you have:

### Required
- **Windows 10/11 64-bit**
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Git** - [Download](https://git-scm.com/)

### Optional (For Full Bundle)
- **Python 3.10+** - [Download](https://python.org/)
- **Visual C++ Build Tools** - May be required for some Python packages
- **~10 GB free disk space** - For full bundle with PyTorch

## 🚀 Quick Build (Frontend Only)

If you want to skip the Python backend bundling:

```powershell
# Navigate to project folder
cd vision-studio

# Install dependencies
npm install

# Build for Windows
npm run package:win
```

**Output:**
- `Vision Studio Setup 3.1.0.exe` - NSIS installer (~150 MB)
- `Vision Studio-3.1.0-win.zip` - portable ZIP archive (~150 MB)

⚠️ **Note:** This version requires Python to be installed separately.

## 🏗️ Full Build (With AI Backend)

To create a complete standalone installer with PyTorch + CUDA bundled:

```powershell
# Option 1: Run the automated build script
npm run build:windows:full

# Option 2: Manual step-by-step
npm run build:backend      # Build Python executable (~30-60 min)
npm run build:windows      # Package with Electron (~5 min)
```

**Output:**
- `Vision Studio Setup 3.1.0.exe` - NSIS installer (~4-6 GB)
- `Vision Studio-3.1.0-win.zip` - portable ZIP archive (~4-6 GB)

### Full Build Steps Explained

#### 1. Install Dependencies
```powershell
npm install
```

#### 2. Create App Icon (Optional but Recommended)
```powershell
# Create a simple icon (requires ImageMagick or Python PIL)
npm run create:icon

# Or manually:
# - Create 256x256 PNG
# - Convert to ICO at: https://redketchup.io/icon-converter
# - Save as build/icon.ico
```

#### 3. Build Python Backend
```powershell
npm run build:backend
```

This will:
- Create Python virtual environment
- Download PyTorch with CUDA 12.1 (~2.5 GB)
- Install all Python dependencies
- Build standalone executable with PyInstaller
- Copy executable to `resources/` folder

⏱️ **Time:** 30-60 minutes depending on internet speed

#### 4. Package for Windows
```powershell
npm run build:windows
```

This will:
- Build React frontend
- Package with Electron
- Create NSIS installer
- Create portable ZIP archive

⏱️ **Time:** 5-10 minutes

## 📦 Build Outputs

After successful build, you'll find these files in `release/`:

| File | Size | Description |
|------|------|-------------|
| `Vision Studio Setup 3.1.0.exe` | 4-6 GB | NSIS installer with wizard |
| `Vision Studio-3.1.0-win.zip` | 4-6 GB | Portable ZIP archive |
| `win-unpacked/` | 4-6 GB | Unpacked app files |

### Installer Features

The NSIS installer includes:

- ✅ Custom welcome and finish pages
- ✅ License agreement screen
- ✅ Component selection (Main, Backend, Shortcuts)
- ✅ Custom installation directory
- ✅ Desktop shortcut option
- ✅ Start Menu integration
- ✅ Proper uninstaller
- ✅ Disk space check
- ✅ 64-bit Windows verification

## 🎨 Customizing the Installer

### Change Installer Graphics

Create these files in `build/` folder:

```
build/
├── icon.ico              # Application icon (256x256)
├── header.bmp            # Header image (150x57)
├── wizard.bmp            # Wizard image (164x314)
└── license.txt           # License text
```

### Change Installer Text

Edit `build/installer.nsh`:

```nsis
!define MUI_WELCOMEPAGE_TITLE "Your Custom Title"
!define MUI_WELCOMEPAGE_TEXT "Your custom welcome message..."
```

### Add Components

Edit `build/installer.nsh` and add new sections:

```nsis
Section "Additional Models" SecModels
    SetOutPath "$INSTDIR\models"
    File /r "..\models\*.*"
SectionEnd
```

## 🔏 Code Signing (Recommended for Distribution)

Unsigned installers show a "Windows protected your PC" warning. Vision Studio
gates release signing through `scripts/verify-release-signing.cjs` instead of
manual signing, so production artifacts cannot ship unsigned by accident.

### Packaging commands

```powershell
# Local development build (unsigned - fine for testing)
npm run package:win

# Production build (preflights the signing setup, then packages signed)
npm run package:win:signed

# Check the signing configuration without packaging
npm run release:signing:check
```

### Configure one signing mode

`verify-release-signing.cjs` accepts any one of three modes via environment
variables, then passes the right options to electron-builder:

1. **CSC / PFX file** - `WIN_CSC_LINK` (or `CSC_LINK`) plus `WIN_CSC_KEY_PASSWORD`
   (or `CSC_KEY_PASSWORD`).
2. **Windows certificate-store token** - `WIN_CSC_SUBJECT_NAME` (or
   `WINDOWS_CERTIFICATE_SUBJECT_NAME`), or `WIN_CSC_SHA1`.
3. **Azure Trusted Signing** - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
   `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, plus an auth secret.

Get a certificate from a CA (DigiCert, Sectigo, Certum, etc.). `electron-builder.yml`
sets `publisherName` and `verifyUpdateCodeSignature: true`, so auto-update only
installs signed builds. `package:win:signed` fails fast if no mode is configured,
rather than emitting an unsigned production build.

## 🐛 Troubleshooting

### "Python not found" during build

Install Python 3.10+ and ensure it's in PATH:
```powershell
# Check Python
python --version

# If not found, install from https://python.org
# Make sure to check "Add to PATH" during installation
```

### "Out of disk space"

The full build requires ~10 GB free space:
```powershell
# Check disk space
Get-PSDrive C | Select-Object Free

# Clean up
npm run clean:all  # Removes all build artifacts
```

### PyTorch download fails

If PyTorch download is slow or fails:
```powershell
# Manually download PyTorch wheels from:
# https://download.pytorch.org/whl/cu121

# Then install:
cd backend
venv\Scripts\activate
pip install torch torchvision --no-index --find-links path/to/wheels
```

### Build script fails

Try manual build:
```powershell
# Step 1: Clean
npm run clean

# Step 2: Install
npm install

# Step 3: Build frontend
npm run build

# Step 4: Build backend (optional)
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install pyinstaller
pyinstaller main.spec
copy dist\VisionStudio-Backend.exe ..\resources\
cd ..

# Step 5: Package
npx electron-builder --config electron-builder.windows.json --win
```

## 📊 Build Size Comparison

| Configuration | Size | Best For |
|---------------|------|----------|
| Frontend Only | ~150 MB | Developers, existing ComfyUI users |
| Full Bundle (CPU) | ~2 GB | Users without NVIDIA GPU |
| Full Bundle (CUDA) | ~4-6 GB | Most users (recommended) |

## 🚀 Distribution

### GitHub Releases

1. Create a new release on GitHub
2. Upload the installer and ZIP:
   - `Vision Studio Setup 3.1.0.exe`
   - `Vision Studio-3.1.0-win.zip`
3. Add release notes
4. Publish

### Website Distribution

```html
<a href="/download/Vision-Studio-Setup-3.1.0.exe" 
   download>
   Download for Windows (4.5 GB)
</a>
```

### Windows Store (Advanced)

Convert to MSIX:
```powershell
# Install MSIX Packaging Tool from Microsoft Store
# Then:
msixpackagingtool.exe create-package --template vs.xml
```

## 🔄 Automated Builds with GitHub Actions

Create `.github/workflows/build-windows.yml`:

```yaml
name: Build Windows

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Build
        run: |
          npm ci
          npm run build:windows:full
      
      - name: Upload
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: release/*.exe
```

## 📞 Support

Having issues?

1. Check the [Troubleshooting](#-troubleshooting) section
2. Open an issue on GitHub
3. Join our Discord community

## 📄 License

The build scripts are MIT licensed. The bundled PyTorch and other dependencies follow their respective licenses.
