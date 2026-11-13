import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const gate = createRequire(resolve(ROOT, 'package.json'))('./scripts/assert-native-backend.cjs') as {
  bundleExecutablePath: (platform?: string, bundleDir?: string) => string;
  runBundleSelfCheck: (
    platform?: string,
    options?: { spawn?: (...args: unknown[]) => unknown; bundleDir?: string },
  ) => boolean;
  selfCheckArgs: (platform?: string) => string[];
};

/**
 * The packaging gate ships the one-folder backend (resources/backend/) and,
 * when the bundle targets the packaging host, runs the bundle's own
 * `--self-check` so a bundle that imports on the build machine but is missing
 * a runtime never reaches an installer.
 */
describe('assert-native-backend: one-folder bundle + self-check', () => {
  it('locates the launcher inside resources/backend/', () => {
    expect(gate.bundleExecutablePath('win32', '/r/backend')).toBe(join('/r/backend', 'VisionStudio-Backend.exe'));
    expect(gate.bundleExecutablePath('mac', '/r/backend')).toBe(join('/r/backend', 'VisionStudio-Backend'));
    expect(gate.bundleExecutablePath('linux', '/r/backend')).toBe(join('/r/backend', 'VisionStudio-Backend'));
  });

  it('runs --self-check with the packaged-layout decoder check on the host platform', () => {
    const calls: unknown[][] = [];
    const spawn = (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, stdout: 'SELF-CHECK PASSED', stderr: '' };
    };
    expect(gate.runBundleSelfCheck(process.platform, { spawn, bundleDir: '/r/backend' })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(gate.bundleExecutablePath(process.platform, '/r/backend'));
    expect(calls[0][1]).toEqual(gate.selfCheckArgs(process.platform));
    expect(calls[0][1]).toEqual(expect.arrayContaining(['--self-check', '--expect-preview-decoders']));
  });

  it('requires the CUDA + TensorRT build on Windows and Linux, and neither on macOS', () => {
    for (const platform of ['win32', 'windows', 'linux']) {
      expect(gate.selfCheckArgs(platform)).toEqual([
        '--self-check',
        '--expect-preview-decoders',
        '--expect-cuda',
        '--expect-tensorrt',
      ]);
    }
    for (const platform of ['darwin', 'mac']) {
      expect(gate.selfCheckArgs(platform)).toEqual(['--self-check', '--expect-preview-decoders']);
    }
  });

  it('fails packaging with the self-check report when the bundle is incomplete', () => {
    const spawn = () => ({ status: 1, stdout: 'MISSING  optimum.quanto: ModuleNotFoundError', stderr: '' });
    expect(() => gate.runBundleSelfCheck(process.platform, { spawn, bundleDir: '/r/backend' })).toThrow(
      /self-check failed \(exit code 1\)[\s\S]*MISSING {2}optimum\.quanto/,
    );
  });

  it('fails packaging when the bundle cannot be executed at all', () => {
    const spawn = () => ({ status: null, error: new Error('spawn EACCES'), stdout: '', stderr: '' });
    expect(() => gate.runBundleSelfCheck(process.platform, { spawn, bundleDir: '/r/backend' })).toThrow(/EACCES/);
  });

  it('skips (without spawning) when packaging for another platform', () => {
    const other = process.platform === 'win32' ? 'linux' : 'win32';
    const spawn = () => {
      throw new Error('must not spawn a foreign-platform bundle');
    };
    expect(gate.runBundleSelfCheck(other, { spawn, bundleDir: '/r/backend' })).toBe(false);
  });
});
