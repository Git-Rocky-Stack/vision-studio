import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('PipelineStore', () => {
  beforeEach(resetStore);

  it('seeds 6 built-in presets on init', () => {
    const pipelines = useAppStore.getState().pipelines;
    expect(pipelines.filter((p) => p.isBuiltIn)).toHaveLength(6);
  });

  it('built-in presets have correct names', () => {
    const builtIn = useAppStore.getState().pipelines.filter((p) => p.isBuiltIn);
    const names = builtIn.map((p) => p.name);
    expect(names).toContain('Upscale 4x');
    expect(names).toContain('Face Restore');
    expect(names).toContain('Denoise Clean');
    expect(names).toContain('Background Remove');
    expect(names).toContain('Style Transfer');
    expect(names).toContain('HDR Enhance');
  });

  it('createPipeline adds a user pipeline', () => {
    useAppStore.getState().createPipeline({
      name: 'My Pipeline',
      description: 'Custom pipeline',
      steps: [],
    });
    const userPipelines = useAppStore.getState().pipelines.filter((p) => !p.isBuiltIn);
    expect(userPipelines).toHaveLength(1);
    expect(userPipelines[0].name).toBe('My Pipeline');
  });

  it('duplicatePipeline copies a built-in as user pipeline', () => {
    const builtIn = useAppStore.getState().pipelines.find((p) => p.name === 'Upscale 4x')!;
    useAppStore.getState().duplicatePipeline(builtIn.id, 'Upscale 4x Copy');
    const userPipelines = useAppStore.getState().pipelines.filter((p) => !p.isBuiltIn);
    expect(userPipelines).toHaveLength(1);
    expect(userPipelines[0].name).toBe('Upscale 4x Copy');
    expect(userPipelines[0].steps).toEqual(builtIn.steps);
  });

  it('deletePipeline removes a user pipeline', () => {
    useAppStore.getState().createPipeline({ name: 'To Delete', description: '', steps: [] });
    const userPipeline = useAppStore.getState().pipelines.find((p) => p.name === 'To Delete')!;
    useAppStore.getState().deletePipeline(userPipeline.id);
    expect(useAppStore.getState().pipelines.find((p) => p.name === 'To Delete')).toBeUndefined();
  });

  it('deletePipeline does not remove built-in presets', () => {
    const builtIn = useAppStore.getState().pipelines.find((p) => p.isBuiltIn)!;
    useAppStore.getState().deletePipeline(builtIn.id);
    expect(useAppStore.getState().pipelines.find((p) => p.id === builtIn.id)).toBeDefined();
  });

  it('runPipeline creates an execution', () => {
    const builtIn = useAppStore.getState().pipelines[0];
    useAppStore.getState().runPipeline(builtIn.id, 'image-1');
    const executions = useAppStore.getState().pipelineExecutions;
    expect(executions).toHaveLength(1);
    expect(executions[0].pipelineId).toBe(builtIn.id);
    expect(executions[0].sourceImageId).toBe('image-1');
    expect(executions[0].status).toBe('queued');
  });

  it('cancelExecution sets status to error', () => {
    const builtIn = useAppStore.getState().pipelines[0];
    useAppStore.getState().runPipeline(builtIn.id, 'image-1');
    const execution = useAppStore.getState().pipelineExecutions[0];
    useAppStore.getState().cancelPipelineExecution(execution.id);
    expect(useAppStore.getState().pipelineExecutions[0].status).toBe('error');
  });

  it('setActivePipelineId sets the active pipeline', () => {
    const builtIn = useAppStore.getState().pipelines[0];
    useAppStore.getState().setActivePipelineId(builtIn.id);
    expect(useAppStore.getState().activePipelineId).toBe(builtIn.id);
  });

  it('setPipelineBuilderOpen toggles builder', () => {
    expect(useAppStore.getState().isPipelineBuilderOpen).toBe(false);
    useAppStore.getState().setPipelineBuilderOpen(true);
    expect(useAppStore.getState().isPipelineBuilderOpen).toBe(true);
  });
});
