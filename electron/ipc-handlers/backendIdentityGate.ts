import { isBackendIdentityVerified as verifyBackendIdentity } from '../services/backend';
import { BACKEND_UNVERIFIED_CODE, BACKEND_UNVERIFIED_MESSAGE } from './backendRequest';

/**
 * Gate for every token-bearing call to the local backend.
 *
 * Port 8000 is a well-known loopback port: until the K1 handshake has proved
 * the listener holds this session's token (electron/services/backend.ts
 * `isBackendIdentityVerified()`), anything bound there could be an impostor,
 * and sending it the session token, a Hugging Face token or a CivitAI token
 * would hand them over.
 *
 * Fails closed: a verifier that throws counts as unverified.
 */

export function isBackendIdentityVerified(): boolean {
  try {
    return verifyBackendIdentity() === true;
  } catch {
    return false;
  }
}

/** Error thrown instead of sending a token to an unverified backend. */
export function createBackendUnverifiedError(): Error {
  const error = new Error(BACKEND_UNVERIFIED_MESSAGE);
  (error as { code?: string }).code = BACKEND_UNVERIFIED_CODE;
  return error;
}

/** Throw unless the backend's identity is verified. */
export function assertBackendIdentityVerified(): void {
  if (!isBackendIdentityVerified()) {
    throw createBackendUnverifiedError();
  }
}
