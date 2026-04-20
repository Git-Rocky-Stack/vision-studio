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
