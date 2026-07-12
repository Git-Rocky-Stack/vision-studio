#!/usr/bin/env node
/**
 * electron-builder afterPack hook: ad-hoc sign the macOS bundle.
 *
 * With no Developer ID identity configured, electron-builder SKIPS signing
 * entirely - which leaves the prebuilt Electron distribution's ad-hoc
 * signature in place with a resource seal that no longer matches the
 * packaged app (asar + extraResources changed it). Apple Silicon refuses to
 * launch code with a BROKEN seal ("app is damaged") and right-click-Open
 * cannot bypass that, so the dmg would be dead on arrival for every user.
 *
 * Re-signing with the ad-hoc identity '-' (codesign --force --deep) reseals
 * the bundle end to end; afterPack runs before the dmg/zip targets wrap the
 * .app, so the shipped images carry the valid seal. The PyInstaller backend
 * binary in Resources is already ad-hoc signed by PyInstaller itself.
 * Replaced wholesale when real Developer ID signing + notarization land.
 */

const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[adhoc-sign-mac] resealing ${appPath} with the ad-hoc identity`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
  // Fail the build HERE if the seal is still broken - never let the dmg/zip
  // targets wrap an unlaunchable app (the CI verify step double-checks).
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  });
  console.log('[adhoc-sign-mac] OK: bundle seal verifies');
};
