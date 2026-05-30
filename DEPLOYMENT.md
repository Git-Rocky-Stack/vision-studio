# Vision Studio - Deployment Guide

Complete guide for building and distributing Vision Studio on different platforms.

## 📋 Pre-Deployment Checklist

- [ ] Test the app in development mode
- [ ] Choose bundling approach (Full / Hybrid / Minimal)
- [ ] Update version number in `package.json`
- [ ] Create app icons (in `build/` folder)
- [ ] Code signing certificates (optional, for distribution)
- [ ] Update README with latest info

## 🔨 Build Process

### Step 1: Prepare Assets

```bash
# Create build directory
mkdir -p build

# Add icons (required for all platforms)
# Windows: icon.ico (256x256)
# macOS: icon.icns (multiple sizes)
# Linux: icon.png (512x512)
```

### Step 2: Build Frontend

```bash
npm install
npm run build
```

### Step 3: Build Python Backend (Optional)

**For Full Bundle:**
```bash
npm run build:backend
# This creates resources/VisionStudio-Backend[.exe]
```

**For Hybrid/Minimal:** Skip this step

### Step 4: Package App

```bash
# Current platform
npm run package

# Specific platform
npm run package:win
npm run package:mac
npm run package:linux
```

Output will be in `release/` folder.

## 🪟 Windows Deployment

### Using NSIS Installer

```bash
npm run package:win
```

Creates:
- `Vision Studio Setup.exe` - NSIS installer
- `Vision Studio.exe` - Portable executable (in win-unpacked/)

### Code Signing (Recommended)

```bash
# Get code signing certificate (e.g., from DigiCert)
# Then add to package.json:

{
  "build": {
    "win": {
      "certificateFile": "certificate.pfx",
      "certificatePassword": "password"
    }
  }
}
```

### Windows Store (MSIX)

```bash
npm run package:win
# Then use Windows Store submission portal
```

### Distribution Options

1. **GitHub Releases** - Upload `.exe` to GitHub
2. **Website** - Self-host installer
3. **Windows Store** - Microsoft Store
4. **Chocolatey** - Package manager

## 🍎 macOS Deployment

### Building

```bash
npm run package:mac
```

Creates:
- `Vision Studio.dmg` - Disk image
- `Vision Studio.app` - Application bundle

### Code Signing & Notarization (Required for distribution)

```bash
# 1. Get Apple Developer certificate
# 2. Install certificate to Keychain

# 3. Add to package.json:
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}

# 4. Create entitlements file: build/entitlements.mac.plist
```

### Notarization

```bash
# Using electron-notarize (automated)
# Add to package.json:
{
  "build": {
    "afterSign": "scripts/notarize.js"
  }
}
```

### Distribution Options

1. **GitHub Releases** - Download `.dmg`
2. **Mac App Store** - Requires sandboxing
3. **Homebrew** - `brew install --cask vision-studio`

## 🐧 Linux Deployment

### Building

```bash
npm run package:linux
```

Creates:
- `Vision Studio.AppImage` - Universal package
- `vision-studio.deb` - Debian package
- `vision-studio.rpm` - RedHat package
- `vision-studio.tar.gz` - Portable archive

### AppImage (Recommended)

Most universal format:
```bash
chmod +x "Vision Studio.AppImage"
./Vision\ Studio.AppImage
```

### Package Managers

**Snap:**
```yaml
# snap/snapcraft.yaml
name: vision-studio
version: '0.1.0'
grade: stable
confinement: strict
parts:
  vision-studio:
    plugin: dump
    source: ./release/
```

**Flatpak:**
```yaml
# com.visionstudio.app.yml
app-id: com.visionstudio.app
runtime: org.freedesktop.Platform
runtime-version: '23.08'
sdk: org.freedesktop.Sdk
command: vision-studio
```

**AUR (Arch):**
```bash
# PKGBUILD
pkgname=vision-studio
pkgver=0.1.0
source=("$pkgname-$pkgver.AppImage")
```

## ☁️ Distribution Platforms

### GitHub Releases (Recommended)

```bash
# 1. Create tag
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0

# 2. GitHub Actions will build and upload
# Or manually upload from release/ folder
```

### Website Distribution

```html
<!-- Download page -->
<div class="downloads">
  <a href="/download/win" class="btn">Windows</a>
  <a href="/download/mac" class="btn">macOS</a>
  <a href="/download/linux" class="btn">Linux</a>
</div>
```

### Auto-Updater

Enable auto-updates with electron-updater:

```json
// package.json
{
  "dependencies": {
    "electron-updater": "^6.3.0"
  },
  "build": {
    "publish": {
      "provider": "github",
      "owner": "Git-Rocky-Stack",
      "repo": "vision-studio"
    }
  }
}
```

```typescript
// electron/main.ts
import { autoUpdater } from 'electron-updater';

// Check for updates
autoUpdater.checkForUpdatesAndNotify();

// Handle events
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update available',
    message: 'A new version is available. Downloading...'
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update ready',
    message: 'Update downloaded. Restart to install?',
    buttons: ['Restart', 'Later']
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});
```

## 📊 File Sizes by Platform

### Full Bundle (With PyTorch)

| Platform | Size | Format |
|----------|------|--------|
| Windows | 4.5 GB | .exe |
| macOS | 4.8 GB | .dmg |
| Linux | 4.6 GB | .AppImage |

### Hybrid (Without PyTorch)

| Platform | Size | Format |
|----------|------|--------|
| Windows | 200 MB | .exe |
| macOS | 220 MB | .dmg |
| Linux | 210 MB | .AppImage |

## 🔐 Security Considerations

### Code Signing

**Why:** Prevents "Unknown Publisher" warnings

**Cost:**
- Windows: $70-300/year
- macOS: $99/year (Apple Developer)
- Linux: Free (GPG signing)

### Sandboxing

**macOS:**
```xml
<!-- entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
```

## 🚀 CI/CD with GitHub Actions

```yaml
# .github/workflows/build.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - run: npm ci
      - run: npm run build:backend  # Optional
      - run: npm run package:win
      
      - uses: actions/upload-artifact@v4
        with:
          name: windows
          path: release/*.exe

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - run: npm ci
      - run: npm run package:mac
      
      - uses: actions/upload-artifact@v4
        with:
          name: macos
          path: release/*.dmg

  release:
    needs: [build-windows, build-macos]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            windows/*.exe
            macos/*.dmg
```

## 📈 Analytics (Optional)

Track usage (respecting privacy):

```typescript
// Track events
import { ipcRenderer } from 'electron';

ipcRenderer.send('analytics', {
  event: 'generation_started',
  params: { model: 'flux-dev', type: 'image' }
});
```

## 🐛 Debugging Production Builds

```bash
# Windows
Vision\ Studio.exe --enable-logging

# macOS
/Applications/Vision\ Studio.app/Contents/MacOS/Vision\ Studio --enable-logging

# Linux
./Vision\ Studio.AppImage --enable-logging
```

## 📚 Resources

- [Electron Builder Docs](https://www.electron.build/)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [PyInstaller Docs](https://pyinstaller.org/)

## 🆘 Support

Need help? Open an [issue](../../issues) or join our [Discord]().
