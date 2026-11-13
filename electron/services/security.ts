import { resolveWithinRoots, type ContainmentOptions } from './pathSafety';

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
  // UNC shares ("\\server\share", "//server/share") and Win32 device /
  // namespace paths ("\\?\", "\\.\") would make the main process load and run
  // an executable from the network or a raw device. A Python interpreter is
  // always a plain local file.
  const isUncOrDevicePath = /^[\\/]{2}/.test(trimmed);
  if (!trimmed || isUncOrDevicePath || SHELL_METACHARACTERS.test(trimmed)) {
    return false;
  }

  const executableName = crossPlatformBasename(trimmed).toLowerCase();
  if (DANGEROUS_EXECUTABLE_NAMES.has(executableName)) {
    return false;
  }

  return PYTHON_EXECUTABLE_NAME.test(executableName);
}

/**
 * File types `app:open-path` may hand to the OS shell: the media the app
 * generates or imports, and plain documents. An allow-list, not a block-list:
 * shell.openPath launches whatever the OS associates with an extension, so an
 * unlisted type (a script, a shortcut, an installer, an extension the
 * block-list never anticipated) is refused rather than executed.
 */
export const OPENABLE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif', '.heic',
  // Video
  '.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi',
  // Audio
  '.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac',
  // Documents
  '.pdf', '.txt', '.json', '.md',
]);

/** True for a directory, or a file whose extension is on the open allow-list. */
export function isOpenablePath(filePath: string, isDirectory: boolean) {
  if (isDirectory) {
    return true;
  }
  const name = crossPlatformBasename(filePath).toLowerCase();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }
  return OPENABLE_FILE_EXTENSIONS.has(name.slice(dotIndex));
}

/**
 * Canonical (forward-slash) destination when `destinationPath` is absolute,
 * well-formed and inside one of `allowedRoots` (lexically and after realpath),
 * else null. Shares its containment rules with managed assets (pathSafety.ts).
 */
export function resolveSafeExportDestination(
  destinationPath: string,
  allowedRoots: string[],
  options: ContainmentOptions = {},
) {
  if (typeof destinationPath !== 'string') {
    return null;
  }
  return resolveWithinRoots(destinationPath, allowedRoots, options);
}

export function toSafeRendererError(error: unknown, fallbackMessage = 'Request failed') {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === 'BACKEND_DOWN') {
    return 'The AI backend is not running. Please restart the app or start the backend manually from Settings.';
  }
  if (code === 'BACKEND_UNVERIFIED') {
    return 'The AI backend is still starting (its identity has not been verified yet). Try again in a moment.';
  }

  return fallbackMessage;
}
