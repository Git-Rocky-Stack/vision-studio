import { describe, expect, it } from 'vitest';

import { createMediaImportGrants, MEDIA_IMPORT_GRANT_TTL_MS } from './mediaImportGrants';

describe('media import grants (S7)', () => {
  it('grants picker paths once, matching across separators and case on Windows', () => {
    const grants = createMediaImportGrants({ platform: 'win32' });
    expect(grants.grant(['C:\\Users\\U\\Pictures\\shot.png'])).toEqual(['C:/Users/U/Pictures/shot.png']);

    expect(grants.consume('c:/users/u/pictures/SHOT.png')).toBe(true);
    expect(grants.consume('C:/Users/U/Pictures/shot.png')).toBe(false);
  });

  it('never grants UNC, device or relative paths', () => {
    const grants = createMediaImportGrants({ platform: 'win32' });
    expect(grants.grant(['\\\\host\\share\\x.png', '\\\\?\\C:\\x.png', 'x.png'])).toEqual([]);
    expect(grants.consume('\\\\host\\share\\x.png')).toBe(false);
  });

  it('expires grants', () => {
    let now = 1_000;
    const grants = createMediaImportGrants({ platform: 'linux', now: () => now });
    grants.grant(['/home/u/a.png']);
    now += MEDIA_IMPORT_GRANT_TTL_MS + 1;
    expect(grants.consume('/home/u/a.png')).toBe(false);
  });
});
