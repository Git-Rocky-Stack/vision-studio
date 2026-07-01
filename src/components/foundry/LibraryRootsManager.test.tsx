import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { LibraryRoot } from '@/types/model';

import { LibraryRootsManager } from './LibraryRootsManager';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeRoot(overrides: Partial<LibraryRoot> = {}): LibraryRoot {
  return {
    id: 'r1',
    path: '/models',
    layout_hint: 'comfyui',
    added_at: '2026-06-28T00:00:00Z',
    ...overrides,
  };
}

describe('LibraryRootsManager', () => {
  beforeEach(resetStore);

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it('lists roots and removes one', () => {
    const removeLibraryRoot = vi.fn();
    useAppStore.setState({ removeLibraryRoot, libraryRoots: [makeRoot()] } as never);
    render(<LibraryRootsManager />);

    expect(screen.getByText('/models')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove root/i }));
    expect(removeLibraryRoot).toHaveBeenCalledWith('r1');
  });

  it('adds a root via the folder picker with the chosen layout hint', async () => {
    const addLibraryRoot = vi.fn();
    window.electron = {
      dialog: { selectFolder: vi.fn().mockResolvedValue('/picked') },
    } as unknown as typeof window.electron;
    useAppStore.setState({ addLibraryRoot } as never);
    render(<LibraryRootsManager />);

    fireEvent.click(screen.getByRole('button', { name: /add folder/i }));
    await waitFor(() => expect(addLibraryRoot).toHaveBeenCalledWith('/picked', 'generic'));
  });

  it('does not add a root when the picker is cancelled', async () => {
    const addLibraryRoot = vi.fn();
    window.electron = {
      dialog: { selectFolder: vi.fn().mockResolvedValue(null) },
    } as unknown as typeof window.electron;
    useAppStore.setState({ addLibraryRoot } as never);
    render(<LibraryRootsManager />);

    fireEvent.click(screen.getByRole('button', { name: /add folder/i }));
    await Promise.resolve();
    expect(addLibraryRoot).not.toHaveBeenCalled();
  });

  it('scans the libraries', () => {
    const scanLibraries = vi.fn();
    useAppStore.setState({ scanLibraries } as never);
    render(<LibraryRootsManager />);

    fireEvent.click(screen.getByRole('button', { name: /scan/i }));
    expect(scanLibraries).toHaveBeenCalled();
  });

  it('detects installs and adds an offered root', () => {
    const detectLibraries = vi.fn();
    const addLibraryRoot = vi.fn();
    useAppStore.setState({
      detectLibraries,
      addLibraryRoot,
      detectedRoots: [{ path: '/comfy', layout_hint: 'comfyui' }],
    } as never);
    render(<LibraryRootsManager />);

    fireEvent.click(screen.getByRole('button', { name: /detect/i }));
    expect(detectLibraries).toHaveBeenCalled();

    expect(screen.getByText('/comfy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add /comfy' }));
    expect(addLibraryRoot).toHaveBeenCalledWith('/comfy', 'comfyui');
  });
});
