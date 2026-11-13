import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../appStore';
import { useNoticeStore } from '@/features/notices/notices';
import { RETOUCH_SIZE_MAX, RETOUCH_SIZE_MIN } from '@/features/edit/retouch';
import type { ModelRecord } from '@/types/model';
import type { AssetRecord } from '@/types/assets';
import type { PromptTemplate } from '@/types/promptStudio';
import type { ProjectTemplate } from '@/types/template';
import { collectSmartQueryMatches } from './collectionsSlice';
import { COMPLETED_JOB_HISTORY_CAP, GENERATION_QUEUE_CAP } from './generationSlice';
import { DEFAULT_IMAGE_MODEL_ID, resolveDefaultImageModelId } from './modelsSlice';

function model(id: string, overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id,
    name: id.toUpperCase(),
    artifact_type: 'checkpoint',
    capability: 'image',
    base_architecture: 'sdxl',
    source: 'huggingface',
    repo_id: null,
    revision: null,
    aux_repo_id: null,
    size: '1 GB',
    status: 'ready',
    tier: 'verified',
    quality: 'balanced',
    runtime: 'local',
    hardware_class: 'creator',
    vram: '8 GB',
    description: '',
    license: null,
    gated: false,
    ...overrides,
  };
}

function setElectron(value: unknown) {
  (globalThis as { window?: unknown }).window = value;
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  useNoticeStore.getState().clear();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('job bookkeeping (#J1/#J2)', () => {
  const job = (id: string) => ({
    id,
    type: 'image' as const,
    status: 'processing' as const,
    progress: 10,
    params: {},
    createdAt: new Date(),
  });

  it('an update that changes nothing does not notify subscribers', () => {
    useAppStore.getState().addJob(job('j1'));
    const listener = vi.fn();
    const unsubscribe = useAppStore.subscribe(listener);
    useAppStore.getState().updateJob('j1', { progress: 10, status: 'processing' });
    expect(listener).not.toHaveBeenCalled();
    useAppStore.getState().updateJob('j1', { progress: 11 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps only a small finished-job history', () => {
    for (let i = 0; i < COMPLETED_JOB_HISTORY_CAP + 10; i++) {
      useAppStore.getState().addJob(job(`j${i}`));
      useAppStore.getState().updateJob(`j${i}`, { status: 'failed' });
    }
    expect(useAppStore.getState().activeJobs).toHaveLength(0);
    expect(useAppStore.getState().completedJobs).toHaveLength(COMPLETED_JOB_HISTORY_CAP);
    expect(useAppStore.getState().completedJobs[0].id).toBe(`j${COMPLETED_JOB_HISTORY_CAP + 9}`);
  });

  it('caps the generation strip and updates items in place', () => {
    for (let i = 0; i < GENERATION_QUEUE_CAP + 5; i++) {
      useAppStore.getState().addToGenerationQueue({ id: `q${i}`, prompt: 'p', params: {}, status: 'pending', createdAt: new Date() });
    }
    const queue = useAppStore.getState().generationQueue;
    expect(queue).toHaveLength(GENERATION_QUEUE_CAP);
    expect(queue[0].id).toBe('q5');
    useAppStore.getState().updateGenerationQueueItem('q5', { status: 'completed', thumbnail: 't.png' });
    expect(useAppStore.getState().generationQueue[0]).toMatchObject({ status: 'completed', thumbnail: 't.png' });
  });

  it('settles a batch once every job has an outcome', () => {
    useAppStore.setState({ activeBatchId: 'b1' });
    useAppStore.getState().addBatchJob({
      id: 'b1', name: 'B', prompts: ['a', 'b'], jobIds: ['ja', 'jb'], currentIndex: 0,
      completedJobs: [], failedJobs: [], status: 'running', createdAt: new Date(),
    });
    useAppStore.getState().recordBatchJobOutcome('b1', 'ja', 'completed');
    useAppStore.getState().recordBatchJobOutcome('b1', 'ja', 'completed');
    expect(useAppStore.getState().batchJobs[0]).toMatchObject({ status: 'running', currentIndex: 1 });
    useAppStore.getState().recordBatchJobOutcome('b1', 'jb', 'failed');
    expect(useAppStore.getState().batchJobs[0]).toMatchObject({
      status: 'completed', completedJobs: ['ja'], failedJobs: ['jb'], currentIndex: 2,
    });
    expect(useAppStore.getState().activeBatchId).toBeNull();
  });
});

describe('download controls surface failures (#J10)', () => {
  it('reports a thrown bridge error as a notice and a failed result', async () => {
    useAppStore.setState({ availableModels: [model('sdxl-base')] });
    setElectron({ electron: { models: { download: vi.fn().mockRejectedValue(new Error('backend down')) } } });

    const result = await useAppStore.getState().enqueueDownload('sdxl-base');

    expect(result).toEqual({ ok: false, error: 'backend down' });
    expect(useNoticeStore.getState().notices.map((n) => [n.tone, n.message])).toEqual([
      ['error', 'Could not start the download of SDXL-BASE: backend down'],
    ]);
  });

  it('reports a resolved error envelope the same way', async () => {
    setElectron({ electron: { models: { downloadPause: vi.fn().mockResolvedValue({ success: false, error: 'not running' }) } } });
    const result = await useAppStore.getState().pauseDownload('flux-dev');
    expect(result).toEqual({ ok: false, error: 'not running' });
    expect(useNoticeStore.getState().notices[0].message).toContain('pause');
  });

  it('records the job and returns ok on success', async () => {
    setElectron({
      electron: { models: { downloadResume: vi.fn().mockResolvedValue({ model_id: 'flux-dev', status: 'downloading', progress: 0.1 }) } },
    });
    expect(await useAppStore.getState().resumeDownload('flux-dev')).toEqual({ ok: true });
    expect(useAppStore.getState().downloads['flux-dev'].status).toBe('downloading');
    expect(useNoticeStore.getState().notices).toHaveLength(0);
  });
});

describe('templates default to installed models and carry their settings (#J16)', () => {
  it('resolves the preferred, then the first installed, then the catalog default model', () => {
    const models = [model('lora-x', { artifact_type: 'lora' }), model('sdxl-base'), model('flux-dev', { status: 'not_found' })];
    expect(resolveDefaultImageModelId(models, 'sdxl-base')).toBe('sdxl-base');
    expect(resolveDefaultImageModelId(models, 'flux-dev')).toBe('sdxl-base');
    expect(resolveDefaultImageModelId([], 'flux-dev')).toBe(DEFAULT_IMAGE_MODEL_ID);
  });

  it('a built-in project template applied to a project uses a model the user has', () => {
    useAppStore.setState({ availableModels: [model('sdxl-base')] });
    const template: ProjectTemplate = {
      id: 't', name: 'T', description: '', category: 'art', thumbnail: '1:1',
      settings: { width: 1024, height: 1024, model: 'flux-dev', steps: 25, cfgScale: 7, prompt: '', negativePrompt: '' },
    };
    const project = { id: 'p', name: 'P', path: '', createdAt: new Date(), updatedAt: new Date(), template };

    useAppStore.getState().setCurrentProject(project);
    expect(useAppStore.getState().currentProject?.template?.settings.model).toBe('sdxl-base');

    useAppStore.getState().setCurrentProject({ ...project, template: { ...template, isCustom: true } });
    expect(useAppStore.getState().currentProject?.template?.settings.model).toBe('flux-dev');
  });

  it('applying a prompt template applies its suggested settings', () => {
    const template: PromptTemplate = {
      id: 'tpl', name: 'Tpl', description: '', category: 'portrait', promptText: 'portrait',
      negativePrompt: 'blurry',
      suggestedSettings: { model: 'sdxl-base', aspectRatio: '2:3', steps: 30, cfgScale: 6.5, scheduler: 'DPM++ 2M Karras' },
      isBuiltIn: true, isFavorite: false, createdAt: 0,
    };
    useAppStore.setState({ promptTemplates: [template], availableModels: [model('sdxl-base')] });

    useAppStore.getState().applyPromptTemplate('tpl', 'replace');

    const state = useAppStore.getState();
    expect(state.aspectRatio).toBe('2:3');
    expect(state.generationDraft).toMatchObject({
      prompt: 'portrait', negativePrompt: 'blurry', model: 'sdxl-base', steps: 30, cfgScale: 6.5, scheduler: 'DPM++ 2M Karras',
    });
    expect(state.generationDraft!.width).toBeLessThan(state.generationDraft!.height);
  });

  it('keeps the current model when the suggested one is not installed', () => {
    const template: PromptTemplate = {
      id: 'tpl', name: 'Tpl', description: '', category: 'portrait', promptText: 'p',
      suggestedSettings: { model: 'sd-xl', steps: 12 }, isBuiltIn: true, isFavorite: false, createdAt: 0,
    };
    useAppStore.setState({ promptTemplates: [template], availableModels: [], selectedImageModelId: 'flux-dev' });
    useAppStore.getState().applyPromptTemplate('tpl', 'replace');
    expect(useAppStore.getState().generationDraft).toMatchObject({ model: 'flux-dev', steps: 12 });
  });
});

describe('renderer UI store requests (#J17)', () => {
  it('the FPS picker sets the active sequence frame rate', () => {
    useAppStore.setState({
      activeTimelineSequenceId: 's1',
      timelineSequences: [
        { id: 's1', projectId: 'p', name: 'A', trackIds: [], durationMs: 1000, fps: 24, playRange: null, createdAt: 'x', updatedAt: 'x' },
        { id: 's2', projectId: 'p', name: 'B', trackIds: [], durationMs: 1000, fps: 24, playRange: null, createdAt: 'x', updatedAt: 'x' },
      ],
    });
    useAppStore.getState().setTimelineFps(30);
    const [s1, s2] = useAppStore.getState().timelineSequences;
    expect(useAppStore.getState().timelineFps).toBe(30);
    expect(s1.fps).toBe(30);
    expect(s1.updatedAt).not.toBe('x');
    expect(s2.fps).toBe(24);
  });

  it('startProvisioning forwards a model subset to the bridge', async () => {
    const start = vi.fn().mockResolvedValue({ success: false, error: 'x' });
    setElectron({ electron: { provisioning: { start } } });
    await useAppStore.getState().startProvisioning({ modelIds: ['sdxl-base'] });
    expect(start).toHaveBeenCalledWith({ modelIds: ['sdxl-base'] });
    await useAppStore.getState().startProvisioning();
    expect(start).toHaveBeenLastCalledWith(undefined);
  });

  it('smart queries match on media type and favorites', () => {
    const asset = (id: string, type: AssetRecord['type'], favorite: boolean): AssetRecord => ({
      id, jobId: id, name: id, type, path: id, previewUrl: '', thumbnail: '', createdAt: '2026-01-01T00:00:00Z',
      prompt: 'sunset', negativePrompt: '', favorite, params: {},
    });
    const assets = [asset('a', 'image', true), asset('b', 'video', true), asset('c', 'image', false)];
    expect(collectSmartQueryMatches({ mediaTypes: ['image'] }, assets, new Map())).toEqual(['a', 'c']);
    expect(collectSmartQueryMatches({ favoritesOnly: true }, assets, new Map())).toEqual(['a', 'b']);
    expect(collectSmartQueryMatches({ mediaTypes: ['image'], favoritesOnly: true, promptText: 'SUN' }, assets, new Map())).toEqual(['a']);
  });

  it('createSmartCollection returns the created collection', () => {
    const created = useAppStore.getState().createSmartCollection({ name: 'Faves', smartQuery: { promptText: 'x' } });
    expect(created).toMatchObject({ name: 'Faves', type: 'smart' });
    expect(useAppStore.getState().collections.map((c) => c.id)).toEqual([created.id]);
  });

  it('clamps the edit brush to the retouch range', () => {
    useAppStore.getState().setEditBrushSize(0);
    expect(useAppStore.getState().editBrushSize).toBe(RETOUCH_SIZE_MIN);
    useAppStore.getState().setEditBrushSize(RETOUCH_SIZE_MAX * 2);
    expect(useAppStore.getState().editBrushSize).toBe(RETOUCH_SIZE_MAX);
  });
});
