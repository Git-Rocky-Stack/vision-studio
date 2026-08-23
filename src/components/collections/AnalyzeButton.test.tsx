import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';

import { AnalyzeButton } from './AnalyzeButton';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedAssets(...prompts: string[]) {
  const assets: AssetRecord[] = prompts.map((prompt, i) => ({
    id: `asset-${i}`,
    jobId: `job-${i}`,
    name: `render-${i}.png`,
    type: 'image',
    path: `C:/out/render-${i}.png`,
    previewUrl: `file:///C:/out/render-${i}.png`,
    thumbnail: '',
    createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    prompt,
    negativePrompt: '',
    model: 'sdxl',
    favorite: false,
    params: {},
  }));
  useAppStore.setState({ assetLibrary: assets });
}

describe('AnalyzeButton', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('reports how many library assets are still untagged', () => {
    seedAssets('a cinematic portrait', 'a serene landscape');
    render(<AnalyzeButton />);
    expect(screen.getByRole('button', { name: /analyze 2 untagged/i })).toBeEnabled();
  });

  it('actually analyses the untagged assets when clicked', () => {
    seedAssets('a cinematic portrait', 'a serene landscape');
    render(<AnalyzeButton />);

    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    expect(useAppStore.getState().assetMetadata.size).toBe(2);
  });

  it('is disabled and says everything is tagged once nothing is left', () => {
    seedAssets('a cinematic portrait');
    useAppStore.getState().analyzeUntaggedAssets();
    render(<AnalyzeButton />);

    const button = screen.getByRole('button', { name: /all assets tagged/i });
    expect(button).toBeDisabled();
  });

  it('is disabled with an empty library rather than offering a no-op action', () => {
    render(<AnalyzeButton />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('tells the user when tagging is switched off instead of silently doing nothing', () => {
    seedAssets('a cinematic portrait');
    useAppStore.setState({ taggingMode: 'off' });
    render(<AnalyzeButton />);

    expect(screen.getByRole('button', { name: /tagging off/i })).toBeDisabled();
  });
});
