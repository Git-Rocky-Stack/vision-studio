import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { PipelineStep } from '@/types/pipeline';
import {
  cancelPipelineRun,
  pipelineUnsupportedReason,
  startPipelineRun,
  unsupportedStepMessage,
} from './runPipelineExecution';

function step(id: string, type: PipelineStep['type'], enabled = true): PipelineStep {
  return { id, type, label: type, params: {}, enabled };
}

function seedPipeline(steps: PipelineStep[]) {
  useAppStore.getState().createPipeline({ name: 'Test', description: '', steps });
  return useAppStore.getState().pipelines.find((p) => p.name === 'Test')!;
}

/** A runner that lands its output the way the real edit bridge does. */
function landingRunner(outputFor: (source: string) => string) {
  return vi.fn(async (_step: PipelineStep, source: string) => {
    const out = outputFor(source);
    useAppStore.getState().setCurrentImage(`preview:${out}`, out);
    return { ok: true };
  });
}

describe('startPipelineRun', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('runs enabled steps in order, chaining each output into the next step', async () => {
    const pipeline = seedPipeline([step('a', 'upscale'), step('skip', 'face-restore', false), step('b', 'background-remove')]);
    const upscale = landingRunner((s) => `${s}+up`);
    const removeBg = landingRunner((s) => `${s}+bg`);

    const result = await startPipelineRun(pipeline.id, 'src.png', {
      runners: { upscale, 'background-remove': removeBg, 'face-restore': vi.fn() },
    });

    expect(result.status).toBe('complete');
    expect(upscale).toHaveBeenCalledWith(expect.anything(), 'src.png', expect.any(AbortSignal));
    expect(removeBg).toHaveBeenCalledWith(expect.anything(), 'src.png+up', expect.any(AbortSignal));
    const execution = useAppStore.getState().pipelineExecutions[0];
    expect(execution.status).toBe('complete');
    expect(execution.finalOutput).toBe('src.png+up+bg');
    expect(execution.stepResults.map((r) => r.status)).toEqual(['complete', 'skipped', 'complete']);
    expect(execution.stepResults[0].output).toBe('preview:src.png+up');
  });

  it('refuses an unsupported step before running anything', async () => {
    const pipeline = seedPipeline([step('a', 'upscale'), step('b', 'denoise')]);
    const upscale = landingRunner((s) => `${s}+up`);

    const result = await startPipelineRun(pipeline.id, 'src.png', { runners: { upscale } });

    expect(result).toMatchObject({ status: 'error', error: unsupportedStepMessage('denoise') });
    expect(upscale).not.toHaveBeenCalled();
    const execution = useAppStore.getState().pipelineExecutions[0];
    expect(execution.status).toBe('error');
    expect(execution.stepResults[1]).toMatchObject({ status: 'error', error: unsupportedStepMessage('denoise') });
  });

  it('stops at a failing step and surfaces its message', async () => {
    const pipeline = seedPipeline([step('a', 'upscale'), step('b', 'background-remove')]);
    const removeBg = vi.fn();
    const result = await startPipelineRun(pipeline.id, 'src.png', {
      runners: {
        upscale: vi.fn(async () => ({ ok: false, error: "install 'realesrgan' from the Foundry first." })),
        'background-remove': removeBg,
      },
    });

    expect(result.error).toMatch(/Foundry/);
    expect(removeBg).not.toHaveBeenCalled();
    expect(useAppStore.getState().pipelineExecutions[0].stepResults[0].status).toBe('error');
  });

  it('cancels a running execution through its abort signal', async () => {
    const pipeline = seedPipeline([step('a', 'upscale'), step('b', 'background-remove')]);
    let seenSignal: AbortSignal | null = null;
    const upscale = vi.fn(
      (_step: PipelineStep, _source: string, signal: AbortSignal) =>
        new Promise<{ ok: boolean }>((resolve) => {
          seenSignal = signal;
          signal.addEventListener('abort', () => resolve({ ok: false }));
        }),
    );
    const removeBg = vi.fn();

    const running = startPipelineRun(pipeline.id, 'src.png', { runners: { upscale, 'background-remove': removeBg } });
    await vi.waitFor(() => expect(seenSignal).not.toBeNull());
    const executionId = useAppStore.getState().pipelineExecutions[0].id;
    cancelPipelineRun(executionId);

    expect(await running).toMatchObject({ status: 'cancelled' });
    expect(seenSignal!.aborted).toBe(true);
    expect(removeBg).not.toHaveBeenCalled();
    expect(useAppStore.getState().pipelineExecutions[0].status).toBe('cancelled');
  });
});

describe('pipelineUnsupportedReason', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('accepts the built-ins backed by a real op and names the ones that are not', () => {
    const byName = (name: string) => useAppStore.getState().pipelines.find((p) => p.name === name)!;
    expect(pipelineUnsupportedReason(byName('Upscale 4x'))).toBeNull();
    expect(pipelineUnsupportedReason(byName('Face Restore'))).toBeNull();
    expect(pipelineUnsupportedReason(byName('Background Remove'))).toBeNull();
    expect(pipelineUnsupportedReason(byName('Style Transfer'))).toBeNull();
    expect(pipelineUnsupportedReason(byName('Denoise Clean'))).toBe(unsupportedStepMessage('denoise'));
    expect(pipelineUnsupportedReason(byName('HDR Enhance'))).toBe(unsupportedStepMessage('color-correct'));
  });
});
