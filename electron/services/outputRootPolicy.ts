import os from 'os';

import {
  canonicalizePath,
  hasForbiddenPathSyntax,
  isCanonicalPathWithin,
  isFilesystemRoot,
  pathFlavorFor,
} from './pathSafety';

/**
 * Which directories may become a managed output root.
 *
 * A managed root is where assets:delete / export / reveal / open may act, so
 * the backend's output folder must never be a place whose other contents
 * matter: a drive root, the user's profile root (or an ancestor of it), the
 * app's own data folder (it holds the encrypted secrets store), or an OS /
 * program directory. UNC shares are refused like everywhere else (S1).
 */

export interface OutputRootPolicyContext {
  homeDir: string;
  userDataPath: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}

export type OutputRootVerdict = { ok: true; path: string } | { ok: false; reason: string };

export function defaultOutputRootPolicyContext(userDataPath: string): OutputRootPolicyContext {
  return {
    homeDir: os.homedir(),
    userDataPath,
    platform: process.platform,
    env: process.env,
  };
}

const POSIX_SYSTEM_DIRECTORIES = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib32',
  '/lib64',
  '/libx32',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/snap',
  '/srv',
  '/sys',
  '/usr',
  '/var',
];

const DARWIN_SYSTEM_DIRECTORIES = [
  '/Applications',
  '/Library',
  '/System',
  '/bin',
  '/cores',
  '/dev',
  '/etc',
  '/private',
  '/sbin',
  '/usr',
  '/var',
];

export function getSystemDirectories(context: Pick<OutputRootPolicyContext, 'platform' | 'env'>): string[] {
  const { platform, env } = context;
  if (platform === 'win32') {
    const candidates = [
      env.SystemRoot,
      env.windir,
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      env.ProgramW6432,
      env.ProgramData,
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\ProgramData',
    ];
    return candidates.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }
  return platform === 'darwin' ? DARWIN_SYSTEM_DIRECTORIES : POSIX_SYSTEM_DIRECTORIES;
}

function within(candidate: string, root: string, platform: NodeJS.Platform) {
  const canonicalRoot = canonicalizePath(root, platform);
  if (!canonicalRoot) {
    return false;
  }
  const flavor = pathFlavorFor(candidate, platform);
  if (pathFlavorFor(canonicalRoot, platform) !== flavor) {
    return false;
  }
  return isCanonicalPathWithin(candidate, canonicalRoot, flavor);
}

/** True when `candidateRoot` is `protectedPath` or one of its ancestors. */
function containsProtected(candidateRoot: string, protectedPath: string, platform: NodeJS.Platform) {
  const canonicalProtected = protectedPath ? canonicalizePath(protectedPath, platform) : null;
  return canonicalProtected !== null && within(canonicalProtected, candidateRoot, platform);
}

/**
 * Validate a would-be output root. Creatability is checked separately (it
 * touches the disk) by the settings:update handler; stored roots loaded at
 * startup are checked with this alone, so historical roots on a disconnected
 * drive stay reachable once it returns.
 */
export function validateOutputRoot(rawPath: string, context: OutputRootPolicyContext): OutputRootVerdict {
  const { platform } = context;
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, reason: 'Choose a folder for generated output.' };
  }
  const trimmed = rawPath.trim();
  const slashed = trimmed.replace(/\\/g, '/');
  if (slashed.startsWith('//')) {
    return {
      ok: false,
      reason: 'Network (UNC) and device paths cannot be output folders. Map the share to a drive letter instead.',
    };
  }
  if (hasForbiddenPathSyntax(trimmed, platform)) {
    return { ok: false, reason: 'The output folder path is not valid.' };
  }
  const canonical = canonicalizePath(trimmed, platform);
  if (!canonical) {
    return { ok: false, reason: 'The output folder must be an absolute path.' };
  }
  if (isFilesystemRoot(canonical)) {
    return { ok: false, reason: 'A drive root cannot be the output folder. Choose a folder inside it.' };
  }

  // The profile root, or any folder that contains it (C:\Users, /home).
  if (containsProtected(canonical, context.homeDir, platform)) {
    return { ok: false, reason: 'Your user folder itself cannot be the output folder. Choose a folder inside it.' };
  }
  // The app's own data folder, or any folder that contains it.
  if (containsProtected(canonical, context.userDataPath, platform)) {
    return { ok: false, reason: 'The app data folder cannot be the output folder.' };
  }
  for (const systemDirectory of getSystemDirectories(context)) {
    if (within(canonical, systemDirectory, platform)) {
      return { ok: false, reason: 'A system or program folder cannot be the output folder.' };
    }
  }
  return { ok: true, path: canonical };
}
