#!/usr/bin/env node
/**
 * Complete Windows Build Script for Vision Studio
 * This script builds everything needed for Windows distribution
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  log(`> ${command}`, 'cyan');
  try {
    return execSync(command, { 
      stdio: 'inherit',
      cwd: options.cwd || process.cwd(),
      shell: true,
      ...options 
    });
  } catch (error) {
    log(`Command failed: ${command}`, 'red');
    throw error;
  }
}

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const RESOURCES_DIR = path.join(ROOT_DIR, 'resources');

// Find a compatible Python (3.8-3.12) for PyTorch.
// Checks uv-managed installs first, then py launcher, then system python.
// All inputs to execSync here are hardcoded version strings, not user input.
function findCompatiblePython() {
  const versions = ['3.12', '3.11', '3.10'];
  for (const ver of versions) {
    try {
      const p = execSync(`uv python find ${ver}`, { encoding: 'utf8' }).trim();
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  for (const ver of versions) {
    try {
      const p = execSync(`py -${ver} -c "import sys; print(sys.executable)"`, { encoding: 'utf8' }).trim();
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return 'python';
}

// Build steps
const steps = {
  async checkPrerequisites() {
    log('\n' + '='.repeat(70), 'magenta');
    log('  Vision Studio - Windows Build Script', 'magenta');
    log('='.repeat(70) + '\n', 'magenta');
    
    log('[1/10] Checking prerequisites...', 'blue');
    
    // Check Node.js
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      log(`  ✅ Node.js: ${nodeVersion}`, 'green');
    } catch {
      log('  ❌ Node.js not found. Install from https://nodejs.org/', 'red');
      throw new Error('Node.js required');
    }
    
    // Check npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      log(`  ✅ npm: ${npmVersion}`, 'green');
    } catch {
      log('  ❌ npm not found', 'red');
      throw new Error('npm required');
    }
    
    // Check Python (optional, for full bundle)
    try {
      const compatPython = findCompatiblePython();
      const pythonVersion = execSync(`"${compatPython}" --version`, { encoding: 'utf8' }).trim();
      log(`  ✅ Python: ${pythonVersion} (${compatPython})`, 'green');
    } catch {
      log('  ⚠️  Compatible Python (3.8-3.12) not found (needed for full bundle)', 'yellow');
    }
    
    // Check Git
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
      log(`  ✅ Git: ${gitVersion.split(' ')[2]}`, 'green');
    } catch {
      log('  ⚠️  Git not found', 'yellow');
    }
    
    log('');
  },

  async cleanDirectories() {
    log('[2/10] Cleaning previous builds...', 'blue');

    const dirsToClean = [
      path.join(ROOT_DIR, 'dist'),
      path.join(ROOT_DIR, 'dist-electron'),
      path.join(ROOT_DIR, 'release'),
      path.join(ROOT_DIR, 'backend', 'build')
    ];

    for (const dir of dirsToClean) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          log(`  🗑️  Cleaned: ${path.relative(ROOT_DIR, dir)}`, 'cyan');
        } catch (err) {
          log(`  ⚠️  Could not clean ${path.relative(ROOT_DIR, dir)}: ${err.message}`, 'yellow');
        }
      }
    }

    // Skip backend/dist if locked
    const backendDist = path.join(ROOT_DIR, 'backend', 'dist');
    if (fs.existsSync(backendDist)) {
      log(`  ⚠️  Skipping backend/dist (locked by another process)`, 'yellow');
    }

    log('  ✅ Cleanup complete\n', 'green');
  },

  async installDependencies() {
    log('[3/10] Installing Node dependencies...', 'blue');
    
    if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
      exec('npm install', { cwd: ROOT_DIR });
    } else {
      log('  ⏩ node_modules exists, skipping npm install', 'yellow');
    }
    
    log('  ✅ Dependencies installed\n', 'green');
  },

  async buildFrontend() {
    log('[4/10] Building React frontend...', 'blue');
    exec('npm run build', { cwd: ROOT_DIR });
    log('  ✅ Frontend built\n', 'green');
  },

  async buildBackend() {
    log('[5/10] Building Python backend...', 'blue');
    log('  This step is OPTIONAL. Skip if you want smaller bundle.\n', 'yellow');
    
    const backendPath = path.join(ROOT_DIR, 'backend');
    const venvPath = path.join(backendPath, 'venv');
    
    // Check if we should build backend
    if (!fs.existsSync(path.join(backendPath, 'main.py'))) {
      log('  ⚠️  Backend source not found, skipping backend build', 'yellow');
      return;
    }
    
    try {
      // Find compatible Python (3.8-3.12) for PyTorch
      const compatPython = findCompatiblePython();
      log(`  Using Python: ${compatPython}`, 'cyan');

      // Create virtual environment if needed
      if (!fs.existsSync(venvPath)) {
        log('  Creating Python virtual environment...', 'cyan');
        exec(`"${compatPython}" -m venv venv`, { cwd: backendPath });
      }

      // Get paths
      const python = `"${path.join(venvPath, 'Scripts', 'python.exe')}"`;
      const pip = `${python} -m pip`;
      
      // Upgrade pip
      exec(`${python} -m pip install --upgrade pip`, { cwd: backendPath });
      
      // Install PyTorch with CUDA
      log('  Installing PyTorch with CUDA (this will take a while)...', 'cyan');
      log('  Download size: ~2.5 GB', 'yellow');
      exec(`${pip} install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121`, { cwd: backendPath });
      
      // Install other requirements
      log('  Installing other Python dependencies...', 'cyan');
      const requirementsPath = path.join(backendPath, 'requirements.txt');
      
      // Read and filter requirements (remove torch as already installed)
      const requirements = fs.readFileSync(requirementsPath, 'utf8')
        .split('\n')
        .filter(line => !line.includes('torch'))
        .join('\n');
      
      const tempReq = path.join(backendPath, 'requirements-temp.txt');
      fs.writeFileSync(tempReq, requirements);
      exec(`${pip} install -r "${tempReq}"`, { cwd: backendPath });
      fs.unlinkSync(tempReq);
      
      // Install PyInstaller
      exec(`${pip} install pyinstaller`, { cwd: backendPath });
      
      // Build executable
      log('  Building executable with PyInstaller...', 'cyan');
      const pyinstaller = `${python} -m PyInstaller`;
      const specPath = path.join(backendPath, 'main.spec');
      exec(`${pyinstaller} "${specPath}" --clean`, { cwd: backendPath });
      
      // Copy to resources
      if (!fs.existsSync(RESOURCES_DIR)) {
        fs.mkdirSync(RESOURCES_DIR, { recursive: true });
      }
      
      const exeSource = path.join(backendPath, 'dist', 'VisionStudio-Backend.exe');
      const exeDest = path.join(RESOURCES_DIR, 'VisionStudio-Backend.exe');
      
      if (fs.existsSync(exeSource)) {
        fs.copyFileSync(exeSource, exeDest);
        const stats = fs.statSync(exeDest);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        log(`  ✅ Backend executable built (${sizeMB} MB)`, 'green');
      } else {
        log('  ❌ Backend executable not found', 'red');
      }
      
    } catch (error) {
      log(`  ⚠️  Backend build failed: ${error.message}`, 'yellow');
      log('  Continuing with frontend-only build...', 'yellow');
    }
    
    log('');
  },

  async prepareResources() {
    log('[6/10] Preparing resources...', 'blue');
    
    // Create resources directory
    if (!fs.existsSync(RESOURCES_DIR)) {
      fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }
    
    // Create license file if not exists
    const licensePath = path.join(ROOT_DIR, 'LICENSE.txt');
    if (!fs.existsSync(licensePath)) {
      fs.writeFileSync(licensePath, `MIT License

Copyright (c) 2024 Vision Studio Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.`);
      log('  ✅ Created LICENSE.txt', 'green');
    }
    
    // Ensure the Windows icon is regenerated from the canonical PNG source when needed
    const iconSourcePath = path.join(ROOT_DIR, 'icons', 'vision.png');
    const iconPath = path.join(BUILD_DIR, 'icon.ico');
    const createIconScript = path.join(ROOT_DIR, 'scripts', 'create-icon.ps1');
    if (fs.existsSync(iconSourcePath)) {
      const shouldRegenerate =
        !fs.existsSync(iconPath) ||
        fs.statSync(iconSourcePath).mtimeMs > fs.statSync(iconPath).mtimeMs;

      if (shouldRegenerate) {
        log('  Regenerating build/icon.ico from icons/vision.png...', 'cyan');
        exec(`powershell -ExecutionPolicy Bypass -File "${createIconScript}" -SourcePath "${iconSourcePath}" -OutputPath "${iconPath}"`, { cwd: ROOT_DIR });
      } else {
        log('  ⏩ App icon already matches icons/vision.png', 'yellow');
      }
    } else if (!fs.existsSync(iconPath)) {
      log('  ⚠️  Icon not found at build/icon.ico', 'yellow');
      log('  Create a source icon at icons/vision.png or save an ICO at build/icon.ico', 'yellow');
    }
    
    log('  ✅ Resources prepared\n', 'green');
  },

  async packageApp() {
    log('[7/10] Packaging with Electron Builder (unpacked)...', 'blue');

    // Use Windows-specific config — produces win-unpacked directory
    const configPath = path.join(ROOT_DIR, 'electron-builder.windows.json');
    exec(`npx electron-builder --config "${configPath}" --win`, { cwd: ROOT_DIR });

    log('  ✅ App packaged (unpacked)\n', 'green');

    // Build Inno Setup installer from the unpacked directory
    log('[7b/10] Building Inno Setup installer...', 'blue');
    log('  This may take several minutes for large payloads...', 'yellow');

    const issPath = path.join(ROOT_DIR, 'scripts', 'installer.iss');

    // All candidate paths are hardcoded — no user input involved
    const isccCandidates = [
      path.join('C:', 'Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
      path.join('C:', 'Program Files', 'Inno Setup 6', 'ISCC.exe'),
    ];

    let isccPath = null;
    for (const candidate of isccCandidates) {
      if (fs.existsSync(candidate)) { isccPath = candidate; break; }
    }

    if (!isccPath) {
      try {
        execSync('where iscc', { encoding: 'utf8' });
        isccPath = 'iscc';
      } catch {
        log('  Inno Setup 6 not found. Install from https://jrsoftware.org/isinfo.php', 'red');
        throw new Error('Inno Setup 6 required for installer build');
      }
    }

    log(`  Using: ${isccPath}`, 'cyan');
    // Both isccPath and issPath are derived from hardcoded constants, not user input
    exec(`"${isccPath}" "${issPath}"`, { cwd: ROOT_DIR });

    // Move ALL Inno Setup output files (.exe + .bin disk slices) to release/
    const innoOutputDir = path.join(ROOT_DIR, 'scripts', 'Output');
    if (fs.existsSync(innoOutputDir)) {
      const outputFiles = fs.readdirSync(innoOutputDir);
      for (const file of outputFiles) {
        const src = path.join(innoOutputDir, file);
        const dest = path.join(RELEASE_DIR, file);
        const stats = fs.statSync(src);
        if (stats.isFile()) {
          fs.copyFileSync(src, dest);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);
          const displaySize = stats.size > 1024 * 1024 * 1024 ? `${sizeGB} GB` : `${sizeMB} MB`;
          log(`  Moved: ${file} (${displaySize})`, 'cyan');
        }
      }
    }

    log('  ✅ Inno Setup installer built\n', 'green');
  },

  async verifyBuild() {
    log('[8/10] Verifying build...', 'blue');

    const results = [];
    let installerTotalBytes = 0;

    // Check for installer artifacts (.exe, .bin disk slices, .zip, .msi)
    const releaseFiles = fs.existsSync(RELEASE_DIR) ? fs.readdirSync(RELEASE_DIR) : [];
    for (const file of releaseFiles) {
      const filePath = path.join(RELEASE_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile() && (file.endsWith('.exe') || file.endsWith('.zip') || file.endsWith('.msi') || file.endsWith('.bin'))) {
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);
        const displaySize = stats.size > 1024 * 1024 * 1024 ? `${sizeGB} GB` : `${sizeMB} MB`;
        const isSetup = file.includes('Setup');
        if (isSetup) installerTotalBytes += stats.size;
        const label = file.endsWith('.bin') ? 'Installer data' : file.endsWith('.exe') ? 'Installer' : 'Archive';
        results.push({ name: label, path: filePath, size: displaySize });
      } else if (stats.isDirectory() && file === 'win-unpacked') {
        results.push({ name: 'Unpacked', path: filePath, size: 'directory' });
      }
    }

    if (results.length === 0) {
      log('  ❌ No build artifacts found!', 'red');
      throw new Error('Build verification failed');
    }

    log('  ✅ Build artifacts:', 'green');
    for (const result of results) {
      log(`     ${result.name}: ${path.basename(result.path)} (${result.size})`, 'cyan');
    }

    if (installerTotalBytes > 0) {
      const totalGB = (installerTotalBytes / 1024 / 1024 / 1024).toFixed(2);
      log(`     Total installer package: ${totalGB} GB`, 'green');
    }

    log('');
  },

  async createReadme() {
    log('[9/10] Creating installation README...', 'blue');
    
    const readme = `# Vision Studio - Windows Installation

## Installation

### Installer (Recommended)
File: \`Vision-Studio-3.1.0-Setup.exe\`

1. Run \`Vision-Studio-3.1.0-Setup.exe\`
2. Follow the installation wizard
3. Launch Vision Studio from the desktop or Start Menu shortcut

**Important:** If the installer came with \`.bin\` data files (e.g. \`Vision-Studio-3.1.0-Setup-1.bin\`),
keep them in the same folder as the Setup .exe (e.g. \`Vision-Studio-3.1.0-Setup-1.bin\`) — the installer needs them.

### Portable (Unpacked)
Folder: \`win-unpacked\`

1. Copy the folder anywhere with at least 6 GB free space
2. Run \`Vision Studio.exe\`

## System Requirements

- Windows 10/11 64-bit
- 8 GB RAM minimum (16 GB recommended)
- ~4 GB free disk space for installation
- NVIDIA GPU with 8GB+ VRAM (optional, for faster generation)
- Internet connection (for downloading AI models)

## First Launch

On first run, the app will:
1. Check for GPU availability
2. Download AI models as needed (2-24 GB per model)
3. Ready to use!

## Troubleshooting

**"Windows protected your PC" warning:**
Click "More info" then "Run anyway" (app is unsigned)

**App won't start:**
- Install Visual C++ Redistributables:
  https://aka.ms/vs/17/release/vc_redist.x64.exe

**Slow generation:**
- Check GPU is detected in Settings
- Lower image resolution
- Use fewer sampling steps

## Uninstallation

Use "Add or Remove Programs" in Windows Settings, or run the uninstaller
from the Start Menu group.

## Support

Visit: https://github.com/Git-Rocky-Stack/vision-studio
`;

    fs.writeFileSync(path.join(RELEASE_DIR, 'README-Windows.txt'), readme);
    log('  ✅ README created\n', 'green');
  },

  async finalReport() {
    log('[10/10] Build Complete!', 'green');
    
    log('\n' + '='.repeat(70), 'green');
    log('  Build Summary', 'green');
    log('='.repeat(70) + '\n', 'green');
    
    const files = fs.readdirSync(RELEASE_DIR);
    
    log('Files in release/ folder:', 'blue');
    let installerBytes = 0;
    for (const file of files) {
      const filePath = path.join(RELEASE_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);
        const displaySize = stats.size > 1024 * 1024 * 1024 ? `${sizeGB} GB` : `${sizeMB} MB`;
        log(`  ✓ ${file} (${displaySize})`, 'cyan');
        if (file.includes('Setup')) installerBytes += stats.size;
      } else {
        log(`  📁 ${file}/`, 'cyan');
      }
    }

    if (installerBytes > 0) {
      const totalGB = (installerBytes / 1024 / 1024 / 1024).toFixed(2);
      log(`\n  Total installer package: ${totalGB} GB`, 'green');
    }

    log('\nNext Steps:', 'blue');
    log('  1. Test the installer on a clean Windows machine', 'white');
    log('  2. Sign the installer with code signing certificate (optional)', 'white');
    log('  3. Upload all Setup files to GitHub Releases or your website', 'white');
    log('  4. Share with users!', 'white');

    log('\nDistribution:', 'blue');
    log('  Distribute ALL files matching Vision-Studio-*-Setup* together:', 'yellow');
    const releaseFiles = fs.readdirSync(RELEASE_DIR);
    for (const file of releaseFiles) {
      const filePath = path.join(RELEASE_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile() && file.includes('Setup')) {
        log(`  ${filePath}`, 'cyan');
      }
    }
    log(`  Unpacked App: ${path.join(RELEASE_DIR, 'win-unpacked')}`, 'cyan');
    
    log('');
  }
};

// Main execution
async function main() {
  const startTime = Date.now();
  
  try {
    await steps.checkPrerequisites();
    await steps.cleanDirectories();
    await steps.installDependencies();
    await steps.buildFrontend();
    await steps.buildBackend();
    await steps.prepareResources();
    await steps.packageApp();
    await steps.verifyBuild();
    await steps.createReadme();
    await steps.finalReport();
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    log(`Build completed in ${duration} minutes`, 'green');
    
  } catch (error) {
    log(`\nBuild failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = steps;
