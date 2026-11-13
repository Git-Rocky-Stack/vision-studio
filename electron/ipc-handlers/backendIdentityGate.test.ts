import { afterEach, describe, expect, it, vi } from 'vitest';

const verifier = vi.hoisted(() => ({ impl: undefined as undefined | (() => boolean) }));

vi.mock('../services/backend', () => ({
  get isBackendIdentityVerified() {
    return verifier.impl;
  },
}));

const { assertBackendIdentityVerified, isBackendIdentityVerified } = await import('./backendIdentityGate');

afterEach(() => {
  verifier.impl = undefined;
});

describe('backend identity gate', () => {
  it('fails closed when the verifier is missing or throws', () => {
    expect(isBackendIdentityVerified()).toBe(false);
    verifier.impl = () => {
      throw new Error('boom');
    };
    expect(isBackendIdentityVerified()).toBe(false);
  });

  it('follows the K1 verifier', () => {
    verifier.impl = () => false;
    expect(() => assertBackendIdentityVerified()).toThrow(/identity has not been verified/);
    verifier.impl = () => true;
    expect(isBackendIdentityVerified()).toBe(true);
    expect(() => assertBackendIdentityVerified()).not.toThrow();
  });

  it('tags the refusal so requestBackend never retries it', () => {
    verifier.impl = () => false;
    try {
      assertBackendIdentityVerified();
    } catch (error) {
      expect((error as { code?: string }).code).toBe('BACKEND_UNVERIFIED');
    }
  });
});
