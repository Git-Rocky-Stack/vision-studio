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

  it('canvas preset has layers in right dock', () => {
    const preset = getLayoutPreset('canvas');
    expect(preset.rightDockPanels).toContain('layers');
    expect(preset.rightDockPanels).toContain('gallery');
  });

  it('story preset has sub-modes', () => {
    const preset = getLayoutPreset('story');
    expect(preset.subModes).toEqual(['storyboard', 'templates']);
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