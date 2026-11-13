import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/appStore';

describe('generationSlice no-op updates', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it('updateJob for an unknown job id does not notify subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);

    useAppStore.getState().updateJob('no-such-job', { progress: 50 });

    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('setSystemInfo with identical fields keeps the existing object and notifies nobody', () => {
    const info = {
      gpuAvailable: true,
      gpuName: 'RTX',
      comfyuiConnected: false,
      modelsCount: 3,
      backendConnected: true,
    };
    useAppStore.getState().setSystemInfo(info);
    const stored = useAppStore.getState().systemInfo;

    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);
    useAppStore.getState().setSystemInfo({ ...info });
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
    expect(useAppStore.getState().systemInfo).toBe(stored);
  });

  it('setSystemInfo stores a changed report', () => {
    const info = { gpuAvailable: false, comfyuiConnected: false, modelsCount: 0, backendConnected: false };
    useAppStore.getState().setSystemInfo(info);
    useAppStore.getState().setSystemInfo({ ...info, backendConnected: true });

    expect(useAppStore.getState().systemInfo.backendConnected).toBe(true);
  });

  it('setSystemInfo compares the reported availability by value', () => {
    const info = {
      gpuAvailable: true,
      comfyuiConnected: false,
      modelsCount: 1,
      backendConnected: true,
      availability: { tensorrt: { available: false, reason: 'Not bundled.' } },
    };
    useAppStore.getState().setSystemInfo(info);
    const stored = useAppStore.getState().systemInfo;

    // The next poll delivers an equal but fresh availability object.
    useAppStore.getState().setSystemInfo({
      ...info,
      availability: { tensorrt: { available: false, reason: 'Not bundled.' } },
    });
    expect(useAppStore.getState().systemInfo).toBe(stored);

    useAppStore.getState().setSystemInfo({ ...info, availability: { tensorrt: { available: true } } });
    expect(useAppStore.getState().systemInfo.availability?.tensorrt?.available).toBe(true);
  });
});

describe('generationSlice finished-job records (edit output supersede)', () => {
  const finished = {
    id: 'done-1',
    type: 'image' as const,
    status: 'completed' as const,
    progress: 100,
    params: { prompt: 'a red door', output_root: 'C:/out' },
    result: { images: ['/outputs/done-1/generated.png'] },
    createdAt: new Date(0),
  };

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState({ completedJobs: [finished] });
  });

  it('patches a finished job record with non-lifecycle fields', () => {
    useAppStore.getState().updateJob('done-1', {
      params: { ...finished.params, suppressAssetSync: true, replacedByAssetPath: 'C:/edits/a.png' },
    });
    const [job] = useAppStore.getState().completedJobs;
    expect(job.params).toMatchObject({ suppressAssetSync: true, replacedByAssetPath: 'C:/edits/a.png' });
    expect(job.status).toBe('completed');
    // No second iteration node is minted for an annotated finished job.
    expect(useAppStore.getState().iterationNodes.size).toBe(0);
  });

  it('drops a late lifecycle frame for a finished job without notifying anyone', () => {
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);
    useAppStore.getState().updateJob('done-1', { status: 'processing', progress: 40, step: 3 });
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(useAppStore.getState().completedJobs[0]).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('applies only the non-lifecycle part of a mixed late update', () => {
    useAppStore.getState().updateJob('done-1', { status: 'processing', error: 'late warning' });
    expect(useAppStore.getState().completedJobs[0]).toMatchObject({ status: 'completed', error: 'late warning' });
  });
});

describe('generationSlice job outputs', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  const completeImageJob = (id: string, params: Record<string, unknown> = {}) => {
    useAppStore.getState().addJob({
      id,
      type: 'image',
      status: 'processing',
      progress: 50,
      params: { prompt: 'p', ...params },
      createdAt: new Date(0),
    });
    useAppStore.getState().updateJob(id, {
      status: 'completed',
      progress: 100,
      result: { images: [`/outputs/${id}/generated.png`] },
    });
  };

  it('records the iteration thumbnail as a loadable preview URL, not the backend-relative path', () => {
    completeImageJob('job-a');
    expect(useAppStore.getState().iterationNodes.get('job-a')?.thumbnail).toBe(
      'http://localhost:8000/outputs/job-a/generated.png',
    );
  });

  it('uses the replacement result for the iteration thumbnail when the output was superseded', () => {
    completeImageJob('job-b', { replacedByAssetPath: 'C:/edits/b-region.png' });
    expect(useAppStore.getState().iterationNodes.get('job-b')?.thumbnail).toBe('file:///C:/edits/b-region.png');
  });

  it('skips asset registration for a job whose output sync is suppressed', () => {
    const status = {
      job_id: 'job-c',
      status: 'completed' as const,
      type: 'image' as const,
      created_at: new Date(0).toISOString(),
      result: { images: ['/outputs/job-c/generated.png'] },
    };
    useAppStore.getState().syncAssetsFromJobStatus({ ...status, params: { suppressAssetSync: true } });
    expect(useAppStore.getState().assetLibrary).toHaveLength(0);

    useAppStore.getState().syncAssetsFromJobStatus({ ...status, params: {} });
    expect(useAppStore.getState().assetLibrary.map((asset) => asset.id)).toEqual([
      'job-c::/outputs/job-c/generated.png',
    ]);
  });
});
