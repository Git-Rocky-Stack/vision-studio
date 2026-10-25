import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { EDIT_TOOL_SHORTCUTS } from '@/features/edit/useEditToolShortcuts';
import { ToolStrip } from './ToolStrip';

describe('ToolStrip', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(cleanup);

  it.each([
    ['Clone Stamp (S)', 'clone'],
    ['Heal (J)', 'heal'],
    ['Shape (U)', 'shape'],
    ['Pen (P)', 'pen'],
    ['Eyedropper (I)', 'eyedropper'],
    ['Crop (C)', 'crop'],
  ] as const)('selects %s', (name, tool) => {
    render(<ToolStrip />);
    const button = screen.getByRole('button', { name });
    fireEvent.click(button);
    expect(useAppStore.getState().activeEditTool).toBe(tool);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels every tool with the key that selects it', () => {
    render(<ToolStrip />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(Object.keys(EDIT_TOOL_SHORTCUTS).length);
    for (const [key, tool] of Object.entries(EDIT_TOOL_SHORTCUTS)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`\\(${key.toUpperCase()}\\)$`) }));
      expect(useAppStore.getState().activeEditTool).toBe(tool);
    }
  });

  it('has no disabled tools', () => {
    render(<ToolStrip />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-disabled');
    }
  });
});
