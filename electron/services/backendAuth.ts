import { randomBytes } from 'crypto';

export const BACKEND_AUTH_HEADER = 'x-vision-studio-token';

/**
 * Shared authentication token for the local Python backend.
 *
 * Resolution order:
 * 1. VISION_STUDIO_BACKEND_AUTH_TOKEN env var (required in production)
 * 2. Random 32-byte hex token (development fallback)
 *
 * The token is generated once at module load and remains stable for the
 * entire app session. It is passed to the Python backend process via
 * environment variable when the app spawns it, so both sides share the
 * same token for the session. A new token is generated on each app launch.
 */
let _token: string | undefined;

export function getBackendAuthToken(): string {
  if (!_token) {
    _token = process.env.VISION_STUDIO_BACKEND_AUTH_TOKEN || randomBytes(32).toString('hex');
  }
  return _token;
}

/** @deprecated Use getBackendAuthToken() for explicit initialization. */
export const BACKEND_AUTH_TOKEN = getBackendAuthToken();

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
