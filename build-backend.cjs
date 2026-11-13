#!/usr/bin/env node
/**
 * Build script for bundling the Python backend with PyInstaller.
 *
 * Produces a ONE-FOLDER bundle (backend/dist/VisionStudio-Backend/) and copies
 * it to resources/backend/, which electron-builder ships as
 * <resources>/backend/VisionStudio-Backend[.exe] plus its _internal/ folder.
 *
 * Every Python package that lands in the bundle is installed from a
 * hash-locked requirement file under backend/requirements/ with
 * `pip install --require-hashes --no-deps`; nothing is resolved at build time.
 *
 *   node build-backend.cjs           build the bundle (installs from the locks)
 *   node build-backend.cjs --lock    re-resolve the locks (maintainers; needs uv)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, 'backend');
const RESOURCES_DIR = path.join(__dirname, 'resources');
const REQUIREMENTS_DIR = path.join(BACKEND_DIR, 'requirements');

// The one-folder bundle: <dir>/VisionStudio-Backend[.exe] + <dir>/_internal/.
const BUNDLE_NAME = 'VisionStudio-Backend';
const BUNDLE_RESOURCES_DIR = path.join(RESOURCES_DIR, 'backend');

/**
 * The hash locks are compiled for CPython 3.12 (the version every CI and
 * release workflow pins). A wheel set locked for cp312 cannot be installed by
 * another interpreter, so the build accepts 3.12 and nothing else.
 */
const LOCKED_PYTHON_VERSION = '3.12';

function executableName(platform = process.platform) {
  return platform === 'win32' ? `${BUNDLE_NAME}.exe` : BUNDLE_NAME;
}

/**
 * Find the locked Python (3.12): uv first, then the Windows py launcher, then
 * `python` on PATH (checkPython verifies whatever this returns).
 */
function findCompatiblePython() {
  try {
    const uvPython = execSync(`uv python find ${LOCKED_PYTHON_VERSION}`, { encoding: 'utf8' }).trim();
    if (uvPython && fs.existsSync(uvPython)) {
      return uvPython;
    }
  } catch {}

  try {
    const pyPath = execSync(`py -${LOCKED_PYTHON_VERSION} -c "import sys; print(sys.executable)"`, {
      encoding: 'utf8',
    }).trim();
    if (pyPath && fs.existsSync(pyPath)) return pyPath;
  } catch {}

  return 'python';
}

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
      ...options,
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

  const pythonPath = findCompatiblePython();
  log(`  Using: ${pythonPath}`, 'cyan');

  try {
    const version = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
    log(`✅ Found ${version}`, 'green');

    const versionMatch = version.match(/Python (\d+)\.(\d+)/);
    if (!versionMatch || `${versionMatch[1]}.${versionMatch[2]}` !== LOCKED_PYTHON_VERSION) {
      log(
        `\n⚠️  The backend dependency locks are compiled for Python ${LOCKED_PYTHON_VERSION}; ` +
          `${version} cannot install them.`,
        'yellow',
      );
      log(`   Install it with \`uv python install ${LOCKED_PYTHON_VERSION}\` or from python.org.\n`, 'yellow');
      return { status: 'unsupported', pythonPath };
    }

    return { status: 'ok', pythonPath };
  } catch {
    log(`❌ Python not found. Please install Python ${LOCKED_PYTHON_VERSION}`, 'red');
    return { status: 'missing', pythonPath: null };
  }
}

async function setupVirtualEnv(pythonPath) {
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
    exec(`"${pythonPath}" -m venv venv`, { cwd: BACKEND_DIR });
  }

  log('✅ Virtual environment ready', 'green');
  return venvPath;
}

