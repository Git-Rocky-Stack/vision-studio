import { beforeEach, describe, expect, it } from 'vitest';

import {
  BACKEND_AUTH_HEADER,
  BACKEND_AUTH_TOKEN,
  getBackendAuthToken,
  backendAuthHeaders,
  setHfToken,
  hfTokenHeaders,
} from './backendAuth';

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

describe('HF token holder', () => {
  beforeEach(() => {
    // Reset the process-local token before each assertion so tests are isolated.
    setHfToken(undefined);
  });

  it('emits the X-HF-Token header after setHfToken', () => {
    setHfToken('hf_abc');
    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_abc' });
  });

  it('trims surrounding whitespace from the token', () => {
    setHfToken('  hf_x  ');
    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_x' });
  });

  it('clears the token on empty, whitespace-only, or undefined input', () => {
    setHfToken('hf_abc');
    setHfToken('');
    expect(hfTokenHeaders()).toEqual({});

    setHfToken('hf_abc');
    setHfToken('   ');
    expect(hfTokenHeaders()).toEqual({});

    setHfToken('hf_abc');
    setHfToken(undefined);
    expect(hfTokenHeaders()).toEqual({});
  });
});
