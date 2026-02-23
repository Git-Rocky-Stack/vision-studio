# 🎉 Vision Studio - Windows Installer Build Complete!

Your complete Windows installer build system is ready. Here's everything you need to know:

## 📦 What You Have

### Build Scripts
| Script | Purpose |
|--------|---------|
| `Build-Windows.ps1` | One-click PowerShell build |
| `scripts/build-windows.js` | Node.js automated build script |
| `build-backend.js` | Python backend bundler |
| `scripts/prepare-release.js` | Release package preparation |
| `scripts/create-icon.ps1` | Icon generator |

### Configuration Files
| File | Purpose |
|------|---------|
| `electron-builder.windows.json` | Windows-specific build config |
| `build/installer.nsh` | NSIS installer script |
| `package.json` | Updated with build scripts |

## 🚀 Build Options

### Option 1: One-Click Build (Recommended)

```powershell
# Open PowerShell in vision-studio folder
# Run this command:
.\Build-Windows.ps1 -FullBundle
```

**What it does:**
- ✅ Checks prerequisites
- ✅ Installs dependencies
- ✅ Builds Python backend (30-60 min)
- ✅ Packages everything into installer
- ✅ Creates portable version

**Output:**
- `release/Vision-Studio-Setup-0.1.0.exe` (4-6 GB)
- `release/Vision-Studio-Portable-0.1.0.exe` (4-6 GB)

### Option 2: Frontend Only (Faster)

```powershell
.\Build-Windows.ps1
```

**Output:**
- `release/Vision-Studio-Setup-0.1.0.exe` (~150 MB)

**Note:** Users need Python installed separately.

### Option 3: Using npm Scripts

```bash
# Full build with backend
npm run build:windows:full

# Frontend only
npm run build:windows

# With clean
npm run clean:all
npm run build:windows:full
```

## 🎨 Before Building

### 1. Create an Icon (Optional but Recommended)

```powershell
# Option A: Auto-generate simple icon
npm run create:icon

# Option B: Create manually
# - Design 256x256 icon
# - Convert at: https://redketchup.io/icon-converter
# - Save to: build/icon.ico
```

### 2. Update Version

Edit `package.json`:
```json
{
  "version": "0.1.0",
  "build": {
    "win": {
      "publish": {
        "owner": "your-github-username",
        "repo": "vision-studio"
      }
    }
  }
}
```

## 📋 Prerequisites Check

Ensure you have:

```powershell
# Check Node.js
node --version  # Should be v18+

# Check Python (for full bundle)
python --version  # Should be 3.10+

# Check disk space
# Need ~10 GB free for full build
```

## 🔨 Build Process Explained

### Step 1: Clean
- Removes old build artifacts
- Ensures fresh start

### Step 2: Dependencies
- Installs Node.js packages
- Creates Python virtual environment (if building backend)

### Step 3: Backend Build (Optional)
- Downloads PyTorch with CUDA (~2.5 GB)
- Installs Python dependencies
- Builds standalone executable with PyInstaller
- **Time:** 30-60 minutes

### Step 4: Frontend Build
- Compiles React app
- Bundles with Electron

### Step 5: Packaging
- Creates NSIS installer
- Creates portable executable
- Generates ZIP archive
- Creates README and checksums
- **Time:** 5-10 minutes

## 📤 Distribution

After build completes, you'll have:

```
release/
├── Vision-Studio-Setup-0.1.0.exe     # Main installer (4-6 GB)
├── Vision-Studio-Portable-0.1.0.exe  # Portable version (4-6 GB)
├── Vision-Studio-0.1.0-win.zip       # ZIP archive (4-6 GB)
├── win-unpacked/                      # Unpacked files
├── README.txt                         # User instructions
├── LICENSE.txt                        # MIT License
└── checksums.txt                      # SHA256 checksums
```

### Upload to GitHub Releases

1. Go to your GitHub repository
2. Click "Create a new release"
3. Upload `Vision-Studio-Setup-0.1.0.exe`
4. Add release notes
5. Publish

### Website Distribution

```html
<a href="/download/Vision-Studio-Setup-0.1.0.exe" download>
  Download for Windows (4.5 GB)
</a>
```

## 🔏 Code Signing (Optional but Recommended)

Without code signing, Windows shows "Windows protected your PC" warning.

### Get Certificate
- DigiCert: ~$200/year
- Sectigo: ~$80/year
- Certum: ~$70/year

### Sign the Installer

```powershell
# Install Windows SDK
# Then run:
signtool sign /f certificate.pfx /p password `
  /tr http://timestamp.digicert.com `
  /td sha256 `
  /fd sha256 `
  "release\Vision-Studio-Setup-0.1.0.exe"
```

## 🐛 Troubleshooting

### Build Fails

```powershell
# Clean everything and retry
npm run clean:all
.\Build-Windows.ps1 -FullBundle -Clean
```

### PyTorch Download Slow

```powershell
# Use mirror (China users)
npm run build:backend -- --mirror

# Or manually download
# Edit build-backend.js and change PyTorch URL
```

### Out of Disk Space

```powershell
# Check space
Get-PSDrive C | Select-Object Free

# Clean Windows temp files
Cleanmgr /sagerun:1

# Or build without backend
.\Build-Windows.ps1
```

## 📊 Build Size Comparison

| Type | Size | User Requirements |
|------|------|-------------------|
| Full Bundle | 4-6 GB | Just double-click |
| Frontend Only | 150 MB | Needs Python installed |
| Portable | 4-6 GB | No install, just run |

## ✨ Installer Features

The NSIS installer includes:

- 🎨 Custom welcome and finish pages
- 📜 License agreement
- ✅ Component selection (Main, Backend, Shortcuts)
- 📁 Custom installation directory
- 🖥️ Desktop shortcut option
- 📋 Start Menu integration
- 🗑️ Proper uninstaller
- 💾 Disk space check
- 🔒 64-bit Windows verification

## 🎯 Next Steps

1. **Test the installer**
   - Run on a clean Windows VM
   - Test on Windows 10 and 11

2. **Code sign** (optional)
   - Get certificate
   - Sign the installer

3. **Distribute**
   - Upload to GitHub Releases
   - Share with users

4. **Collect feedback**
   - Monitor issues
   - Plan v0.2.0 features

## 📞 Need Help?

- 📖 Full docs: `WINDOWS_BUILD.md`
- 🐛 Issues: Open GitHub issue
- 💬 Discord: Join community

---

**You're ready to ship! 🚀**

Run `.\Build-Windows.ps1 -FullBundle` to create your installer.