/**
 * The torch stack is pinned, and has to stay pinned.
 *
 * These versions used to float. The v3.4.0 macOS build resolved a different
 * torch / torchvision than the spec that shipped v3.3.0 in August, and the
 * bundle died on startup with `RuntimeError: operator torchvision::nms does
 * not exist`, cascading through transformers' image_utils into diffusers.
 * Linux built and published from the identical commit; only the resolved
 * dependency set had changed. Pinning puts every platform on one tested pair.
 *
 * Why 2.14.1 / 0.29.1 on CUDA 13.2 (cu132) - product decision 2026-11:
 * "RTX 20 and newer including RTX 50, AND bundle TensorRT":
 * - Security: torch < 2.6.0 lets torch.load(weights_only=True) execute code
 *   (CVE-2025-32434). weights_only is the trust boundary of
 *   foundry/convert.py, edit_tools/upscale.py and edit_tools/faces.py, so the
 *   old 2.5.1 pin left every pickle checkpoint load exploitable. pip-audit
 *   reports no open advisory for torch 2.14.1.
 * - Hardware: the cu132 wheels compile SASS for sm_75 / 80 / 86 / 90 / 100 /
 *   120 on both Windows and Linux (PyTorch's TORCH_CUDA_ARCH_LIST for CUDA
 *   13.2 at the v2.14.1 tag): Turing (RTX 20 / GTX 16) through Blackwell
 *   (RTX 50). They need an NVIDIA driver from the R580 branch or newer (the
 *   CUDA 13.x minor-version compatibility floor). Maxwell / Pascal / Volta
 *   (GTX 900 / 10, V100) have no kernels in CUDA 13 builds and run on CPU.
 * - TensorRT: torch-tensorrt 2.14.0 (+cu132) requires torch >= 2.14, < 2.15,
 *   and no torch-tensorrt build exists for torch 2.15 - which is why the pin
 *   is 2.14.1, not 2.15.0. GPU coverage is identical (same cu132 arch list).
 *   torch-tensorrt + TensorRT 11.1 are bundled on Windows and Linux only
 *   (TORCH_TENSORRT_PIN below); there is no macOS build of either.
 * - torchvision 0.29.1 is the companion release of torch 2.14.x (requires
 *   torch >= 2.14). Like 0.29.2 it ships its ops as the stable-ABI
 *   `_C_stable` library (see selfcheck.NATIVE_EXTENSION_MODULES).
 * - macOS arm64 installs the same versions from PyPI (the MPS build;
 *   macosx_14_0_arm64 wheels only, so macOS 14 is the floor).
 * - torchaudio is not imported anywhere in backend/, so it is not installed
 *   or bundled.
 *
 * The exact wheels (and their sha256) are in
 * backend/requirements/torch-<platform>-<flavor>.txt. tests/torch-pins.test.ts
 * fails if these constants, the locks and the docs drift apart. Bump
 * deliberately, run `node build-backend.cjs --lock`, and re-run the macOS
 * smoke gate on real Apple Silicon hardware.
 */
const TORCH_PIN = '2.14.1';
const TORCHVISION_PIN = '0.29.1';
const TORCH_SPEC = `torch==${TORCH_PIN} torchvision==${TORCHVISION_PIN}`;
const TORCH_CUDA_FLAVOR = 'cu132';

/** Where each torch wheel flavour is served from. */
const TORCH_INDEXES = {
  [TORCH_CUDA_FLAVOR]: `https://download.pytorch.org/whl/${TORCH_CUDA_FLAVOR}`,
  cpu: 'https://download.pytorch.org/whl/cpu',
  pypi: 'https://pypi.org/simple',
};

const PYPI_INDEX = 'https://pypi.org/simple';

/**
 * TensorRT, bundled with the CUDA flavour on Windows and Linux.
 *
 * torch-tensorrt 2.14.0 is the build for torch 2.14.x (`torch>=2.14,<2.15`),
 * published per CUDA flavour on the PyTorch index (2.14.0+cu132). It pulls
 * TensorRT 11.1: `tensorrt-cu13` (a pure-Python sdist providing the `tensorrt`
 * import name, re-exporting the bindings), `tensorrt-cu13-bindings` (PyPI
 * wheel) and `tensorrt-cu13-libs` (the runtime libraries; wheels on
 * pypi.nvidia.com only), plus `dllist`. The hash-locked set lives in
 * requirements/tensorrt-<platform>-cu132.txt and installs with
 * --require-hashes like every other lock.
 *
 * Size: TensorRT adds 2.36 GB (Windows) / 4.55 GB (Linux) to the installed
 * bundle (1.93 GB / 3.75 GB download), measured from the wheels' file tables.
 *
 * Bundling the runtime does NOT turn TensorRT on for any model:
 * foundry/accelerator.py only builds engines for families listed in
 * TRT_PROVEN_FAMILIES, which stays empty until docs/TENSORRT_VERIFICATION.md's
 * sweep has been run on real hardware.
 */
const TORCH_TENSORRT_PIN = '2.14.0';
const NVIDIA_INDEX = 'https://pypi.nvidia.com';

/**
 * Lock targets. `gpuFlavor` is what the release build and GPU developer
 * machines install; `cpuFlavor` is the smaller no-GPU developer install.
 * macOS has no CUDA: its PyPI wheel is the MPS-capable build.
 */
