import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { SearchResult } from '@/types/model';

import { DiscoverSection } from './DiscoverSection';

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

describe('DiscoverSection', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(cleanup);

  it('runs a search with the active source and page 1 on submit', () => {
    const searchModels = vi.fn();
    useAppStore.setState({ searchModels, searchSource: 'hf' } as never);
    render(<DiscoverSection />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sdxl' } });
    fireEvent.submit(screen.getByTestId('foundry-search-form'));

    expect(searchModels).toHaveBeenCalledWith('sdxl', 'hf', 1);
  });

  it('does not search on an empty/whitespace query', () => {
    const searchModels = vi.fn();
    useAppStore.setState({ searchModels } as never);
    render(<DiscoverSection />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('foundry-search-form'));

    expect(searchModels).not.toHaveBeenCalled();
  });

  it('shows the NSFW toggle only for CivitAI and forwards opt-in changes', () => {
    const setNsfwOptIn = vi.fn();
    useAppStore.setState({ setNsfwOptIn, searchSource: 'hf', nsfwOptIn: false } as never);
    render(<DiscoverSection />);

    // Hugging Face: no mature-content toggle.
    expect(screen.queryByRole('switch', { name: /mature|nsfw/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /civitai/i }));
    const toggle = screen.getByRole('switch', { name: /mature|nsfw/i });
    expect(toggle).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(setNsfwOptIn).toHaveBeenCalledWith(true);
  });

  it('searches CivitAI once the source is switched', () => {
    const searchModels = vi.fn();
    useAppStore.setState({ searchModels, searchSource: 'hf' } as never);
    render(<DiscoverSection />);

    fireEvent.click(screen.getByRole('button', { name: /civitai/i }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'anime' } });
    fireEvent.submit(screen.getByTestId('foundry-search-form'));

    expect(searchModels).toHaveBeenCalledWith('anime', 'civitai', 1);
  });

  it('renders the offline banner with the warning text', () => {
    useAppStore.setState({ searchStatus: 'offline', searchWarning: 'No network' } as never);
    render(<DiscoverSection />);
    expect(screen.getByText(/no network/i)).toBeInTheDocument();
  });

  it('lists result names when the search is ready', () => {
    useAppStore.setState({
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1', name: 'SDXL Turbo' })],
    } as never);
    render(<DiscoverSection />);
    expect(screen.getByText('SDXL Turbo')).toBeInTheDocument();
  });

  it('renders the full acquire card for each result, not a bare name', () => {
    useAppStore.setState({
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1', name: 'SDXL Turbo' })],
    } as never);
    render(<DiscoverSection />);

    // The rich SearchResultCard surfaces the tier, the popularity counts, the
    // license and - critically - the Acquire action. A bare <li>{name}</li> has
    // none of these, so a user can search but never install what they find.
    expect(screen.getByText('SDXL Turbo')).toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.getByText('openrail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /acquire/i })).toBeInTheDocument();
  });

  it('enqueues a download when a clean result is acquired', () => {
    const enqueueDownload = vi.fn();
    useAppStore.setState({
      enqueueDownload,
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1', format: 'safetensors', trust_remote_code: false })],
    } as never);
    render(<DiscoverSection />);

    fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
    expect(enqueueDownload).toHaveBeenCalledWith('r1');
  });

  it('gates a pickle result behind the consent dialog instead of downloading', () => {
    const enqueueDownload = vi.fn();
    useAppStore.setState({
      enqueueDownload,
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1', format: 'pickle' })],
    } as never);
    render(<DiscoverSection />);

    fireEvent.click(screen.getByRole('button', { name: /acquire/i }));
    expect(enqueueDownload).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows an empty state when ready with no results', () => {
    useAppStore.setState({ searchStatus: 'ready', searchResults: [] } as never);
    render(<DiscoverSection />);
    expect(screen.getByText(/no (results|models)/i)).toBeInTheDocument();
  });

  it('paginates to the previous page from page 2', () => {
    const searchModels = vi.fn();
    useAppStore.setState({
      searchModels,
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1' })],
      searchQuery: 'sdxl',
      searchSource: 'hf',
      searchPage: 2,
    } as never);
    render(<DiscoverSection />);

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(searchModels).toHaveBeenCalledWith('sdxl', 'hf', 1);
  });

  it('disables the previous-page control on page 1', () => {
    useAppStore.setState({
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1' })],
      searchPage: 1,
    } as never);
    render(<DiscoverSection />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('shows result-shaped placeholders while a search is in flight', () => {
    useAppStore.setState({ searchStatus: 'loading' } as never);
    render(<DiscoverSection />);

    // A grid of placeholders shaped like the cards that are coming reads far
    // better than one small spinner over an empty pane.
    const placeholders = screen.getAllByRole('progressbar', { name: /loading/i });
    expect(placeholders.length).toBeGreaterThan(1);
  });

  it('drops the placeholders once results land', () => {
    useAppStore.setState({
      searchStatus: 'ready',
      searchResults: [makeResult({ id: 'r1' })],
    } as never);
    render(<DiscoverSection />);

    expect(screen.queryByRole('progressbar', { name: /loading/i })).not.toBeInTheDocument();
  });
});
