#!/usr/bin/env node
/**
 * Developer backend setup. setup-python.bat runs this on Windows; it works the
 * same from any shell: `node scripts/setup-dev-backend.cjs`.
 *
 * It installs exactly what the release build bundles by calling
 * build-backend.cjs's own steps, so the two cannot drift apart: a Python
 * venv (build-backend.cjs LOCKED_PYTHON_VERSION) in backend/venv, the pinned
 * torch stack, the hash-locked requirements,
 * the generation stack (diffusers and the rest), torch-tensorrt + TensorRT on
 * a CUDA install (Windows/Linux, as the release bundles it), then the same
 * import check the release build runs before PyInstaller. It stops there - no
 * bundle is built.
 *
 * Without an NVIDIA GPU it installs the CPU torch wheels, which are smaller
 * and carry no TensorRT; the release build always tries CUDA first.
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
    // The hash-locked requirements and the pinned torch wheels are resolved
    // for exactly one Python minor (build-backend.cjs LOCKED_PYTHON_VERSION).
    throw new Error(
      `Python ${steps.LOCKED_PYTHON_VERSION ?? build.LOCKED_PYTHON_VERSION} is required (the backend ` +
        `dependency locks and PyTorch ${steps.TORCH_PIN ?? build.TORCH_PIN} are resolved for it). Install it ` +
        'from https://www.python.org/downloads/ and run this again.',
    );
  }

  const venvPath = await steps.setupVirtualEnv(python.pythonPath);
  const flavor = await steps.installPyTorch(venvPath, !gpuPresent());
  await steps.installPythonDependencies(venvPath);
  // installTensorRT decides from the platform and torch flavour (CUDA on
  // Windows/Linux only) and reports whether it installed anything; the lock
  // check and the import check then hold the venv to exactly that.
  const tensorrt = await steps.installTensorRT(venvPath, flavor);
  await steps.installBundledRuntimes(venvPath, { tensorrt });
  steps.assertBundleImports(venvPath, { expectTensorrt: tensorrt });
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