const LOCK_PLATFORMS = {
  win32: {
    name: 'windows',
    uvPlatform: 'x86_64-pc-windows-msvc',
    gpuFlavor: TORCH_CUDA_FLAVOR,
    cpuFlavor: 'cpu',
    tensorrt: true,
  },
  linux: {
    name: 'linux',
    uvPlatform: 'x86_64-manylinux_2_28',
    gpuFlavor: TORCH_CUDA_FLAVOR,
    cpuFlavor: 'cpu',
    tensorrt: true,
  },
  // torch 2.14 publishes macosx_14_0_arm64 wheels only: macOS 14 (Sonoma) is
  // the floor for the Apple Silicon build. uv reads the deployment target from
  // MACOSX_DEPLOYMENT_TARGET when compiling for a macOS platform.
  darwin: {
    name: 'macos',
    uvPlatform: 'aarch64-apple-darwin',
    gpuFlavor: 'pypi',
    cpuFlavor: 'pypi',
    // NVIDIA-only: there is no macOS build of TensorRT or torch-tensorrt.
    tensorrt: false,
    env: { MACOSX_DEPLOYMENT_TARGET: '14.0' },
  },
};

function lockPlatform(platform = process.platform) {
  const target = LOCK_PLATFORMS[platform];
  if (!target) {
    throw new Error(`No backend dependency lock exists for platform "${platform}".`);
  }
  return target;
}

function torchLockPath(platform, flavor) {
  return path.join(REQUIREMENTS_DIR, `torch-${lockPlatform(platform).name}-${flavor}.txt`);
}

function runtimeLockPath(platform) {
  return path.join(REQUIREMENTS_DIR, `runtime-${lockPlatform(platform).name}.txt`);
}

function devLockPath(platform) {
  return path.join(REQUIREMENTS_DIR, `dev-${lockPlatform(platform).name}.txt`);
}

/** The TensorRT lock (CUDA flavour; Windows and Linux only). */
function tensorrtLockPath(platform) {
  return path.join(REQUIREMENTS_DIR, `tensorrt-${lockPlatform(platform).name}-${TORCH_CUDA_FLAVOR}.txt`);
}

/** Does a build for this platform + torch flavour ship TensorRT? */
function bundlesTensorrt(platform, flavor) {
  return Boolean(lockPlatform(platform).tensorrt) && flavor === TORCH_CUDA_FLAVOR;
}

/** A package's wheel page on the PyTorch index (usable as pip/uv --find-links). */
function torchWheelPage(flavor, project) {
  return `${TORCH_INDEXES[flavor]}/${project}/`;
}

/** Index flags the TensorRT lock is resolved and installed from. */
function tensorrtIndexArgs() {
  return (
    `--index-url ${PYPI_INDEX} --extra-index-url ${NVIDIA_INDEX} ` +
    `--extra-index-url ${TORCH_INDEXES[TORCH_CUDA_FLAVOR]}`
  );
}

/** The exact torch requirement lines for one wheel flavour. */
function torchRequirementLines(flavor) {
  const local = flavor === 'pypi' ? '' : `+${flavor}`;
  return [`torch==${TORCH_PIN}${local}`, `torchvision==${TORCHVISION_PIN}${local}`];
}

function assertLockFile(lockPath) {
  if (!fs.existsSync(lockPath)) {
    throw new Error(
      `Dependency lock missing: ${path.relative(__dirname, lockPath)}\n` +
        'Regenerate the locks with `node build-backend.cjs --lock` (needs uv).',
    );
  }
}

/**
 * Install the pinned torch / torchvision wheels for this platform from their
 * hash lock. A CUDA install that fails FAILS the build: silently falling back
 * to CPU wheels would ship an installer that cannot use the GPU. `useCPU` is
 * the explicit no-GPU developer path (scripts/setup-dev-backend.cjs).
 */
async function installPyTorch(venvPath, useCPU = false) {
  const target = lockPlatform();
  const flavor = useCPU ? target.cpuFlavor : target.gpuFlavor;
  const lockPath = torchLockPath(process.platform, flavor);
  assertLockFile(lockPath);

  log(`\n⬇️  Installing PyTorch ${TORCH_PIN} (${flavor}) from its hash lock...`, 'blue');
  log('  This may take 10-30 minutes...', 'yellow');

  const pip = `${getVenvPython(venvPath)} -m pip`;
  exec(
    `${pip} install --require-hashes --no-deps --index-url ${TORCH_INDEXES[flavor]} -r "${lockPath}"`,
    { cwd: BACKEND_DIR },
  );
  log(`✅ PyTorch installed (${flavor})`, 'green');
  return flavor;
}

