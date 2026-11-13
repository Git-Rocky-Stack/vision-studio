import { randomBytes } from 'crypto';

export const BACKEND_AUTH_HEADER = 'x-vision-studio-token';

/**
 * Shared authentication token for the local Python backend.
 *
 * Resolution order:
 * 1. VISION_STUDIO_BACKEND_AUTH_TOKEN env var - only needed when the backend
 *    is started outside the app (external-backend mode), so both processes
 *    can be given the same value;
 * 2. otherwise a random 32-byte hex token, the normal case in production and
 *    development alike.
 *
 * The token is created on first use and stays stable for the app session.
 * When the app spawns the backend it passes the token through the child's
 * environment, so both sides share it; each launch gets a fresh token.
 */
let _token: string | undefined;

export function getBackendAuthToken(): string {
  if (!_token) {
    _token = process.env.VISION_STUDIO_BACKEND_AUTH_TOKEN || randomBytes(32).toString('hex');
  }
  return _token;
}

export function backendAuthHeaders() {
  return {
    [BACKEND_AUTH_HEADER]: getBackendAuthToken(),
  };
}

/**
 * HF token for gated/private model downloads. Held only in the main process.
 * Set via the auth:setHfToken IPC channel (the renderer never reads it back).
 * Injected per download request as the X-HF-Token header; never logged, never
 * sent on non-download requests.
 */
let _hfToken: string | undefined;

export function setHfToken(token: string | undefined): void {
  _hfToken = token && token.trim() ? token.trim() : undefined;
}

export function hfTokenHeaders(): Record<string, string> {
  return _hfToken ? { 'X-HF-Token': _hfToken } : {};
}

/**
 * CivitAI API token for authenticated downloads and NSFW-gated search.
 * Held only in the main process. Set via the auth:setCivitaiToken IPC channel
 * (the renderer never reads it back). Injected per request as the
 * X-Civitai-Token header; never logged, never sent on unrelated requests.
 */
let _civitaiToken: string | undefined;

export function setCivitaiToken(token: string | undefined): void {
  _civitaiToken = token && token.trim() ? token.trim() : undefined;
}

export function civitaiTokenHeaders(): Record<string, string> {
  return _civitaiToken ? { 'X-Civitai-Token': _civitaiToken } : {};
}
