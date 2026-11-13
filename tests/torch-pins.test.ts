import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const buildBackendSource = readFileSync(resolve(ROOT, 'build-backend.cjs'), 'utf8');
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
const mainSpec = readFileSync(resolve(ROOT, 'backend/main.spec'), 'utf8');

type LockTarget = { name: string; uvPlatform: string; gpuFlavor: string; cpuFlavor: string; tensorrt: boolean };

// Safe to require: build-backend.cjs guards its entry point with
// `if (require.main === module)`, so importing it runs no build.
const build = createRequire(resolve(ROOT, 'package.json'))('./build-backend.cjs') as {
  TORCH_PIN: string;
  TORCHVISION_PIN: string;
  TORCH_SPEC: string;
  TORCH_CUDA_FLAVOR: string;
  TORCH_INDEXES: Record<string, string>;
  TORCH_TENSORRT_PIN: string;
  LOCK_PLATFORMS: Record<string, LockTarget>;
  BUNDLED_RUNTIME_PACKAGES: string[];
  torchLockPath: (platform: string, flavor: string) => string;
  runtimeLockPath: (platform: string) => string;
  devLockPath: (platform: string) => string;
  tensorrtLockPath: (platform: string) => string;
  bundlesTensorrt: (platform: string, flavor: string) => boolean;
  selfCheckFlags: (expectations: { expectCuda?: boolean; expectTensorrt?: boolean }) => string[];
  torchRequirementLines: (flavor: string) => string[];
  readLockPins: (lockPath: string) => Map<string, string>;
};

const PLATFORMS = Object.keys(build.LOCK_PLATFORMS);

function flavorsOf(platform: string): string[] {
  const target = build.LOCK_PLATFORMS[platform];
  return [...new Set([target.gpuFlavor, target.cpuFlavor])];
}

