import { describe, expect, it, vi } from 'vitest';
import { createHuggingFaceInferenceService, HUGGINGFACE_GATED_MODEL_MESSAGE } from './huggingfaceInference';

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

  it('sends the first curated text model when the account has none selected', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: { choices: [{ message: { content: JSON.stringify({ prompt: 'p', variations: [] }) } }] },
      }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const curated = await service.listTextModels('hf_token');

    await service.enhancePrompt({ token: 'hf_token', prompt: 'a cat', mode: 'clarify' });
    await service.enhancePrompt({ token: 'hf_token', prompt: 'a cat', mode: 'clarify', model: '  ' });

    expect(axiosInstance.post.mock.calls[0][1].model).toBe(curated[0].id);
    expect(axiosInstance.post.mock.calls[1][1].model).toBe(curated[0].id);
  });

  it('explains a 403 on a gated model instead of blaming the token', async () => {
    const gated = Object.assign(new Error('HTTP 403'), {
      response: {
        status: 403,
        headers: {},
        data: { error: 'Access to model meta-llama/Llama-3.1-8B-Instruct is restricted. hf_secret' },
      },
    });
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockRejectedValue(gated) };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const thrown = (await service
      .enhancePrompt({ token: 'hf_secret', prompt: 'a cat', mode: 'clarify' })
      .catch((error: unknown) => error)) as Error;

    expect(thrown.message).toBe(HUGGINGFACE_GATED_MODEL_MESSAGE);
    expect(thrown.message).not.toMatch(/rejected the token/);
    expect(thrown.message).not.toContain('hf_secret');
  });

  it('still points a 403 without a gated body at the license and the token scope', async () => {
    const forbidden = Object.assign(new Error('HTTP 403'), {
      response: { status: 403, headers: {}, data: Buffer.from('{"error":"forbidden"}') },
    });
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockRejectedValue(forbidden) };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    await expect(
      service.generateImage({ token: 'hf_token', model: 'm/x', prompt: 'a tree', width: 512, height: 512 }),
    ).rejects.toThrow(/gated.*Inference Providers/s);
  });

  it('flags an unreadable reply as a fallback that echoes the input', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { choices: [{ message: { content: 'sorry, prose' } }] } }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance, logger: { warn: vi.fn() } });

    const enhanced = await service.enhancePrompt({ token: 'hf_token', prompt: 'a cat', mode: 'clarify' });
    const negative = await service.suggestNegativePrompt({ token: 'hf_token', prompt: 'a cat', negativePrompt: 'blur' });

    expect(enhanced).toMatchObject({ prompt: 'a cat', variations: [], fallback: true });
    expect(negative).toMatchObject({ negativePrompt: 'blur', suggestions: [], fallback: true });
  });

  it('does not flag a readable reply as a fallback', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: { choices: [{ message: { content: JSON.stringify({ prompt: 'a tabby cat', variations: [] }) } }] },
      }),
    };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    const result = await service.enhancePrompt({ token: 'hf_token', prompt: 'a cat', mode: 'clarify' });
    expect(result.fallback).toBeUndefined();
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

  it('keeps the AbortError identity when the request is cancelled (axios CanceledError)', async () => {
    const canceled = Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
    const axiosInstance = { get: vi.fn(), post: vi.fn().mockRejectedValue(canceled) };
    const service = createHuggingFaceInferenceService({ axiosInstance });

    const thrown = await service
      .generateImage({ token: 'hf_token', model: 'm/x', prompt: 'a tree', width: 512, height: 512 })
      .catch((error: unknown) => error);

    expect((thrown as Error).name).toBe('AbortError');
    expect(axiosInstance.post).toHaveBeenCalledOnce();
  });

  it('does not retry a billed generation on a 502 or a timeout', async () => {
    const badGateway = Object.assign(new Error('HTTP 502'), { response: { status: 502, headers: {} } });
    const timeout = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    for (const failure of [badGateway, timeout]) {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ data: PNG_MAGIC }),
      };
      const service = createHuggingFaceInferenceService({ axiosInstance, retryBaseDelayMs: 0 });
      await expect(
        service.generateImage({ token: 'hf_token', model: 'm/x', prompt: 'a tree', width: 512, height: 512 }),
      ).rejects.toThrow();
      expect(axiosInstance.post).toHaveBeenCalledOnce();
    }
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

  it('rejects an unsafe model id before any network call', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const service = createHuggingFaceInferenceService({ axiosInstance });
    await expect(
      service.generateImage({ token: 'hf_token', model: '../../etc/passwd', prompt: 'a tree', width: 512, height: 512 }),
    ).rejects.toThrow(/Invalid HuggingFace model id/);
    await expect(
      service.generateImage({ token: 'hf_token', model: 'org/model/extra', prompt: 'a tree', width: 512, height: 512 }),
    ).rejects.toThrow(/Invalid HuggingFace model id/);
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

describe('createHuggingFaceInferenceService.generateImage adapter-by-model-id (#42)', () => {
  const PNG_BLOB = new Blob([PNG_MAGIC]);

  it('dispatches through the official-client seam with the LoRA repo id AS the model', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const adapterTextToImage = vi.fn().mockResolvedValue(PNG_BLOB);
    const service = createHuggingFaceInferenceService({ axiosInstance, adapterTextToImage });

    const result = await service.generateImage({
      token: 'hf_token',
      model: 'black-forest-labs/FLUX.1-schnell',
      adapterRepoId: 'XLabs-AI/flux-RealismLora',
      prompt: 'a tree',
      negativePrompt: 'blurry',
      width: 1024,
      height: 768,
      seed: 7,
    });

    expect(adapterTextToImage).toHaveBeenCalledWith(
      {
        accessToken: 'hf_token',
        model: 'XLabs-AI/flux-RealismLora',
        provider: 'auto',
        inputs: 'a tree',
        parameters: { negative_prompt: 'blurry', width: 1024, height: 768, seed: 7 },
      },
      expect.objectContaining({ retry_on_error: false }),
    );
    // The adapter IS the model on this contract: the pinned hf-inference
    // router must never be hit, and the result reports the adapter id.
    expect(axiosInstance.post).not.toHaveBeenCalled();
    expect(result.model).toBe('XLabs-AI/flux-RealismLora');
    expect(result.images[0].mimeType).toBe('image/png');
    expect(result.images[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('rejects a non-image adapter payload (sanitization)', async () => {
    const adapterTextToImage = vi.fn().mockResolvedValue(new Blob(['{"error":"nope"}']));
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      adapterTextToImage,
    });
    await expect(
      service.generateImage({
        token: 'hf_token',
        model: 'm/x',
        adapterRepoId: 'org/lora',
        prompt: 'a tree',
        width: 512,
        height: 512,
      }),
    ).rejects.toThrow(/did not return a valid image|failed/i);
  });

  it('rejects an unsafe or non-namespaced adapter repo id before any call', async () => {
    const adapterTextToImage = vi.fn();
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      adapterTextToImage,
    });
    for (const bad of ['../../etc/passwd', 'org/model/extra', 'single-segment']) {
      await expect(
        service.generateImage({
          token: 'hf_token',
          model: 'm/x',
          adapterRepoId: bad,
          prompt: 'a tree',
          width: 512,
          height: 512,
        }),
      ).rejects.toThrow(/Invalid HuggingFace LoRA adapter/);
    }
    expect(adapterTextToImage).not.toHaveBeenCalled();
  });

  it('sanitizes a client 401 to the token message without echoing the token', async () => {
    const clientError = new Error('Provider rejected the call') as Error & { httpResponse: unknown };
    clientError.httpResponse = { requestId: 'req-1', status: 401, body: {} };
    const adapterTextToImage = vi.fn().mockRejectedValue(clientError);
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      adapterTextToImage,
    });
    await expect(
      service.generateImage({
        token: 'hf_token',
        model: 'm/x',
        adapterRepoId: 'org/lora',
        prompt: 'a tree',
        width: 512,
        height: 512,
      }),
    ).rejects.toThrow(/rejected the token/i);
  });

  it('prompt-only requests still ride the pinned hf-inference router, never the adapter seam', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: PNG_MAGIC, headers: { 'content-type': 'image/png' } }),
    };
    const adapterTextToImage = vi.fn();
    const service = createHuggingFaceInferenceService({ axiosInstance, adapterTextToImage });

    await service.generateImage({
      token: 'hf_token',
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: 'a tree',
      width: 512,
      height: 512,
    });

    expect(axiosInstance.post).toHaveBeenCalledOnce();
    expect(adapterTextToImage).not.toHaveBeenCalled();
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
  function hangingClient() {
    return vi.fn(
      (_args: unknown, options: { signal?: AbortSignal }) =>
        new Promise<Blob>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
        }),
    );
  }

  it('dispatches through the official client with provider auto, never the hf-inference router', async () => {
    const axiosInstance = { get: vi.fn(), post: vi.fn() };
    const clientTextToVideo = vi.fn().mockResolvedValue(new Blob([MP4_BYTES]));
    const service = createHuggingFaceInferenceService({ axiosInstance, clientTextToVideo });

    const result = await service.generateVideo({
      token: 'hf_token',
      model: 'Lightricks/LTX-Video',
      prompt: 'a wave',
      durationSeconds: 5,
    });

    expect(clientTextToVideo).toHaveBeenCalledWith(
      {
        accessToken: 'hf_token',
        model: 'Lightricks/LTX-Video',
        provider: 'auto',
        inputs: 'a wave',
        parameters: { num_frames: 120 },
      },
      expect.objectContaining({ retry_on_error: false, signal: expect.any(AbortSignal) }),
    );
    expect(axiosInstance.post).not.toHaveBeenCalled();
    expect(result.mimeType).toBe('video/mp4');
    expect(result.dataUrl.startsWith('data:video/mp4;base64,')).toBe(true);
  });

  it('forwards a user cancel to the client as an AbortError', async () => {
    const controller = new AbortController();
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      clientTextToVideo: hangingClient(),
    });

    const pending = service.generateVideo({ token: 'hf_token', model: 'm/v', prompt: 'a wave', signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('gives the client a deadline and reports expiry as a timeout, not a cancel', async () => {
    const clientTextToVideo = hangingClient();
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      clientTextToVideo,
      videoGenerationTimeoutMs: 5,
    });

    const thrown = (await service
      .generateVideo({ token: 'hf_token', model: 'm/v', prompt: 'a wave' })
      .catch((error: unknown) => error)) as Error;

    expect(thrown.name).not.toBe('AbortError');
    expect(thrown.message).toMatch(/timed out/);
    // Billed: a timeout is never retried.
    expect(clientTextToVideo).toHaveBeenCalledOnce();
  });

  it('rejects a non-video response body (sanitization)', async () => {
    const clientTextToVideo = vi.fn().mockResolvedValue(new Blob(['{"error":"loading"}']));
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      clientTextToVideo,
    });
    await expect(
      service.generateVideo({ token: 'hf_token', model: 'm/v', prompt: 'a wave' }),
    ).rejects.toThrow(/did not return a valid video|failed/i);
  });

  it('rejects an empty prompt before any network call', async () => {
    const clientTextToVideo = vi.fn();
    const service = createHuggingFaceInferenceService({
      axiosInstance: { get: vi.fn(), post: vi.fn() },
      clientTextToVideo,
    });
    await expect(service.generateVideo({ token: 'hf_token', model: 'm/v', prompt: '   ' })).rejects.toThrow(/empty/i);
    expect(clientTextToVideo).not.toHaveBeenCalled();
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
