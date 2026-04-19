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

  const executableName = path.basename(trimmed).toLowerCase();
  if (DANGEROUS_EXECUTABLE_NAMES.has(executableName)) {
    return false;
  }

  return PYTHON_EXECUTABLE_NAME.test(executableName);
}

export function isAllowedStoreKey(key: string) {
  return ALLOWED_STORE_KEYS.has(key);
}

export function resolveSafeExportDestination(destinationPath: string, allowedRoots: string[]) {
  if (!path.isAbsolute(destinationPath)) {
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