/**
 * Install everything else the bundle ships - the server, the generation stack
 * and PyInstaller - from the platform's hash lock. --no-deps: the lock is the
 * complete, already-resolved set, so pip resolves nothing on its own.
 */
async function installPythonDependencies(venvPath) {
  const lockPath = runtimeLockPath(process.platform);
  assertLockFile(lockPath);

  log('\n📚 Installing the locked backend runtime...', 'blue');
  const pip = `${getVenvPython(venvPath)} -m pip`;
  exec(`${pip} install --require-hashes --no-deps --index-url ${PYPI_INDEX} -r "${lockPath}"`, {
    cwd: BACKEND_DIR,
  });
  log('✅ Locked runtime installed', 'green');
}

/**
 * The TensorRT packages that must arrive as wheels: tensorrt-cu13-libs also
 * exists on PyPI as a stub sdist that would download the libraries at build
 * time, outside the lock. Only `tensorrt-cu13` itself is an sdist (pure-Python
 * shim, identical on PyPI and pypi.nvidia.com).
 */
const TENSORRT_BINARY_ONLY = ['torch-tensorrt', 'tensorrt-cu13-libs', 'tensorrt-cu13-bindings', 'dllist'];

/**
 * Install torch-tensorrt + TensorRT from their hash lock - CUDA flavour on
 * Windows/Linux only (macOS and the CPU developer flavour skip it). Runs after
 * the runtime lock: the `tensorrt-cu13` shim is an sdist built with
 * --no-build-isolation against the locked setuptools, so nothing unhashed is
 * fetched to build it. Returns whether TensorRT was installed.
 */
async function installTensorRT(venvPath, flavor) {
  if (!bundlesTensorrt(process.platform, flavor)) {
    log(`\nℹ️  TensorRT is not bundled for ${lockPlatform().name} / ${flavor}`, 'yellow');
    return false;
  }
  const lockPath = tensorrtLockPath(process.platform);
  assertLockFile(lockPath);

  log(`\n⬇️  Installing torch-tensorrt ${TORCH_TENSORRT_PIN} + TensorRT from their hash lock...`, 'blue');
  const pip = `${getVenvPython(venvPath)} -m pip`;
  const binaryOnly = TENSORRT_BINARY_ONLY.join(',');
  const indexes = tensorrtIndexArgs();
  exec(
    `${pip} install --require-hashes --no-deps --no-build-isolation --only-binary ${binaryOnly} ${indexes} -r "${lockPath}"`,
    { cwd: BACKEND_DIR },
  );
  log('✅ TensorRT installed', 'green');
  return true;
}

/**
 * The generation stack the product promises. Every one of these must be a
 * pinned, hashed entry of the runtime lock (pip names; the import names live
 * in backend/selfcheck.py). torch/torchvision come from the torch lock.
 */
const BUNDLED_RUNTIME_PACKAGES = [
  'diffusers',
  'transformers',
  'accelerate',
  'peft',
  'controlnet-aux',
  'onnxruntime',
  'spandrel',
  'facexlib',
  'optimum-quanto',
  'sentence-transformers',
  'opencv-python-headless',
  'imageio-ffmpeg',
  // ComfyUI client transport.
  'aiohttp',
  'pyinstaller',
];

