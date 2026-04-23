import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { AssetsPanel } from './AssetsPanel';

const selectMediaFilesMock = vi.fn();
const importFilesMock = vi.fn();

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
}

function installElectronMock() {
  window.electron = {
    dialog: {
      selectFolder: vi.fn().mockResolvedValue(null),
      selectMediaFiles: selectMediaFilesMock,
      saveFile: vi.fn().mockResolvedValue(null),
    },
    assets: {
      importFiles: importFilesMock,
      export: vi.fn().mockResolvedValue({ success: true }),
      exportMany: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      reveal: vi.fn().mockResolvedValue({ success: true }),
      clearCache: vi.fn().mockResolvedValue({ success: true }),
    },
    app: {
      openPath: vi.fn().mockResolvedValue({ success: true }),
      getPath: vi.fn().mockResolvedValue('C:/vision-studio'),
    },
  } as unknown as typeof window.electron;
}

describe('AssetsPanel import', () => {
  beforeEach(() => {
    resetStore();
    selectMediaFilesMock.mockReset();
    importFilesMock.mockReset();
    installElectronMock();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('imports selected media files into the asset library and media asset domain', async () => {
    selectMediaFilesMock.mockResolvedValue([
      'C:/Users/User/Pictures/hero.png',
      'C:/Users/User/Videos/clip.mp4',
    ]);
    importFilesMock.mockResolvedValue({
      success: true,
      files: [
        {
          originalPath: 'C:/Users/User/Pictures/hero.png',
          importedPath: 'C:/vision-studio-output/imports/hero.png',
          name: 'hero',
          type: 'image',
          importedAt: '2026-04-22T12:00:00.000Z',
        },
        {
          originalPath: 'C:/Users/User/Videos/clip.mp4',
          importedPath: 'C:/vision-studio-output/imports/clip.mp4',
          name: 'clip',
          type: 'video',
          importedAt: '2026-04-22T12:01:00.000Z',
        },
      ],
    });

    const user = userEvent.setup();
    render(<AssetsPanel />);

    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(useAppStore.getState().assetLibrary).toHaveLength(2);
      expect(useAppStore.getState().mediaAssets).toHaveLength(2);
    });

    expect(selectMediaFilesMock).toHaveBeenCalledTimes(1);
    expect(importFilesMock).toHaveBeenCalledWith([
      'C:/Users/User/Pictures/hero.png',
      'C:/Users/User/Videos/clip.mp4',
    ]);

    const state = useAppStore.getState();
    expect(state.assetLibrary.map((asset) => asset.id)).toEqual([
      'import::C:/vision-studio-output/imports/clip.mp4',
      'import::C:/vision-studio-output/imports/hero.png',
    ]);
    expect(state.assetLibrary[0].params).toMatchObject({
      source: 'imported',
      reference_ready: true,
    });
    expect(state.mediaAssets.map((asset) => asset.id)).toEqual([
      'media::C:/vision-studio-output/imports/hero.png',
      'media::C:/vision-studio-output/imports/clip.mp4',
    ]);
  });
});
