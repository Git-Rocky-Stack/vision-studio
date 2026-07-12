import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..');
const config = parse(readFileSync(resolve(ROOT, 'electron-builder.yml'), 'utf8'));

describe('packaging config honesty rails', () => {
  it('publishes the update feed to the generic R2 host, not GitHub', () => {
    // GitHub caps release assets at 2 GB; the ~6 GB heavy installer cannot
    // ship there. The electron-updater feed (latest.yml + blockmap) lives on
    // the R2 custom domain.
    expect(config.publish.provider).toBe('generic');
    expect(config.publish.url).toBe('https://updates.vision-studio-x.com/win/');
  });

  it('builds the web installer whose package URL matches the publish host', () => {
    // The app payload exceeds the 32-bit makensis mmap ceiling - a single
    // file NSIS installer cannot build. The nsis-web stub must fetch its
    // .nsis.7z from the exact prefix scripts/publish-r2.cjs uploads to, or
    // every install 404s halfway through.
    const winTargets = config.win.target.map((t: { target: string }) => t.target);
    expect(winTargets).toContain('nsis-web');
    expect(winTargets).not.toContain('nsis');
    expect(config.nsisWeb.appPackageUrl).toBe('https://updates.vision-studio-x.com/win');
    expect(config.nsisWeb.artifactName).toBe('Vision-Studio-${version}-Setup.${ext}');
  });

  it('disables multi-range differential requests (unsupported by R2/S3)', () => {
    expect(config.publish.useMultipleRangeRequest).toBe(false);
  });

  it('feeds each platform from its own R2 prefix', () => {
    // publish resolves per-platform (platform block wins over top-level). A
    // missing mac/linux override would bake the WINDOWS feed URL into the
    // mac/linux app-update.yml and every update check would 404 or, worse,
    // resolve a Windows installer.
    expect(config.mac.publish.provider).toBe('generic');
    expect(config.mac.publish.url).toBe('https://updates.vision-studio-x.com/mac/');
    expect(config.mac.publish.useMultipleRangeRequest).toBe(false);
    expect(config.linux.publish.provider).toBe('generic');
    expect(config.linux.publish.url).toBe('https://updates.vision-studio-x.com/linux/');
    expect(config.linux.publish.useMultipleRangeRequest).toBe(false);
  });

  it('builds macOS for Apple Silicon only, as dmg + updater zip', () => {
    // PyTorch dropped macOS x64 wheels at 2.3 - an Intel app would ship
    // without its backend. The zip target must ride along: electron-updater
    // on macOS updates from the zip, never the dmg.
    const targets = config.mac.target as { target: string; arch: string[] }[];
    const names = targets.map((t) => t.target);
    expect(names).toContain('dmg');
    expect(names).toContain('zip');
    for (const target of targets) {
      expect(target.arch).toEqual(['arm64']);
    }
    expect(config.mac.artifactName).toBe('Vision-Studio-${version}-${arch}.${ext}');
  });

  it('builds Linux as x64 AppImage (the auto-updatable format)', () => {
    const targets = config.linux.target as { target: string; arch: string[] }[];
    expect(targets.map((t) => t.target)).toEqual(['AppImage']);
    expect(targets[0].arch).toEqual(['x64']);
    expect(config.linux.artifactName).toBe('Vision-Studio-${version}-${arch}.${ext}');
  });

  it('ships a real >=512px PNG icon source for the mac/linux builds', () => {
    // electron-builder derives .icns and the AppImage icon set from this
    // file at build time; a missing/placeholder file fails packaging on the
    // CI runners only after the ~40 minute backend build has already run.
    expect(config.mac.icon).toBe('build/icon.png');
    expect(config.linux.icon).toBe('build/icon.png');
    const icon = readFileSync(resolve(ROOT, 'build/icon.png'));
    expect(icon.length).toBeGreaterThan(100_000);
    expect(icon.subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('keeps update signature verification on', () => {
    expect(config.win.verifyUpdateCodeSignature).toBe(true);
  });

  it('never packages user-side backend state into backend-source', () => {
    // Provisioned model weights are multi-GB AND unlicensed redistribution
    // (weights install per-user through the consent-gated Foundry); the local
    // DB is private user data. A missing exclusion once ballooned the app
    // payload to ~12 GB and broke the NSIS build outright (makensis mmap).
    type ExtraResource = { from: string; to?: string; filter?: string[] };
    const entries: ExtraResource[] = config.extraResources ?? [];
    const backendSource = entries.find((e) => e.to === 'backend-source/');
    expect(backendSource).toBeDefined();
    for (const excluded of ['!models/**/*', '!data/**/*', '!outputs/**/*']) {
      expect(backendSource!.filter).toContain(excluded);
    }
    const windowsConfig = JSON.parse(
      readFileSync(resolve(ROOT, 'electron-builder.windows.json'), 'utf8'),
    );
    const winBackendSource = (windowsConfig.extraResources ?? []).find(
      (e: ExtraResource) => e.to === 'backend-source/',
    );
    expect(winBackendSource).toBeDefined();
    for (const excluded of ['!models/**/*', '!data/**/*', '!outputs/**/*']) {
      expect(winBackendSource.filter).toContain(excluded);
    }
  });

  it('keeps the heavy-by-design beforePack gate wired and present', () => {
    expect(config.beforePack).toBe('scripts/assert-native-backend.cjs');
    expect(() => readFileSync(resolve(ROOT, config.beforePack))).not.toThrow();
  });

  it('keeps the macOS ad-hoc reseal hook wired and present', () => {
    // Skipped signing leaves Electron's prebuilt ad-hoc seal broken after
    // packaging modifies the bundle; Apple Silicon refuses to launch a
    // broken seal, so an un-resealed dmg is dead on arrival for every user.
    expect(config.afterPack).toBe('scripts/adhoc-sign-mac.cjs');
    expect(() => readFileSync(resolve(ROOT, config.afterPack))).not.toThrow();
  });

  it('ships the third-party license compliance doc as an extra resource', () => {
    const entries = (config.extraResources ?? []).map((e: { from: string }) => e.from);
    expect(entries).toContain('THIRD-PARTY-LICENSES.md');
  });
});
