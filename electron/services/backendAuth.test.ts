import { describe, expect, it } from 'vitest';

import { BACKEND_AUTH_HEADER, BACKEND_AUTH_TOKEN, backendAuthHeaders } from './backendAuth';

describe('backend auth helpers', () => {
  it('creates a process-local backend auth token header', () => {
    expect(BACKEND_AUTH_TOKEN.length).toBeGreaterThan(16);
    expect(backendAuthHeaders()).toEqual({
      [BACKEND_AUTH_HEADER]: BACKEND_AUTH_TOKEN,
    });
  });
});