/** Parse `name==version` pins out of a pip-compile style lock. */
function readLockPins(lockPath) {
  const pins = new Map();
  for (const line of fs.readFileSync(lockPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==([^\s;\\]+)/.exec(line);
    if (match) {
      pins.set(match[1].toLowerCase().replace(/[._]/g, '-'), match[2]);
    }
  }
  return pins;
}

/**
 * Historically installed the generation stack unpinned. It is now part of the
 * runtime lock, so this step verifies instead: every bundled runtime is in the
 * lock, and the venv holds exactly the locked version of every locked package
 * (a stale venv from an older lock would otherwise be frozen as-is).
 */
async function installBundledRuntimes(venvPath, { tensorrt = false } = {}) {
  log('\n🔎 Verifying the venv matches the dependency locks...', 'blue');
  const target = lockPlatform();
  const runtimeLock = runtimeLockPath(process.platform);
  // Either torch flavour is a valid install (the release build uses the GPU
  // one, a no-GPU developer the CPU one); the installed wheels must match one
  // of them exactly.
  const torchLocks = [...new Set([target.gpuFlavor, target.cpuFlavor])].map((flavor) =>
    torchLockPath(process.platform, flavor),
  );
  const runtimePins = readLockPins(runtimeLock);

  const missing = BUNDLED_RUNTIME_PACKAGES.filter((name) => !runtimePins.has(name));
  if (missing.length > 0) {
    throw new Error(
      `The runtime lock does not pin these bundled runtimes: ${missing.join(', ')}. ` +
        'Add them to backend/requirements/runtime.in and run `node build-backend.cjs --lock`.',
    );
  }

  const torchArgs = torchLocks.map((lock) => `--torch-lock "${lock}"`).join(' ');
  // The TensorRT lock is checked exactly like the runtime lock when the
  // build ships it (CUDA flavour on Windows/Linux).
  const tensorrtArg = tensorrt ? `--extra-lock "${tensorrtLockPath(process.platform)}"` : '';
  exec(`${getVenvPython(venvPath)} selfcheck.py --verify-lock "${runtimeLock}" ${torchArgs} ${tensorrtArg}`, {
    cwd: BACKEND_DIR,
  });
  log('✅ Venv matches the locks', 'green');
}

/**
 * Pre-freeze gate: run the backend self-check against the venv itself, so a
 * missing runtime fails here in seconds instead of after a 20-minute freeze.
 * backend/selfcheck.py holds the module list main.spec collects from.
 */
function selfCheckFlags({ expectCuda = false, expectTensorrt = false } = {}) {
  return [...(expectCuda ? ['--expect-cuda'] : []), ...(expectTensorrt ? ['--expect-tensorrt'] : [])];
}

function assertBundleImports(venvPath, expectations = {}) {
  log('\n🔎 Verifying the venv carries every bundled runtime...', 'blue');
  try {
    exec(`${getVenvPython(venvPath)} selfcheck.py ${selfCheckFlags(expectations).join(' ')}`.trim(), {
      cwd: BACKEND_DIR,
    });
  } catch (error) {
    log('❌ Backend venv is missing bundled runtimes (see the self-check report above).', 'red');
    log('   Reinstall from the locks: node build-backend.cjs', 'red');
    throw error;
  }
  log('✅ All bundled runtimes importable', 'green');
}

async function installPyInstaller() {
  // PyInstaller is a pinned, hashed entry of the runtime lock and is installed
  // by installPythonDependencies. Kept as an export for callers of the old API.
  log('\n🔧 PyInstaller comes from the runtime lock (already installed)', 'blue');
}

/** Absolute path of the frozen executable inside a one-folder bundle dir. */
function bundleExecutable(bundleDir, platform = process.platform) {
  return path.join(bundleDir, executableName(platform));
}

/**
 * Run the frozen backend's own self-check (imports every bundled module and
 * runs the bundled ffmpeg). Any failure fails the build.
 */
function runFrozenSelfCheck(bundleDir, expectations = {}) {
  const exe = bundleExecutable(bundleDir);
  if (!fs.existsSync(exe)) {
    throw new Error(`Frozen backend executable not found at ${exe}`);
  }
  log('\n🩺 Running the frozen backend self-check...', 'blue');
  const flags = ['--self-check', ...selfCheckFlags(expectations)].join(' ');
  exec(`"${exe}" ${flags}`, { cwd: bundleDir });
  log('✅ Frozen self-check passed', 'green');
}

async function buildExecutable(venvPath, expectations = {}) {
  log('\n🏗️  Building the one-folder backend bundle...', 'blue');

  assertBundleImports(venvPath, expectations);

  const pyinstaller = `${getVenvPython(venvPath)} -m PyInstaller`;
  const specPath = path.join(BACKEND_DIR, 'main.spec');

  // Clean previous builds
  const buildDir = path.join(BACKEND_DIR, 'build');
  const distDir = path.join(BACKEND_DIR, 'dist');
  for (const dir of [buildDir, distDir]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  log('Building... This may take 10-20 minutes...', 'yellow');
  exec(`${pyinstaller} "${specPath}" --clean --noconfirm`, { cwd: BACKEND_DIR });

  const bundleDir = path.join(distDir, BUNDLE_NAME);
  runFrozenSelfCheck(bundleDir, expectations);

  log('✅ Bundle built', 'green');
  return bundleDir;
}

function directorySizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      total += directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += fs.statSync(entryPath).size;
    }
  }
  return total;
}

