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
  const exeName =
    platformName === 'win32' || platformName === 'windows'
      ? 'VisionStudio-Backend.exe'
      : 'VisionStudio-Backend';
  const bundlePath = path.join(__dirname, '..', 'resources', exeName);

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `Native backend bundle missing: ${bundlePath}\n` +
        'The installer must ship the full PyInstaller backend (PyTorch, ' +
        'diffusers, CUDA) - slim/frontend-only packages are not produced. ' +
        'Run `npm run build:backend` first.'
    );
  }

  const stats = fs.statSync(bundlePath);
  const sizeGB = stats.size / 1024 ** 3;
  // A real bundle with torch + diffusers is multi-GB; a truncated or
  // placeholder file must not pass the gate.
  if (sizeGB < 0.5) {
    throw new Error(
      `Native backend bundle looks truncated (${sizeGB.toFixed(2)} GB): ${bundlePath}\n` +
        'Rebuild it with `npm run build:backend`.'
    );
  }

  console.log(
    `[assert-native-backend] OK: ${exeName} (${sizeGB.toFixed(2)} GB) is in resources/`
  );
  return bundlePath;
}

// electron-builder beforePack hook signature: (context) => Promise<void>
module.exports = async function beforePack(context) {
  const platformName = context?.electronPlatformName ?? process.platform;
  assertNativeBackend(platformName);
};
module.exports.assertNativeBackend = assertNativeBackend;

if (require.main === module) {
  assertNativeBackend();
}
