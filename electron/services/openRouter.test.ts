import { describe, expect, it, vi } from 'vitest';
import {
  createOpenRouterService,
  PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
  NEGATIVE_PROMPT_SYSTEM_PROMPT,
} from './openRouter';

describe('createOpenRouterService', () => {
  it('sends the documented OpenRouter attribution headers (HTTP-Referer + X-Title)', async () => {
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({ data: { data: {} } }),
      post: vi.fn(),
    };

    const service = createOpenRouterService({
      axiosInstance,
      appReferer: 'https://visionstudio.app',
      appTitle: 'Vision Studio',
    });
    await service.getKeyInfo('sk-or-v1-test-key');

    const headers = axiosInstance.get.mock.calls[0][1].headers;
    expect(headers['HTTP-Referer']).toBe('https://visionstudio.app');
    expect(headers['X-Title']).toBe('Vision Studio');
    expect(headers['X-OpenRouter-Title']).toBeUndefined();
  });

  it('normalizes key metadata from the OpenRouter key endpoint', async () => {
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({
        data: {
          data: {
            label: 'Primary Key',
            limit: 25,
            limit_remaining: 18.5,
            usage: 6.5,
            usage_daily: 1.2,
            usage_weekly: 3.1,
            usage_monthly: 6.5,
            byok_usage: 0.4,
            include_byok_in_limit: false,
            is_free_tier: false,
            expires_at: '2027-12-31T23:59:59Z',
          },
        },
      }),
      post: vi.fn(),
    };

    const service = createOpenRouterService({ axiosInstance });
    const result = await service.getKeyInfo('sk-or-v1-test-key');

    expect(result).toEqual({
      label: 'Primary Key',
      limit: 25,
      limitRemaining: 18.5,
      usage: 6.5,
      usageDaily: 1.2,
      usageWeekly: 3.1,
      usageMonthly: 6.5,
      byokUsage: 0.4,
      includeByokInLimit: false,
      isFreeTier: false,
      expiresAt: '2027-12-31T23:59:59Z',
    });
  });

  it('parses structured prompt enhancement responses', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mode: 'clarify',
                  prompt: 'dramatic portrait, crisp detail, balanced composition',
                  variations: [],
                }),
              },
            },
          ],
        },
      }),
    };

    const service = createOpenRouterService({ axiosInstance });
    const result = await service.enhancePrompt({
      apiKey: 'sk-or-v1-test-key',
      prompt: 'dramatic portrait',
      mode: 'clarify',
      model: 'openai/gpt-4o-mini',
    });

    expect(result).toEqual({
      mode: 'clarify',
      prompt: 'dramatic portrait, crisp detail, balanced composition',
      variations: [],
    });
  });

  it('supports richer prompt expansion mode payloads', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mode: 'expand',
                  prompt:
                    'dramatic portrait, layered wardrobe detail, atmospheric backlight, cinematic depth cues',
                  variations: [],
                }),
              },
            },
          ],
        },
      }),
    };

    const service = createOpenRouterService({ axiosInstance });
    const result = await service.enhancePrompt({
      apiKey: 'sk-or-v1-test-key',
      prompt: 'dramatic portrait',
      mode: 'expand',
      model: 'openai/gpt-4o-mini',
    });

    expect(result).toEqual({
      mode: 'expand',
      prompt:
        'dramatic portrait, layered wardrobe detail, atmospheric backlight, cinematic depth cues',
      variations: [],
    });
  });

  it('parses structured negative prompt suggestion responses', async () => {
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  negativePrompt: 'blurry, low quality, extra fingers, warped anatomy',
                  suggestions: ['blurry', 'low quality', 'extra fingers', 'warped anatomy'],
                }),
              },
            },
          ],
        },
      }),
    };

    const service = createOpenRouterService({ axiosInstance });
    const result = await service.suggestNegativePrompt({
      apiKey: 'sk-or-v1-test-key',
      prompt: 'hero portrait',
      negativePrompt: 'blurry',
      model: 'openai/gpt-4o-mini',
    });

    expect(result).toEqual({
      negativePrompt: 'blurry, low quality, extra fingers, warped anatomy',
      suggestions: ['blurry', 'low quality', 'extra fingers', 'warped anatomy'],
    });
  });

  it('filters and normalizes image-capable models', async () => {
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: 'google/gemini-2.5-flash-image',
              name: 'Gemini 2.5 Flash Image',
              description: 'Image generation with text output.',
              context_length: 32000,
              architecture: {
                output_modalities: ['text', 'image'],
              },
              supported_parameters: ['seed'],
              pricing: {
                prompt: '0.000001',
                completion: '0.000002',
                image: '0.02',
              },
            },
          ],
        },
      }),
      post: vi.fn(),
    };

    const service = createOpenRouterService({ axiosInstance });
    const result = await service.listImageModels('sk-or-v1-test-key');

    expect(result).toEqual([
      {
        id: 'google/gemini-2.5-flash-image',
        name: 'Gemini 2.5 Flash Image',
        description: 'Image generation with text output.',
        contextLength: 32000,
        outputModalities: ['text', 'image'],
        supportedParameters: ['seed'],
        pricing: {
          prompt: '0.000001',
          completion: '0.000002',
          image: '0.02',
        },
      },
    ]);
  });

  it('generates images and extracts returned data URLs', async () => {
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: 'google/gemini-2.5-flash-image',
              name: 'Gemini 2.5 Flash Image',
              architecture: {
                output_modalities: ['text', 'image'],
              },
              supported_parameters: ['seed'],
              pricing: {
                prompt: '0.000001',
                completion: '0.000002',
                image: '0.02',
              },
            },
          ],
        },
      }),
      post: vi.fn().mockResolvedValue({
        data: {
          id: 'chatcmpl-image-1',
          model: 'google/gemini-2.5-flash-image',
          choices: [
            {
              message: {
                content: 'Image ready.',
                images: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    };

    const service = createOpenRouterService({ axiosInstance });
    const result = await service.generateImage({
      apiKey: 'sk-or-v1-test-key',
      model: 'google/gemini-2.5-flash-image',
      prompt: 'sunlit studio portrait',
      negativePrompt: 'blur, extra fingers',
      width: 1344,
      height: 768,
      seed: 42,
    });

    expect(axiosInstance.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        model: 'google/gemini-2.5-flash-image',
        modalities: ['image', 'text'],
        seed: 42,
        image_config: {
          aspect_ratio: '16:9',
        },
      }),
      expect.any(Object),
    );
    expect(result).toEqual({
      responseId: 'chatcmpl-image-1',
      model: 'google/gemini-2.5-flash-image',
      content: 'Image ready.',
      images: [
        {
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
          mimeType: 'image/png',
        },
      ],
    });
  });

  describe('request timeouts', () => {
    it('applies a 10s timeout to key info requests', async () => {
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({ data: { data: {} } }),
        post: vi.fn(),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.getKeyInfo('sk-or-v1-test-key');
      expect(axiosInstance.get.mock.calls[0][1].timeout).toBe(10_000);
    });

    it('applies a 10s timeout to model catalog requests', async () => {
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({ data: { data: [] } }),
        post: vi.fn(),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.listTextModels('sk-or-v1-test-key');
      await service.listImageModels('sk-or-v1-test-key');
      expect(axiosInstance.get.mock.calls[0][1].timeout).toBe(10_000);
      expect(axiosInstance.get.mock.calls[1][1].timeout).toBe(10_000);
    });

    it('applies a 30s timeout to prompt enhancement requests', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: JSON.stringify({ mode: 'clarify', prompt: 'p', variations: [] }) } }],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.enhancePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'sunset',
        mode: 'clarify',
      });
      expect(axiosInstance.post.mock.calls[0][2].timeout).toBe(30_000);
    });

    it('applies a 30s timeout to negative prompt suggestion requests', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: JSON.stringify({ negativePrompt: 'blur', suggestions: ['blur'] }) } }],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'portrait',
      });
      expect(axiosInstance.post.mock.calls[0][2].timeout).toBe(30_000);
    });

    it('applies a 120s timeout to image generation requests', async () => {
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({
          data: {
            data: [
              {
                id: 'google/gemini-2.5-flash-image',
                name: 'Gemini Image',
                architecture: { output_modalities: ['image'] },
                supported_parameters: [],
                pricing: { prompt: '0', completion: '0', image: '0' },
              },
            ],
          },
        }),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: '',
                  images: [
                    {
                      type: 'image_url',
                      image_url: { url: 'data:image/png;base64,xx' },
                    },
                  ],
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.generateImage({
        apiKey: 'sk-or-v1-test-key',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      });
      expect(axiosInstance.post.mock.calls[0][2].timeout).toBe(120_000);
    });

    it('maps ECONNABORTED into a friendly "request timed out" error', async () => {
      const timeoutError: Error & { code?: string } = new Error('timeout of 30000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValue(timeoutError),
      };
      const service = createOpenRouterService({ axiosInstance });
      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1-test-key', prompt: 'sunset', mode: 'clarify' }),
      ).rejects.toThrow(/timed out/i);
    });

    it('forwards an AbortSignal into prompt enhancement requests', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: JSON.stringify({ mode: 'clarify', prompt: 'p', variations: [] }) } }],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const controller = new AbortController();
      await service.enhancePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'sunset',
        mode: 'clarify',
        signal: controller.signal,
      });
      expect(axiosInstance.post.mock.calls[0][2].signal).toBe(controller.signal);
    });

    it('exports system prompts as named module constants', () => {
      expect(PROMPT_ENHANCEMENT_SYSTEM_PROMPT).toContain('improve prompts');
      expect(PROMPT_ENHANCEMENT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
      expect(NEGATIVE_PROMPT_SYSTEM_PROMPT).toContain('negative prompts');
      expect(NEGATIVE_PROMPT_SYSTEM_PROMPT.length).toBeGreaterThan(50);
    });

    it('sends system prompt as multipart content with cache_control: ephemeral on enhancePrompt', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              { message: { content: JSON.stringify({ mode: 'clarify', prompt: 'p', variations: [] }) } },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await service.enhancePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'sunset',
        mode: 'clarify',
      });
      const body = axiosInstance.post.mock.calls[0][1];
      const systemMessage = body.messages[0];
      expect(systemMessage.role).toBe('system');
      expect(Array.isArray(systemMessage.content)).toBe(true);
      expect(systemMessage.content[0]).toMatchObject({
        type: 'text',
        text: PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      });
    });

    it('sends system prompt as multipart content with cache_control: ephemeral on suggestNegativePrompt', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              { message: { content: JSON.stringify({ negativePrompt: 'blur', suggestions: [] }) } },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'portrait',
      });
      const body = axiosInstance.post.mock.calls[0][1];
      const systemMessage = body.messages[0];
      expect(systemMessage.role).toBe('system');
      expect(Array.isArray(systemMessage.content)).toBe(true);
      expect(systemMessage.content[0]).toMatchObject({
        type: 'text',
        text: NEGATIVE_PROMPT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      });
    });

    it('forwards an AbortSignal into negative prompt suggestion requests', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: JSON.stringify({ negativePrompt: 'blur', suggestions: [] }) } }],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const controller = new AbortController();
      await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'portrait',
        signal: controller.signal,
      });
      expect(axiosInstance.post.mock.calls[0][2].signal).toBe(controller.signal);
    });
  });

  describe('retry with backoff', () => {
    function http(status: number, headers: Record<string, string> = {}): Error & { response: unknown } {
      const error = new Error(`HTTP ${status}`) as Error & { response: unknown };
      (error as any).response = {
        status,
        headers,
        data: { error: { message: `upstream ${status}` } },
      };
      return error;
    }

    function successfulEnhanceResponse() {
      return {
        data: {
          choices: [
            { message: { content: JSON.stringify({ mode: 'clarify', prompt: 'p', variations: [] }) } },
          ],
        },
      };
    }

    it('retries up to 3 attempts on 429 then succeeds', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi
          .fn()
          .mockRejectedValueOnce(http(429))
          .mockRejectedValueOnce(http(429))
          .mockResolvedValueOnce(successfulEnhanceResponse()),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'sunset',
        mode: 'clarify',
      });
      expect(result.prompt).toBe('p');
      expect(axiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('retries on 5xx then succeeds', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValueOnce(http(503)).mockResolvedValueOnce(successfulEnhanceResponse()),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await service.enhancePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'sunset',
        mode: 'clarify',
      });
      expect(axiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on 401 (auth errors are terminal)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValueOnce(http(401)),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1-test-key', prompt: 'sunset', mode: 'clarify' }),
      ).rejects.toThrow();
      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 400 (bad request)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValueOnce(http(400)),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1-test-key', prompt: 'sunset', mode: 'clarify' }),
      ).rejects.toThrow();
      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on ECONNABORTED (timeout is terminal)', async () => {
      const timeoutError: Error & { code?: string } = new Error('timeout');
      timeoutError.code = 'ECONNABORTED';
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValueOnce(timeoutError),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1-test-key', prompt: 'sunset', mode: 'clarify' }),
      ).rejects.toThrow(/timed out/i);
      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('exhausts retry budget and surfaces the last error', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi
          .fn()
          .mockRejectedValueOnce(http(503))
          .mockRejectedValueOnce(http(503))
          .mockRejectedValueOnce(http(503)),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1-test-key', prompt: 'sunset', mode: 'clarify' }),
      ).rejects.toThrow(/upstream 503/);
      expect(axiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('respects Retry-After header on 429 (seconds form)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi
          .fn()
          .mockRejectedValueOnce(http(429, { 'retry-after': '1' }))
          .mockResolvedValueOnce(successfulEnhanceResponse()),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 1 });
      const start = Date.now();
      await service.enhancePrompt({
        apiKey: 'sk-or-v1-test-key',
        prompt: 'sunset',
        mode: 'clarify',
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(3000);
    });

    it('aborts retry loop when AbortSignal fires between attempts', async () => {
      const controller = new AbortController();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockImplementationOnce(() => {
          controller.abort();
          return Promise.reject(http(503));
        }),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 1 });
      await expect(
        service.enhancePrompt({
          apiKey: 'sk-or-v1-test-key',
          prompt: 'sunset',
          mode: 'clarify',
          signal: controller.signal,
        }),
      ).rejects.toThrow();
      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('caches image model catalog across generateImage calls with the same key', async () => {
      const modelsPayload = {
        data: {
          data: [
            {
              id: 'google/gemini-2.5-flash-image',
              name: 'Gemini Image',
              architecture: { output_modalities: ['image'] },
              supported_parameters: [],
              pricing: { prompt: '0', completion: '0', image: '0' },
            },
          ],
        },
      };
      const imagePayload = {
        data: {
          choices: [
            {
              message: {
                content: '',
                images: [
                  {
                    type: 'image_url',
                    image_url: { url: 'data:image/png;base64,xx' },
                  },
                ],
              },
            },
          ],
        },
      };
      const axiosInstance = {
        get: vi.fn().mockResolvedValue(modelsPayload),
        post: vi.fn().mockResolvedValue(imagePayload),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      const args = {
        apiKey: 'sk-or-v1-test-key',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      };
      await service.generateImage(args);
      await service.generateImage(args);
      await service.generateImage(args);
      // First call hits /models. Subsequent calls reuse the cached catalog.
      expect(axiosInstance.get).toHaveBeenCalledTimes(1);
      expect(axiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('does NOT share image model cache across different API keys', async () => {
      const modelsPayload = {
        data: {
          data: [
            {
              id: 'google/gemini-2.5-flash-image',
              name: 'Gemini Image',
              architecture: { output_modalities: ['image'] },
              supported_parameters: [],
              pricing: { prompt: '0', completion: '0', image: '0' },
            },
          ],
        },
      };
      const imagePayload = {
        data: {
          choices: [
            {
              message: {
                content: '',
                images: [
                  {
                    type: 'image_url',
                    image_url: { url: 'data:image/png;base64,xx' },
                  },
                ],
              },
            },
          ],
        },
      };
      const axiosInstance = {
        get: vi.fn().mockResolvedValue(modelsPayload),
        post: vi.fn().mockResolvedValue(imagePayload),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await service.generateImage({
        apiKey: 'sk-or-v1-account-A',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      });
      await service.generateImage({
        apiKey: 'sk-or-v1-account-B',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      });
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('retries metadata calls (getKeyInfo) on 5xx', async () => {
      const axiosInstance = {
        get: vi
          .fn()
          .mockRejectedValueOnce(http(502))
          .mockResolvedValueOnce({ data: { data: {} } }),
        post: vi.fn(),
      };
      const service = createOpenRouterService({ axiosInstance, retryBaseDelayMs: 0 });
      await service.getKeyInfo('sk-or-v1-test-key');
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);
    });
  });
});
