import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { GenerationJob } from '@/store/appStore.types';
import type { AssetRecord } from '@/types/assets';

import { isOutputReferenced, supersedeRawEditOutput } from './supersedeRawEditOutput';

const ROOT = 'C:/Users/u/AppData/Roaming/vision-studio/outputs';
const RAW = `${ROOT}/job-1/generated.png`;
const BLENDED = 'C:/Users/u/AppData/Roaming/vision-studio/edits/photo-region-1.png';

function record(id: string, path: string): AssetRecord {
  return {
    id,
    jobId: id.split('::')[0],
    name: path.split('/').pop() ?? path,
    type: 'image',
    path,
    previewUrl: `file:///${path}`,
    thumbnail: `file:///${path}`,
    createdAt: new Date(0).toISOString(),
    prompt: 'a red door',
    negativePrompt: '',
    favorite: false,
    params: {},
  } as AssetRecord;
}

function job(): GenerationJob {
  return {
    id: 'job-1',
    type: 'image',
    status: 'completed',
    progress: 100,
    params: { output_root: ROOT, source: 'edit-tool' },
    result: { images: ['/outputs/job-1/generated.png'] },
    createdAt: new Date(0),
  } as GenerationJob;
}

const params = {
  jobId: 'job-1',
  rawPath: RAW,
  outputRoot: ROOT,
  sourcePath: 'C:/Users/u/Pictures/photo.png',
  replacementPath: BLENDED,
};

describe('supersedeRawEditOutput', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    // The raw output was never registered (runGuidedEditTool polls a blend
    // run with landAssets: false); the composite is in the library.
    useAppStore.setState({
      assetLibrary: [
        record(`import::${BLENDED}`, BLENDED),
        record('older::/outputs/older/generated.png', `${ROOT}/older/generated.png`),
      ],
      completedJobs: [job()],
      currentImage: `file:///${BLENDED}`,
      currentImageAssetPath: BLENDED,
    });
    useAppStore.getState().addIteration({
      job: job(),
      parentId: null,
      thumbnail: 'http://localhost:8000/outputs/job-1/generated.png',
    });
  });

  it('flags the finished job, points its iteration node at the composite and deletes the unused raw file', async () => {
    const remove = vi.fn().mockResolvedValue({ success: true });
    const outcome = await supersedeRawEditOutput(params, { store: useAppStore, assetsApi: { delete: remove } });

    expect(outcome).toEqual({ deletedFile: true });
    expect(remove).toHaveBeenCalledWith(RAW);
    const state = useAppStore.getState();
    // The finished job keeps its lifecycle; only the params are annotated.
    expect(state.completedJobs[0]).toMatchObject({ status: 'completed', progress: 100 });
    expect(state.completedJobs[0].params).toMatchObject({
      output_root: ROOT,
      suppressAssetSync: true,
      replacedByAssetPath: BLENDED,
    });
    const node = state.iterationNodes.get('job-1');
    // The registered composite's preview URL, not a derived one.
    expect(node?.thumbnail).toBe(`file:///${BLENDED}`);
    expect(node?.generationJob.params).toMatchObject({ suppressAssetSync: true, replacedByAssetPath: BLENDED });
    // Nothing else in the library is touched.
    expect(state.assetLibrary.map((asset) => asset.id)).toEqual([
      `import::${BLENDED}`,
      'older::/outputs/older/generated.png',
    ]);
  });

  it('keeps later job-status syncs from registering the superseded output', async () => {
    await supersedeRawEditOutput(params, {
      store: useAppStore,
      assetsApi: { delete: vi.fn().mockResolvedValue({ success: true }) },
    });
    const flagged = useAppStore.getState().completedJobs[0];
    useAppStore.getState().syncAssetsFromJobStatus({
      job_id: 'job-1',
      status: 'completed',
      type: 'image',
      created_at: new Date(0).toISOString(),
      result: { images: ['/outputs/job-1/generated.png'] },
      params: flagged.params,
    });
    expect(useAppStore.getState().assetLibrary.some((asset) => asset.id.startsWith('job-1::'))).toBe(false);
  });

  it('keeps the file when no raw path is known', async () => {
    const remove = vi.fn();
    const outcome = await supersedeRawEditOutput(
      { ...params, rawPath: null },
      { store: useAppStore, assetsApi: { delete: remove } },
    );
    expect(outcome).toEqual({ deletedFile: false, keptReason: 'no-raw-path' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('never deletes the image the edit started from', async () => {
    const remove = vi.fn();
    const outcome = await supersedeRawEditOutput(
      { ...params, sourcePath: RAW },
      { store: useAppStore, assetsApi: { delete: remove } },
    );
    expect(outcome).toMatchObject({ deletedFile: false, keptReason: 'is-source' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('never deletes a file outside the job’s output root', async () => {
    const remove = vi.fn();
    const outcome = await supersedeRawEditOutput(
      { ...params, rawPath: 'D:/Photos/generated.png' },
      { store: useAppStore, assetsApi: { delete: remove } },
    );
    expect(outcome).toMatchObject({ deletedFile: false, keptReason: 'outside-output-root' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the file on disk while anything else still references it', async () => {
    useAppStore.setState({
      batchResults: [{ id: 'r1', assetPath: RAW, imagePath: `file:///${RAW}` } as never],
    });
    const remove = vi.fn();
    const outcome = await supersedeRawEditOutput(params, { store: useAppStore, assetsApi: { delete: remove } });
    expect(outcome).toMatchObject({ deletedFile: false, keptReason: 'referenced' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the file, without failing, when the delete is refused or unavailable', async () => {
    const refused = await supersedeRawEditOutput(params, {
      store: useAppStore,
      assetsApi: { delete: vi.fn().mockRejectedValue(new Error('not a managed path')) },
    });
    expect(refused).toMatchObject({ deletedFile: false, keptReason: 'delete-failed' });

    const unavailable = await supersedeRawEditOutput(params, { store: useAppStore, assetsApi: {} });
    expect(unavailable).toMatchObject({ deletedFile: false, keptReason: 'delete-failed' });
  });
});

describe('isOutputReferenced', () => {
  const rel = 'job-1/generated.png';

  it('looks inside Maps but ignores job bookkeeping and job snapshots', () => {
    expect(isOutputReferenced({ activeJobs: [{ result: rel }], completedJobs: [rel] }, rel)).toBe(false);
    expect(isOutputReferenced({ iterationNodes: new Map([['n', { generationJob: { result: rel } }]]) }, rel)).toBe(false);
    expect(isOutputReferenced({ iterationNodes: new Map([['n', { thumbnail: `/outputs/${rel}` }]]) }, rel)).toBe(true);
    expect(isOutputReferenced({ mediaAssets: [{ path: `C:/out/${rel}` }] }, rel)).toBe(true);
  });

  it('matches Windows backslash paths but not another job’s identically named output', () => {
    expect(isOutputReferenced({ mediaAssets: [{ path: 'C:\\out\\job-1\\generated.png' }] }, rel)).toBe(true);
    // Every backend output is called generated.png; only this job's folder counts.
    expect(isOutputReferenced({ mediaAssets: [{ path: 'C:/out/job-2/generated.png' }] }, rel)).toBe(false);
  });

  it('treats an empty name as referenced so nothing unnamed is ever deleted', () => {
    expect(isOutputReferenced({}, '')).toBe(true);
  });
});
