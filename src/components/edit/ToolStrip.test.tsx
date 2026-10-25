import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { ToolStrip } from './ToolStrip';

describe('ToolStrip', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(cleanup);

  it.each(['Clone Stamp', 'Heal', 'Shape', 'Pen'])('renders %s as not available and never selects it', (label) => {
    render(<ToolStrip />);
    const button = screen.getByRole('button', { name: `${label} (Not available yet)` });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(useAppStore.getState().activeEditTool).toBe('move');
  });

  it('selects working tools and shows their shortcut', () => {
    render(<ToolStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Eyedropper (I)' }));
    expect(useAppStore.getState().activeEditTool).toBe('eyedropper');
    fireEvent.click(screen.getByRole('button', { name: 'Crop (C)' }));
    expect(useAppStore.getState().activeEditTool).toBe('crop');
  });
});
