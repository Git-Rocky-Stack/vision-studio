import path from 'path';

const ALLOWED_STORE_KEYS = new Set(['settings', 'recentProjects', 'firstRun', 'modelsDownloaded']);
const DANGEROUS_EXECUTABLE_NAMES = new Set([
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'bash',
  'bash.exe',
  'sh',
  'sh.exe',
  'wscript',
  'wscript.exe',
  'cscript',
  'cscript.exe',
]);

const SHELL_METACHARACTERS = /[;&|`$<>]/;
const PYTHON_EXECUTABLE_NAME = /^(py|python(?:\d+(?:\.\d+)*)?)(?:\.exe)?$/i;

// Electron ships on Windows, so command paths arrive with Windows separators
// ("C:\\Python311\\python.exe"). Node's POSIX `path.basename` (used by the test
// suite + CI on Linux) does not split on backslashes, so it would return the
// whole string. Split on either separator to get the real executable name on
// every host.
function crossPlatformBasename(filePath: string) {
  const segments = filePath.split(/[\\/]/);
  return segments[segments.length - 1] || filePath;
}

function normalizeForCompare(filePath: string) {
  return path.resolve(filePath).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

function isPathInsideRoot(candidatePath: string, rootPath: string) {
  const candidate = normalizeForCompare(candidatePath);
  const root = normalizeForCompare(rootPath);
  return candidate === root || candidate.startsWith(`${root}/`);
}

export function isSafeExternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafePythonCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed || SHELL_METACHARACTERS.test(trimmed)) {
    return false;
  }

  const executableName = crossPlatformBasename(trimmed).toLowerCase();
  if (DANGEROUS_EXECUTABLE_NAMES.has(executableName)) {
    return false;
  }

  return PYTHON_EXECUTABLE_NAME.test(executableName);
}

// File extensions the OS shell would launch/execute (or run as a script)
// rather than open in a viewer. `app:open-path` only ever opens generated
// media or documents, so refusing these stops a renderer-supplied path - even
// one inside an allowed root, e.g. `Downloads\tool.exe` - from being executed
// via shell.openPath.
const DANGEROUS_OPEN_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl', '.reg',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta',
  '.lnk', '.url', '.jar', '.msc', '.gadget', '.sh', '.command', '.app',
]);

export function isExecutablePath(filePath: string) {
  const name = crossPlatformBasename(filePath).toLowerCase();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }
  return DANGEROUS_OPEN_EXTENSIONS.has(name.slice(dotIndex));
}

export function isAllowedStoreKey(key: string) {
  return ALLOWED_STORE_KEYS.has(key);
}

// A Windows drive-absolute path ("C:\\...", "D:/..."). On the Linux CI runner
// Node's POSIX `path.isAbsolute` reports these as relative, so detect them
// explicitly; otherwise legitimate Windows export targets would be rejected.
const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;

function isAbsoluteDestination(destinationPath: string) {
  return path.isAbsolute(destinationPath) || WINDOWS_DRIVE_ABSOLUTE.test(destinationPath);
}

export function resolveSafeExportDestination(destinationPath: string, allowedRoots: string[]) {
  if (!isAbsoluteDestination(destinationPath)) {
    return null;
  }

  const resolvedDestination = path.resolve(destinationPath);
  const isAllowed = allowedRoots.some((root) => isPathInsideRoot(resolvedDestination, root));
  return isAllowed ? resolvedDestination : null;
}

export function toSafeRendererError(error: unknown, fallbackMessage = 'Request failed') {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'BACKEND_DOWN'
  ) {
    return 'The AI backend is not running. Please restart the app or start the backend manually from Settings.';
  }

  return fallbackMessage;
}
