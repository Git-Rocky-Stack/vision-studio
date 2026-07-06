/**
 * Pure routing of backend WebSocket messages to renderer IPC channels (#33).
 * Socket-free so the channel contract stays unit-testable.
 */

type SendToRenderer = (channel: string, payload: unknown) => void;

const CHANNEL_BY_TYPE: Record<string, string> = {
  job_update: 'generation:progress',
  step_image: 'generation:step-image',
};

export function routeBackendWsMessage(raw: string, send: SendToRenderer): void {
  let message: { type?: unknown };
  try {
    message = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse WebSocket message:', e);
    return;
  }

  const channel =
    typeof message?.type === 'string' ? CHANNEL_BY_TYPE[message.type] : undefined;
  if (channel) {
    send(channel, message);
  }
}
