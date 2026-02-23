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
- `release/Vision-Studio-Setup-0.1.0.exe` (~150 MB)
- `release/Vision-Studio-Portable-0.1.0.exe` (~150 MB)

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
- `release/Vision-Studio-Setup-0.1.0.exe` (~4-6 GB)
- `release/Vision-Studio-Portable-0.1.0.exe` (~4-6 GB)

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
- Create portable executable
- Create ZIP archive

⏱️ **Time:** 5-10 minutes

## 📦 Build Outputs

After successful build, you'll find these files in `release/`:

| File | Size | Description |
|------|------|-------------|
| `Vision-Studio-Setup-0.1.0.exe` | 4-6 GB | Full installer with wizard |
| `Vision-Studio-Portable-0.1.0.exe` | 4-6 GB | Standalone portable app |
| `Vision-Studio-0.1.0-win.zip` | 4-6 GB | ZIP archive (unpacked) |
| `win-unpacked/` | 4-6 GB | Unpacked files |

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

Unsigned installers show "Windows protected your PC" warning. To fix this:

### Get Code Signing Certificate

1. Purchase from:
   - DigiCert (~$200/year)
   - Sectigo (~$80/year)
   - Certum (~$70/year)

2. Install certificate to Windows Certificate Store

### Sign the Installer

```powershell
# Using Windows SDK signtool
signtool sign /f certificate.pfx /p password `
  /tr http://timestamp.digicert.com `
  /td sha256 `
  /fd sha256 `
  "release\Vision-Studio-Setup-0.1.0.exe"
```

Or add to package.json:

```json
{
  "build": {
    "win": {
      "certificateFile": "certificate.pfx",
      "certificatePassword": "password"
    }
  }
}
```

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
2. Upload the installer:
   - `Vision-Studio-Setup-0.1.0.exe`
3. Add release notes
4. Publish

### Website Distribution

```html
<a href="/download/Vision-Studio-Setup-0.1.0.exe" 
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
