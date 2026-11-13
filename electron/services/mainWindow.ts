import { join } from 'path';
import type {
  BrowserWindow as BrowserWindowInstance,
  BrowserWindowConstructorOptions,
  RenderProcessGoneDetails,
  Session,
  WebContents,
} from 'electron';
import { isBlockedPackagedShortcut } from './applicationMenu';

type BrowserWindowConstructor = new (options: BrowserWindowConstructorOptions) => BrowserWindowInstance;

type RendererLoadTarget =
  | { kind: 'url'; value: string }
  | { kind: 'file'; value: string };

type Logger = Pick<Console, 'error' | 'warn'>;

/** Renderer crashes tolerated inside the window before giving up on automatic reloads. */
export const RENDERER_CRASH_LIMIT = 3;
export const RENDERER_CRASH_WINDOW_MS = 60_000;

type MainWindowServiceOptions = {
  BrowserWindow: BrowserWindowConstructor;
  dirname: string;
  devServerUrl?: string;
  onReadyToShow?: () => void | Promise<void>;
  /**
   * Packaged builds: swallow reload / DevTools shortcuts before the page sees
   * them (see applicationMenu.ts). A reload drops all renderer state.
   */
  blockReloadShortcuts?: boolean;
  platform?: NodeJS.Platform;
  /**
   * Synchronous fast path for closing: true lets the window close at once
   * (nothing to lose, or the user already confirmed). Without it every close
   * goes through `confirmClose`.
   */
  canCloseImmediately?: () => boolean;
  /**
   * Asked before the window closes when `canCloseImmediately` is false - by
   * any path: the caption button, Alt+F4, the menu, or app quit. Resolve
   * false to keep the window open.
   */
  confirmClose?: () => Promise<boolean>;
  /** The renderer crashed more than RENDERER_CRASH_LIMIT times within the window. */
  onRendererCrashLoop?: (details: RenderProcessGoneDetails) => void;
  logger?: Logger;
  now?: () => number;
};

export function createBrowserWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      // Not the chassis colour: the strip sits over the right end of the
      // header, whose top edge is lit 4% above the void (Header.tsx).
      color: '#0a0a0a',
      symbolColor: '#e5e5e5',
      height: 56,
    },
    // Painted before the renderer's first frame: the void token, true black.
    backgroundColor: '#000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: true,
  };
}

export function resolveRendererLoadTarget({
  dirname: electronDirname,
  devServerUrl,
}: {
  dirname: string;
  devServerUrl?: string;
}): RendererLoadTarget {
  if (devServerUrl) {
    return { kind: 'url', value: devServerUrl };
  }

  return { kind: 'file', value: join(electronDirname, '../dist/index.html') };
}

/**
 * Permissions the renderer legitimately uses: `clipboard-sanitized-write`
 * backs navigator.clipboard.writeText / write (copy prompt, copy image) and
 * `notifications` covers web notifications. Everything else (camera,
 * microphone, geolocation, MIDI, HID, serial, USB, file system, ...) is denied.
 */
export const ALLOWED_RENDERER_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-sanitized-write',
  'notifications',
]);

/** The app's own renderer: the packaged file:// bundle or, in development, the Vite origin. */
export function isTrustedRendererUrl(url: string | undefined, devServerUrl?: string): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') {
      return true;
    }
    return Boolean(devServerUrl) && parsed.origin === new URL(devServerUrl!).origin;
  } catch {
    return false;
  }
}

export function isPermissionAllowed(permission: string, requestingUrl: string | undefined, devServerUrl?: string) {
  return ALLOWED_RENDERER_PERMISSIONS.has(permission) && isTrustedRendererUrl(requestingUrl, devServerUrl);
}

/**
 * Deny-by-default permission policy for a session. Both handlers are needed:
 * the request handler answers prompts (navigator.permissions requests, web
 * APIs that ask), the check handler answers synchronous capability checks.
 */
export function installSessionPermissionPolicy(
  session: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
  { devServerUrl, logger = console }: { devServerUrl?: string; logger?: Logger } = {},
): void {
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents?.getURL();
    const allowed = isPermissionAllowed(permission, requestingUrl, devServerUrl);
    if (!allowed) {
      logger.warn(`[security] Denied renderer permission request: ${permission}`);
    }
    callback(allowed);
  });

  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    isPermissionAllowed(permission, details?.requestingUrl || requestingOrigin, devServerUrl),
  );
}

