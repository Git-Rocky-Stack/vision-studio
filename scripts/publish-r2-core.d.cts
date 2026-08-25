/**
 * Types for the CommonJS planning core in publish-r2-core.cjs.
 *
 * The implementation is plain .cjs (it is invoked by scripts/publish-r2.cjs
 * under bare node, which never sees a compiler), but tests/publish-r2-core.test.ts
 * is typechecked by tsconfig.tests.json and needs a shape to import. Enabling
 * `allowJs` so tsc could infer this from the source was measured at 27s against
 * 10s for the same program without it, on a config the husky pre-commit gate
 * runs - so the shape is declared here instead.
 *
 * This file is a claim about the .cjs, not a check of it. What keeps it honest
 * is that the tests call the real module at runtime: a declaration that drifts
 * from the implementation fails those tests rather than passing silently.
 */

/** One planned R2 PUT: local file, destination object key, and its Content-Type. */
export interface PlannedUpload {
  filePath: string;
  key: string;
  contentType: string;
}

export interface UploadPlanOptions {
  /** Local directory the file names are relative to. */
  dir: string;
  /** Object-key prefix, e.g. `win/`. Concatenated verbatim, so it carries its own trailing slash. */
  prefix: string;
}

/** File-name patterns a release publish ships. Everything else is build noise. */
export declare const RELEASE_ARTIFACT_PATTERNS: RegExp[];

/** Matches the electron-updater feed files (latest*.yml), which must upload last. */
export declare const FEED_PATTERN: RegExp;

/** Content-Type for an object key, falling back to application/octet-stream. */
export declare function contentTypeFor(name: string): string;

/** Filters a directory listing down to release artifacts and plans their uploads. */
export declare function planUploads(fileNames: string[], options: UploadPlanOptions): PlannedUpload[];

/** Plans uploads for every staged model-mirror file, normalising keys to forward slashes. */
export declare function planMirrorUploads(relPaths: string[], options: UploadPlanOptions): PlannedUpload[];

/** Reorders a plan so feed files upload after the artifacts they point at. */
export declare function orderForFeedSafety<T extends { key: string }>(uploads: T[]): T[];
