import { describe, expect, it } from 'vitest';
import { resolveOutputPath, shouldRestartBackend } from './settings';
import { DEFAULT_SETTINGS } from './outputRoots';

describe('resolveOutputPath', () => {
  it('uses the configured output path when present', () => {
    expect(
      resolveOutputPath(
        {
          defaultOutputPath: 'D:/VisionStudio/Outputs',
        },
        'C:/Users/test/AppData/Roaming/Vision Studio'
      )
    ).toBe('D:/VisionStudio/Outputs');
  });

  it('falls back to the app data outputs directory when no custom path is set', () => {
    expect(
      resolveOutputPath(
        {
          defaultOutputPath: '',
        },
        'C:/Users/test/AppData/Roaming/Vision Studio'
      )
    ).toBe('C:/Users/test/AppData/Roaming/Vision Studio/outputs');
  });
});

describe('shouldRestartBackend', () => {
  it('restarts when the output root changes', () => {
    expect(
      shouldRestartBackend(
        { defaultOutputPath: 'C:/A' },
        { defaultOutputPath: 'D:/B' }
      )
    ).toBe(true);
  });

  it('does not restart for presentation-only setting changes', () => {
    expect(
      shouldRestartBackend(
        { defaultOutputPath: 'C:/A', theme: 'dark' },
        { defaultOutputPath: 'C:/A', theme: 'light' }
      )
    ).toBe(false);
  });
});

describe('retired settings', () => {
  it('has no autoSave or pythonPath default (K4; the interpreter is env-only)', () => {
    expect(DEFAULT_SETTINGS).not.toHaveProperty('autoSave');
    expect(DEFAULT_SETTINGS).not.toHaveProperty('pythonPath');
  });
});

describe('autoRouteOnOverBudget setting', () => {
  it('defaults to false (always-prompt is the default fallback policy)', () => {
    expect(DEFAULT_SETTINGS.autoRouteOnOverBudget).toBe(false);
  });
});
