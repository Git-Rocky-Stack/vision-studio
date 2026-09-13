import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const buildBackendSource = readFileSync(resolve(ROOT, 'build-backend.cjs'), 'utf8');
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

// Safe to require: build-backend.cjs guards its entry point with
// `if (require.main === module)`, so importing it runs no build.
const build = createRequire(resolve(ROOT, 'package.json'))('./build-backend.cjs') as {
  TORCH_PIN: string;
  TORCHVISION_PIN: string;
  TORCHAUDIO_PIN: string;
  TORCH_SPEC: string;
};

/**
 * A release build that resolves its own dependency versions is not a build,
 * it is a roll of the dice against whatever the index served that morning.
 *
 * That is not hypothetical here. `installPyTorch` used to install bare
 * `torch torchvision torchaudio`. On the CUDA rungs nobody noticed, because
 * the cu121 index stops at torch 2.5.1 and pinned them by accident. macOS has
 * no CUDA wheels, falls through to the `cpu` rung, and that index tracks
 * latest - so macOS alone floated, and in v3.4.0 it floated to torch 2.14.0 /
 * torchvision 0.29.0. The bundle died on startup with
 * `RuntimeError: operator torchvision::nms does not exist`, cascading through
 * transformers' image_utils into diffusers. Linux built and published from the
 * identical commit, and `backend/` had not changed since v3.3.0 at all - only
 * the resolved versions had.
 *
 * These assertions are what stands between that and a repeat.
 */
describe('the torch stack is pinned in the release build', () => {
  it('pins all three packages with ==, torchaudio in lockstep with torch', () => {
    const { TORCH_PIN, TORCHVISION_PIN, TORCHAUDIO_PIN, TORCH_SPEC } = build;
    for (const [name, v] of Object.entries({ TORCH_PIN, TORCHVISION_PIN, TORCHAUDIO_PIN })) {
      expect(v, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    // torch and torchaudio are released together; a mismatch is a half-done bump.
    expect(TORCHAUDIO_PIN, 'torchaudio must match torch').toBe(TORCH_PIN);

    expect(TORCH_SPEC).toContain(`torch==${TORCH_PIN}`);
    expect(TORCH_SPEC).toContain(`torchvision==${TORCHVISION_PIN}`);
    expect(TORCH_SPEC).toContain(`torchaudio==${TORCHAUDIO_PIN}`);
  });

  it('leaves no install rung resolving its own torch version', () => {
    // The realistic failure is one forgotten rung, not a wholesale revert - and
    // the forgotten one is whichever platform's CI you are not watching. Each
    // rung must interpolate TORCH_SPEC rather than name packages itself.
    const rungs = [...buildBackendSource.matchAll(/\$\{pip\} install ([^`]+)/g)].map((m) =>
      m[1].trim(),
    );
    expect(rungs.length, 'no pip install rungs found - did the ladder move?').toBeGreaterThan(0);

    const torchRungs = rungs.filter((r) => /torch/.test(r));
    expect(torchRungs.length, 'no torch install rung found').toBeGreaterThan(0);

    const unpinned = torchRungs.filter((r) => !r.includes('${TORCH_SPEC}'));
    expect(unpinned, 'these rungs install torch without the pinned spec').toEqual([]);
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
    expect(
      readme,
      'README:116 names the shipped torch build; it disagrees with the pin',
    ).toContain(`(${build.TORCH_PIN}+cu121)`);
  });
});
