import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Which frames may call the main process over IPC.
 *
 * Only the app's own top-level renderer page is trusted: the packaged
 * `file://.../dist/index.html` entry, or the Vite dev server origin in
 * development. An iframe, a navigated-away page, or any other origin that
 * somehow gained the preload is refused before a handler runs.
 */

/** The parts of Electron's WebFrameMain the policy reads. */
export interface IpcSenderFrame {
  url: string;
  parent: unknown;
}

export interface IpcSenderEvent {
  senderFrame?: IpcSenderFrame | null;
}

export interface TrustedRendererLocation {
  /** VITE_DEV_SERVER_URL in development; absent in packaged / preview runs. */
  devServerUrl?: string;
  /** Absolute path of the packaged renderer entry (dist/index.html). */
  rendererEntryFile?: string;
  /** Host platform; win32 compares file paths case-insensitively. */
  platform?: NodeJS.Platform;
}

function sameFilePath(left: string, right: string, platform: NodeJS.Platform) {
  const flavor = platform === 'win32' ? path.win32 : path.posix;
  const a = flavor.resolve(left);
  const b = flavor.resolve(right);
  return platform === 'win32' || platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * file: URL -> local path for the given platform, without the host's
 * url.fileURLToPath (whose separator rules follow the host OS). A file URL
 * with a host (a UNC share) is never the app entry and maps to null.
 */
function fileUrlToLocalPath(parsed: URL, platform: NodeJS.Platform): string | null {
  if (parsed.host && parsed.host !== 'localhost') {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }
  if (platform === 'win32') {
    if (!/^\/[A-Za-z]:\//.test(decoded)) {
      return null;
    }
    return decoded.slice(1).replace(/\//g, '\\');
  }
  return decoded;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isTrustedRendererUrl(url: string, location: TrustedRendererLocation): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (location.devServerUrl) {
    const devOrigin = originOf(location.devServerUrl);
    if (devOrigin && devOrigin !== 'null' && parsed.origin === devOrigin) {
      return true;
    }
  }

  if (parsed.protocol === 'file:' && location.rendererEntryFile) {
    const platform = location.platform ?? process.platform;
    // pathname excludes the hash/query a router may append; only the document matters.
    const framePath = fileUrlToLocalPath(parsed, platform);
    return framePath !== null && sameFilePath(framePath, location.rendererEntryFile, platform);
  }

  return false;
}

/** True only for the app's own top-level frame at a trusted location. */
export function isTrustedIpcSender(event: IpcSenderEvent, location: TrustedRendererLocation): boolean {
  const frame = event?.senderFrame;
  if (!frame || typeof frame.url !== 'string') {
    return false;
  }
  if (frame.parent !== null) {
    return false;
  }
  return isTrustedRendererUrl(frame.url, location);
}

let configuredLocation: TrustedRendererLocation | null = null;

/**
 * Pin the trusted renderer location. The main process may call this once it
 * knows the load target; until then the default (below) applies.
 */
export function configureTrustedRendererLocation(location: TrustedRendererLocation | null): void {
  configuredLocation = location;
}

/**
 * Default location, mirroring mainWindow.ts resolveRendererLoadTarget: the dev
 * server when VITE_DEV_SERVER_URL is set, else `<bundle dir>/../dist/index.html`.
 * `bundleDir` is the directory of the running main bundle (dist-electron, inside
 * app.asar when packaged) - the same `dirname` main.ts hands mainWindow.ts.
 */
export function resolveDefaultRendererLocation(
  bundleDir: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): TrustedRendererLocation {
  const flavor = platform === 'win32' ? path.win32 : path.posix;
  return {
    devServerUrl: env.VITE_DEV_SERVER_URL || undefined,
    rendererEntryFile: flavor.join(bundleDir, '..', 'dist', 'index.html'),
    platform,
  };
}

function runningBundleDir(): string {
  // Built as a plain path (not `new URL('..', import.meta.url)`), so the
  // bundler never mistakes it for an asset reference to emit.
  return path.dirname(fileURLToPath(import.meta.url));
}

export function getTrustedRendererLocation(): TrustedRendererLocation {
  if (!configuredLocation) {
    configuredLocation = resolveDefaultRendererLocation(runningBundleDir());
  }
  return configuredLocation;
}

/** The default sender check every contract handler uses. */
export function isAppRendererSender(event: IpcSenderEvent): boolean {
  return isTrustedIpcSender(event, getTrustedRendererLocation());
}
