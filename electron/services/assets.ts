import path from 'path';

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/$/, '');
}

// Windows drive-absolute path (e.g. "D:/Outputs", "C:\\Users"). Electron runs on
// Windows so user output paths are routinely drive-absolute, but unit tests and
// CI execute on Linux where Node's POSIX `path.isAbsolute` reports these as
// relative. Detect them explicitly so path handling is identical on every host.
const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;

function isAbsolutePath(value: string) {
  return path.isAbsolute(value) || WINDOWS_DRIVE_ABSOLUTE.test(value);
}

// Join a base directory with a relative segment using forward slashes, without
// routing through `path.join` (whose separator and `..` semantics differ by
// host OS). Output paths are always normalized to forward slashes anyway.
function joinPath(baseDirectory: string, relativeSegment: string) {
  return normalizePath(`${normalizePath(baseDirectory)}/${relativeSegment.replace(/^\/+/, '')}`);
}

export function resolveAssetPath(assetPath: string, outputDirectory: string) {
  if (!assetPath) {
    return normalizePath(outputDirectory);
  }

  if (assetPath.startsWith('/outputs/') || assetPath.startsWith('outputs/')) {
    const relativePath = assetPath.replace(/^\/?outputs\/+/, '');
    return joinPath(outputDirectory, relativePath);
  }

  if (isAbsolutePath(assetPath)) {
    return normalizePath(assetPath);
  }

  const normalizedAssetPath = assetPath.replace(/^\/+/, '');
  return joinPath(outputDirectory, normalizedAssetPath);
}

export function isPathInsideRoots(filePath: string, allowedRoots: string[]) {
  const normalizedFilePath = normalizePath(filePath);

  return allowedRoots.some((root) => {
    const normalizedRoot = normalizePath(root);
    return (
      normalizedFilePath === normalizedRoot ||
      normalizedFilePath.startsWith(`${normalizedRoot}/`)
    );
  });
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
    isAbsolutePath(assetPath) &&
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