/**
 * Copy the one-folder bundle to resources/backend/ (replacing any previous
 * bundle) and remove the legacy one-file executable, which electron-builder
 * would otherwise package alongside it.
 */
async function copyToResources(bundleDir) {
  log('\n📂 Copying the bundle to resources/backend/...', 'blue');

  const exe = bundleExecutable(bundleDir);
  if (!fs.existsSync(exe)) {
    throw new Error(`Built executable not found at ${exe}`);
  }

  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  fs.rmSync(BUNDLE_RESOURCES_DIR, { recursive: true, force: true });
  for (const legacy of ['VisionStudio-Backend.exe', 'VisionStudio-Backend']) {
    const legacyPath = path.join(RESOURCES_DIR, legacy);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      fs.rmSync(legacyPath, { force: true });
    }
  }

  // verbatimSymlinks: macOS bundles carry relative framework symlinks that
  // must stay links (resolving them would duplicate or break the tree).
  fs.cpSync(bundleDir, BUNDLE_RESOURCES_DIR, { recursive: true, verbatimSymlinks: true });

  // POSIX: Electron spawns this binary directly, so the execute bit must hold.
  const copiedExe = bundleExecutable(BUNDLE_RESOURCES_DIR);
  if (process.platform !== 'win32') {
    fs.chmodSync(copiedExe, 0o755);
  }

  const sizeMB = (directorySizeBytes(BUNDLE_RESOURCES_DIR) / 1024 / 1024).toFixed(2);
  log(`✅ Copied to ${path.relative(__dirname, BUNDLE_RESOURCES_DIR)} (${sizeMB} MB)`, 'green');
  return copiedExe;
}

// ---------------------------------------------------------------------------
// Lock generation (maintainers): `node build-backend.cjs --lock`
// ---------------------------------------------------------------------------

const LOCK_COMPILE_COMMAND = 'node build-backend.cjs --lock';

function findUv() {
  const candidates = [process.env.UV, 'uv'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'ignore' });
      return candidate;
    } catch {}
  }
  throw new Error('`uv` is required to compile the dependency locks (https://docs.astral.sh/uv/).');
}

/**
 * Split a pip-compile style lock into its header and one block per package
 * (the `name==version \` line plus its `--hash` continuation lines).
 */
function splitLockBlocks(text) {
  const header = [];
  const blocks = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^[A-Za-z0-9]/.test(line)) {
      blocks.push({ name: line.split(/[=\[ ;]/)[0].toLowerCase().replace(/[._]/g, '-'), lines: [line] });
    } else if (blocks.length > 0 && /^\s/.test(line)) {
      blocks[blocks.length - 1].lines.push(line);
    } else if (blocks.length === 0) {
      header.push(line);
    }
  }
  return { header, blocks };
}

/**
 * requirements/tensorrt-<p>-cu132.txt: torch-tensorrt resolved against the
 * shipped torch (the cu132 torch lock) and the runtime lock (as constraints),
 * keeping ONLY what neither of those already installs - so the three locks
 * install side by side with --no-deps and never pin a package twice.
 */
function lockTensorRT(uv, platform, target, common, env, tmpDir) {
  log(`\n🔒 TensorRT lock: ${target.name} / ${TORCH_CUDA_FLAVOR}`, 'blue');
  const input = path.join(tmpDir, `tensorrt-${target.name}.in`);
  fs.writeFileSync(input, `torch-tensorrt==${TORCH_TENSORRT_PIN}+${TORCH_CUDA_FLAVOR}\n`);
  const resolved = path.join(tmpDir, `tensorrt-${target.name}.resolved.txt`);
  const torchLock = torchLockPath(platform, TORCH_CUDA_FLAVOR);
  const runtimeLock = runtimeLockPath(platform);
  // PyPI, pypi.nvidia.com (the only home of the tensorrt-cu13-libs wheels) and
  // the cu132 PyTorch index (torch-tensorrt+cu132; an index rather than a
  // find-links page so its wheels are hash-locked). Everything the torch and
  // runtime locks pin is constrained to those exact versions and dropped from
  // this lock below, so which index serves a shared package cannot matter.
  exec(
    `"${uv}" pip compile "${input}" ${common} --no-annotate ` +
      `-c "${torchLock}" -c "${runtimeLock}" ` +
      `--python-platform ${target.uvPlatform} ${tensorrtIndexArgs()} ` +
      `--index-strategy unsafe-best-match -o "${resolved}"`,
    { cwd: REQUIREMENTS_DIR, env },
  );

  const alreadyLocked = new Set([...readLockPins(torchLock).keys(), ...readLockPins(runtimeLock).keys()]);
  const { header, blocks } = splitLockBlocks(fs.readFileSync(resolved, 'utf8'));
  const kept = blocks.filter((block) => !alreadyLocked.has(block.name));
  if (!kept.some((block) => block.name === 'torch-tensorrt')) {
    throw new Error(`torch-tensorrt did not resolve for ${target.name}`);
  }
  const body = [
    ...header.filter((line) => line.startsWith('#')),
    '# torch-tensorrt and the TensorRT runtime it needs. Packages the torch and',
    '# runtime locks already pin are omitted (all three install with --no-deps).',
    ...kept.flatMap((block) => block.lines),
    '',
  ];
  fs.writeFileSync(tensorrtLockPath(platform), body.join('\n'));
}

