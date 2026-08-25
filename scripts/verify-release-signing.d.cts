/**
 * Types for the CommonJS signing gate in verify-release-signing.cjs.
 *
 * Same contract as scripts/publish-r2-core.d.cts: the implementation runs under
 * bare node, tests/integration/release-signing.test.ts is typechecked by
 * tsconfig.tests.json, and that test calls the real module at runtime - so a
 * declaration that drifts fails the test rather than passing silently.
 */

export interface SigningReadiness {
  /** True when the environment carries a complete credential set for `mode`. */
  ok: boolean;
  /** The signing mode the environment selects, or null when none is configured. */
  mode: string | null;
  /** Names of the environment variables the selected mode still needs. */
  missing: string[];
}

/** Reports which signing mode an environment selects and what it is still missing. */
export declare function getSigningReadiness(env: Record<string, string | undefined>): SigningReadiness;

/** Builds the electron-builder argv for a Windows package in the selected signing mode. */
export declare function buildWindowsPackageArgs(env: Record<string, string | undefined>): string[];
