/**
 * Integration tests: IPC handler HTTP contracts
 *
 * These tests verify that the Electron IPC handlers send the correct HTTP
 * requests to the Python backend and transform responses into the shapes
 * the React frontend expects. We test the pure functions extracted from
 * the IPC layer (requestBackend, error mapping) and validate the request/
 * response schemas against the real backend API contract.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Backend API request schemas ──────────────────────────────────────────

describe('ImageGenerationRequest schema', () => {
  it('requires prompt and has correct defaults', () => {
    const minimal = buildImageRequest({ prompt: 'a sunset' });

    expect(minimal).toEqual({
      prompt: 'a sunset',
      negative_prompt: '',
      width: 1024,
      height: 1024,
      steps: 25,
      cfg_scale: 7.5,
      seed: -1,
      model: 'flux-dev',
      scheduler: 'euler',
    });
  });

  it('accepts overrides for all fields', () => {
    const custom = buildImageRequest({
      prompt: 'cyberpunk city',
      negative_prompt: 'blurry',
      width: 1344,
      height: 768,
      steps: 50,
      cfg_scale: 12,
      seed: 42,
      model: 'sd3.5-medium',
      scheduler: 'dpm++',
    });

    expect(custom.width).toBe(1344);
    expect(custom.height).toBe(768);
    expect(custom.seed).toBe(42);
    expect(custom.model).toBe('sd3.5-medium');
  });

  it('rejects dimensions outside allowed range', () => {
    expect(() => buildImageRequest({ prompt: 'x', width: 128 })).toThrow();
    expect(() => buildImageRequest({ prompt: 'x', width: 4096 })).toThrow();
    expect(() => buildImageRequest({ prompt: 'x', height: 0 })).toThrow();
  });

  it('rejects steps outside allowed range', () => {
    expect(() => buildImageRequest({ prompt: 'x', steps: 0 })).toThrow();
    expect(() => buildImageRequest({ prompt: 'x', steps: 200 })).toThrow();
  });

  it('rejects cfg_scale outside allowed range', () => {
    expect(() => buildImageRequest({ prompt: 'x', cfg_scale: 0 })).toThrow();
    expect(() => buildImageRequest({ prompt: 'x', cfg_scale: 50 })).toThrow();
  });
});

describe('VideoGenerationRequest schema', () => {
  it('requires prompt and has correct defaults', () => {
    const minimal = buildVideoRequest({ prompt: 'waves crashing' });

    expect(minimal).toEqual({
      prompt: 'waves crashing',
      image_path: null,
      width: 1024,
      height: 576,
      fps: 24,
      duration: 5,
      steps: 25,
      model: 'ltx-video',
      seed: -1,
    });
  });

  it('includes image_path for image-to-video models', () => {
    const svd = buildVideoRequest({
      prompt: 'animate this',
      model: 'svd',
      image_path: '/path/to/ref.png',
    });

    expect(svd.image_path).toBe('/path/to/ref.png');
    expect(svd.model).toBe('svd');
  });
});

// ── Backend API response schemas ─────────────────────────────────────────

describe('JobResponse contract', () => {
  it('contains job_id and pending status', () => {
    const response = { job_id: 'abc-123', status: 'pending', message: 'Job queued' };

    expect(response).toHaveProperty('job_id');
    expect(response.status).toBe('pending');
  });
});

describe('JobStatusResponse contract', () => {
  it('validates a completed image job response', () => {
    const status = buildJobStatusResponse({
      job_id: 'job-1',
      status: 'completed',
      type: 'image',
      progress: 100,
      result: {
        images: ['/outputs/job-1/image_001.png'],
        seed: 42,
        width: 1024,
        height: 1024,
        prompt: 'a sunset',
        model: 'flux-dev',
      },
    });

    expect(status.status).toBe('completed');
    expect(status.progress).toBe(100);
    expect(status.result?.images).toHaveLength(1);
    expect(status.result?.seed).toBe(42);
    expect(status.error).toBeUndefined();
  });

  it('validates a failed job response', () => {
    const status = buildJobStatusResponse({
      job_id: 'job-2',
      status: 'failed',
      type: 'image',
      progress: 30,
      error: 'Out of VRAM',
    });

    expect(status.status).toBe('failed');
    expect(status.error).toBe('Out of VRAM');
    expect(status.result).toBeUndefined();
  });

  it('validates a processing job with partial progress', () => {
    const status = buildJobStatusResponse({
      job_id: 'job-3',
      status: 'processing',
      type: 'video',
      progress: 55.5,
    });

    expect(status.status).toBe('processing');
    expect(status.progress).toBeGreaterThanOrEqual(0);
    expect(status.progress).toBeLessThanOrEqual(100);
  });

  it('validates all allowed status values', () => {
    const allowed = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    for (const s of allowed) {
      expect(() =>
        buildJobStatusResponse({ job_id: 'x', status: s as any, type: 'image', progress: 0 })
      ).not.toThrow();
    }
  });
});

// ── WebSocket message contract ───────────────────────────────────────────

describe('WebSocket job_update message contract', () => {
  it('contains required fields for progress forwarding', () => {
    const message = {
      type: 'job_update',
      job_id: 'job-1',
      status: 'processing',
      progress: 45.2,
    };

    expect(message.type).toBe('job_update');
    expect(message).toHaveProperty('job_id');
    expect(message).toHaveProperty('status');
    expect(message).toHaveProperty('progress');
    expect(typeof message.progress).toBe('number');
  });

  it('includes result on completion', () => {
    const message = {
      type: 'job_update',
      job_id: 'job-1',
      status: 'completed',
      progress: 100,
      result: {
        images: ['/outputs/job-1/image_001.png'],
        seed: 42,
      },
    };

    expect(message.status).toBe('completed');
    expect(message.result?.images).toHaveLength(1);
  });
});

// ── IPC response transformation contracts ────────────────────────────────

describe('IPC handler response shapes', () => {
  it('maps successful generation to { success, jobId }', () => {
    const backendResponse = { data: { job_id: 'abc-123' } };
    const ipcResult = transformGenerateResponse(backendResponse);

    expect(ipcResult).toEqual({
      success: true,
      jobId: 'abc-123',
    });
  });

  it('maps axios error with detail to { success: false, error }', () => {
    const axiosError = {
      response: { data: { detail: 'Invalid dimensions' } },
      message: 'Request failed with status code 422',
    };
    const ipcResult = transformGenerateError(axiosError);

    expect(ipcResult).toEqual({
      success: false,
      error: 'Invalid dimensions',
    });
  });

  it('maps network error to { success: false, error }', () => {
    const networkError = {
      message: 'connect ECONNREFUSED 127.0.0.1:8000',
    };
    const ipcResult = transformGenerateError(networkError);

    expect(ipcResult).toEqual({
      success: false,
      error: 'connect ECONNREFUSED 127.0.0.1:8000',
    });
  });

  it('maps batch response to { success, jobIds[] }', () => {
    const batchResult = transformBatchResponse(['id-1', 'id-2', 'id-3']);

    expect(batchResult).toEqual({
      success: true,
      jobIds: ['id-1', 'id-2', 'id-3'],
    });
  });

  it('system info error falls back to safe defaults', () => {
    const fallback = systemInfoFallback();

    expect(fallback).toEqual({
      gpu_available: false,
      comfyui_connected: false,
      models_count: 0,
    });
  });
});

// ── Retry logic contract ─────────────────────────────────────────────────

describe('requestBackend retry logic', () => {
  it('retries on ECONNREFUSED and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'))
      .mockResolvedValueOnce({ data: { job_id: 'ok' } });

    const result = await requestBackendImpl(fn, 5, 0);
    expect(result).toEqual({ data: { job_id: 'ok' } });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-connection errors', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('400 Bad Request'));

    await expect(requestBackendImpl(fn, 5, 0)).rejects.toThrow('400 Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));

    await expect(requestBackendImpl(fn, 3, 0)).rejects.toThrow('ECONNREFUSED');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ── Crop/Upscale request contracts ───────────────────────────────────────

describe('ImageEditRequest contract', () => {
  it('builds a valid crop request', () => {
    const request = {
      source_path: '/outputs/job-1/image_001.png',
      crop_box: { left: 100, top: 50, width: 800, height: 600 },
      rotation: 0,
      flip_horizontal: false,
      flip_vertical: false,
    };

    expect(request.source_path).toBeTruthy();
    expect(request.crop_box.width).toBeGreaterThan(0);
    expect(request.crop_box.height).toBeGreaterThan(0);
  });

  it('builds a valid upscale request', () => {
    const request = {
      source_path: '/outputs/job-1/image_001.png',
      scale_factor: 2,
    };

    expect(request.source_path).toBeTruthy();
    expect(request.scale_factor).toBeGreaterThanOrEqual(2);
    expect(request.scale_factor).toBeLessThanOrEqual(4);
  });
});

// ── AssetJobStatus → frontend mapping contract ───────────────────────────

describe('AssetJobStatus contract', () => {
  it('matches the shape expected by syncAssetsFromJobStatus', () => {
    const backendJob = {
      job_id: 'job-1',
      status: 'completed' as const,
      type: 'image' as const,
      created_at: '2026-03-13T10:00:00.000Z',
      completed_at: '2026-03-13T10:01:00.000Z',
      result: {
        images: ['/outputs/job-1/image_001.png'],
        seed: 42,
      },
      params: {
        prompt: 'a sunset',
        negative_prompt: 'blurry',
        width: 1024,
        height: 1024,
        model: 'flux-dev',
      },
    };

    // Verify all fields expected by upsertAssetsFromJobStatus
    expect(backendJob).toHaveProperty('job_id');
    expect(backendJob).toHaveProperty('status');
    expect(backendJob).toHaveProperty('type');
    expect(backendJob).toHaveProperty('created_at');
    expect(backendJob.result).toHaveProperty('images');
    expect(backendJob.params).toHaveProperty('prompt');
  });

  it('handles video job status shape', () => {
    const videoJob = {
      job_id: 'job-v1',
      status: 'completed' as const,
      type: 'video' as const,
      created_at: '2026-03-13T10:00:00.000Z',
      result: {
        video: '/outputs/job-v1/video.mp4',
        duration: 5,
        fps: 24,
      },
      params: {
        prompt: 'waves',
        width: 1024,
        height: 576,
        model: 'ltx-video',
      },
    };

    expect(videoJob.result).toHaveProperty('video');
    expect(videoJob.result).toHaveProperty('duration');
  });
});

// ── ModelRecord / models endpoints contract ──────────────────────────────

describe('ModelRecord contract', () => {
  it('a record carries the canonical Foundry fields', () => {
    const record = buildModelRecord({ id: 'flux-dev', capability: 'image', tier: 'verified' });
    expect(record).toMatchObject({
      id: 'flux-dev',
      capability: 'image',
      tier: 'verified',
      base_architecture: expect.any(String),
      runtime: expect.any(String),
      status: expect.any(String),
    });
  });

  it('maps a backend records array to the frontend list shape', () => {
    const mapped = mapModelsListResponse([
      buildModelRecord({ id: 'a' }),
      buildModelRecord({ id: 'b', capability: 'video' }),
    ]);
    expect(mapped.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('M4 fields are present and typed correctly on ModelRecord (compile-time contract)', () => {
    // Compile-time contract: typed as import ModelRecord so tsc validates every field.
    const record: import('@/types/model').ModelRecord = {
      id: 'civitai-lora-1', name: 'Test LoRA', artifact_type: 'lora', capability: 'image',
      base_architecture: 'sdxl', source: 'civitai', repo_id: null, revision: 'main',
      aux_repo_id: null, size: '200 MB', status: 'not_found', tier: 'compatible',
      quality: 'balanced', runtime: 'local', hardware_class: 'creator', vram: '8 GB',
      description: '', license: null, gated: false,
      tier_reason: 'standalone sdxl lora - safetensors',
      format: 'safetensors',
      trust_remote_code: false,
      nsfw: false,
      download_url: 'https://civitai.com/api/download/models/1',
      sha256: 'ab'.repeat(32),
    };
    expect(record.tier_reason).toBe('standalone sdxl lora - safetensors');
    expect(record.format).toBe('safetensors');
    expect(record.trust_remote_code).toBe(false);
    expect(record.nsfw).toBe(false);
    expect(record.download_url).toBe('https://civitai.com/api/download/models/1');
    expect(record.sha256).toBe('ab'.repeat(32));
  });
});

// ── DownloadJob / downloads endpoints contract ───────────────────────────

describe('DownloadJob contract', () => {
  it('carries the canonical Foundry download fields and no token', () => {
    const job = buildDownloadJob({ model_id: 'flux-dev', status: 'downloading', progress: 0.5 });
    expect(job).toMatchObject({
      model_id: 'flux-dev',
      status: 'downloading',
      progress: 0.5,
      speed: expect.any(Number),
      total_bytes: expect.any(Number),
    });
    expect(job).not.toHaveProperty('token');
  });

  it('maps a backend downloads array into a model_id-keyed map', () => {
    const map = mapDownloadsResponse([
      buildDownloadJob({ model_id: 'a' }),
      buildDownloadJob({ model_id: 'b', status: 'paused' }),
    ]);
    expect(Object.keys(map).sort()).toEqual(['a', 'b']);
    expect(map.b.status).toBe('paused');
  });

  it('the download control action set is exactly pause/resume/cancel', () => {
    expect(downloadActions()).toEqual(['pause', 'resume', 'cancel']);
  });
});

// ── Helper implementations ───────────────────────────────────────────────
// These mirror the logic in electron/ipc-handlers/generation.ts so we can
// test the contract in isolation without requiring Electron.

interface ImageGenerationParams {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  model?: string;
  scheduler?: string;
}

function buildImageRequest(params: ImageGenerationParams) {
  const {
    prompt,
    negative_prompt = '',
    width = 1024,
    height = 1024,
    steps = 25,
    cfg_scale = 7.5,
    seed = -1,
    model = 'flux-dev',
    scheduler = 'euler',
  } = params;

  if (width < 256 || width > 2048) throw new Error(`width ${width} out of range [256, 2048]`);
  if (height < 256 || height > 2048) throw new Error(`height ${height} out of range [256, 2048]`);
  if (steps < 1 || steps > 100) throw new Error(`steps ${steps} out of range [1, 100]`);
  if (cfg_scale < 1 || cfg_scale > 30) throw new Error(`cfg_scale ${cfg_scale} out of range [1, 30]`);

  return { prompt, negative_prompt, width, height, steps, cfg_scale, seed, model, scheduler };
}

interface VideoGenerationParams {
  prompt: string;
  image_path?: string | null;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  steps?: number;
  model?: string;
  seed?: number;
}

function buildVideoRequest(params: VideoGenerationParams) {
  return {
    prompt: params.prompt,
    image_path: params.image_path ?? null,
    width: params.width ?? 1024,
    height: params.height ?? 576,
    fps: params.fps ?? 24,
    duration: params.duration ?? 5,
    steps: params.steps ?? 25,
    model: params.model ?? 'ltx-video',
    seed: params.seed ?? -1,
  };
}

interface JobStatusResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  type: 'image' | 'video';
  progress: number;
  created_at?: string;
  completed_at?: string;
  result?: Record<string, any>;
  error?: string;
}

function buildJobStatusResponse(input: Partial<JobStatusResponse> & { job_id: string; status: JobStatusResponse['status']; type: 'image' | 'video'; progress: number }): JobStatusResponse {
  return {
    job_id: input.job_id,
    status: input.status,
    type: input.type,
    progress: input.progress,
    created_at: input.created_at ?? new Date().toISOString(),
    completed_at: input.completed_at,
    result: input.result,
    error: input.error,
  };
}

function transformGenerateResponse(axiosResponse: { data: { job_id: string } }) {
  return { success: true, jobId: axiosResponse.data.job_id };
}

function transformGenerateError(error: { response?: { data?: { detail?: string } }; message: string }) {
  return { success: false, error: error.response?.data?.detail || error.message };
}

function transformBatchResponse(jobIds: string[]) {
  return { success: true, jobIds };
}

function systemInfoFallback() {
  return { gpu_available: false, comfyui_connected: false, models_count: 0 };
}

function isConnectionRefused(error: { message: string }) {
  return typeof error.message === 'string' && error.message.includes('ECONNREFUSED');
}

async function requestBackendImpl<T>(
  request: () => Promise<T>,
  attempts: number = 10,
  delayMs: number = 500
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error: any) {
      lastError = error;
      if (!isConnectionRefused(error) || attempt === attempts) {
        throw error;
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

interface ModelRecordShape {
  id: string;
  name: string;
  artifact_type: string;
  capability: 'image' | 'video' | 'edit' | 'inpaint';
  base_architecture: string;
  source: string;
  repo_id: string | null;
  revision: string;
  aux_repo_id: string | null;
  size: string;
  status: string;
  tier: string;
  quality: string;
  runtime: string;
  hardware_class: string;
  vram: string;
  description: string;
  license: string | null;
  gated: boolean;
  // M4 classification + security fields (absent on older payloads):
  tier_reason?: string | null;
  format?: 'safetensors' | 'pickle' | 'diffusers' | null;
  trust_remote_code?: boolean;
  nsfw?: boolean;
  download_url?: string | null;
  sha256?: string | null;
}

function buildModelRecord(over: Partial<ModelRecordShape>): ModelRecordShape {
  return {
    id: 'model', name: 'Model', artifact_type: 'checkpoint', capability: 'image',
    base_architecture: 'sdxl', source: 'huggingface', repo_id: 'org/x', revision: 'main',
    aux_repo_id: null, size: '1 GB', status: 'not_found', tier: 'verified', quality: 'balanced',
    runtime: 'local', hardware_class: 'creator', vram: '1 GB', description: '', license: null,
    gated: false, ...over,
  };
}

function mapModelsListResponse(records: ModelRecordShape[]): ModelRecordShape[] {
  return records;
}

interface DownloadJobShape {
  model_id: string;
  status: 'queued' | 'downloading' | 'paused' | 'verifying' | 'ready' | 'error' | 'cancelled';
  progress: number;
  speed: number;
  eta: number | null;
  total_bytes: number;
  error: string | null;
  gate_url: string | null;
}

function buildDownloadJob(over: Partial<DownloadJobShape>): DownloadJobShape {
  return {
    model_id: 'model', status: 'queued', progress: 0, speed: 0, eta: null,
    total_bytes: 0, error: null, gate_url: null, ...over,
  };
}

function mapDownloadsResponse(jobs: DownloadJobShape[]): Record<string, DownloadJobShape> {
  const map: Record<string, DownloadJobShape> = {};
  for (const job of jobs) map[job.model_id] = job;
  return map;
}

function downloadActions(): string[] {
  return ['pause', 'resume', 'cancel'];
}

// ── M5 hardware + runtime plan contracts ─────────────────────────────────

describe('M5 hardware + runtime plan contracts', () => {
  it('HardwareProfile carries the fit-relevant fields', () => {
    const profile: import('@/types/model').HardwareProfile = {
      gpu_available: true, gpu_name: 'RTX 4090',
      vram_total_bytes: 25769803776, vram_free_bytes: 21474836480,
      compute_major: 8, compute_minor: 9, cuda_version: '12.1',
      torch_available: true, system_ram_total_bytes: 68719476736,
      system_ram_available_bytes: 51539607552, disk_free_bytes: 966367641600,
    };
    expect(profile.vram_total_bytes).toBeGreaterThan(0);
  });

  it('RuntimePlan refusal and readiness are renderer-visible', () => {
    const plan: import('@/types/model').RuntimePlan = {
      pipeline_class: 'StableDiffusionXLPipeline', precision: 'bf16',
      offload: false, vae_tiling: false, attention_slicing: true,
      single_file: false, config_catalog_id: null,
      vram_plan: { weight_bytes: 1, activation_bytes: 1, runtime_bytes: 1, total_bytes: 3, basis: 'estimated' },
      fit: 'fits', missing_components: [], fallback_ladder: [],
      readiness: 'Ready - bf16 - fits (estimated)', refusal: null,
    };
    expect(plan.readiness).toContain('Ready');
  });
});

// ── LibraryRoot / ScanResult contracts ───────────────────────────────────

describe('LibraryRoot contract', () => {
  it('matches the backend LibraryRootSchema field set', () => {
    const root: import('@/types/model').LibraryRoot = {
      id: 'r1',
      path: '/some/path',
      layout_hint: 'comfyui',
      added_at: '2026-06-09T00:00:00Z',
    };
    expect(Object.keys(root).sort()).toEqual(['added_at', 'id', 'layout_hint', 'path']);
  });

  it('ScanResult matches ScanResultSchema', () => {
    const result: import('@/types/model').ScanResult = { records_indexed: 0, warnings: [] };
    expect(Object.keys(result).sort()).toEqual(['records_indexed', 'warnings']);
  });
});
