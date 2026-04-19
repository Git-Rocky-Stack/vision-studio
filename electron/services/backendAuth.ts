import { randomBytes } from 'crypto';

export const BACKEND_AUTH_HEADER = 'x-vision-studio-token';
export const BACKEND_AUTH_TOKEN =
  process.env.VISION_STUDIO_BACKEND_AUTH_TOKEN || randomBytes(32).toString('hex');

export function backendAuthHeaders() {
  return {
    [BACKEND_AUTH_HEADER]: BACKEND_AUTH_TOKEN,
  };
}
