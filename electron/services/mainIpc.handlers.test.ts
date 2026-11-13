import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerMainIpcHandlers, validateSettingsPatch } from './mainIpc';
import { createMediaImportGrants } from './mediaImportGrants';
import type { OutputRootPolicyContext } from './outputRootPolicy';
import { IPC_BRIDGE } from '../../shared/ipcContract';
import { createFakeIpcMain, TRUSTED_EVENT, UNTRUSTED_EVENT } from '../ipc-handlers/ipcTestHarness';
import type { ResolvedAppSettings, UpdaterStatus } from '../../shared/ipcTypes';

const DEFAULTS: ResolvedAppSettings = {
  theme: 'dark',
  defaultOutputPath: '',
  backendAutostart: true,
  notifyOnGenerationComplete: true,
  notifyOnGenerationFailed: true,
  notifyOnModelDownloads: true,
  autoRouteOnOverBudget: false,
  aiDirector: { enabled: true, sources: { promptHistory: true, assets: true, knowledgeBase: true } },
};

let base: string;

function setup() {
  const home = path.join(base, 'home');
  const userData = path.join(home, 'appdata', 'Vision Studio');
  const internalOutputs = path.join(userData, 'outputs');
  const desktop = path.join(home, 'Desktop');
  for (const dir of [internalOutputs, desktop]) fs.mkdirSync(dir, { recursive: true });

  const paths: Record<string, string> = {
    home,
    userData,
    desktop,
    documents: path.join(home, 'Documents'),
    downloads: path.join(home, 'Downloads'),
    pictures: path.join(home, 'Pictures'),
    videos: path.join(home, 'Videos'),
  };
  let settings: ResolvedAppSettings = { ...DEFAULTS };
  const policy: OutputRootPolicyContext = {
    homeDir: home,
    userDataPath: userData,
    platform: process.platform,
    env: {},
  };
  const dialog = {
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [] as string[] })),
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '' })),
  };
  const shell = { openExternal: vi.fn(), openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() };
  const userAccounts = {
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(async () => ({ activeAccountId: null, accounts: [] })),
    deleteAccount: vi.fn(),
    setActiveAccount: vi.fn(),
    getAccount: vi.fn(() => ({ id: 'account-1' }) as never),
    setOpenRouterApiKey: vi.fn(async () => ({ activeAccountId: null, accounts: [] })),
    clearOpenRouterApiKey: vi.fn(),
    getOpenRouterApiKey: vi.fn(async (): Promise<string | null> => 'sk-or-key'),
    markOpenRouterVerified: vi.fn(async () => ({ activeAccountId: 'account-1', accounts: [] })),
    setHuggingFaceToken: vi.fn(),
    clearHuggingFaceToken: vi.fn(),
  };
  const updater = {
    getStatus: vi.fn((): UpdaterStatus => ({ state: 'idle' })),
    check: vi.fn(async (): Promise<UpdaterStatus> => ({ state: 'idle' })),
    download: vi.fn(async (): Promise<UpdaterStatus> => ({ state: 'downloading', version: '9.9.10', percent: 0 })),
    install: vi.fn(),
  };
  const openRouter = {
    getKeyInfo: vi.fn(async () => ({ label: 'main' }) as never),
    listTextModels: vi.fn(async () => []),
    listImageModels: vi.fn(async () => []),
  };
  const store = { get: vi.fn(), set: vi.fn((_key: string, value: unknown) => { settings = value as ResolvedAppSettings; }) };
  const outputRoots = {
    getAppSettings: () => settings,
    getInternalOutputDirectory: () => internalOutputs,
    rememberOutputRoot: vi.fn(),
    resolveManagedAssetPath: (assetPath: string) => {
      const resolved = path.resolve(assetPath);
      if (resolved !== internalOutputs && !resolved.startsWith(internalOutputs + path.sep)) {
        throw new Error('Asset path is outside managed output directories');
      }
      return resolved;
    },
  };
  const backend = {
    restartIfRunning: vi.fn(async () => true),
    startOrRecover: vi.fn(async () => ({ success: true })),
    getStatus: vi.fn(async () => ({ running: true, pid: null, bundled: true })),
    getSystemInfo: vi.fn(async () => ({ gpu_available: false, comfyui_connected: false, models_count: 0 })),
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const fake = createFakeIpcMain();

  registerMainIpcHandlers({
    app: { getVersion: () => '9.9.9', getPath: (name: string) => paths[name] } as never,
    ipcMain: fake.ipcMain,
    dialog: dialog as never,
    shell: shell as never,
    Notification: Object.assign(vi.fn(() => ({ show: vi.fn() })), { isSupported: () => false }) as never,
    store: store as never,
    outputRoots,
    backend,
    userAccounts: userAccounts as never,
    openRouter,
    updater,
    getMainWindow: () => null,
    logger,
    isTrustedSender: (event) => event?.senderFrame?.url === TRUSTED_EVENT.senderFrame.url,
    outputRootPolicy: policy,
    importGrants: createMediaImportGrants(),
  });

  return { ...fake, dialog, shell, userAccounts, openRouter, updater, store, backend, logger, paths, internalOutputs, getSettings: () => settings };
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mainipc-'));
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('main IPC contract wrapper', () => {
  it('registers exactly the main-process channels the bridge exposes, and no store:* or dead channels (S2)', () => {
    const { handlers } = setup();
    const registered = [...handlers.keys()];
    for (const dead of ['store:get', 'store:set', 'store:reset', 'settings:reset', 'backend:stop', 'backend:check-bundled']) {
      expect(registered).not.toContain(dead);
    }
    const bridgeChannels = new Set(Object.values(IPC_BRIDGE).flatMap((ns) => Object.values(ns)));
    for (const channel of registered) {
      expect(bridgeChannels.has(channel as never), channel).toBe(true);
    }
  });

  it('refuses a call from a frame that is not the app page', async () => {
    const { invokeRaw, userAccounts } = setup();
    const reply = await invokeRaw('accounts:delete', UNTRUSTED_EVENT, 'account-1');
    expect(reply).toEqual({ ok: false, error: { code: 'FORBIDDEN_SENDER', message: expect.any(String) } });
    expect(userAccounts.deleteAccount).not.toHaveBeenCalled();
  });

  it('validates input: provider allow-list, string apiKey, get-path names, optional dialog options (S5)', async () => {
    const { invoke, userAccounts, dialog } = setup();

    await expect(invoke('accounts:update', 'account-1', { imageGenerationProvider: 'evil' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(invoke('accounts:update', 'account-1', { isAdmin: true })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(invoke('accounts:set-openrouter-api-key', { accountId: 'a', apiKey: 42 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(invoke('app:get-path', 'home')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(userAccounts.updateAccount).not.toHaveBeenCalled();
    expect(userAccounts.setOpenRouterApiKey).not.toHaveBeenCalled();

    await invoke('accounts:update', 'account-1', { imageGenerationProvider: 'huggingface', fallbackProvider: null });
    expect(userAccounts.updateAccount).toHaveBeenCalledWith('account-1', {
      imageGenerationProvider: 'huggingface',
      fallbackProvider: null,
    });
    await expect(invoke('app:get-path', 'pictures')).resolves.toMatch(/Pictures$/);
    await expect(invoke('dialog:save-file')).resolves.toBeNull();
    expect(dialog.showSaveDialog).toHaveBeenCalled();
  });

  it('shares one verification path for test-connection and get-key-info (S14)', async () => {
    const { invoke, openRouter, userAccounts } = setup();
    const first = await invoke('openrouter:test-connection');
    const second = await invoke('openrouter:get-key-info', 'account-1');
    expect(first).toEqual(second);
    expect(openRouter.getKeyInfo).toHaveBeenCalledTimes(2);
    expect(userAccounts.markOpenRouterVerified).toHaveBeenCalledTimes(2);

    openRouter.getKeyInfo.mockRejectedValueOnce('not an error');
    await expect(invoke('openrouter:get-key-info')).resolves.toEqual({
      success: false,
      error: 'Could not load OpenRouter key information.',
    });
  });
});

describe('OpenRouter key resolution (async secret reads)', () => {
  it('awaits the decrypted key before calling OpenRouter', async () => {
    const { invoke, openRouter, userAccounts } = setup();
    userAccounts.getOpenRouterApiKey.mockResolvedValueOnce('sk-or-decrypted');

    await invoke('openrouter:list-models', 'account-1');

    expect(userAccounts.getOpenRouterApiKey).toHaveBeenCalledWith('account-1');
    expect(openRouter.listTextModels).toHaveBeenCalledWith('sk-or-decrypted');
  });

  it('reports a missing key without calling OpenRouter', async () => {
    const { invoke, openRouter, userAccounts } = setup();
    userAccounts.getOpenRouterApiKey.mockResolvedValueOnce(null);

    await expect(invoke('openrouter:test-connection', 'account-1')).resolves.toEqual({
      success: false,
      error: 'No OpenRouter API key is stored for this account.',
    });
    expect(openRouter.getKeyInfo).not.toHaveBeenCalled();
    expect(userAccounts.markOpenRouterVerified).not.toHaveBeenCalled();
  });

  it('returns the snapshot the async verification write produced', async () => {
    const { invoke, userAccounts } = setup();
    const accounts = { activeAccountId: 'account-1', accounts: [] };
    userAccounts.markOpenRouterVerified.mockResolvedValueOnce(accounts);

    await expect(invoke('openrouter:get-key-info', 'account-1')).resolves.toEqual({
      success: true,
      keyInfo: { label: 'main' },
      accounts,
    });
  });

  it('turns a rejected account write into a handler error envelope', async () => {
    const { invoke, userAccounts } = setup();
    userAccounts.setOpenRouterApiKey.mockRejectedValueOnce(new Error('Secure storage is unavailable on this system.'));

    await expect(
      invoke('accounts:set-openrouter-api-key', { accountId: 'account-1', apiKey: 'sk-or-key' }),
    ).rejects.toMatchObject({ code: 'HANDLER_ERROR', message: 'Secure storage is unavailable on this system.' });
  });
});

describe('updater channels', () => {
  it('starts the explicit update download and answers with the downloading status', async () => {
    const { invoke, updater } = setup();

    await expect(invoke('updater:download')).resolves.toEqual({ state: 'downloading', version: '9.9.10', percent: 0 });
    expect(updater.download).toHaveBeenCalledTimes(1);
  });

  it('refuses arguments on updater:download before touching the updater', async () => {
    const { invoke, updater } = setup();

    await expect(invoke('updater:download', 'https://attacker.example/setup.exe')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(updater.download).not.toHaveBeenCalled();
  });

  it('refuses updater:download from a frame that is not the app page', async () => {
    const { invokeRaw, updater } = setup();

    await expect(invokeRaw('updater:download', UNTRUSTED_EVENT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' },
    });
    expect(updater.download).not.toHaveBeenCalled();
  });

  it('wires check and install to the same service', async () => {
    const { invoke, updater } = setup();

    await invoke('updater:check');
    await invoke('updater:install');

    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(updater.install).toHaveBeenCalledTimes(1);
  });
});

describe('settings:update (S3)', () => {
  it('refuses unknown keys, retired keys and wrong types without saving', async () => {
    const { invoke, store } = setup();
    for (const patch of [{ autoSave: true }, { pythonPath: 'cmd.exe' }, { managedOutputRoots: ['C:/'] }, { theme: 'neon' }]) {
      await expect(invoke('settings:update', patch), JSON.stringify(patch)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(store.set).not.toHaveBeenCalled();
  });

  it('refuses an output folder that is a drive root, the profile, app data or relative', async () => {
    const { invoke, paths, store } = setup();
    for (const folder of [path.parse(base).root, paths.home, paths.userData, 'relative/out']) {
      await expect(invoke('settings:update', { defaultOutputPath: folder }), folder).rejects.toMatchObject({
        code: 'HANDLER_ERROR',
      });
    }
    expect(store.set).not.toHaveBeenCalled();
  });

  it('creates and saves a valid output folder, canonicalized, and restarts the backend', async () => {
    const { invoke, backend, getSettings } = setup();
    const target = path.join(base, 'renders', 'vision');

    const result = await invoke<ResolvedAppSettings>('settings:update', { defaultOutputPath: `${target}${path.sep}` });

    expect(fs.statSync(target).isDirectory()).toBe(true);
    expect(result.defaultOutputPath).toBe(target.replace(/\\/g, '/'));
    expect(getSettings().defaultOutputPath).toBe(target.replace(/\\/g, '/'));
    expect(backend.restartIfRunning).toHaveBeenCalled();
  });

  it('refuses a folder path that is an existing file', async () => {
    const file = path.join(base, 'not-a-dir');
    fs.writeFileSync(file, 'x');
    const verdict = await validateSettingsPatch(
      { defaultOutputPath: file },
      { homeDir: path.join(base, 'home'), userDataPath: path.join(base, 'ud'), platform: process.platform, env: {} },
    );
    expect(verdict.ok).toBe(false);
  });
});

describe('assets:import-files (S7)', () => {
  it('imports only paths the file picker returned, once each', async () => {
    const { invoke, dialog, internalOutputs } = setup();
    const source = path.join(base, 'shot.png');
    fs.writeFileSync(source, 'png');
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [source] });

    const picked = await invoke<string[]>('dialog:select-media-files');
    const first = await invoke<{ success: boolean; files: unknown[] }>('assets:import-files', picked);
    const replay = await invoke<{ success: boolean; error?: string }>('assets:import-files', picked);

    expect(first.success).toBe(true);
    expect(first.files).toHaveLength(1);
    expect(fs.existsSync(path.join(internalOutputs, 'imports', 'shot.png'))).toBe(true);
    expect(replay).toMatchObject({ success: false, error: expect.stringMatching(/Import button/) });
  });

  it('refuses a renderer-chosen path and UNC paths even when picked', async () => {
    const { invoke, dialog } = setup();
    const secret = path.join(base, 'home', 'secret.png');
    fs.mkdirSync(path.dirname(secret), { recursive: true });
    fs.writeFileSync(secret, 'x');

    expect(await invoke('assets:import-files', [secret])).toMatchObject({ success: false });

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['\\\\attacker\\share\\x.png'] });
    const picked = await invoke<string[]>('dialog:select-media-files');
    expect(await invoke('assets:import-files', picked)).toMatchObject({ success: false });
  });
});

describe('app:open-path (S8)', () => {
  it('opens allow-listed media and folders, refuses other types', async () => {
    const { invoke, shell, internalOutputs } = setup();
    const image = path.join(internalOutputs, 'render.png');
    const script = path.join(internalOutputs, 'payload.html');
    fs.writeFileSync(image, 'x');
    fs.writeFileSync(script, 'x');

    expect(await invoke('app:open-path', image)).toEqual({ success: true });
    expect(await invoke('app:open-path', script)).toMatchObject({ success: false });
    expect(await invoke('app:open-path', internalOutputs + path.sep + '..' + path.sep + 'outputs')).toEqual({ success: true });
    expect(shell.openPath).toHaveBeenCalledTimes(2);
  });

  it('refuses paths outside managed and export roots', async () => {
    const { invoke, shell } = setup();
    expect(await invoke('app:open-path', path.join(base, 'home', 'appdata', 'Vision Studio', 'config.json'))).toMatchObject({
      success: false,
    });
    expect(shell.openPath).not.toHaveBeenCalled();
  });
});
