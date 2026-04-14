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
// not surface.

module.exports = {
  '*.{ts,tsx}': () => ['npm run typecheck', 'npm run test'],
};
