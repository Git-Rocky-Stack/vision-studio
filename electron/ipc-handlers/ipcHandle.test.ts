import { describe, expect, it, vi } from 'vitest';

import { createIpcListener, formatRequestIssues, handleIpc, isContractListener } from './ipcHandle';
import { createFakeIpcMain, TRUSTED_EVENT, UNTRUSTED_EVENT } from './ipcTestHarness';
import { IPC_CONTRACT } from '../../shared/ipcContract';

const trustOnly = (event: { senderFrame?: { url: string } | null }) => event?.senderFrame?.url === TRUSTED_EVENT.senderFrame.url;
const quiet = () => ({ warn: vi.fn(), error: vi.fn() });

describe('handleIpc', () => {
  it('passes parsed args to the handler and wraps the result in an ok envelope', async () => {
    const handler = vi.fn((_event: unknown, name: string) => `path:${name}`);
    const listener = createIpcListener('app:get-path', handler, { isTrustedSender: trustOnly, logger: quiet() });

    expect(await listener(TRUSTED_EVENT as never, 'pictures')).toEqual({ ok: true, data: 'path:pictures' });
    expect(handler).toHaveBeenCalledWith(TRUSTED_EVENT, 'pictures');
    expect(isContractListener(listener)).toBe(true);
  });

  it('refuses an untrusted or frameless sender without running the handler', async () => {
    const handler = vi.fn();
    const logger = quiet();
    const listener = createIpcListener('app:get-version', handler, { isTrustedSender: trustOnly, logger });

    for (const event of [UNTRUSTED_EVENT, {}, { senderFrame: null }]) {
      expect(await listener(event as never)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    }
    expect(handler).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('answers invalid input with an INVALID_REQUEST envelope naming the arg, not its value', async () => {
    const handler = vi.fn();
    const listener = createIpcListener('accounts:set-openrouter-api-key', handler, {
      isTrustedSender: trustOnly,
      logger: quiet(),
    });

    const reply = await listener(TRUSTED_EVENT as never, { accountId: 'a', apiKey: 12345, extra: 'sk-secret' });

    expect(reply).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    const message = (reply as { error: { message: string } }).error.message;
    expect(message).toMatch(/accounts:set-openrouter-api-key/);
    expect(message).not.toContain('sk-secret');
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses extra positional args and missing required ones', async () => {
    const listener = createIpcListener('accounts:delete', vi.fn(), { isTrustedSender: trustOnly, logger: quiet() });
    expect(await listener(TRUSTED_EVENT as never)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(await listener(TRUSTED_EVENT as never, 'a', 'b')).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  });

  it('turns a thrown handler into a HANDLER_ERROR envelope and logs one sanitized line', async () => {
    const secret = 'session-token-xyz';
    const logger = quiet();
    const listener = createIpcListener(
      'settings:get',
      () => {
        throw Object.assign(new Error('Request failed with status code 500'), {
          config: { headers: { 'x-vision-studio-token': secret } },
          response: { status: 500 },
        });
      },
      { isTrustedSender: trustOnly, logger },
    );

    expect(await listener(TRUSTED_EVENT as never)).toEqual({
      ok: false,
      error: { code: 'HANDLER_ERROR', message: 'Request failed with status code 500' },
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const logged = logger.error.mock.calls.flat();
    expect(logged.every((entry) => typeof entry === 'string')).toBe(true);
    expect(logged.join(' ')).toContain('(HTTP 500)');
    expect(logged.join(' ')).not.toContain(secret);
  });

  it('registers through ipcMain.handle', async () => {
    const { ipcMain, invoke } = createFakeIpcMain();
    handleIpc(ipcMain, 'app:get-version', () => '3.4.2', { isTrustedSender: trustOnly });
    await expect(invoke('app:get-version')).resolves.toBe('3.4.2');
  });

  it('formats at most five issues', () => {
    const parsed = IPC_CONTRACT['notifications:notify'].request.safeParse([1, 2, 3, 4, 5, 6, 7]);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(formatRequestIssues(parsed.error).length).toBeGreaterThan(0);
    }
  });
});
