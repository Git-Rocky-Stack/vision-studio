import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { useAppStore } from './store/appStore';

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    delete (window as unknown as { electron?: unknown }).electron;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the workbench in browser dev without the Electron preload API', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<App />);

    expect(await screen.findByTestId('left-dock')).toHaveTextContent('Model Router');
    expect(screen.getByTestId('right-dock')).toHaveTextContent('Boards');
  });
});
