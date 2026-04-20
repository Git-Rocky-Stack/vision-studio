import { describe, expect, it } from 'vitest';

import { BACKEND_AUTH_HEADER, BACKEND_AUTH_TOKEN, getBackendAuthToken, backendAuthHeaders } from './backendAuth';

describe('backend auth helpers', () => {
  it('creates a process-local backend auth token header', () => {
    expect(BACKEND_AUTH_TOKEN.length).toBeGreaterThan(16);
    expect(backendAuthHeaders()).toEqual({
      [BACKEND_AUTH_HEADER]: BACKEND_AUTH_TOKEN,
    });
  });

  it('getBackendAuthToken returns a stable token', () => {
    const first = getBackendAuthToken();
    const second = getBackendAuthToken();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(16);
  });
});
