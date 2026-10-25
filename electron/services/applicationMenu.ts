import type { Input, Menu as MenuType, MenuItemConstructorOptions } from 'electron';

/**
 * Packaged-build application menu.
 *
 * The window uses titleBarStyle 'hidden', so Electron's default menu is never
 * seen - but its accelerators stay live: Ctrl/Cmd+R reloads the renderer and
 * drops every bit of in-memory state mid-generation, Ctrl+Shift+I opens
 * DevTools, F11 toggles fullscreen, Ctrl +/-/0 zoom the page. In packaged
 * builds the default menu is replaced with one that keeps only what the app
 * genuinely needs: the standard Edit roles (text fields rely on them for
 * undo / copy / paste, on macOS they do not work without the menu), the macOS
 * app menu (about / hide / quit) and the window roles. There is no View menu,
 * so reload, forceReload, toggleDevTools, fullscreen and zoom are gone.
 * Development keeps Electron's default menu.
 */

type MenuPlatform = NodeJS.Platform;

export function buildPackagedMenuTemplate({
  platform,
  appName,
}: {
  platform: MenuPlatform;
  appName: string;
}): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin';

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: isMac
      ? [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ]
      : [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' },
        ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    submenu: isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }],
  };

  if (!isMac) {
    return [editMenu, windowMenu];
  }

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  return [appMenu, editMenu, windowMenu];
}

type ShortcutInput = Pick<Input, 'type' | 'key' | 'control' | 'meta' | 'shift' | 'alt'>;

/**
 * Belt and braces for packaged builds: reload and DevTools shortcuts that a
 * menu change alone does not cover (F5, F12, and any accelerator Chromium
 * handles before the menu). Swallowed in `before-input-event`.
 */
export function isBlockedPackagedShortcut(input: ShortcutInput, platform: MenuPlatform): boolean {
  if (input.type !== 'keyDown') {
    return false;
  }
  const key = input.key.toLowerCase();
  const isMac = platform === 'darwin';
  // Ctrl+Alt is AltGr on many Windows / Linux layouts (AltGr+C types a
  // character in Polish, for one), so an Alt-modified chord is never treated
  // as a command there.
  const command = isMac ? input.meta : input.control && !input.alt;
  if (key === 'f5' || key === 'f12') {
    return true;
  }
  if (command && key === 'r') {
    return true;
  }
  // DevTools: Cmd+Alt+I / J / C on macOS, Ctrl+Shift+I / J / C elsewhere.
  const devToolsChord = isMac ? input.alt : input.shift;
  return Boolean(command && devToolsChord && (key === 'i' || key === 'j' || key === 'c'));
}

export function installApplicationMenu({
  Menu,
  isPackaged,
  platform,
  appName,
}: {
  Menu: Pick<typeof MenuType, 'buildFromTemplate' | 'setApplicationMenu'>;
  isPackaged: boolean;
  platform: MenuPlatform;
  appName: string;
}): boolean {
  if (!isPackaged) {
    return false;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildPackagedMenuTemplate({ platform, appName })));
  return true;
}
