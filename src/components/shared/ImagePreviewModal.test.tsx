import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ImagePreviewModal } from './ImagePreviewModal';
import type { BatchResult } from '@/types/generation';
import type { EditOperation } from '@/features/edit/runEditTool';

const runMock = vi.fn().mockResolvedValue({ ok: true });
const hookState = {
  run: runMock,
  cancel: vi.fn(),
  isRunning: false,
  runningOperation: null as EditOperation | null,
  progress: 0,
  error: null as string | null,
  notice: null as string | null,
  clearFeedback: vi.fn(),
};

vi.mock('@/features/edit/useEditTool', () => ({
  useEditTool: () => hookState,
}));

function makeResult(over: Partial<BatchResult> = {}): BatchResult {
  return {
    id: 'r1',
    batchId: 'b1',
    promptIndex: 0,
    prompt: 'a red apple',
    imagePath: 'http://localhost:8000/outputs/j1/img.png',
    assetPath: 'C:/outputs/j1/img.png',
    seed: 7,
    generationTime: 1.2,
    params: {},
    createdAt: new Date('2026-07-05T00:00:00Z'),
    isFavorite: false,
    ...over,
  };
}

function renderModal(result: BatchResult | null = makeResult()) {
  return render(
    <ImagePreviewModal
      result={result}
      results={result ? [result] : []}
      onClose={vi.fn()}
      onNavigate={vi.fn()}
    />,
  );
}

describe('ImagePreviewModal upscale (#34 real path)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    runMock.mockClear();
    hookState.isRunning = false;
    hookState.runningOperation = null;
    hookState.error = null;
  });

  it('dispatches the real edit upscale job (2x general)', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^upscale$/i }));
    expect(runMock).toHaveBeenCalledWith('upscale', {
      source_path: 'C:/outputs/j1/img.png',
      scale: 2,
      model: 'general',
    });
  });

  it('disables the button and shows progress while running', () => {
    hookState.isRunning = true;
    hookState.runningOperation = 'upscale';
    hookState.progress = 40;
    renderModal();
    const button = screen.getByRole('button', { name: /upscaling 40%/i });
    expect(button).toBeDisabled();
  });

  it('renders the honest error from a failed run', () => {
    hookState.error =
      "The AI upscale weights are not installed - install 'edit-realesrgan-x4plus' from the Foundry first.";
    renderModal();
    expect(screen.getByTestId('modal-upscale-error')).toHaveTextContent(
      /install 'edit-realesrgan-x4plus'/,
    );
  });
});
