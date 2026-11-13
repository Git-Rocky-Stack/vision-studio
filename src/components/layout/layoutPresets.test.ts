import { describe, expect, it } from 'vitest';
import { getLayoutPreset } from './layoutPresets';

describe('layoutPresets', () => {
  it('returns a preset for each tab', () => {
    const tabs = ['generate', 'canvas', 'story', 'workflows', 'assets', 'settings'] as const;
    for (const tab of tabs) {
      const preset = getLayoutPreset(tab);
      expect(preset).toBeDefined();
      expect(preset.tabId).toBe(tab);
    }
  });

  it('generate preset has left, center, and right panels', () => {
    const preset = getLayoutPreset('generate');
    expect(preset.hasLeftDock).toBe(true);
    expect(preset.hasRightDock).toBe(true);
    expect(preset.centerViews).toEqual(['canvas', 'viewer', 'workflow', 'launchpad']);
  });

  it('canvas preset has both docks and no sub-modes', () => {
    const preset = getLayoutPreset('canvas');
    expect(preset.hasRightDock).toBe(true);
    expect(preset.subModes).toEqual([]);
  });

  it('story preset has sub-modes', () => {
    const preset = getLayoutPreset('story');
    expect(preset.subModes.map((m) => m.value)).toEqual(['storyboard', 'templates']);
  });

  it('is the single source for the sub-modes each tab offers, with their labels', () => {
    expect(getLayoutPreset('generate').subModes.map((m) => m.value)).toEqual([
      'generate',
      'quick',
      'batch',
      'studio',
    ]);
    // Workflows used to declare no sub-modes here while the settings rail
    // offered Workflows / Pipelines from its own list.
    expect(getLayoutPreset('workflows').subModes).toEqual([
      { value: 'workflows', label: 'Workflows' },
      { value: 'pipelines', label: 'Pipelines' },
    ]);
  });

  it('assets preset has no side docks', () => {
    const preset = getLayoutPreset('assets');
    expect(preset.hasLeftDock).toBe(false);
    expect(preset.hasRightDock).toBe(false);
  });

  it('settings preset has no side docks', () => {
    const preset = getLayoutPreset('settings');
    expect(preset.hasLeftDock).toBe(false);
    expect(preset.hasRightDock).toBe(false);
  });
});