// lint-staged runs this config on every pre-commit.
//
// `vitest related --run <staged>` was previously used here but is incompatible
// with this project: the bare `electron` import in electron/*.ts collides with
// the local `electron/` source directory during vitest's static dep trace,
// producing an EISDIR crash on any staged .ts/.tsx file. The full suite runs
// in ~20s and is reliable, so we run it as a function entry that does not
// forward the staged filenames to the command.
//
// Typecheck runs alongside tests to catch type errors that `vitest run` would
// not surface. Lint runs too: CI enforces --max-warnings=0, so a warning that
// slips past the hook would only fail later on the PR gate.
//
// Packaging inputs (icons, installer scripts, builder configs, workflows) are
// guarded separately: commit 7c85564 moved build/icon.* and broke every
// installer target while touching no .ts file, so the hook never ran.

const PACKAGING_TESTS = [
  'npx vitest run tests/packaging-config.test.ts tests/packaging-schema.test.ts',
  'tests/ci-typecheck-gate.test.ts',
].join(' ');

module.exports = {
  '*.{ts,tsx}': () => ['npm run typecheck', 'npm run lint', 'npm run test'],
  '{build/**,icons/**,electron-builder*.{yml,json},scripts/installer.iss,.github/workflows/**}': () =>
    PACKAGING_TESTS,
};
