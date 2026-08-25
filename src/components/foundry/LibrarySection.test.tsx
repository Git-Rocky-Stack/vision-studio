import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { ModelRecord, DownloadJob, LibraryRoot } from '@/types/model';

import { LibrarySection } from './LibrarySection';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeModel(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'm1',
    name: 'Installed One',
    artifact_type: 'checkpoint',
    capability: 'image',
    base_architecture: 'sdxl',
    source: 'local',
    repo_id: null,
    revision: null,
    aux_repo_id: null,
    size: '6.9 GB',
    status: 'ready',
    tier: 'verified',
    quality: 'pro',
    runtime: 'local',
    hardware_class: 'creator',
    vram: '8 GB',
    description: '',
    license: 'openrail',
    gated: false,
    format: 'safetensors',
    trust_remote_code: false,
    nsfw: false,
    ...overrides,
  };
}

function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    model_id: 'd1',
    status: 'downloading',
    progress: 10,
    speed: 0,
    eta: null,
    total_bytes: 0,
    error: null,
    gate_url: null,
    ...overrides,
  };
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

describe('LibrarySection', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('renders downloads, installed, and roots subsections together', () => {
    useAppStore.setState({
      downloads: { d1: makeJob({ model_id: 'd1', status: 'downloading' }) },
      availableModels: [
        makeModel({ id: 'm1', name: 'Installed One' }),
        makeModel({ id: 'd1', name: 'Downloading One' }),
      ],
      libraryRoots: [makeRoot()],
    } as never);
    render(<LibrarySection />);

    // The download job maps to its catalog name, and the still-downloading
    // model must NOT also appear as installed. Asserting each name is present
    // somewhere on the page passes even when a half-downloaded model is listed
    // as ready to use, which is the bug this subsection exists to prevent - so
    // assert per-subsection instead.
    expect(screen.getByTestId('foundry-downloads')).toHaveTextContent('Downloading One');
    expect(screen.getByTestId('foundry-installed')).toHaveTextContent('Installed One');
    expect(screen.getByTestId('foundry-installed')).not.toHaveTextContent('Downloading One');
    expect(screen.getByTestId('foundry-roots')).toHaveTextContent('/models');
  });

  it('shows empty states when there are no downloads or installed models', () => {
    useAppStore.setState({ downloads: {}, availableModels: [], libraryRoots: [] } as never);
    render(<LibrarySection />);

    expect(screen.getByTestId('foundry-downloads')).toHaveTextContent(/no active downloads/i);
    expect(screen.getByTestId('foundry-installed')).toHaveTextContent(/no models installed/i);
  });
});
