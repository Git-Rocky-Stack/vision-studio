import { describe, expect, it } from 'vitest';
import type { ModelStatus } from './model';

describe('ModelStatus (M2 extended vocabulary)', () => {
  it('accepts the four new lifecycle values', () => {
    const queued: ModelStatus = 'queued';
    const verifying: ModelStatus = 'verifying';
    const paused: ModelStatus = 'paused';
    const cancelled: ModelStatus = 'cancelled';
    expect([queued, verifying, paused, cancelled]).toHaveLength(4);
  });

  it('still accepts the original four', () => {
    const values: ModelStatus[] = ['ready', 'downloading', 'error', 'not_found'];
    expect(values).toHaveLength(4);
  });
});
