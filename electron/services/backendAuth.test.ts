import { beforeEach, describe, expect, it } from 'vitest';

import {
  BACKEND_AUTH_HEADER,
  BACKEND_AUTH_TOKEN,
  getBackendAuthToken,
  backendAuthHeaders,
  setHfToken,
  hfTokenHeaders,
  setCivitaiToken,
  civitaiTokenHeaders,
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

describe('CivitAI token holder', () => {
  beforeEach(() => {
    // Reset the process-local token before each assertion so tests are isolated.
    setCivitaiToken(undefined);
  });

  it('emits the X-Civitai-Token header after setCivitaiToken', () => {
    setCivitaiToken('civ_abc');
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_abc' });
  });

  it('trims surrounding whitespace from the token', () => {
    setCivitaiToken('  civ_x  ');
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_x' });
  });

  it('clears the token on empty, whitespace-only, or undefined input', () => {
    setCivitaiToken('civ_abc');
    setCivitaiToken('');
    expect(civitaiTokenHeaders()).toEqual({});

    setCivitaiToken('civ_abc');
    setCivitaiToken('   ');
    expect(civitaiTokenHeaders()).toEqual({});

    setCivitaiToken('civ_abc');
    setCivitaiToken(undefined);
    expect(civitaiTokenHeaders()).toEqual({});
  });

  it('does not cross-contaminate the HF token holder', () => {
    setHfToken('hf_abc');
    setCivitaiToken('civ_abc');
    expect(hfTokenHeaders()).toEqual({ 'X-HF-Token': 'hf_abc' });
    expect(civitaiTokenHeaders()).toEqual({ 'X-Civitai-Token': 'civ_abc' });
    setHfToken(undefined);
  });
});
