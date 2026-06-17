import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceInferenceService } from './huggingfaceInference';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

describe('createHuggingFaceInferenceService.getKeyInfo', () => {
  it('reads the account label and never echoes the token', async () => {
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({
        data: { name: 'rocky', fullname: 'Rocky E', auth: { accessToken: { displayName: 'vision-studio' } } },
      }),
      post: vi.fn(),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const info = await service.getKeyInfo('hf_secrettoken');

    expect(info.label).toBe('rocky');
    expect(JSON.stringify(info)).not.toContain('hf_secrettoken');
    const calledUrl = axiosInstance.get.mock.calls[0][0] as string;
    const calledHeaders = (axiosInstance.get.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(calledUrl).toContain('whoami');
    expect(calledHeaders.Authorization).toBe('Bearer hf_secrettoken');
  });

  it('maps an auth failure to a sanitized error that omits the token', async () => {
    const error = new Error('HTTP 401') as Error & { response: unknown };
    (error as { response: unknown }).response = {
      status: 401,
      headers: {},
      data: { error: 'Invalid token hf_secrettoken' },
    };
    const axiosInstance = { get: vi.fn().mockRejectedValue(error), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    await expect(service.getKeyInfo('hf_secrettoken')).rejects.toThrow(/HuggingFace/);
    await service.getKeyInfo('hf_secrettoken').catch((thrown: unknown) => {
      expect(String(thrown)).not.toContain('hf_secrettoken');
    });
  });
});

describe('createHuggingFaceInferenceService.listImageModels', () => {
  it('returns curated image-capable defaults', async () => {
    const service = createHuggingFaceInferenceService({ axiosInstance: { get: vi.fn(), post: vi.fn() } });
    const models = await service.listImageModels('hf_token');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => typeof model.id === 'string' && model.id.includes('/'))).toBe(true);
  });
});

describe('createHuggingFaceInferenceService.enhancePrompt', () => {
  it('calls the OpenAI-compatible chat endpoint and parses JSON output', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [
            { message: { content: JSON.stringify({ prompt: 'dramatic portrait, crisp detail', variations: [] }) } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        },
      }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const result = await service.enhancePrompt({
      token: 'hf_token',
      prompt: 'dramatic portrait',
      mode: 'clarify',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
    });

    expect(result.prompt).toBe('dramatic portrait, crisp detail');
    expect(result.usage?.totalTokens).toBe(18);
    const url = axiosInstance.post.mock.calls[0][0] as string;
    expect(url).toContain('/chat/completions');
  });

  it('rejects an over-long prompt before any network call', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.enhancePrompt({ token: 'hf_token', prompt: 'x'.repeat(9000), mode: 'clarify' }),
    ).rejects.toThrow(/character limit/);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});

describe('createHuggingFaceInferenceService.suggestNegativePrompt', () => {
  it('parses a structured negative-prompt suggestion', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [
            { message: { content: JSON.stringify({ negativePrompt: 'blurry, low quality', suggestions: ['blurry', 'low quality'] }) } },
          ],
        },
      }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.suggestNegativePrompt({ token: 'hf_token', prompt: 'a castle' });
    expect(result.negativePrompt).toBe('blurry, low quality');
    expect(result.suggestions).toEqual(['blurry', 'low quality']);
  });
});

describe('createHuggingFaceInferenceService.generateImage', () => {
  it('normalizes returned bytes to a png data URL', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: PNG_MAGIC, headers: { 'content-type': 'image/png' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const result = await service.generateImage({
      token: 'hf_token',
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: 'a tree',
      width: 1024,
      height: 1024,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].mimeType).toBe('image/png');
    expect(result.images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('rejects a non-image response body (sanitization)', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: Buffer.from('{"error":"loading"}'), headers: { 'content-type': 'application/json' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateImage({ token: 'hf_token', model: 'm/x', prompt: 'a tree', width: 512, height: 512 }),
    ).rejects.toThrow(/did not return a valid image|failed/i);
  });

  it('rejects an empty prompt before any network call', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateImage({ token: 'hf_token', model: 'm/x', prompt: '   ', width: 512, height: 512 }),
    ).rejects.toThrow(/empty/i);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('accepts a genuine RIFF/WEBP body as image/webp', async () => {
    // 'RIFF' (0-3) + size (4-7) + 'WEBP' form type (8-11) + payload.
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x10, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
      Buffer.from([0x56, 0x50, 0x38, 0x20]),
    ]);
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: webp, headers: { 'content-type': 'image/webp' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const result = await service.generateImage({
      token: 'hf_token',
      model: 'm/x',
      prompt: 'a tree',
      width: 512,
      height: 512,
    });

    expect(result.images[0].mimeType).toBe('image/webp');
    expect(result.images[0].dataUrl.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('rejects a bare RIFF body that is not WEBP (e.g. WAVE) instead of trusting it as webp', async () => {
    // RIFF container with a 'WAVE' form type must NOT be persisted as a webp.
    const wave = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x10, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
      Buffer.from([0x66, 0x6d, 0x74, 0x20]),
    ]);
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: wave, headers: { 'content-type': 'image/webp' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateImage({ token: 'hf_token', model: 'm/x', prompt: 'a tree', width: 512, height: 512 }),
    ).rejects.toThrow(/did not return a valid image|failed/i);
  });
});

const MP4_BYTES = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8)]);

describe('createHuggingFaceInferenceService.listVideoModels', () => {
  it('returns curated video-capable defaults', async () => {
    const service = createHuggingFaceInferenceService({ axiosInstance: { get: vi.fn(), post: vi.fn() } });
    const models = await service.listVideoModels('hf_token');
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => model.modality === 'video' && model.id.includes('/'))).toBe(true);
  });
});

describe('createHuggingFaceInferenceService.generateVideo', () => {
  it('normalizes returned bytes to an mp4 data URL via the hf-inference router', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: MP4_BYTES, headers: { 'content-type': 'video/mp4' } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.generateVideo({
      token: 'hf_token',
      model: 'Lightricks/LTX-Video',
      prompt: 'a wave',
      durationSeconds: 5,
    });
    expect(result.mimeType).toBe('video/mp4');
    expect(result.dataUrl.startsWith('data:video/mp4;base64,')).toBe(true);
    const url = axiosInstance.post.mock.calls[0][0] as string;
    expect(url).toBe('https://router.huggingface.co/hf-inference/models/Lightricks/LTX-Video');
  });

  it('rejects a non-video response body (sanitization)', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: Buffer.from('{"error":"loading"}'), headers: {} }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateVideo({ token: 'hf_token', model: 'm/v', prompt: 'a wave' }),
    ).rejects.toThrow(/did not return a valid video|failed/i);
  });

  it('rejects an empty prompt before any network call', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(service.generateVideo({ token: 'hf_token', model: 'm/v', prompt: '   ' })).rejects.toThrow(/empty/i);
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});

describe('createHuggingFaceInferenceService surface', () => {
  it('exposes the full generation surface without leaking internals or unproven CN/inpaint clients', () => {
    const service = createHuggingFaceInferenceService({ axiosInstance: { get: vi.fn(), post: vi.fn() } });
    expect(Object.keys(service).sort()).toEqual(
      [
        'enhancePrompt',
        'generateImage',
        'generateVideo',
        'getKeyInfo',
        'listImageModels',
        'listTextModels',
        'listVideoModels',
        'suggestNegativePrompt',
      ].sort(),
    );
  });
});
