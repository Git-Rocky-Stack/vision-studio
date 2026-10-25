import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

const startPipelineRun = vi.fn(async () => ({ executionId: 'e1', status: 'error' as const, error: 'GPU busy' }));
vi.mock('@/features/pipeline/runPipelineExecution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/pipeline/runPipelineExecution')>();
  return { ...actual, startPipelineRun: (...args: unknown[]) => startPipelineRun(...(args as [])) };
});

import { useNoticeStore } from '@/features/notices';
import { CanvasContextMenu } from './CanvasContextMenu';

function stubElectron(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('electron', {
    dialog: { saveFile: vi.fn().mockResolvedValue('C:/out/copy.png') },
    assets: {
      export: vi.fn().mockResolvedValue({ success: false, error: 'Disk full' }),
      reveal: vi.fn().mockResolvedValue({ success: true }),
    },
    ...overrides,
  });
}

describe('CanvasContextMenu', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.getState().setCurrentImage('http://localhost:8000/a.png', 'C:/assets/a.png');
    useNoticeStore.getState().clear();
    startPipelineRun.mockClear();
    stubElectron();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('runs zoom handlers passed from the canvas and closes', () => {
    const onClose = vi.fn();
    const onZoomToFit = vi.fn();
    const onZoom100 = vi.fn();
    render(<CanvasContextMenu x={0} y={0} onClose={onClose} onZoomToFit={onZoomToFit} onZoom100={onZoom100} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom to Fit' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom to 100%' }));
    expect(onZoomToFit).toHaveBeenCalledTimes(1);
    expect(onZoom100).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opens generation info when the canvas provides it, and disables it otherwise', () => {
    const onShowGenerationInfo = vi.fn();
    const { unmount } = render(
      <CanvasContextMenu x={0} y={0} onClose={vi.fn()} onShowGenerationInfo={onShowGenerationInfo} />,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Generation Info' }));
    expect(onShowGenerationInfo).toHaveBeenCalled();
    unmount();

    render(<CanvasContextMenu x={0} y={0} onClose={vi.fn()} />);
    expect(screen.getByRole('menuitem', { name: 'Generation Info' })).toBeDisabled();
  });

  it('keeps the menu open with the reason when Save As fails', async () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu x={0} y={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save As...' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed: Disk full');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a failed copy instead of only logging it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const onClose = vi.fn();
    render(<CanvasContextMenu x={0} y={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Image' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Copy failed: offline');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('runs a supported pipeline for real and reports its failure as a notice', async () => {
    render(<CanvasContextMenu x={0} y={0} onClose={vi.fn()} />);
    const upscale = useAppStore.getState().pipelines.find((p) => p.name === 'Upscale 4x')!;
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upscale 4x' }));

    expect(startPipelineRun).toHaveBeenCalledWith(upscale.id, 'C:/assets/a.png');
    await waitFor(() =>
      expect(useNoticeStore.getState().notices[0]?.message).toBe('Upscale 4x failed: GPU busy'),
    );
  });

  it('disables pipelines whose steps have no backend op, with the reason', () => {
    render(<CanvasContextMenu x={0} y={0} onClose={vi.fn()} />);
    const denoise = screen.getByRole('menuitem', { name: 'Denoise Clean' });
    expect(denoise).toBeDisabled();
    expect(denoise.getAttribute('title')).toMatch(/no backend operation/);
  });
});