type HardenableWebContents = Pick<WebContents, 'setWindowOpenHandler'> & {
  on(event: 'will-attach-webview', listener: (event: { preventDefault: () => void }) => void): unknown;
  on(event: 'will-navigate', listener: (event: { preventDefault: () => void }) => void): unknown;
};

/**
 * Applied to every webContents the app creates (app 'web-contents-created'):
 * no <webview> attachment, no window.open popups, no navigation away from the
 * bundled renderer. External links go through the vetted app:open-external IPC.
 */
export function hardenWebContents(contents: HardenableWebContents, logger: Logger = console): void {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    logger.warn('[security] Blocked a <webview> attachment.');
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

export function createMainWindowService({
  BrowserWindow,
  dirname: electronDirname,
  devServerUrl,
  onReadyToShow,
  blockReloadShortcuts = false,
  platform = process.platform,
  canCloseImmediately,
  confirmClose,
  onRendererCrashLoop,
  logger = console,
  now = Date.now,
}: MainWindowServiceOptions) {
  let mainWindow: BrowserWindowInstance | null = null;
  let rendererCrashes: number[] = [];

  const target = resolveRendererLoadTarget({
    dirname: electronDirname,
    devServerUrl,
  });

  function loadRenderer(window: BrowserWindowInstance) {
    const load = target.kind === 'url'
      ? window.loadURL(target.value)
      : window.loadFile(target.value);
    void Promise.resolve(load).catch((error: unknown) => {
      logger.error('Failed to load the renderer:', error);
    });
  }

  /** Reload after a crash-loop notice; the crash budget starts over. */
  function reloadRenderer() {
    rendererCrashes = [];
    if (mainWindow && !mainWindow.isDestroyed()) {
      loadRenderer(mainWindow);
    }
  }

  function createWindow() {
    const window = new BrowserWindow(
      createBrowserWindowOptions(join(electronDirname, 'preload.cjs'))
    );
    mainWindow = window;
    rendererCrashes = [];

    loadRenderer(window);
    if (target.kind === 'url') {
      window.webContents.openDevTools();
    }

    hardenWebContents(window.webContents, logger);

    if (blockReloadShortcuts) {
      window.webContents.on('before-input-event', (event, input) => {
        if (isBlockedPackagedShortcut(input, platform)) {
          event.preventDefault();
        }
      });
    }

    window.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') {
        return;
      }
      logger.error(`Renderer process gone (${details.reason}, exit code ${details.exitCode}).`);
      if (window.isDestroyed()) {
        return;
      }

      const at = now();
      rendererCrashes = [...rendererCrashes.filter((crashAt) => at - crashAt < RENDERER_CRASH_WINDOW_MS), at];
      if (rendererCrashes.length > RENDERER_CRASH_LIMIT) {
        onRendererCrashLoop?.(details);
        return;
      }
      loadRenderer(window);
    });

    let closeApproved = false;
    let closeCheckInFlight = false;
    window.on('close', (event) => {
      if (closeApproved || !confirmClose || canCloseImmediately?.()) {
        return;
      }
      // 'close' must be cancelled synchronously; the decision comes later.
      event.preventDefault();
      if (closeCheckInFlight) {
        return;
      }
      closeCheckInFlight = true;
      void confirmClose()
        .catch((error: unknown) => {
          // A failed check must never trap the user in the app.
          logger.error('Close confirmation failed; closing anyway:', error);
          return true;
        })
        .then((confirmed) => {
          closeCheckInFlight = false;
          if (!confirmed || window.isDestroyed()) {
            return;
          }
          closeApproved = true;
          window.close();
        });
    });

    window.once('ready-to-show', () => {
      void onReadyToShow?.();
    });

    window.on('closed', () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
    });

    return window;
  }

  /** Second-instance launch: bring the existing window to the front. */
  function focusWindow(): boolean {
    const window = mainWindow;
    if (!window || window.isDestroyed()) {
      return false;
    }
    if (window.isMinimized()) {
      window.restore();
    }
    if (!window.isVisible()) {
      window.show();
    }
    window.focus();
    return true;
  }

  return {
    createWindow,
    getWindow: () => mainWindow,
    focusWindow,
    reloadRenderer,
  };
}
