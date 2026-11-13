import {
  canonicalizePath,
  hasForbiddenPathSyntax,
  isAbsoluteAnyPlatform,
  isPathWithinRoots,
  type ContainmentOptions,
} from './pathSafety';

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/$/, '');
}

// Join a base directory with a relative segment using forward slashes, without
// routing through `path.join` (whose separator semantics differ by host OS).
// Dot segments are resolved afterwards by canonicalizePath.
function joinPath(baseDirectory: string, relativeSegment: string) {
  return `${normalizePath(baseDirectory)}/${relativeSegment.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

/** Canonical form when the path is absolute and well-formed, else the slash-normalized input. */
function canonicalOrNormalized(value: string) {
  return canonicalizePath(value) ?? normalizePath(value);
}

/**
 * Map an asset reference to a filesystem path: `/outputs/...` (a backend
 * output URL path) and bare relative paths resolve under `outputDirectory`;
 * absolute paths are kept. Dot segments are resolved, so the result can be
 * checked for containment as-is.
 */
export function resolveAssetPath(assetPath: string, outputDirectory: string) {
  if (!assetPath) {
    return canonicalOrNormalized(outputDirectory);
  }

  if (assetPath.startsWith('/outputs/') || assetPath.startsWith('outputs/')) {
    const relativePath = assetPath.replace(/^\/?outputs\/+/, '');
    return canonicalOrNormalized(joinPath(outputDirectory, relativePath));
  }

  if (isAbsoluteAnyPlatform(assetPath)) {
    return canonicalOrNormalized(assetPath);
  }

  return canonicalOrNormalized(joinPath(outputDirectory, assetPath));
}

/**
 * True when `filePath` lies inside one of `allowedRoots`: dot segments
 * resolved, UNC / device / stream syntax refused, compared with path.relative
 * semantics (case-insensitive on Windows) and again after realpath, so neither
 * `<root>/../x`, `<root>-sibling/x` nor a symlink inside a root escapes.
 */
export function isPathInsideRoots(
  filePath: string,
  allowedRoots: string[],
  options: ContainmentOptions = {},
) {
  if (hasForbiddenPathSyntax(filePath, options.platform)) {
    return false;
  }
  return isPathWithinRoots(filePath, allowedRoots, options);
}

export function resolveAssetPathFromRoots(
  assetPath: string,
  primaryRoot: string,
  managedRoots: string[],
  exists: (candidatePath: string) => boolean
) {
  const primaryPath = resolveAssetPath(assetPath, primaryRoot);
  if (exists(primaryPath)) {
    return primaryPath;
  }

  if (
    isAbsoluteAnyPlatform(assetPath) &&
    !assetPath.startsWith('/outputs/') &&
    !assetPath.startsWith('outputs/')
  ) {
    return primaryPath;
  }

  for (const managedRoot of managedRoots) {
    const candidatePath = resolveAssetPath(assetPath, managedRoot);
    if (exists(candidatePath)) {
      return candidatePath;
    }
  }

  return primaryPath;
}
