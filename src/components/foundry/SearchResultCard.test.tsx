import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { SearchResult, DownloadJob } from '@/types/model';

import { SearchResultCard } from './SearchResultCard';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'hf:stabilityai/sdxl',
    source: 'huggingface',
    name: 'SDXL Base',
    repo_id: 'stabilityai/stable-diffusion-xl-base-1.0',
    tier: 'verified',
    tier_reason: 'popular',
    artifact_type: 'checkpoint',
    base_architecture: 'sdxl',
    capability: 'image',
    downloads: 1000,
    likes: 50,
    author: 'stabilityai',
    license: 'openrail',
    gated: false,
    nsfw: false,
    format: 'safetensors',
    trust_remote_code: false,
    size: '6.9 GB',
    tags: ['text-to-image'],
    ...overrides,
  };
}

function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    model_id: 'hf:stabilityai/sdxl',
    status: 'downloading',
    progress: 0,
    speed: 0,
    eta: null,
    total_bytes: 0,
    error: null,
    gate_url: null,
    ...overrides,
  };
}

describe('SearchResultCard', () => {
  beforeEach(resetStore);

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it('acquires a clean result directly', () => {
    const enqueueDownload = vi.fn();
    useAppStore.setState({ enqueueDownload, downloads: {} } as never);
    const result = makeResult();
    render(<SearchResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
    expect(enqueueDownload).toHaveBeenCalledWith(result.id);
  });

  it('gates a pickle result behind a consent dialog', async () => {
    const enqueueDownload = vi.fn();
    const grantConsent = vi.fn().mockResolvedValue({ success: true });
    useAppStore.setState({ enqueueDownload, grantConsent, downloads: {} } as never);
    const result = makeResult({ format: 'pickle' });
    render(<SearchResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
    // No download until the user grants consent.
    expect(enqueueDownload).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /i understand|continue/i }));
    expect(grantConsent).toHaveBeenCalledWith(result.id, 'pickle', true);
  });

  it('gates a trust_remote_code result behind consent', async () => {
    const grantConsent = vi.fn().mockResolvedValue({ success: true });
    useAppStore.setState({ enqueueDownload: vi.fn(), grantConsent, downloads: {} } as never);
    const result = makeResult({ trust_remote_code: true });
    render(<SearchResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
    fireEvent.click(await screen.findByRole('button', { name: /i understand|continue/i }));
    expect(grantConsent).toHaveBeenCalledWith(result.id, 'trust_remote_code', true);
  });

  it('cancelling the consent dialog does not download', async () => {
    const enqueueDownload = vi.fn();
    useAppStore.setState({ enqueueDownload, grantConsent: vi.fn(), downloads: {} } as never);
    render(<SearchResultCard result={makeResult({ format: 'pickle' })} />);

    fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(enqueueDownload).not.toHaveBeenCalled();
  });

  it('shows an Accept license action for a gated job and opens the gate URL', () => {
    const openExternal = vi.fn();
    window.electron = { app: { openExternal } } as unknown as typeof window.electron;
    const result = makeResult({ id: 'gated1', gated: true });
    useAppStore.setState({
      downloads: {
        gated1: makeJob({ model_id: 'gated1', status: 'queued', gate_url: 'https://hf.co/gate' }),
      },
    } as never);
    render(<SearchResultCard result={result} />);

    fireEvent.click(screen.getByRole('button', { name: /accept license/i }));
    expect(openExternal).toHaveBeenCalledWith('https://hf.co/gate');
  });

  it('renders security badges for a risky result', () => {
    useAppStore.setState({ downloads: {} } as never);
    render(<SearchResultCard result={makeResult({ format: 'pickle', gated: true })} />);
    expect(screen.getByTestId('badge-pickle')).toBeInTheDocument();
    expect(screen.getByTestId('badge-gated')).toBeInTheDocument();
  });
});
