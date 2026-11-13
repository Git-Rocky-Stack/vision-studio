import type { IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';

import {
  IPC_CONTRACT,
  type IpcChannel,
  type IpcParsedArgs,
  type IpcResult,
} from '../../shared/ipcContract';
import type { IpcEnvelope, IpcErrorCode } from '../../shared/ipcTypes';
import { describeBackendError } from './backendRequest';
import { isAppRendererSender, type IpcSenderEvent } from './ipcSenderPolicy';

/**
 * The one way the main process registers an invoke handler.
 *
 * Every listener registered through here:
 *   1. refuses any sender other than the app's own top-level frame;
 *   2. parses its positional args with the channel's zod schema from
 *      shared/ipcContract.ts, so a handler only ever sees well-typed input;
 *   3. answers with an IpcEnvelope - `{ ok: true, data }`, or
 *      `{ ok: false, error: { code, message } }` for a refused sender, invalid
 *      input or a thrown handler - which the preload unwraps;
 *   4. logs a failure as one sanitized line (describeBackendError), never the
 *      raw error object, whose axios `config.headers` carry the backend token.
 *
 * ipc-guard.ts refuses to register any listener that did not come from here.
 */

/** Marks listeners built by handleIpc; ipc-guard.ts checks for it. */
export const IPC_CONTRACT_LISTENER = Symbol.for('vision-studio.ipc-contract-listener');

export type IpcHandler<C extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IpcParsedArgs<C>
) => IpcResult<C> | Promise<IpcResult<C>>;

type IpcListener = ((event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcEnvelope<unknown>>) & {
  [IPC_CONTRACT_LISTENER]?: true;
};

export interface IpcMainLike {
  handle: (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => void;
}

export interface HandleIpcOptions {
  /** Whether the invoking frame may use the bridge. Default: the app's own renderer page only. */
  isTrustedSender?: (event: IpcSenderEvent) => boolean;
  logger?: Pick<Console, 'warn' | 'error'>;
}

/** Collapse zod issues into one short, renderer-safe line (paths only, no values). */
export function formatRequestIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, 5).map((issue) => {
    const where = issue.path.length > 0 ? `arg ${issue.path.map(String).join('.')}` : 'args';
    return `${where}: ${issue.message}`;
  });
  const more = error.issues.length > 5 ? ` (+${error.issues.length - 5} more)` : '';
  return `${issues.join('; ')}${more}`;
}

function failure(code: IpcErrorCode, message: string): IpcEnvelope<never> {
  return { ok: false, error: { code, message } };
}

export function createIpcListener<C extends IpcChannel>(
  channel: C,
  handler: IpcHandler<C>,
  { isTrustedSender = isAppRendererSender, logger = console }: HandleIpcOptions = {},
): IpcListener {
  const schema = IPC_CONTRACT[channel].request as z.ZodType;

  const listener: IpcListener = async (event, ...args) => {
    if (!isTrustedSender(event as unknown as IpcSenderEvent)) {
      const url = (event as unknown as IpcSenderEvent)?.senderFrame?.url ?? '<no frame>';
      logger.warn(`[ipc] Refused "${channel}" from an untrusted frame: ${url}`);
      return failure('FORBIDDEN_SENDER', 'This window is not allowed to call the app.');
    }

    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      const message = `Invalid request for "${channel}": ${formatRequestIssues(parsed.error)}`;
      logger.warn(`[ipc] ${message}`);
      return failure('INVALID_REQUEST', message);
    }

    try {
      const data = await handler(event, ...(parsed.data as IpcParsedArgs<C>));
      return { ok: true, data };
    } catch (error) {
      const message = describeBackendError(error);
      logger.error(`[ipc] "${channel}" failed: ${message}`);
      return failure('HANDLER_ERROR', error instanceof Error && error.message ? error.message : 'Request failed');
    }
  };
  listener[IPC_CONTRACT_LISTENER] = true;
  return listener;
}

/** Register `handler` for `channel` on `ipcMain` through the contract wrapper. */
export function handleIpc<C extends IpcChannel>(
  ipcMain: IpcMainLike,
  channel: C,
  handler: IpcHandler<C>,
  options: HandleIpcOptions = {},
): void {
  ipcMain.handle(channel, createIpcListener(channel, handler, options));
}

export function isContractListener(listener: unknown): boolean {
  return typeof listener === 'function' && Reflect.get(listener, IPC_CONTRACT_LISTENER) === true;
}
