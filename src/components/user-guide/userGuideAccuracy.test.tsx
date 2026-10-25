import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UserGuidePage } from '@/pages/UserGuidePage';
import { EDIT_TOOL_SHORTCUTS, REGION_TOOL_SHORTCUTS } from '@/features/edit/useEditToolShortcuts';
import { GettingStartedGuideSection } from './sections/GettingStartedGuideSection';
import { SettingsGuideSection } from './sections/SettingsGuideSection';
import { GenerateGuideSection } from './sections/GenerateGuideSection';
import { CanvasGuideSection } from './sections/CanvasGuideSection';
import { AssetsGuideSection } from './sections/AssetsGuideSection';
import { TimelineGuideSection } from './sections/TimelineGuideSection';

afterEach(cleanup);

/** The rendered guide text, whitespace-normalized, for claim checks. */
function textOf(ui: React.ReactElement): string {
  const { container } = render(ui);
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

/**
 * Each guide claim pinned here was checked against the code it describes. When
 * a test fails, re-read that code before changing the copy: the guide must
 * describe what the app does, not what it used to do.
 */
describe('User Guide accuracy', () => {
  it('names Hugging Face as a BYOK route, not just OpenRouter', () => {
    const text = textOf(<UserGuidePage />);
    expect(text).toMatch(/Hugging Face token/);
    expect(text).not.toMatch(/optional OpenRouter BYOK/);
  });

  it('routes video through Local or HuggingFace, never claiming video is local-only', () => {
    const start = textOf(<GettingStartedGuideSection />);
    expect(start).toMatch(/Motion \/ Video Provider/);
    expect(start).toMatch(/HuggingFace for hosted prompt-only video/);
    cleanup();

    const all = textOf(<UserGuidePage />);
    expect(all).not.toMatch(/Video remains local-only/i);
    expect(all).not.toMatch(/Video generation, retake generation, ControlNet/);
  });

  it('lists the seven Settings tabs SettingsPanel renders', () => {
    const text = textOf(<SettingsGuideSection />);
    expect(text).toMatch(/seven tabs/);
    for (const tab of ['General', 'AI & Models', 'Performance', 'Appearance', 'Notifications', 'User Guide', 'About']) {
      expect(text).toContain(tab);
    }
  });

  it('sends model management to the Foundry and has no Stop Backend control', () => {
    const text = textOf(<SettingsGuideSection />);
    expect(text).toMatch(/Manage in Foundry/);
    expect(text).toMatch(/There is no Stop Backend control/);
    expect(text).toMatch(/HuggingFace token/);
    // String descriptions are not HTML: an entity there renders literally.
    expect(text).not.toContain('&apos;');
  });

  it('states the real generation defaults and OpenRouter output path', () => {
    const text = textOf(<GenerateGuideSection />);
    expect(text).toMatch(/25 steps, CFG 7\.5, the Euler a scheduler/);
    expect(text).toContain('<output root>/openrouter/YYYY-MM-DD/');
  });

  it('describes batch as one card per prompt with no retry control', () => {
    const generate = textOf(<GenerateGuideSection />);
    expect(generate).toMatch(/Each prompt gets its own card/);
    expect(generate).not.toMatch(/one prompt per line/i);
    expect(generate).toMatch(/there is no retry control/i);
    cleanup();

    const assets = textOf(<AssetsGuideSection />);
    expect(assets).toMatch(/There is no retry control/);
  });

  it('lists exactly the edit tool letters the editor binds', () => {
    const text = textOf(<CanvasGuideSection />);
    const toolNames: Record<string, string> = {
      move: 'Move', scale: 'Scale', crop: 'Crop', rotate: 'Rotate', brush: 'Brush',
      eraser: 'Eraser', clone: 'Clone Stamp', heal: 'Heal', text: 'Text', shape: 'Shape',
      pen: 'Pen', hand: 'Hand', zoom: 'Zoom', eyedropper: 'Eyedropper',
    };
    for (const [key, tool] of Object.entries(EDIT_TOOL_SHORTCUTS)) {
      expect(text).toContain(`${toolNames[tool]} (${key.toUpperCase()})`);
    }
    for (const key of Object.keys(REGION_TOOL_SHORTCUTS)) {
      expect(text).toMatch(new RegExp(`\\(${key.toUpperCase()}\\)`));
    }
    expect(text).not.toMatch(/not available yet/);
    expect(text).toMatch(/Alt\+click to set the source/);
    expect(text).toMatch(/Click the first point to close the\s+shape/);
  });

  it('does not promise canvas drop, layer context menus, or Spacebar panning', () => {
    const text = textOf(<CanvasGuideSection />);
    expect(text).not.toMatch(/drop an image/i);
    expect(text).not.toMatch(/Right-click a layer/i);
    expect(text).not.toMatch(/Spacebar/i);
    expect(text).toMatch(/There is no right-click menu on layers/);
    expect(text).toMatch(/Send to Edit/);
  });

  it('describes asset actions as the hover buttons that exist', () => {
    const text = textOf(<AssetsGuideSection />);
    expect(text).not.toMatch(/drop files/i);
    expect(text).not.toMatch(/Right-click an asset/i);
    expect(text).not.toMatch(/Reveal in Folder/);
    expect(text).not.toMatch(/Smart collection/i);
    expect(text).not.toMatch(/Exports only land inside Home/);
  });

  it('lists only timeline keys Timeline.tsx handles', () => {
    const text = textOf(<TimelineGuideSection />);
    expect(text).not.toMatch(/J\/K\/L/);
    expect(text).not.toMatch(/Shift\+I/);
    expect(text).not.toMatch(/typically I and O/);
    expect(text).toMatch(/Space plays or pauses/);
    expect(text).toMatch(/Left and Right seek 250 ms; hold Shift to seek 1 second/);
    expect(text).toMatch(/Alt\+Left or Alt\+Right nudges it one frame/);
    expect(text).toMatch(/S splits it at the playhead, Ctrl\/Cmd\+D duplicates it/);
  });

  it('keeps the readable step measure', () => {
    render(<SettingsGuideSection />);
    const description = screen.getByText(/The GPU card shows the detected GPU/);
    expect(description.className).toMatch(/max-w-\[\d+ch\]/);
  });
});
