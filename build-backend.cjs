#!/usr/bin/env node
/**
 * Build script for bundling Python backend with PyInstaller
 * This creates a standalone executable that includes PyTorch, CUDA, and all dependencies
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BACKEND_DIR = path.join(__dirname, 'backend');
const DIST_DIR = path.join(__dirname, 'dist-backend');
const RESOURCES_DIR = path.join(__dirname, 'resources');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  log(`> ${command}`, 'cyan');
  try {
    return execSync(command, { 
      stdio: 'inherit',
      cwd: options.cwd || __dirname,
      shell: true,
      ...options 
    });
  } catch (error) {
    log(`Command failed: ${command}`, 'red');
    throw error;
  }
}

function getVenvPython(venvPath) {
  const isWindows = process.platform === 'win32';
  return isWindows
    ? `"${path.join(venvPath, 'Scripts', 'python.exe')}"`
    : `"${path.join(venvPath, 'bin', 'python')}"`;
}

async function checkPython() {
  log('\n🔍 Checking Python installation...', 'blue');
  try {
    const version = execSync('python --version', { encoding: 'utf8' }).trim();
    log(`✅ Found ${version}`, 'green');
    
    // Check Python version (PyTorch supports 3.8-3.12 typically)
    const versionMatch = version.match(/Python (\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);
      
      if (major > 3 || (major === 3 && minor > 12)) {
        log(`\n⚠️  Warning: Python ${major}.${minor} may not be supported by PyTorch yet.`, 'yellow');
        log('   PyTorch typically supports Python 3.8 - 3.12', 'yellow');
        log('   The build may fail. Consider using Python 3.11 for best compatibility.\n', 'yellow');
        
        // Continue anyway but warn
        return 'unsupported';
      }
    }
    
    return true;
  } catch {
    log('❌ Python not found. Please install Python 3.10+', 'red');
    return false;
  }
}

async function setupVirtualEnv() {
  log('\n📦 Setting up Python virtual environment...', 'blue');
  
  const venvPath = path.join(BACKEND_DIR, 'venv');
  const venvPython = process.platform === 'win32'
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');
  
  if (!fs.existsSync(venvPath) || !fs.existsSync(venvPython)) {
    if (fs.existsSync(venvPath)) {
      log('  Existing virtual environment is incomplete, recreating...', 'yellow');
      fs.rmSync(venvPath, { recursive: true, force: true });
    }
    exec('python -m venv venv', { cwd: BACKEND_DIR });
  }
  
  log('✅ Virtual environment ready', 'green');
  return venvPath;
}

async function installPyTorch(venvPath, useCPU = false) {
  log('\n⬇️  Installing PyTorch...', 'blue');
  
  const pip = `${getVenvPython(venvPath)} -m pip`;
  
  // Try different PyTorch installation methods
  const installMethods = [
    {
      name: 'CUDA 12.1',
      command: `${pip} install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121`,
      enabled: !useCPU
    },
    {
      name: 'CUDA 11.8',
      command: `${pip} install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118`,
      enabled: !useCPU
    },
    {
      name: 'CPU only',
      command: `${pip} install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu`,
      enabled: true
    },
    {
      name: 'Latest (no index)',
      command: `${pip} install torch torchvision torchaudio`,
      enabled: true
    }
  ];
  
  let lastError = null;
  
  for (const method of installMethods) {
    if (!method.enabled) continue;
    
    try {
      log(`\n  Trying PyTorch with ${method.name}...`, 'cyan');
      log('  This may take 10-30 minutes...', 'yellow');
      
      exec(method.command, { cwd: BACKEND_DIR });
      log(`✅ PyTorch installed (${method.name})`, 'green');
      return;
    } catch (error) {
      lastError = error;
      log(`  ⚠️  ${method.name} failed, trying next option...`, 'yellow');
    }
  }
  
  // All methods failed
  log('\n❌ Failed to install PyTorch', 'red');
  log('   This may be due to:', 'red');
  log('   - Unsupported Python version (need 3.8-3.12)', 'red');
  log('   - Network issues', 'red');
  log('   - Incompatible platform', 'red');
  log('\n   Try manually installing PyTorch from https://pytorch.org/get-started/locally/', 'yellow');
  
  throw lastError;
}

async function installPythonDependencies(venvPath) {
  log('\n📚 Installing Python dependencies...', 'blue');
  
  const pip = `${getVenvPython(venvPath)} -m pip`;
  
  // Install all requirements except torch (already installed)
  const requirementsPath = path.join(BACKEND_DIR, 'requirements.txt');
  
  // Read requirements and filter out torch
  const requirements = fs.readFileSync(requirementsPath, 'utf8')
    .split('\n')
    .filter(line => !line.includes('torch'))
    .join('\n');
  
  const tempRequirements = path.join(BACKEND_DIR, 'requirements-temp.txt');
  fs.writeFileSync(tempRequirements, requirements);
  
  exec(`${pip} install -r "${tempRequirements}"`, { cwd: BACKEND_DIR });
  
  fs.unlinkSync(tempRequirements);
  
  log('✅ Dependencies installed', 'green');
}

async function installPyInstaller(venvPath) {
  log('\n🔧 Installing PyInstaller...', 'blue');
  
  const pip = `${getVenvPython(venvPath)} -m pip`;
  
  exec(`${pip} install pyinstaller`, { cwd: BACKEND_DIR, shell: true });
  
  log('✅ PyInstaller installed', 'green');
}

async function buildExecutable(venvPath) {
  log('\n🏗️  Building standalone executable...', 'blue');
  
  const pyinstaller = `${getVenvPython(venvPath)} -m PyInstaller`;
  
  const specPath = path.join(BACKEND_DIR, 'main.spec');
  
  // Clean previous builds
  const buildDir = path.join(BACKEND_DIR, 'build');
  const distDir = path.join(BACKEND_DIR, 'dist');
  
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
  }
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  
  log('Building... This may take 10-20 minutes...', 'yellow');
  exec(`${pyinstaller} "${specPath}" --clean`, { cwd: BACKEND_DIR });
  
  log('✅ Executable built', 'green');
  return distDir;
}

async function copyToResources(distDir) {
  log('\n📂 Copying executable to resources...', 'blue');
  
  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  }
  
  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';
  const sourcePath = path.join(distDir, exeName);
  const destPath = path.join(RESOURCES_DIR, exeName);
  
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Built executable not found at ${sourcePath}`);
  }
  
  // Copy with overwrite
  fs.copyFileSync(sourcePath, destPath);
  
  // Get file size
  const stats = fs.statSync(destPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  log(`✅ Copied to resources (${sizeMB} MB)`, 'green');
}

async function createModelDownloader() {
  log('\n💾 Creating model downloader script...', 'blue');
  
  const downloaderScript = `#!/usr/bin/env node
/**
 * First-time setup: Download AI models
 * This runs on first launch to download models (too large to bundle)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const MODELS_DIR = path.join(process.resourcesPath, 'models');

const MODELS = [
  {
    id: 'sd-1-5',
    name: 'Stable Diffusion 1.5',
    repo: 'runwayml/stable-diffusion-v1-5',
    file: 'v1-5-pruned-emaonly.safetensors',
    size: '4.3 GB',
    required: true
  },
  {
    id: 'sdxl-base',
    name: 'Stable Diffusion XL',
    repo: 'stabilityai/stable-diffusion-xl-base-1.0',
    file: 'sd_xl_base_1.0.safetensors',
    size: '6.9 GB',
    required: false
  },
];

async function downloadModel(model, onProgress) {
  console.log(\`Downloading \${model.name}...\`);
  // Implementation would download from HuggingFace
  // For now, just create directory structure
  const modelDir = path.join(MODELS_DIR, 'checkpoints');
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
}

module.exports = { MODELS, downloadModel };
`;
  
  const downloaderPath = path.join(__dirname, 'scripts', 'model-downloader.js');
  
  if (!fs.existsSync(path.dirname(downloaderPath))) {
    fs.mkdirSync(path.dirname(downloaderPath), { recursive: true });
  }
  
  fs.writeFileSync(downloaderPath, downloaderScript);
  log('✅ Model downloader created', 'green');
}

async function main() {
  log('\n' + '='.repeat(60), 'magenta');
  log('  Vision Studio - Backend Build Script', 'magenta');
  log('='.repeat(60) + '\n', 'magenta');
  
  try {
    // Check Python
    const pythonCheck = await checkPython();
    if (pythonCheck === false) {
      process.exit(1);
    }
    
    const pythonUnsupported = pythonCheck === 'unsupported';
    
    // Setup environment
    const venvPath = await setupVirtualEnv();
    
    // Install dependencies
    if (pythonUnsupported) {
      log('\n⚠️  Attempting PyTorch install with unsupported Python...', 'yellow');
      log('   This may fail. Consider installing Python 3.10-3.11 for best results.\n', 'yellow');
    }
    
    await installPyTorch(venvPath, pythonUnsupported);
    await installPythonDependencies(venvPath);
    await installPyInstaller(venvPath);
    
    // Build executable
    const distDir = await buildExecutable(venvPath);
    
    // Copy to resources
    await copyToResources(distDir);
    
    // Create model downloader
    await createModelDownloader();
    
    log('\n' + '='.repeat(60), 'green');
    log('  ✅ Backend build complete!', 'green');
    log('='.repeat(60) + '\n', 'green');
    
    log('Next steps:', 'cyan');
    log('  1. Run: npm run package', 'yellow');
    log('  2. Distribute the built app', 'yellow');
    log('\nNote: AI models are downloaded on first run (not bundled)', 'yellow');
    
  } catch (error) {
    log('\n❌ Build failed!', 'red');
    console.error(error);
    log('\n💡 Tips:', 'yellow');
    log('   • Make sure Python 3.8-3.12 is installed', 'yellow');
    log('   • You can skip backend bundling and use npm run build:windows instead', 'yellow');
    log('   • The frontend-only installer will download PyTorch on first run', 'yellow');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkPython,
  setupVirtualEnv,
  installPyTorch,
  installPythonDependencies,
  buildExecutable,
  copyToResources
};