/** Every `--hash=sha256:` group in a lock, keyed by its `name==version` line. */
function hashedPins(lockPath: string): Map<string, number> {
  const pins = new Map<string, number>();
  let current: string | null = null;
  for (const line of readFileSync(lockPath, 'utf8').split(/\r?\n/)) {
    const pin = /^([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?==\S+)/.exec(line);
    if (pin) {
      current = pin[1];
      pins.set(current, 0);
    } else if (current && /--hash=sha256:[0-9a-f]{64}/.test(line)) {
      pins.set(current, (pins.get(current) ?? 0) + 1);
    } else if (!line.startsWith(' ')) {
      current = null;
    }
  }
  return pins;
}

/**
 * A release build that resolves its own dependency versions is not a build,
 * it is a roll of the dice against whatever the index served that morning.
 *
 * That is not hypothetical here. `installPyTorch` used to install bare
 * `torch torchvision torchaudio`, and the rest of the generation stack with
 * `>=` floors. In v3.4.0 macOS floated to a torch / torchvision pair that died
 * on startup with `RuntimeError: operator torchvision::nms does not exist`,
 * cascading through transformers' image_utils into diffusers, while Linux
 * built and published from the identical commit.
 *
 * Everything the bundle ships is now installed from hash locks. These
 * assertions keep the pins, the locks, the installer and the docs one fact.
 */
describe('the torch stack is pinned in the release build', () => {
  it('pins torch and torchvision exactly, and never torchaudio', () => {
    const { TORCH_PIN, TORCHVISION_PIN, TORCH_SPEC } = build;
    for (const [name, v] of Object.entries({ TORCH_PIN, TORCHVISION_PIN })) {
      expect(v, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(TORCH_SPEC).toBe(`torch==${TORCH_PIN} torchvision==${TORCHVISION_PIN}`);

    // torchaudio is imported nowhere in backend/ - it must not be installed or bundled.
    expect(buildBackendSource).not.toMatch(/torchaudio==/);
    expect(mainSpec).not.toMatch(/torchaudio/);
  });

  it('clears CVE-2025-32434 (torch.load weights_only bypass, fixed in 2.6.0)', () => {
    const [major, minor] = build.TORCH_PIN.split('.').map(Number);
    expect(major > 2 || (major === 2 && minor >= 6), `torch ${build.TORCH_PIN} is < 2.6.0`).toBe(true);
  });

  it('installs CUDA wheels from an index with Blackwell (sm_120) kernels', () => {
    // RTX 50-series needs CUDA >= 12.8: cu128, cu129, cu13x...
    const match = /^cu(\d+)$/.exec(build.TORCH_CUDA_FLAVOR);
    expect(match, `unexpected CUDA flavour ${build.TORCH_CUDA_FLAVOR}`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(128);
    expect(build.TORCH_INDEXES[build.TORCH_CUDA_FLAVOR]).toBe(
      `https://download.pytorch.org/whl/${build.TORCH_CUDA_FLAVOR}`,
    );
    for (const platform of ['win32', 'linux']) {
      expect(build.LOCK_PLATFORMS[platform].gpuFlavor).toBe(build.TORCH_CUDA_FLAVOR);
    }
    expect(build.LOCK_PLATFORMS.darwin.gpuFlavor, 'macOS installs the MPS wheel from PyPI').toBe('pypi');
  });

  it('locks exactly the pinned torch pair, with hashes, for every platform and flavour', () => {
    for (const platform of PLATFORMS) {
      for (const flavor of flavorsOf(platform)) {
        const lockPath = build.torchLockPath(platform, flavor);
        const pins = hashedPins(lockPath);
        expect([...pins.keys()].sort(), lockPath).toEqual(build.torchRequirementLines(flavor).sort());
        for (const [pin, hashes] of pins) {
          expect(hashes, `${pin} in ${lockPath} carries no sha256`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('feeds the same pin into the runtime resolution (requirements/torch.in)', () => {
    const torchIn = readFileSync(resolve(ROOT, 'backend/requirements/torch.in'), 'utf8');
    for (const line of build.torchRequirementLines('pypi')) {
      expect(torchIn).toContain(line);
    }
  });

  it('installs torch only from its hash lock - no rung resolves its own version', () => {
    const installs = [...buildBackendSource.matchAll(/\$\{pip\} install ([^`]+)/g)].map((m) => m[1]);
    expect(installs.length, 'no pip install commands found - did the installer move?').toBeGreaterThan(0);
    for (const command of installs) {
      expect(command, `unlocked install: ${command}`).toContain('--require-hashes');
      expect(command, `install that resolves on its own: ${command}`).toContain('--no-deps');
      expect(command, `install not driven by a lock file: ${command}`).toMatch(/-r "\$\{lockPath\}"/);
    }
  });

  it('installs the PyTorch version the README advertises', () => {
    // Gate 4: the public claim and the build have to be the same fact.
    const advertised = /\*\*PyTorch (\d+\.\d+)\*\*/.exec(readme)?.[1];
    expect(advertised, 'README no longer advertises a PyTorch version').toBeDefined();
    expect(
      build.TORCH_PIN.startsWith(`${advertised}.`),
      `README advertises PyTorch ${advertised}, the build pins ${build.TORCH_PIN}`,
    ).toBe(true);

    // The developer-setup note names the exact CUDA build too.
    expect(readme, 'README names the shipped torch build; it disagrees with the pin').toContain(
      `${build.TORCH_PIN}+${build.TORCH_CUDA_FLAVOR}`,
    );
    expect(readme, 'README still documents the retired cu121 build').not.toMatch(/cu121|torch==2\.5\.1/);
  });
});

/**
 * Product decision (2026-11): RTX 20 and newer including RTX 50 on cu132, with
 * TensorRT bundled on Windows and Linux. torch-tensorrt is built against one
 * torch minor (2.14.0 requires torch >= 2.14, < 2.15), so the pins move
 * together or not at all.
 */
describe('TensorRT ships with the CUDA build on Windows and Linux', () => {
  it('pins a torch-tensorrt built for the pinned torch minor', () => {
    expect(build.TORCH_TENSORRT_PIN).toMatch(/^\d+\.\d+\.\d+$/);
    const minor = (v: string) => v.split('.').slice(0, 2).join('.');
    expect(minor(build.TORCH_TENSORRT_PIN), 'torch-tensorrt and torch must share a minor').toBe(
      minor(build.TORCH_PIN),
    );
  });

  it('bundles it for the CUDA flavour on Windows/Linux only', () => {
    expect(build.bundlesTensorrt('win32', build.TORCH_CUDA_FLAVOR)).toBe(true);
    expect(build.bundlesTensorrt('linux', build.TORCH_CUDA_FLAVOR)).toBe(true);
    expect(build.bundlesTensorrt('win32', 'cpu'), 'the CPU developer flavour skips it').toBe(false);
    expect(build.bundlesTensorrt('darwin', 'pypi'), 'no macOS build exists').toBe(false);
  });

  it('hash-locks torch-tensorrt and the TensorRT runtime per platform', () => {
    for (const platform of ['win32', 'linux']) {
      const lockPath = build.tensorrtLockPath(platform);
      const pins = hashedPins(lockPath);
      expect(pins.has(`torch-tensorrt==${build.TORCH_TENSORRT_PIN}+${build.TORCH_CUDA_FLAVOR}`), lockPath).toBe(true);
      const names = [...pins.keys()].map((pin) => pin.split('==')[0]);
      for (const name of ['tensorrt-cu13', 'tensorrt-cu13-libs', 'tensorrt-cu13-bindings']) {
        expect(names, `${name} missing from ${lockPath}`).toContain(name);
      }
      for (const [pin, hashes] of pins) {
        expect(hashes, `${pin} in ${lockPath} carries no sha256`).toBeGreaterThan(0);
      }
      // Installed side by side with --no-deps: nothing may be pinned twice.
      const others = new Set([
        ...build.readLockPins(build.runtimeLockPath(platform)).keys(),
        ...build.readLockPins(build.torchLockPath(platform, build.TORCH_CUDA_FLAVOR)).keys(),
      ]);
      expect(names.filter((name) => others.has(name)), `${lockPath} re-pins another lock's packages`).toEqual([]);
    }
  });

  it('requires the TensorRT self-check whenever a build ships it', () => {
    expect(build.selfCheckFlags({ expectCuda: true, expectTensorrt: true })).toEqual([
      '--expect-cuda',
      '--expect-tensorrt',
    ]);
    expect(build.selfCheckFlags({})).toEqual([]);
    expect(buildBackendSource).toMatch(/expectTensorrt: tensorrt/);
  });

  it('resolves the Linux runtime against the cu132 torch, not PyPI\'s CUDA 13.0 build', () => {
    // torch 2.14.1 on PyPI is a CUDA 13.0 build; 2.14.1+cu132 requires
    // cuda-toolkit 13.2.x. The runtime lock must carry the libraries the
    // shipped torch actually loads.
    const pins = build.readLockPins(build.runtimeLockPath('linux'));
    expect(pins.get('cuda-toolkit'), 'linux runtime lock has no cuda-toolkit').toMatch(/^13\.2\./);
  });
});

describe('the rest of the bundle is hash-locked', () => {
  it('pins every runtime and dev package exactly, each with at least one sha256', () => {
    for (const platform of PLATFORMS) {
      for (const lockPath of [build.runtimeLockPath(platform), build.devLockPath(platform)]) {
        const pins = hashedPins(lockPath);
        expect(pins.size, `${lockPath} is empty`).toBeGreaterThan(10);
        for (const [pin, hashes] of pins) {
          expect(hashes, `${pin} in ${lockPath} carries no sha256`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('locks every bundled runtime on every platform, and never torch itself', () => {
    for (const platform of PLATFORMS) {
      const pins = build.readLockPins(build.runtimeLockPath(platform));
      for (const name of build.BUNDLED_RUNTIME_PACKAGES) {
        expect(pins.has(name), `${name} missing from the ${platform} runtime lock`).toBe(true);
      }
      // torch/torchvision come from the CUDA index lock; a PyPI copy here
      // would replace the CUDA build with the PyPI one.
      expect(pins.has('torch')).toBe(false);
      expect(pins.has('torchvision')).toBe(false);
    }
  });

  it('ships exactly one OpenCV (headless) and none of the retired packages', () => {
    for (const platform of PLATFORMS) {
      const pins = build.readLockPins(build.runtimeLockPath(platform));
      expect(pins.has('opencv-python-headless')).toBe(true);
      expect(pins.has('opencv-python'), 'the GUI OpenCV would fight the headless one over cv2').toBe(false);
      for (const retired of ['gdown', 'python-multipart', 'xformers', 'torchaudio']) {
        expect(pins.has(retired), `${retired} is locked for ${platform}`).toBe(false);
      }
    }
  });

  it('holds the security floors named in runtime.in', () => {
    const atLeast = (version: string, floor: string) => {
      const a = version.split(/[.+]/).map((part) => Number.parseInt(part, 10) || 0);
      const b = floor.split('.').map(Number);
      for (let i = 0; i < b.length; i += 1) {
        if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
      }
      return true;
    };
    const floors: Record<string, string> = {
      pillow: '11.3.0',
      starlette: '0.49.1',
      h11: '0.16.0',
      aiohttp: '3.13.3',
      transformers: '4.53.0',
      requests: '2.32.4',
      urllib3: '2.5.0',
    };
    for (const platform of PLATFORMS) {
      const pins = build.readLockPins(build.runtimeLockPath(platform));
      for (const [name, floor] of Object.entries(floors)) {
        const version = pins.get(name);
        expect(version, `${name} missing from the ${platform} lock`).toBeDefined();
        expect(atLeast(version!, floor), `${name} ${version} < ${floor} (${platform})`).toBe(true);
      }
    }
  });
});
