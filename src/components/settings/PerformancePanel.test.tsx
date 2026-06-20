import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { PerformancePanel } from './PerformancePanel';

describe('PerformancePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(() => cleanup());

  it('renders a tri-state control for each optimization', () => {
    render(<PerformancePanel />);
    for (const label of ['Compile', 'Quantization', 'SDPA', 'Channels Last', 'Attention Slicing', 'TensorRT']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('writes a tri-state change to the store', () => {
    render(<PerformancePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Compile off' }));
    expect(useAppStore.getState().accelerationSettings.compile).toBe('off');
  });

  it('shows the applied/skipped/fell-back readout', () => {
    useAppStore.getState().setLastAppliedAcceleration({
      applied: ['sdpa', 'compile:reduce-overhead'],
      skipped: ['quantization:int8 (backend unavailable)'],
      fellBack: ['compile (RuntimeError, ran eager)'],
    });
    render(<PerformancePanel />);
    expect(screen.getByText('sdpa')).toBeInTheDocument();
    expect(screen.getByText('quantization:int8 (backend unavailable)')).toBeInTheDocument();
    expect(screen.getByText('compile (RuntimeError, ran eager)')).toBeInTheDocument();
  });

  it('uses no banned decorative glyphs', () => {
    const { container } = render(<PerformancePanel />);
    // Build the banned-glyph set from numeric code points so this source line
    // does not itself trip the ui-glyphs guard (mirrors src/styles/ui-glyphs.test.ts):
    // middot, bullet, em-dash, en-dash, minus, multiply, ellipsis.
    const bannedCodePoints = [0x00b7, 0x2022, 0x2014, 0x2013, 0x2212, 0x00d7, 0x2026];
    const banned = new Set(bannedCodePoints);
    const hasBannedGlyph = Array.from(container.textContent ?? '').some((ch) =>
      banned.has(ch.codePointAt(0) ?? -1)
    );
    expect(hasBannedGlyph).toBe(false);
  });
});
