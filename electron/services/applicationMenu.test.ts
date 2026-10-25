import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildPackagedMenuTemplate, installApplicationMenu, isBlockedPackagedShortcut } from './applicationMenu';

function roles(template: MenuItemConstructorOptions[]): string[] {
  return template.flatMap((item) => [
    ...(item.role ? [item.role] : []),
    ...(Array.isArray(item.submenu) ? roles(item.submenu) : []),
  ]);
}

const FORBIDDEN_ROLES = ['reload', 'forceReload', 'toggleDevTools', 'togglefullscreen', 'zoomIn', 'zoomOut', 'resetZoom'];

describe('buildPackagedMenuTemplate', () => {
  it.each(['darwin', 'win32', 'linux'] as const)('keeps the Edit roles text fields need on %s', (platform) => {
    const present = roles(buildPackagedMenuTemplate({ platform, appName: 'Vision Studio' }));
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
      expect(present).toContain(role);
    }
  });

  it.each(['darwin', 'win32', 'linux'] as const)('omits reload, DevTools, fullscreen and zoom on %s', (platform) => {
    const present = roles(buildPackagedMenuTemplate({ platform, appName: 'Vision Studio' }));
    for (const role of FORBIDDEN_ROLES) {
      expect(present).not.toContain(role);
    }
  });

  it('adds the macOS app menu and window roles', () => {
    const template = buildPackagedMenuTemplate({ platform: 'darwin', appName: 'Vision Studio' });
    expect(template[0].label).toBe('Vision Studio');
    const present = roles(template);
    for (const role of ['about', 'hide', 'quit', 'minimize', 'front']) {
      expect(present).toContain(role);
    }
  });

  it('has no app menu off macOS', () => {
    const template = buildPackagedMenuTemplate({ platform: 'win32', appName: 'Vision Studio' });
    expect(template.map((item) => item.label)).toEqual(['Edit', 'Window']);
  });
});

describe('installApplicationMenu', () => {
  it('replaces the default menu only in packaged builds', () => {
    const Menu = { buildFromTemplate: vi.fn(() => ({}) as never), setApplicationMenu: vi.fn() };

    expect(installApplicationMenu({ Menu, isPackaged: false, platform: 'win32', appName: 'Vision Studio' })).toBe(false);
    expect(Menu.setApplicationMenu).not.toHaveBeenCalled();

    expect(installApplicationMenu({ Menu, isPackaged: true, platform: 'win32', appName: 'Vision Studio' })).toBe(true);
    expect(Menu.setApplicationMenu).toHaveBeenCalledOnce();
  });
});

describe('isBlockedPackagedShortcut', () => {
  const key = (k: string, mods: Partial<{ control: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) => ({
    type: 'keyDown' as const,
    key: k,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...mods,
  });

  it('blocks reload and DevTools chords', () => {
    expect(isBlockedPackagedShortcut(key('r', { control: true }), 'win32')).toBe(true);
    expect(isBlockedPackagedShortcut(key('R', { control: true, shift: true }), 'linux')).toBe(true);
    expect(isBlockedPackagedShortcut(key('F5'), 'win32')).toBe(true);
    expect(isBlockedPackagedShortcut(key('I', { control: true, shift: true }), 'win32')).toBe(true);
    expect(isBlockedPackagedShortcut(key('r', { meta: true }), 'darwin')).toBe(true);
    expect(isBlockedPackagedShortcut(key('i', { meta: true, alt: true }), 'darwin')).toBe(true);
  });

  it('leaves editing shortcuts and AltGr characters alone', () => {
    expect(isBlockedPackagedShortcut(key('c', { control: true }), 'win32')).toBe(false);
    expect(isBlockedPackagedShortcut(key('v', { meta: true }), 'darwin')).toBe(false);
    // AltGr arrives as Ctrl+Alt on Windows: AltGr+C types a character in Polish.
    expect(isBlockedPackagedShortcut(key('c', { control: true, alt: true }), 'win32')).toBe(false);
    expect(isBlockedPackagedShortcut(key('r'), 'win32')).toBe(false);
    expect(isBlockedPackagedShortcut({ ...key('r', { control: true }), type: 'keyUp' }, 'win32')).toBe(false);
  });
});
