#!/usr/bin/env node
/**
 * Packaging gate: the installer ALWAYS ships the native backend bundle.
 *
 * Vision Studio is deliberately a heavy, self-contained install - the
 * PyInstaller backend (PyTorch, diffusers, transformers, CUDA runtime)
 * must be inside every distributable. A package without it silently falls
 * back to the user's system Python, which on a fresh machine has none of
 * the dependencies. This gate makes that failure impossible: packaging
 * aborts unless resources/VisionStudio-Backend(.exe) exists.
 *
 * Wired as electron-builder's beforePack hook AND called directly by
 * scripts/build-windows.cjs. Run `npm run build:backend` to produce the
 * bundle.
 */

const fs = require('fs');
const path = require('path');

function assertNativeBackend(platformName = process.platform) {
  const isWindows = platformName === 'win32' || platformName === 'windows';
  const isMac = platformName === 'darwin' || platformName === 'mac';
  const exeName = isWindows ? 'VisionStudio-Backend.exe' : 'VisionStudio-Backend';
  const bundlePath = path.join(__dirname, '..', 'resources', exeName);

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `Native backend bundle missing: ${bundlePath}\n` +
        'The installer must ship the full PyInstaller backend (PyTorch, ' +
        'diffusers, CUDA/MPS) - slim/frontend-only packages are not produced. ' +
        'Run `npm run build:backend` first.'
    );
  }

  const stats = fs.statSync(bundlePath);
  const sizeGB = stats.size / 1024 ** 3;
  // A truncated or placeholder file must not pass the gate. The floor is
  // platform-calibrated: Windows/Linux torch bundles CUDA and lands well
  // over 2 GB, while the macOS arm64 MPS wheel has no CUDA payload - a
  // real, verified-healthy mac bundle measures ~0.33 GB (2026-07 CI run).
  const minSizeGB = isMac ? 0.25 : 0.5;
  if (sizeGB < minSizeGB) {
    throw new Error(
      `Native backend bundle looks truncated (${sizeGB.toFixed(2)} GB < ${minSizeGB} GB floor for ${platformName}): ${bundlePath}\n` +
        'Rebuild it with `npm run build:backend`.'
    );
  }

  assertPreviewDecoders();

  console.log(
    `[assert-native-backend] OK: ${exeName} (${sizeGB.toFixed(2)} GB) is in resources/`
  );
  return bundlePath;
}

// #33: the Studio step-preview decoders (MIT, ~45 MB total) ship in every
// installer alongside the backend bundle - same heavy-by-design rationale.
const PREVIEW_DECODERS = ['taesd', 'taesdxl', 'taesd3', 'taef1'];
const PREVIEW_DECODER_FILES = ['config.json', 'diffusion_pytorch_model.safetensors'];

function assertPreviewDecoders() {
  const root = path.join(__dirname, '..', 'resources', 'preview-decoders');
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

if (require.main === module) {
  assertNativeBackend();
}