/**
 * Re-resolve every lock from its reviewed input:
 *   requirements/torch.in              <- TORCH_PIN / TORCHVISION_PIN (written here)
 *   requirements/torch-<p>-<flavor>.txt   torch + torchvision only, from their index
 *   requirements/runtime-<p>.txt          runtime.in resolved against the torch pin
 *   requirements/tensorrt-<p>-cu132.txt   torch-tensorrt + TensorRT (Windows/Linux)
 *   requirements/dev-<p>.txt              requirements-dev.txt (the CI test env)
 */
function lockDependencies() {
  const uv = findUv();
  const torchIn = path.join(REQUIREMENTS_DIR, 'torch.in');
  fs.writeFileSync(
    torchIn,
    [
      '# Generated by `node build-backend.cjs --lock` from TORCH_PIN / TORCHVISION_PIN.',
      '# The PyPI pin (the macOS build). The lock step resolves each platform\'s',
      '# runtime-<platform>.txt against the torch build that ships there (the',
      '# cu132 wheels on Windows/Linux); the torch wheels themselves are locked',
      '# per flavour in torch-<platform>-<flavor>.txt.',
      ...torchRequirementLines('pypi'),
      '',
    ].join('\n'),
  );

  const common = [
    '--generate-hashes',
    `--python-version ${LOCKED_PYTHON_VERSION}`,
    `--custom-compile-command "${LOCK_COMPILE_COMMAND}"`,
    '--quiet',
  ].join(' ');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-torch-lock-'));

  try {
    for (const [platform, target] of Object.entries(LOCK_PLATFORMS)) {
      const env = { ...process.env, ...(target.env || {}) };
      for (const flavor of new Set([target.gpuFlavor, target.cpuFlavor])) {
        const input = path.join(tmpDir, `torch-${target.name}-${flavor}.in`);
        fs.writeFileSync(input, `${torchRequirementLines(flavor).join('\n')}\n`);
        log(`\n🔒 torch lock: ${target.name} / ${flavor}`, 'blue');
        exec(
          `"${uv}" pip compile "${input}" ${common} --no-deps --no-annotate ` +
            `--python-platform ${target.uvPlatform} --index-url ${TORCH_INDEXES[flavor]} ` +
            `-o "${path.basename(torchLockPath(platform, flavor))}"`,
          { cwd: REQUIREMENTS_DIR, env },
        );
      }

      // Resolve the runtime against the torch build that SHIPS on this
      // platform. PyPI's torch is not always the same CUDA build as the
      // PyTorch index's: PyPI torch 2.14.1 for Linux is CUDA 13.0, while
      // 2.14.1+cu132 requires cuda-toolkit 13.2.x - resolving against PyPI
      // would lock CUDA userspace libraries that do not match the shipped
      // torch. The CUDA wheels come in through --find-links (their own pages
      // on the PyTorch index) so every other package still resolves from PyPI.
      const torchInput = path.join(tmpDir, `torch-runtime-${target.name}.in`);
      fs.writeFileSync(torchInput, `${torchRequirementLines(target.gpuFlavor).join('\n')}\n`);
      const torchLinks =
        target.gpuFlavor === 'pypi'
          ? ''
          : `--find-links ${torchWheelPage(target.gpuFlavor, 'torch')} ` +
            `--find-links ${torchWheelPage(target.gpuFlavor, 'torchvision')} `;
      log(`\n🔒 runtime lock: ${target.name}`, 'blue');
      exec(
        `"${uv}" pip compile runtime.in "${torchInput}" ${common} --override overrides.txt ` +
          '--no-emit-package torch --no-emit-package torchvision ' +
          `--python-platform ${target.uvPlatform} --index-url ${PYPI_INDEX} ${torchLinks}` +
          `-o "${path.basename(runtimeLockPath(platform))}"`,
        { cwd: REQUIREMENTS_DIR, env },
      );

      if (target.tensorrt) {
        lockTensorRT(uv, platform, target, common, env, tmpDir);
      }

      log(`\n🔒 dev/test lock: ${target.name}`, 'blue');
      exec(
        `"${uv}" pip compile ../requirements-dev.txt ${common} ` +
          `--python-platform ${target.uvPlatform} --index-url ${PYPI_INDEX} ` +
          `-o "${path.basename(devLockPath(platform))}"`,
        { cwd: REQUIREMENTS_DIR, env },
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  log('\n✅ Locks regenerated. Review the diff, then rebuild and re-run the smoke gates.', 'green');
}

/**
 * The whole release pipeline: locked venv -> pre-freeze self-check ->
 * PyInstaller one-folder -> frozen self-check -> resources/backend/.
 * scripts/build-windows.cjs should call this rather than keep its own steps.
 * Returns the staged executable's path.
 */
async function buildBackendBundle() {
  const pythonCheck = await checkPython();
  if (pythonCheck.status !== 'ok') {
    throw new Error(`Python ${LOCKED_PYTHON_VERSION} is required to build the backend bundle.`);
  }

  const venvPath = await setupVirtualEnv(pythonCheck.pythonPath);

  const flavor = await installPyTorch(venvPath, false);
  await installPythonDependencies(venvPath);
  const tensorrt = await installTensorRT(venvPath, flavor);
  await installBundledRuntimes(venvPath, { tensorrt });

  const bundleDir = await buildExecutable(venvPath, {
    expectCuda: flavor === TORCH_CUDA_FLAVOR,
    expectTensorrt: tensorrt,
  });
  return copyToResources(bundleDir);
}

async function main() {
  log('\n' + '='.repeat(60), 'magenta');
  log('  Vision Studio - Backend Build Script', 'magenta');
  log('='.repeat(60) + '\n', 'magenta');

  if (process.argv.includes('--lock')) {
    try {
      lockDependencies();
    } catch (error) {
      log('\n❌ Lock generation failed!', 'red');
      console.error(error);
      process.exit(1);
    }
    return;
  }

  try {
    await buildBackendBundle();

    log('\n' + '='.repeat(60), 'green');
    log('  ✅ Backend build complete!', 'green');
    log('='.repeat(60) + '\n', 'green');

    log('Next steps:', 'cyan');
    log('  1. Run: node scripts/fetch-preview-decoders.cjs (once)', 'yellow');
    log('  2. Run: npm run package', 'yellow');
    log('\nNote: model WEIGHTS install per-user through the consent-gated Foundry;', 'yellow');
    log('every runtime dependency (PyTorch, diffusers, CUDA) ships inside the bundle.', 'yellow');
  } catch (error) {
    log('\n❌ Build failed!', 'red');
    console.error(error);
    log('\n💡 Tips:', 'yellow');
    log(`   • Make sure Python ${LOCKED_PYTHON_VERSION} is installed (uv python install ${LOCKED_PYTHON_VERSION})`, 'yellow');
    log('   • The native backend bundle is REQUIRED - packaging refuses to', 'yellow');
    log('     produce a slim installer without it (scripts/assert-native-backend.cjs)', 'yellow');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  TORCH_PIN,
  TORCHVISION_PIN,
  TORCH_SPEC,
  TORCH_CUDA_FLAVOR,
  TORCH_INDEXES,
  TORCH_TENSORRT_PIN,
  NVIDIA_INDEX,
  TENSORRT_BINARY_ONLY,
  LOCK_PLATFORMS,
  LOCKED_PYTHON_VERSION,
  BUNDLE_NAME,
  BUNDLED_RUNTIME_PACKAGES,
  REQUIREMENTS_DIR,
  executableName,
  bundleExecutable,
  torchLockPath,
  runtimeLockPath,
  devLockPath,
  tensorrtLockPath,
  bundlesTensorrt,
  splitLockBlocks,
  torchRequirementLines,
  readLockPins,
  checkPython,
  setupVirtualEnv,
  installPyTorch,
  installPythonDependencies,
  installTensorRT,
  installBundledRuntimes,
  installPyInstaller,
  selfCheckFlags,
  assertBundleImports,
  runFrozenSelfCheck,
  buildExecutable,
  copyToResources,
  buildBackendBundle,
  lockDependencies,
};
