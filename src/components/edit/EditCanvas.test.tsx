import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { EditCanvas } from './EditCanvas';

vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: ReactNode }) => <div data-testid="konva-stage">{children}</div>,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Rect: () => <div />,
  Image: () => <div />,
  Line: () => <div />,
  Text: () => <div />,
  Transformer: () => <div />,
}));

describe('EditCanvas', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('describes the editor canvas for assistive technology', () => {
    render(<EditCanvas />);

    expect(screen.getByRole('application', { name: /image editor canvas/i })).toBeInTheDocument();
    expect(screen.getByText(/Active tool:/)).toBeInTheDocument();
  });
});
