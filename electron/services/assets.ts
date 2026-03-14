import path from 'path';

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/$/, '');
}

export function resolveAssetPath(assetPath: string, outputDirectory: string) {
  if (!assetPath) {
    return normalizePath(outputDirectory);
  }

  if (assetPath.startsWith('/outputs/') || assetPath.startsWith('outputs/')) {
    const relativePath = assetPath.replace(/^\/?outputs\/+/, '');
    return normalizePath(path.join(outputDirectory, relativePath));
  }

  if (path.isAbsolute(assetPath)) {
    return normalizePath(assetPath);
  }

  const normalizedAssetPath = assetPath.replace(/^\/+/, '');
  return normalizePath(path.join(outputDirectory, normalizedAssetPath));
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
    path.isAbsolute(assetPath) &&
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
