import fs from 'fs';
import path from 'path';

/**
 * Path containment for renderer-supplied paths.
 *
 * A string-prefix test lets `<root>/../../x` (or `<root>-evil/x`, or a
 * symlink inside the root) escape. Containment here is decided on:
 *   1. syntax - NUL bytes, UNC / device / NT-namespace prefixes (`\\host`,
 *      `\\?\`, `\\.\`, `\??\`) and NTFS alternate data streams are refused
 *      outright (a UNC open leaks the user's NTLM credentials to the host);
 *   2. the lexical canonical path - dot segments resolved with the right
 *      platform's semantics, compared with path.relative (case-insensitive on
 *      Windows, so `C:\Out` and `c:\out` agree and `C:\Out-evil` does not);
 *   3. the real path - both the candidate (or its nearest existing ancestor)
 *      and the root go through realpath, so a symlink or junction inside a
 *      root cannot point outside it.
 *
 * Electron ships on Windows while CI runs on Linux, so the flavour is chosen
 * per path: a drive-letter path is always Windows-flavoured, whatever the host.
 */

export type PathFlavor = 'win32' | 'posix';

export type RealpathFn = (candidatePath: string) => string;

const WINDOWS_DRIVE = /^[A-Za-z]:/;
const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;

function flavorApi(flavor: PathFlavor) {
  return flavor === 'win32' ? path.win32 : path.posix;
}

/**
 * True for syntax no managed path ever uses: NUL, UNC and device paths
 * (`\\host\share`, `//host/share`, `\\?\C:\`, `\\.\pipe\x`), the NT object
 * namespace (`\??\`), and - for Windows paths - a colon past the drive
 * letter (`file.png:stream` alternate data streams, `C:x` drive-relative
 * forms). A colon is an ordinary file-name character on POSIX.
 */
export function hasForbiddenPathSyntax(rawPath: string, platform: NodeJS.Platform = process.platform): boolean {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.includes('\0')) {
    return true;
  }
  const slashed = rawPath.replace(/\\/g, '/');
  if (slashed.startsWith('//') || slashed.startsWith('/??/')) {
    return true;
  }
  if (pathFlavorFor(rawPath, platform) !== 'win32') {
    return false;
  }
  const colon = rawPath.indexOf(':');
  if (colon === -1) {
    return false;
  }
  // The only colon allowed is the drive letter's, followed by a separator.
  return !(colon === 1 && WINDOWS_DRIVE_ABSOLUTE.test(rawPath) && rawPath.indexOf(':', 2) === -1);
}

export function pathFlavorFor(rawPath: string, platform: NodeJS.Platform = process.platform): PathFlavor {
  if (platform === 'win32' || WINDOWS_DRIVE.test(rawPath)) {
    return 'win32';
  }
  return 'posix';
}

export function isAbsoluteAnyPlatform(rawPath: string, platform: NodeJS.Platform = process.platform): boolean {
  if (WINDOWS_DRIVE_ABSOLUTE.test(rawPath)) {
    return true;
  }
  return flavorApi(pathFlavorFor(rawPath, platform)).isAbsolute(rawPath);
}

function toForwardSlashes(value: string) {
  return value.replace(/\\/g, '/');
}

/** Strip a trailing separator, keeping a bare root (`C:/`, `/`). */
function trimTrailingSeparator(value: string) {
  if (value === '/' || /^[A-Za-z]:\/$/.test(value)) {
    return value;
  }
  return value.replace(/\/+$/, '');
}

/**
 * Absolute, dot-free, forward-slash form of `rawPath`, or null when the path
 * is relative or uses forbidden syntax.
 */
