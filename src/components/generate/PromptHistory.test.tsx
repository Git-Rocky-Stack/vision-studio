import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { PromptHistoryEntry } from '@/types/generation';
import { PromptHistory } from './PromptHistory';

function seedHistory(count: number) {
  const promptHistory = Array.from({ length: count }, (_, index) => ({
    id: `entry-${index}`,
    prompt: `history prompt ${index}`,
    negativePrompt: '',
    timestamp: new Date(),
  })) as PromptHistoryEntry[];
  useAppStore.setState({ promptHistory });
}

describe('PromptHistory', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(cleanup);

  it('names its close button and search field', () => {
    seedHistory(2);
    render(<PromptHistory isOpen onClose={vi.fn()} onSelectPrompt={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Close prompt history' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search prompt history' })).toBeInTheDocument();
  });

  it('renders every row of a short history', () => {
    seedHistory(5);
    render(<PromptHistory isOpen onClose={vi.fn()} onSelectPrompt={vi.fn()} />);

    expect(screen.getAllByText(/^history prompt \d+$/)).toHaveLength(5);
  });

  // Past the threshold only the rows in view are mounted.
  it('virtualises a long history', () => {
    seedHistory(45);
    render(<PromptHistory isOpen onClose={vi.fn()} onSelectPrompt={vi.fn()} />);

    expect(screen.queryAllByText(/^history prompt \d+$/).length).toBeLessThan(45);
  });
});
