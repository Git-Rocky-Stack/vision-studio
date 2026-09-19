import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const requireFromRoot = createRequire(resolve(ROOT, 'package.json'));

type Steps = {
  checkPython: () => Promise<{ status: 'ok' | 'unsupported' | 'missing'; pythonPath: string | null }>;
  setupVirtualEnv: (pythonPath: string) => Promise<string>;
  installPyTorch: (venvPath: string, useCPU?: boolean) => Promise<void>;
  installPythonDependencies: (venvPath: string) => Promise<void>;
  installBundledRuntimes: (venvPath: string) => Promise<void>;
  assertBundleImports: (venvPath: string) => void;
};

/**
 * setup-python.bat is the Windows developer path (README Option B, quickstart.bat).
 * It installed torch without a version, never installed diffusers or the rest of
 * the generation stack, and built the venv with whatever `python` was on PATH -
 * torch 2.5.1 has Windows wheels for Python 3.9-3.12 only. It then printed
 * "Setup Complete!" over a backend that started but could not generate.
 *
 * It now runs build-backend.cjs's own install steps, so the developer venv and
 * the release bundle install the same pinned set by construction.
 */
function fakeSteps(python: Awaited<ReturnType<Steps['checkPython']>>) {
  const calls: string[] = [];
  const steps: Steps = {
    checkPython: async () => {
      calls.push('checkPython');
      return python;
    },
    setupVirtualEnv: async (pythonPath) => {
      calls.push(`setupVirtualEnv(${pythonPath})`);
      return 'backend/venv';
    },
    installPyTorch: async (venvPath, useCPU) => {
      calls.push(`installPyTorch(${venvPath}, cpu=${Boolean(useCPU)})`);
    },
    installPythonDependencies: async (venvPath) => {
      calls.push(`installPythonDependencies(${venvPath})`);
    },
    installBundledRuntimes: async (venvPath) => {
      calls.push(`installBundledRuntimes(${venvPath})`);
    },
    assertBundleImports: (venvPath) => {
      calls.push(`assertBundleImports(${venvPath})`);
    },
  };
  return { steps, calls };
}

describe('developer backend setup installs what the release build bundles', () => {
  const { setupDevBackend } = requireFromRoot('./scripts/setup-dev-backend.cjs') as {
    setupDevBackend: (steps: Steps, hasNvidiaGpu: () => boolean) => Promise<string>;
  };

  it('runs the release build install steps, then its import check', async () => {
    const { steps, calls } = fakeSteps({ status: 'ok', pythonPath: 'C:/py312/python.exe' });

    await setupDevBackend(steps, () => true);

    expect(calls).toEqual([
      'checkPython',
      'setupVirtualEnv(C:/py312/python.exe)',
      'installPyTorch(backend/venv, cpu=false)',
      'installPythonDependencies(backend/venv)',
      'installBundledRuntimes(backend/venv)',
      'assertBundleImports(backend/venv)',
    ]);
  });

  it('installs the CPU torch wheels when there is no NVIDIA GPU', async () => {
    const { steps, calls } = fakeSteps({ status: 'ok', pythonPath: 'python' });

    await setupDevBackend(steps, () => false);

    expect(calls).toContain('installPyTorch(backend/venv, cpu=true)');
  });

  it.each(['unsupported', 'missing'] as const)(
    'stops before creating a venv when Python is %s',
    async (status) => {
      const { steps, calls } = fakeSteps({ status, pythonPath: status === 'missing' ? null : 'python' });

      await expect(setupDevBackend(steps, () => true)).rejects.toThrow(/Python 3\.10, 3\.11 or 3\.12/);
      expect(calls).toEqual(['checkPython']);
    },
  );

  it('uses the release build module itself by default', () => {
    const build = requireFromRoot('./build-backend.cjs') as Record<string, unknown>;
    for (const step of [
      'checkPython',
      'setupVirtualEnv',
      'installPyTorch',
      'installPythonDependencies',
      'installBundledRuntimes',
      'assertBundleImports',
    ]) {
      expect(typeof build[step], `build-backend.cjs must export ${step}`).toBe('function');
    }
  });

  it('setup-python.bat delegates instead of keeping its own package list', () => {
    const bat = readFileSync(resolve(ROOT, 'setup-python.bat'), 'utf8');

    expect(bat).toMatch(/node "?(%~dp0)?scripts[\\/]setup-dev-backend\.cjs"?/);
    expect(bat, 'a pip install in the .bat can drift from the release build').not.toMatch(/pip install/i);
  });
});
