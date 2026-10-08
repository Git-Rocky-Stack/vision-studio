import { describe, expect, it } from 'vitest';
import { getLayoutPreset, resolveCenterView } from './layoutPresets';
import type { ActiveTab, CenterView } from '@/types/navigation';

/**
 * `centerView` is a single store field, but only the Generate tab lets the user
 * choose between views. These cases pin the rule that keeps a choice made there
 * from leaking into a tab that has no way to show or change it.
 */
describe('resolveCenterView', () => {
  it('keeps a stored view the tab offers', () => {
    const offered: CenterView[] = ['canvas', 'viewer', 'workflow', 'launchpad'];
    for (const view of offered) {
      expect(resolveCenterView('generate', view)).toBe(view);
    }
  });

  it('opens Workflows on the workflow editor, not the stored canvas', () => {
    expect(resolveCenterView('workflows', 'canvas')).toBe('workflow');
  });

  it('does not carry a Generate-only view into Story or Canvas', () => {
    expect(resolveCenterView('story', 'launchpad')).toBe('canvas');
    expect(resolveCenterView('story', 'viewer')).toBe('canvas');
    expect(resolveCenterView('canvas', 'workflow')).toBe('canvas');
  });

  it('always returns a view the tab preset lists', () => {
    const tabs: ActiveTab[] = [
      'generate', 'canvas', 'story', 'workflows', 'assets', 'collections', 'foundry', 'settings',
    ];
    const views: CenterView[] = ['canvas', 'viewer', 'workflow', 'launchpad'];
    for (const tab of tabs) {
      for (const view of views) {
        expect(getLayoutPreset(tab).centerViews).toContain(resolveCenterView(tab, view));
      }
    }
  });
});
