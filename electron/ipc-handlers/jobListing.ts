/**
 * Merge two sources of job records by `created_at` descending and apply a
 * hard upper bound. Used by the `generation:list-jobs` IPC handler to
 * blend local OpenRouter jobs with backend Python jobs without letting
 * a flood of one source silently shadow more recent records from the
 * other.
 */
export function mergeJobsByCreatedAtDesc<T extends { created_at: string }>(
  local: readonly T[],
  backend: readonly T[],
  limit: number,
): T[] {
  return [...local, ...backend]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, Math.max(0, limit));
}
