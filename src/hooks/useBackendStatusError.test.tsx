import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyBackendStatusEvent,
  resetBackendStatusErrorForTests,
  useBackendStatusError,
  type BackendStatusEvent,
} from './useBackendStatusError';

function Probe({ label = 'probe' }: { label?: string }) {
  const error = useBackendStatusError();
  return <p data-testid={label}>{error ?? 'none'}</p>;
}

describe('useBackendStatusError', () => {
  let emitStatus: ((status: BackendStatusEvent) => void) | null;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let onStatusChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emitStatus = null;
    unsubscribe = vi.fn();
    onStatusChange = vi.fn((callback: (status: BackendStatusEvent) => void) => {
      emitStatus = callback;
      return unsubscribe;
    });
    window.electron = { backend: { onStatusChange } } as unknown as typeof window.electron;
  });

  afterEach(() => {
    cleanup();
    resetBackendStatusErrorForTests();
    Reflect.deleteProperty(window, 'electron');
  });

  it('shows the reason from a status event and clears it on a clean one', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');

    act(() => emitStatus?.({ running: false, error: 'Port 8000 is in use by another application' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('Port 8000 is in use by another application');

    act(() => emitStatus?.({ running: true }));
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('ignores a blank reason', () => {
    render(<Probe />);
    act(() => emitStatus?.({ running: false, error: '   ' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('opens one bridge listener for every consumer and closes it with the last', () => {
    const { unmount } = render(
      <>
        <Probe label="header" />
        <Probe label="settings" />
      </>,
    );
    expect(onStatusChange).toHaveBeenCalledTimes(1);

    act(() => emitStatus?.({ running: false, error: 'Backend exited with code 1' }));
    expect(screen.getByTestId('header')).toHaveTextContent('Backend exited with code 1');
    expect(screen.getByTestId('settings')).toHaveTextContent('Backend exited with code 1');

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('renders without a preload bridge', () => {
    Reflect.deleteProperty(window, 'electron');
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
    act(() => applyBackendStatusEvent({ running: false, error: 'spawn failed' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('spawn failed');
  });
});
