import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';

const startPipelineRun = vi.fn(async () => ({ executionId: 'e1', status: 'complete' as const }));
const cancelPipelineRun = vi.fn();

vi.mock('@/features/pipeline/runPipelineExecution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/pipeline/runPipelineExecution')>();
  return {
    ...actual,
    startPipelineRun: (...args: unknown[]) => startPipelineRun(...(args as [])),
    cancelPipelineRun: (...args: unknown[]) => cancelPipelineRun(...(args as [])),
  };
});

import { PipelineBuilder } from './PipelineBuilder';

function pipelineNamed(name: string) {
  return useAppStore.getState().pipelines.find((p) => p.name === name)!;
}

describe('PipelineBuilder', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    startPipelineRun.mockClear();
    cancelPipelineRun.mockClear();
  });
  afterEach(cleanup);

  it('has no do-nothing Save button', () => {
    render(<PipelineBuilder pipeline={pipelineNamed('Upscale 4x')} />);
    expect(screen.queryByRole('button', { name: /save pipeline/i })).toBeNull();
  });

  it('runs the pipeline on the image open on the Edit canvas', () => {
    useAppStore.getState().setCurrentImage('preview.png', 'C:/assets/a.png');
    const pipeline = pipelineNamed('Upscale 4x');
    render(<PipelineBuilder pipeline={pipeline} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run pipeline' }));
    expect(startPipelineRun).toHaveBeenCalledWith(pipeline.id, 'C:/assets/a.png');
  });

  it('disables Run with an honest reason for a pipeline with an unsupported step', () => {
    useAppStore.getState().setCurrentImage('preview.png', 'C:/assets/a.png');
    render(<PipelineBuilder pipeline={pipelineNamed('Denoise Clean')} />);
    const run = screen.getByRole('button', { name: 'Run pipeline' });
    expect(run).toBeDisabled();
    expect(run.getAttribute('title')).toMatch(/Denoise steps have no backend operation/);
  });

  it('offers Cancel while the latest run is in flight', () => {
    const pipeline = pipelineNamed('Upscale 4x');
    const id = useAppStore.getState().runPipeline(pipeline.id, 'C:/assets/a.png')!;
    useAppStore.getState().updatePipelineExecution(id, { status: 'running' });
    render(<PipelineBuilder pipeline={pipeline} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pipeline run' }));
    expect(cancelPipelineRun).toHaveBeenCalledWith(id);
  });

  it('asks before deleting a pipeline and keeps it on cancel', () => {
    const source = pipelineNamed('Upscale 4x');
    useAppStore.getState().duplicatePipeline(source.id, 'My Pipeline');
    const mine = pipelineNamed('My Pipeline');
    render(<PipelineBuilder pipeline={mine} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete pipeline' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete Pipeline' });
    expect(confirm).toHaveTextContent('Delete the pipeline "My Pipeline"');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(useAppStore.getState().pipelines.some((p) => p.id === mine.id)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete pipeline' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete Pipeline' })).getByRole('button', { name: 'Delete Pipeline' }),
    );
    expect(useAppStore.getState().pipelines.some((p) => p.id === mine.id)).toBe(false);
  });

  it('offers no delete for a built-in pipeline', () => {
    render(<PipelineBuilder pipeline={pipelineNamed('Upscale 4x')} />);
    expect(screen.queryByRole('button', { name: 'Delete pipeline' })).toBeNull();
  });
});
