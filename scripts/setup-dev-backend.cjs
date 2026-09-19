#!/usr/bin/env node
/**
 * Developer backend setup. setup-python.bat runs this on Windows; it works the
 * same from any shell: `node scripts/setup-dev-backend.cjs`.
 *
 * It installs exactly what the release build bundles by calling
 * build-backend.cjs's own steps, so the two cannot drift apart: a Python
 * 3.10-3.12 venv in backend/venv, the pinned torch stack, requirements.txt,
 * the generation stack (diffusers and the rest), then the same import check the
 * release build runs before PyInstaller. It stops there - no bundle is built.
 *
 * Without an NVIDIA GPU it installs the CPU torch wheels, which are smaller;
 * the release build always tries CUDA first.
 */

const { execSync } = require('child_process');
const build = require('../build-backend.cjs');

function hasNvidiaGpu() {
  try {
    execSync('nvidia-smi', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function setupDevBackend(steps = build, gpuPresent = hasNvidiaGpu) {
  const python = await steps.checkPython();
  if (python.status !== 'ok') {
    // build-backend.cjs looks for 3.12, 3.11 and 3.10 and flags anything newer:
    // the pinned torch 2.5.1 has no Windows wheels past Python 3.12.
    throw new Error(
      'Python 3.10, 3.11 or 3.12 is required (the pinned PyTorch 2.5.1 has no wheels ' +
        'for newer Windows Pythons). Install Python 3.12 from https://www.python.org/downloads/ ' +
        'and run this again.',
    );
  }

  const venvPath = await steps.setupVirtualEnv(python.pythonPath);
  await steps.installPyTorch(venvPath, !gpuPresent());
  await steps.installPythonDependencies(venvPath);
  await steps.installBundledRuntimes(venvPath);
  steps.assertBundleImports(venvPath);
  return venvPath;
}

if (require.main === module) {
  setupDevBackend()
    .then((venvPath) => {
      console.log(`\nBackend environment ready in ${venvPath}.`);
      console.log('Start the whole app with: npm run dev');
      console.log('Or only the backend: cd backend, venv\\Scripts\\activate, python main.py');
    })
    .catch((error) => {
      console.error(`\nBackend setup failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}

module.exports = { setupDevBackend };
