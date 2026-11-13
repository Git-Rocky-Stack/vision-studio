import { canonicalizePath, pathFlavorFor } from './pathSafety';

/**
 * One-time grants for `assets:import-files`.
 *
 * The import handler copies a source file into the managed output tree, so it
 * must never read an arbitrary renderer-chosen path (a UNC path alone makes
 * Windows authenticate to the remote host with the user's NTLM credentials).
 * A path is importable only after the main process itself produced it - from
 * the native picker in `dialog:select-media-files` - and only once, within a
 * short window. UNC / device paths are never granted.
 */

export const MEDIA_IMPORT_GRANT_TTL_MS = 10 * 60 * 1000;

export interface MediaImportGrants {
  /** Grant each importable path; returns the canonical paths actually granted. */
  grant: (paths: readonly string[]) => string[];
  /** Consume a grant: true once per granted path, then false. */
  consume: (path: string) => boolean;
}

export function createMediaImportGrants({
  ttlMs = MEDIA_IMPORT_GRANT_TTL_MS,
  now = Date.now,
  platform = process.platform,
}: {
  ttlMs?: number;
  now?: () => number;
  platform?: NodeJS.Platform;
} = {}): MediaImportGrants {
  const grants = new Map<string, number>();

  function keyOf(rawPath: string): string | null {
    const canonical = canonicalizePath(rawPath, platform);
    if (!canonical) {
      return null;
    }
    return pathFlavorFor(canonical, platform) === 'win32' ? canonical.toLowerCase() : canonical;
  }

  function prune() {
    const current = now();
    for (const [key, expiresAt] of grants) {
      if (expiresAt <= current) {
        grants.delete(key);
      }
    }
  }

  return {
    grant(paths) {
      prune();
      const granted: string[] = [];
      const expiresAt = now() + ttlMs;
      for (const rawPath of paths) {
        const key = typeof rawPath === 'string' ? keyOf(rawPath) : null;
        if (key) {
          grants.set(key, expiresAt);
          granted.push(canonicalizePath(rawPath, platform) as string);
        }
      }
      return granted;
    },
    consume(rawPath) {
      prune();
      const key = typeof rawPath === 'string' ? keyOf(rawPath) : null;
      if (!key || !grants.has(key)) {
        return false;
      }
      grants.delete(key);
      return true;
    },
  };
}
