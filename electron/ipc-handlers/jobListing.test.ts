import { describe, expect, it } from 'vitest';

import { mergeJobsByCreatedAtDesc } from './jobListing';

describe('mergeJobsByCreatedAtDesc', () => {
  // Background: generation:list-jobs merges local OpenRouter jobs with
  // backend Python jobs and slices to a limit. Without sorting first,
  // a flood of local jobs would silently shadow the more recent backend
  // jobs in the user's job list.

  it('returns the most recent N jobs across both sources, newest first', () => {
    const local = [
      { job_id: 'local-old', created_at: '2026-01-01T00:00:00.000Z' },
      { job_id: 'local-mid', created_at: '2026-03-01T00:00:00.000Z' },
    ];
    const backend = [
      { job_id: 'backend-newest', created_at: '2026-04-01T00:00:00.000Z' },
      { job_id: 'backend-old', created_at: '2026-02-01T00:00:00.000Z' },
    ];

    const merged = mergeJobsByCreatedAtDesc(local, backend, 3);
    expect(merged.map((entry) => entry.job_id)).toEqual([
      'backend-newest',
      'local-mid',
      'backend-old',
    ]);
  });

  it('does not let a flood of local jobs shadow more recent backend jobs', () => {
    const local = Array.from({ length: 50 }, (_, index) => ({
      job_id: `local-${index}`,
      created_at: `2025-12-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const backend = [
      { job_id: 'backend-fresh', created_at: '2026-04-30T00:00:00.000Z' },
    ];

    const merged = mergeJobsByCreatedAtDesc(local, backend, 50);
    // The fresh backend job MUST appear in the result, even though local
    // alone already filled the limit.
    expect(merged.some((entry) => entry.job_id === 'backend-fresh')).toBe(true);
    expect(merged[0].job_id).toBe('backend-fresh');
  });

  it('respects the limit', () => {
    const local = [
      { job_id: 'a', created_at: '2026-04-01T00:00:00.000Z' },
      { job_id: 'b', created_at: '2026-03-01T00:00:00.000Z' },
    ];
    const backend = [
      { job_id: 'c', created_at: '2026-02-01T00:00:00.000Z' },
      { job_id: 'd', created_at: '2026-01-01T00:00:00.000Z' },
    ];
    expect(mergeJobsByCreatedAtDesc(local, backend, 2)).toHaveLength(2);
  });

  it('returns an empty list when both sides are empty', () => {
    expect(mergeJobsByCreatedAtDesc([], [], 50)).toEqual([]);
  });

  it('handles only-local input', () => {
    const local = [{ job_id: 'l', created_at: '2026-04-01T00:00:00.000Z' }];
    expect(mergeJobsByCreatedAtDesc(local, [], 5)).toEqual(local);
  });

  it('handles only-backend input', () => {
    const backend = [{ job_id: 'b', created_at: '2026-04-01T00:00:00.000Z' }];
    expect(mergeJobsByCreatedAtDesc([], backend, 5)).toEqual(backend);
  });
});