export function canonicalizePath(rawPath: string, platform: NodeJS.Platform = process.platform): string | null {
  if (hasForbiddenPathSyntax(rawPath, platform) || !isAbsoluteAnyPlatform(rawPath, platform)) {
    return null;
  }
  const flavor = pathFlavorFor(rawPath, platform);
  const resolved = toForwardSlashes(flavorApi(flavor).resolve(rawPath));
  // win32.resolve of a rooted, driveless path on a non-Windows host borrows the
  // host cwd; that is never a real Windows path.
  if (flavor === 'win32' && !WINDOWS_DRIVE_ABSOLUTE.test(resolved)) {
    return null;
  }
  return trimTrailingSeparator(resolved);
}

/** True when `canonical` is a filesystem root (`/`, `C:/`). */
export function isFilesystemRoot(canonical: string): boolean {
  return canonical === '/' || /^[A-Za-z]:\/?$/.test(canonical);
}

/** Lexical containment of two canonical paths of the same flavour. */
export function isCanonicalPathWithin(candidate: string, root: string, flavor: PathFlavor): boolean {
  const api = flavorApi(flavor);
  // path.win32.relative compares case-insensitively; posix is exact.
  const relative = api.relative(root, candidate);
  if (relative === '') {
    return true;
  }
  if (api.isAbsolute(relative)) {
    return false; // different drive
  }
  const first = toForwardSlashes(relative).split('/')[0];
  return first !== '..';
}

function defaultRealpath(candidatePath: string) {
  return fs.realpathSync.native(candidatePath);
}

/**
 * Real path of `canonical`, resolving through its nearest existing ancestor
 * when the leaf does not exist yet (an export destination, a deleted asset).
 * Returns `canonical` unchanged when no ancestor resolves (e.g. a Windows
 * path evaluated on a Linux host).
 */
export function realpathThroughExisting(
  canonical: string,
  flavor: PathFlavor,
  realpath: RealpathFn = defaultRealpath,
): string {
  const api = flavorApi(flavor);
  const pending: string[] = [];
  let current = canonical;
  for (;;) {
    try {
      const real = toForwardSlashes(realpath(current));
      return trimTrailingSeparator(pending.length ? `${trimTrailingSeparator(real)}/${pending.reverse().join('/')}` : real);
    } catch {
      const parent = toForwardSlashes(api.dirname(current));
      if (parent === current) {
        return canonical;
      }
      pending.push(api.basename(current));
      current = parent;
    }
  }
}

export interface ContainmentOptions {
  platform?: NodeJS.Platform;
  realpath?: RealpathFn;
}

/**
 * Canonical path of `candidate` when it lies inside one of `roots` both
 * lexically and after realpath, else null.
 */
export function resolveWithinRoots(
  candidate: string,
  roots: readonly string[],
  { platform = process.platform, realpath = defaultRealpath }: ContainmentOptions = {},
): string | null {
  const canonical = canonicalizePath(candidate, platform);
  if (!canonical) {
    return null;
  }
  const flavor = pathFlavorFor(canonical, platform);
  let realCandidate: string | null = null;

  for (const root of roots) {
    const canonicalRoot = typeof root === 'string' ? canonicalizePath(root, platform) : null;
    if (!canonicalRoot || pathFlavorFor(canonicalRoot, platform) !== flavor) {
      continue;
    }
    if (!isCanonicalPathWithin(canonical, canonicalRoot, flavor)) {
      continue;
    }
    realCandidate ??= realpathThroughExisting(canonical, flavor, realpath);
    const realRoot = realpathThroughExisting(canonicalRoot, flavor, realpath);
    if (isCanonicalPathWithin(realCandidate, realRoot, pathFlavorFor(realRoot, platform))) {
      return canonical;
    }
  }
  return null;
}

export function isPathWithinRoots(
  candidate: string,
  roots: readonly string[],
  options: ContainmentOptions = {},
): boolean {
  return resolveWithinRoots(candidate, roots, options) !== null;
}

/** Native separators for handing a canonical path to the OS shell. */
export function toNativePath(canonical: string, platform: NodeJS.Platform = process.platform): string {
  return pathFlavorFor(canonical, platform) === 'win32' ? canonical.replace(/\//g, '\\') : canonical;
}
