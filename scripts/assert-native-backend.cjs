#!/usr/bin/env node
/**
 * Packaging gate: the installer ALWAYS ships the native backend bundle.
 *
 * Vision Studio is deliberately a heavy, self-contained install - the
 * PyInstaller backend (PyTorch, diffusers, transformers, CUDA runtime)
 * must be inside every distributable. A package without it silently falls
 * back to the user's system Python, which on a fresh machine has none of
 * the dependencies. This gate makes that failure impossible: packaging
 * aborts unless the one-folder bundle resources/backend/ holds the
 * VisionStudio-Backend(.exe) launcher and its _internal/ payload.
 *
 * When the bundle was built for the platform doing the packaging, the gate
 * also runs the bundle's own `--self-check` (every runtime module imports,
 * the bundled ffmpeg runs, the preview decoders resolve from the packaged
 * layout). A cross-platform package cannot execute the bundle, so it skips
 * that step and says so.
 *
 * Wired as electron-builder's beforePack hook AND called directly by
 * scripts/build-windows.cjs. Run `npm run build:backend` to produce the
 * bundle.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');
const BUNDLE_DIR = path.join(RESOURCES_DIR, 'backend');
const SELF_CHECK_TIMEOUT_MS = 10 * 60 * 1000;

function normalizePlatform(platformName) {
  if (platformName === 'win32' || platformName === 'windows') return 'win32';
  if (platformName === 'darwin' || platformName === 'mac') return 'darwin';
  return 'linux';
}

function bundleExecutablePath(platformName = process.platform, bundleDir = BUNDLE_DIR) {
  const exeName = normalizePlatform(platformName) === 'win32' ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';
  return path.join(bundleDir, exeName);
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
 * The self-check flags a release bundle for this platform must pass. Every
 * Windows/Linux installer ships the CUDA torch build WITH TensorRT
 * (build-backend.cjs: cu132 + torch-tensorrt); macOS ships the MPS build
 * without either. A CPU developer bundle therefore cannot be packaged on
 * Windows/Linux - the same "no slim installer" rule as the size floor.
 */
function selfCheckArgs(platformName = process.platform) {
  const target = normalizePlatform(platformName);
  const args = ['--self-check', '--expect-preview-decoders'];
  if (target === 'win32' || target === 'linux') {
    args.push('--expect-cuda', '--expect-tensorrt');
  }
  return args;
}

/**
 * Run the bundle's `--self-check`. Throws with the captured report when it
 * fails; returns false (skipped) when the bundle targets another platform.
 */
function runBundleSelfCheck(platformName = process.platform, { spawn = spawnSync, bundleDir = BUNDLE_DIR } = {}) {
  const target = normalizePlatform(platformName);
  if (target !== process.platform) {
    console.log(
      `[assert-native-backend] Skipping the bundle self-check: packaging for ${target} on ${process.platform}.`,
    );
    return false;
  }

  const exe = bundleExecutablePath(target, bundleDir);
  console.log('[assert-native-backend] Running the bundle self-check...');
  const result = spawn(exe, selfCheckArgs(target), {
    cwd: bundleDir,
    encoding: 'utf8',
    timeout: SELF_CHECK_TIMEOUT_MS,
    windowsHide: true,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : `exit code ${result.status}`;
    throw new Error(
      `Native backend self-check failed (${reason}): ${exe}\n${output}\n` +
        'Rebuild the bundle with `npm run build:backend`.',
    );
  }
  console.log('[assert-native-backend] OK: bundle self-check passed');
  return true;
}

function assertNativeBackend(platformName = process.platform, { selfCheck = true } = {}) {
  const target = normalizePlatform(platformName);
  const exePath = bundleExecutablePath(target);

  for (const legacy of ['VisionStudio-Backend.exe', 'VisionStudio-Backend']) {
    const legacyPath = path.join(RESOURCES_DIR, legacy);
    if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      throw new Error(
        `Legacy one-file backend found at ${legacyPath}.\n` +
          'The backend now ships as the one-folder bundle in resources/backend/; delete the ' +
          'old executable so it is not packaged alongside it (npm run build:backend does this).',
      );
    }
  }

  if (!fs.existsSync(exePath) || !fs.existsSync(path.join(BUNDLE_DIR, '_internal'))) {
    throw new Error(
      `Native backend bundle missing: ${exePath} (with ${path.join(BUNDLE_DIR, '_internal')})\n` +
        'The installer must ship the full PyInstaller backend (PyTorch, ' +
        'diffusers, CUDA/MPS) - slim/frontend-only packages are not produced. ' +
        'Run `npm run build:backend` first.'
    );
  }

  const sizeGB = directorySizeBytes(BUNDLE_DIR) / 1024 ** 3;
  // A truncated or placeholder bundle must not pass the gate. The floor is
  // platform-calibrated: Windows/Linux torch bundles CUDA and lands well over
  // 2 GB, while the macOS arm64 MPS wheel has no CUDA payload.
  const minSizeGB = target === 'darwin' ? 0.25 : 0.5;
  if (sizeGB < minSizeGB) {
    throw new Error(
      `Native backend bundle looks truncated (${sizeGB.toFixed(2)} GB < ${minSizeGB} GB floor for ${target}): ${BUNDLE_DIR}\n` +
        'Rebuild it with `npm run build:backend`.'
    );
  }

  assertPreviewDecoders();

  if (selfCheck) {
    runBundleSelfCheck(target);
  }

  console.log(
    `[assert-native-backend] OK: backend bundle (${sizeGB.toFixed(2)} GB) is in resources/backend/`
  );
  return exePath;
}

// #33: the Studio step-preview decoders (MIT, ~45 MB total) ship in every
// installer alongside the backend bundle - same heavy-by-design rationale.
const PREVIEW_DECODERS = ['taesd', 'taesdxl', 'taesd3', 'taef1'];
const PREVIEW_DECODER_FILES = ['config.json', 'diffusion_pytorch_model.safetensors'];

function assertPreviewDecoders() {
  const root = path.join(RESOURCES_DIR, 'preview-decoders');
  for (const name of PREVIEW_DECODERS) {
    for (const file of PREVIEW_DECODER_FILES) {
      const filePath = path.join(root, name, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Preview decoder missing: ${name}/${file}\n` +
            'The installer always ships the Studio step-preview decoders ' +
            '(heavy-by-design). Run `node scripts/fetch-preview-decoders.cjs`.'
        );
      }
    }
  }
  console.log('[assert-native-backend] OK: preview decoders (taesd family) are in resources/');
}

// electron-builder beforePack hook signature: (context) => Promise<void>
module.exports = async function beforePack(context) {
  const platformName = context?.electronPlatformName ?? process.platform;
  assertNativeBackend(platformName);
};
module.exports.assertNativeBackend = assertNativeBackend;
module.exports.assertPreviewDecoders = assertPreviewDecoders;
module.exports.runBundleSelfCheck = runBundleSelfCheck;
module.exports.selfCheckArgs = selfCheckArgs;
module.exports.bundleExecutablePath = bundleExecutablePath;

if (require.main === module) {
  assertNativeBackend();
}
