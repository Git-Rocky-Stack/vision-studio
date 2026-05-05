import { describe, expect, it, vi } from 'vitest';
import {
  createOpenRouterService,
  MAX_PROMPT_CHARS,
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
      usage: null,
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
      usage: null,
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
      usage: null,
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
      usage: null,
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
      // 1% tolerance — Windows timers can resolve ~10-15ms early which causes
      // a strict >= 1000 assertion to flake. The Retry-After contract is
      // "approximately N seconds", not millisecond-exact.
      expect(elapsed).toBeGreaterThanOrEqual(990);
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

  describe('usage logging', () => {
    it('logs usage at info level after successful enhancePrompt', async () => {
      const info = vi.fn();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'enhanced', variations: [] }),
                },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 30, total_tokens: 42, cost: 0.0009 },
          },
        }),
      };
      const service = createOpenRouterService({
        axiosInstance,
        logger: { warn: vi.fn(), error: vi.fn(), info },
      });
      await service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' });

      expect(info).toHaveBeenCalledTimes(1);
      const [message, payload] = info.mock.calls[0];
      expect(message).toMatch(/enhancePrompt/);
      expect(payload).toMatchObject({
        promptTokens: 12,
        completionTokens: 30,
        totalTokens: 42,
        cost: 0.0009,
      });
    });

    it('logs usage at info level after successful suggestNegativePrompt', async () => {
      const info = vi.fn();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    negativePrompt: 'blurry',
                    suggestions: ['blurry'],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12, cost: 0.0001 },
          },
        }),
      };
      const service = createOpenRouterService({
        axiosInstance,
        logger: { warn: vi.fn(), error: vi.fn(), info },
      });
      await service.suggestNegativePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait' });

      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][0]).toMatch(/suggestNegativePrompt/);
    });

    it('logs usage at info level after successful generateImage', async () => {
      const info = vi.fn();
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({
          data: {
            data: [
              {
                id: 'google/gemini-2.5-flash-image',
                name: 'Gemini Flash Image',
                architecture: { output_modalities: ['image'] },
                pricing: { prompt: '0', completion: '0', image: '0.0001' },
              },
            ],
          },
        }),
        post: vi.fn().mockResolvedValue({
          data: {
            id: 'gen-1',
            model: 'google/gemini-2.5-flash-image',
            choices: [
              {
                message: {
                  content: '',
                  images: [{ image_url: { url: 'data:image/png;base64,AAAA' } }],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10, cost: 0.0002 },
          },
        }),
      };
      const service = createOpenRouterService({
        axiosInstance,
        logger: { warn: vi.fn(), error: vi.fn(), info },
      });
      await service.generateImage({
        apiKey: 'sk-or-v1',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      });

      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][0]).toMatch(/generateImage/);
    });

    it('skips usage logging when the response has no usage field', async () => {
      const info = vi.fn();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'enhanced', variations: [] }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({
        axiosInstance,
        logger: { warn: vi.fn(), error: vi.fn(), info },
      });
      await service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' });

      expect(info).not.toHaveBeenCalled();
    });
  });

  describe('structured logger injection', () => {
    it('routes enhance parse-failure warnings through the injected logger (not console)', async () => {
      const warn = vi.fn();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: { choices: [{ message: { content: 'not valid json' } }] },
        }),
      };
      const service = createOpenRouterService({
        axiosInstance,
        logger: { warn, error: vi.fn(), info: vi.fn() },
      });
      await service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' });

      expect(warn).toHaveBeenCalledTimes(1);
      const [message, ...rest] = warn.mock.calls[0];
      expect(message).toMatch(/enhancePrompt/);
      expect(rest.length).toBeGreaterThan(0);
    });

    it('routes negative-prompt parse-failure warnings through the injected logger', async () => {
      const warn = vi.fn();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: { choices: [{ message: { content: 'not valid json' } }] },
        }),
      };
      const service = createOpenRouterService({
        axiosInstance,
        logger: { warn, error: vi.fn(), info: vi.fn() },
      });
      await service.suggestNegativePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait' });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/suggestNegativePrompt/);
    });

    it('falls back to console when no logger is provided (no breaking change)', async () => {
      // Spy on console.warn to assert default behavior preserved
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: { choices: [{ message: { content: 'not valid json' } }] },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' });

      expect(consoleWarn).toHaveBeenCalledTimes(1);
      consoleWarn.mockRestore();
    });
  });

  describe('suggestNegativePrompt parse-failure fallback', () => {
    it('returns the original negativePrompt unchanged when the LLM returns non-JSON content', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: 'apologies, here is some prose instead of JSON' } }],
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, cost: 0.0001 },
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'a portrait',
        negativePrompt: 'blurry, distorted',
      });

      expect(result.negativePrompt).toBe('blurry, distorted');
      expect(result.suggestions).toEqual([]);
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
        cost: 0.0001,
      });
    });

    it('returns the original negativePrompt unchanged when JSON content fails schema validation', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              { message: { content: JSON.stringify({ wrong_key: 'value' }) } },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'a portrait',
        negativePrompt: 'low quality',
      });

      expect(result.negativePrompt).toBe('low quality');
      expect(result.suggestions).toEqual([]);
    });

    it('returns empty negativePrompt when no original was provided AND parse fails', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: 'not json' } }],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'a portrait',
      });

      expect(result.negativePrompt).toBe('');
      expect(result.suggestions).toEqual([]);
    });

    it('STILL throws on HTTP errors (parse fallback only applies when the API call itself succeeds)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValue(
          Object.assign(new Error('OpenRouter rejected: invalid key'), {
            response: { status: 401, data: { error: { message: 'invalid key' } } },
          }),
        ),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.suggestNegativePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait' }),
      ).rejects.toThrow(/invalid key/i);
    });
  });

  describe('per-API-key concurrency budget', () => {
    it('caps concurrent enhancePrompt calls per key at the configured limit', async () => {
      let inFlight = 0;
      let observedMax = 0;
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockImplementation(async () => {
          inFlight += 1;
          observedMax = Math.max(observedMax, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return {
            data: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ mode: 'clarify', prompt: 'ok', variations: [] }),
                  },
                },
              ],
            },
          };
        }),
      };
      const service = createOpenRouterService({ axiosInstance, maxConcurrentPerKey: 2 });
      const calls = Array.from({ length: 6 }, () =>
        service.enhancePrompt({ apiKey: 'sk-or-v1-A', prompt: 'cat', mode: 'clarify' }),
      );
      await Promise.all(calls);

      expect(observedMax).toBeLessThanOrEqual(2);
      expect(observedMax).toBeGreaterThan(1);
      expect(axiosInstance.post).toHaveBeenCalledTimes(6);
    });

    it('treats different API keys as independent buckets', async () => {
      const inFlightByKey = new Map<string, number>();
      const observedMaxByKey = new Map<string, number>();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockImplementation(async (_url, _body, config) => {
          const auth = config.headers.Authorization as string;
          const key = auth.replace('Bearer ', '');
          inFlightByKey.set(key, (inFlightByKey.get(key) ?? 0) + 1);
          observedMaxByKey.set(
            key,
            Math.max(observedMaxByKey.get(key) ?? 0, inFlightByKey.get(key) ?? 0),
          );
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlightByKey.set(key, (inFlightByKey.get(key) ?? 0) - 1);
          return {
            data: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ mode: 'clarify', prompt: 'ok', variations: [] }),
                  },
                },
              ],
            },
          };
        }),
      };
      const service = createOpenRouterService({ axiosInstance, maxConcurrentPerKey: 2 });
      const calls = [
        ...Array.from({ length: 3 }, () =>
          service.enhancePrompt({ apiKey: 'sk-or-v1-A', prompt: 'cat', mode: 'clarify' }),
        ),
        ...Array.from({ length: 3 }, () =>
          service.enhancePrompt({ apiKey: 'sk-or-v1-B', prompt: 'cat', mode: 'clarify' }),
        ),
      ];
      await Promise.all(calls);

      expect(observedMaxByKey.get('sk-or-v1-A')).toBeLessThanOrEqual(2);
      expect(observedMaxByKey.get('sk-or-v1-B')).toBeLessThanOrEqual(2);
      // Both keys should have run concurrently — the max-per-key cap doesn't
      // serialize across keys.
    });

    it('releases the slot even when a call rejects (no permanent leak)', async () => {
      let inFlight = 0;
      let observedMax = 0;
      let callCount = 0;
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockImplementation(async () => {
          inFlight += 1;
          observedMax = Math.max(observedMax, inFlight);
          callCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 3));
          inFlight -= 1;
          if (callCount <= 2) {
            const error = new Error('forced');
            (error as any).response = { status: 401, data: { error: { message: 'denied' } } };
            throw error;
          }
          return {
            data: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ mode: 'clarify', prompt: 'ok', variations: [] }),
                  },
                },
              ],
            },
          };
        }),
      };
      const service = createOpenRouterService({ axiosInstance, maxConcurrentPerKey: 1 });
      const promises = Array.from({ length: 4 }, () =>
        service.enhancePrompt({ apiKey: 'sk-or-v1-A', prompt: 'cat', mode: 'clarify' }).catch(() => null),
      );
      await Promise.all(promises);

      expect(observedMax).toBe(1);
      // All 4 attempts should have made it through (no deadlock from leaked slot).
      expect(callCount).toBe(4);
    });
  });

  describe('chat completion envelope validation', () => {
    it('enhancePrompt throws when response.data is missing the choices array', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({ data: { id: 'gen-1', model: 'foo' } }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' }),
      ).rejects.toThrow(/choices/i);
    });

    it('enhancePrompt throws when choices is an empty array', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({ data: { choices: [] } }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' }),
      ).rejects.toThrow(/choices/i);
    });

    it('enhancePrompt throws when choices[0] is missing message', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({ data: { choices: [{ index: 0 }] } }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' }),
      ).rejects.toThrow(/message/i);
    });

    it('suggestNegativePrompt throws on malformed envelope (no choices)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({ data: { id: 'gen-2' } }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.suggestNegativePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait' }),
      ).rejects.toThrow(/choices/i);
    });

    it('generateImage throws on malformed envelope (no choices)', async () => {
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({
          data: {
            data: [
              {
                id: 'google/gemini-2.5-flash-image',
                name: 'Gemini Flash Image',
                architecture: { output_modalities: ['image'] },
                pricing: { prompt: '0', completion: '0', image: '0.0001' },
              },
            ],
          },
        }),
        post: vi.fn().mockResolvedValue({ data: { id: 'gen-3' } }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.generateImage({
          apiKey: 'sk-or-v1',
          model: 'google/gemini-2.5-flash-image',
          prompt: 'a cat',
          width: 1024,
          height: 1024,
        }),
      ).rejects.toThrow(/choices/i);
    });

    it('error path identifies the offending field', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({ data: { choices: 'not-an-array' } }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'cat', mode: 'clarify' }),
      ).rejects.toThrow(/choices/i);
    });
  });

  describe('enhancePrompt parse-failure fallback', () => {
    it('returns the original prompt unchanged when the LLM returns non-JSON content', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [{ message: { content: 'this is not valid json at all, sorry' } }],
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, cost: 0.0001 },
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'a serene mountain lake at dawn',
        mode: 'cinematic',
      });

      expect(result.prompt).toBe('a serene mountain lake at dawn');
      expect(result.mode).toBe('cinematic');
      expect(result.variations).toEqual([]);
      // Usage should still surface even on fallback so cost/tokens are tracked.
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
        cost: 0.0001,
      });
    });

    it('returns the original prompt unchanged when the JSON content fails schema validation', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ wrong_key: 'value', no_prompt_field: true }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'a portrait',
        mode: 'clarify',
      });

      expect(result.prompt).toBe('a portrait');
      expect(result.mode).toBe('clarify');
      expect(result.variations).toEqual([]);
    });

    it('STILL throws on HTTP errors (parse fallback only applies when the API call itself succeeds)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockRejectedValue(
          Object.assign(new Error('OpenRouter rejected: invalid key'), {
            response: { status: 401, data: { error: { message: 'invalid key' } } },
          }),
        ),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait', mode: 'clarify' }),
      ).rejects.toThrow(/invalid key/i);
    });

    it('STILL throws on AbortSignal cancellation (parse fallback never masks user cancel)', async () => {
      const controller = new AbortController();
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockImplementation(() => {
          controller.abort();
          return Promise.reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
        }),
      };
      const service = createOpenRouterService({ axiosInstance });

      await expect(
        service.enhancePrompt({
          apiKey: 'sk-or-v1',
          prompt: 'a portrait',
          mode: 'clarify',
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });
  });

  describe('few-shot examples in enhancement system prompt', () => {
    it('includes a cinematic-mode few-shot example in PROMPT_ENHANCEMENT_SYSTEM_PROMPT', () => {
      // Look for the literal "cinematic" mode tag and an Input:/Output: pair near it.
      expect(PROMPT_ENHANCEMENT_SYSTEM_PROMPT).toMatch(/cinematic[^]*Input:[^]*Output:/i);
    });

    it('includes a concise-mode few-shot example in PROMPT_ENHANCEMENT_SYSTEM_PROMPT', () => {
      expect(PROMPT_ENHANCEMENT_SYSTEM_PROMPT).toMatch(/concise[^]*Input:[^]*Output:/i);
    });

    it('keeps PROMPT_ENHANCEMENT_SYSTEM_PROMPT under 2000 chars (cache-friendly upper bound)', () => {
      expect(PROMPT_ENHANCEMENT_SYSTEM_PROMPT.length).toBeLessThan(2000);
    });

    it('still validates as a single string (no accidental array/segment break)', () => {
      expect(typeof PROMPT_ENHANCEMENT_SYSTEM_PROMPT).toBe('string');
    });
  });

  describe('consistent multipart message format', () => {
    it('sends user content as multipart text-part array on enhancePrompt', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'enhanced', variations: [] }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.enhancePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait', mode: 'clarify' });

      const body = axiosInstance.post.mock.calls[0][1];
      const userMessage = body.messages.find((m: any) => m.role === 'user');
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content[0]).toMatchObject({ type: 'text' });
      expect(typeof userMessage.content[0].text).toBe('string');
    });

    it('sends user content as multipart text-part array on suggestNegativePrompt', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    negativePrompt: 'blurry',
                    suggestions: ['blurry'],
                  }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.suggestNegativePrompt({ apiKey: 'sk-or-v1', prompt: 'a portrait' });

      const body = axiosInstance.post.mock.calls[0][1];
      const userMessage = body.messages.find((m: any) => m.role === 'user');
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content[0]).toMatchObject({ type: 'text' });
    });

    it('sends user content as multipart text-part array on generateImage', async () => {
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({
          data: {
            data: [
              {
                id: 'google/gemini-2.5-flash-image',
                name: 'Gemini Flash Image',
                architecture: { output_modalities: ['image'] },
                pricing: { prompt: '0', completion: '0', image: '0.0001' },
              },
            ],
          },
        }),
        post: vi.fn().mockResolvedValue({
          data: {
            id: 'gen-1',
            model: 'google/gemini-2.5-flash-image',
            choices: [
              {
                message: {
                  content: '',
                  images: [{ image_url: { url: 'data:image/png;base64,AAAA' } }],
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      await service.generateImage({
        apiKey: 'sk-or-v1',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      });

      const body = axiosInstance.post.mock.calls[0][1];
      const userMessage = body.messages.find((m: any) => m.role === 'user');
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content[0]).toMatchObject({ type: 'text', text: 'a cat' });
    });
  });

  describe('zod schema validation of LLM-generated payloads', () => {
    // Note: both enhancePrompt and suggestNegativePrompt have parse fallbacks
    // (P2-B and P3-B respectively) that catch schema failures and return a
    // safe default (original input). Strict-throw schema assertions are
    // therefore covered by the dedicated parse-failure-fallback describe
    // blocks above. Only forward-compat and snake_case-acceptance assertions
    // belong here -- those characterize the schema's permissiveness, not
    // its enforcement path.

    it('tolerates extra/unknown fields in prompt enhancement payload (forward compat)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    prompt: 'enhanced',
                    mode: 'clarify',
                    variations: [],
                    extra_field: 'future feature',
                    nested: { also: 'fine' },
                  }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'cat',
        mode: 'clarify',
      });
      expect(result.prompt).toBe('enhanced');
    });

    it('accepts snake_case negative_prompt key (alongside camelCase)', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    negative_prompt: 'blurry, distorted',
                    suggestions: ['blurry'],
                  }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1',
        prompt: 'a portrait',
      });
      expect(result.negativePrompt).toBe('blurry, distorted');
    });
  });

  describe('per-request usage capture', () => {
    it('surfaces usage (prompt/completion/total tokens + cost) on enhancePrompt result', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'enhanced', variations: [] }),
                },
              },
            ],
            usage: {
              prompt_tokens: 123,
              completion_tokens: 45,
              total_tokens: 168,
              cost: 0.000123,
            },
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1-test',
        prompt: 'a portrait',
        mode: 'clarify',
      });
      expect(result.usage).toEqual({
        promptTokens: 123,
        completionTokens: 45,
        totalTokens: 168,
        cost: 0.000123,
      });
    });

    it('returns usage: null on enhancePrompt when response omits the usage field', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'enhanced', variations: [] }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1-test',
        prompt: 'a portrait',
        mode: 'clarify',
      });
      expect(result.usage).toBeNull();
    });

    it('parses string-encoded cost on enhancePrompt usage', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'enhanced', variations: [] }),
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: '0.0007' },
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.enhancePrompt({
        apiKey: 'sk-or-v1-test',
        prompt: 'a portrait',
        mode: 'clarify',
      });
      expect(result.usage?.cost).toBe(0.0007);
    });

    it('surfaces usage on suggestNegativePrompt result', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    negativePrompt: 'blurry, distorted',
                    suggestions: ['blurry', 'distorted'],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70, cost: 0.00005 },
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.suggestNegativePrompt({
        apiKey: 'sk-or-v1-test',
        prompt: 'a portrait',
      });
      expect(result.usage).toEqual({
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        cost: 0.00005,
      });
    });

    it('surfaces usage on generateImage result', async () => {
      const axiosInstance = {
        get: vi.fn().mockResolvedValue({
          data: {
            data: [
              {
                id: 'google/gemini-2.5-flash-image',
                name: 'Gemini Flash Image',
                architecture: { output_modalities: ['image'] },
                pricing: { prompt: '0', completion: '0', image: '0.0001' },
              },
            ],
          },
        }),
        post: vi.fn().mockResolvedValue({
          data: {
            id: 'gen-1',
            model: 'google/gemini-2.5-flash-image',
            choices: [
              {
                message: {
                  content: '',
                  images: [{ image_url: { url: 'data:image/png;base64,AAAA' } }],
                },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 0, total_tokens: 12, cost: 0.0001 },
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const result = await service.generateImage({
        apiKey: 'sk-or-v1-test',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'a cat',
        width: 1024,
        height: 1024,
      });
      expect(result.usage).toEqual({
        promptTokens: 12,
        completionTokens: 0,
        totalTokens: 12,
        cost: 0.0001,
      });
    });
  });

  describe('input length validation', () => {
    it('exports MAX_PROMPT_CHARS as a named module constant', () => {
      expect(typeof MAX_PROMPT_CHARS).toBe('number');
      expect(MAX_PROMPT_CHARS).toBeGreaterThan(0);
    });

    it('enhancePrompt rejects prompts longer than MAX_PROMPT_CHARS without making any HTTP call', async () => {
      const axiosInstance = { get: vi.fn(), post: vi.fn() };
      const service = createOpenRouterService({ axiosInstance });
      const oversized = 'a'.repeat(MAX_PROMPT_CHARS + 1);

      await expect(
        service.enhancePrompt({ apiKey: 'sk-or-v1-test', prompt: oversized, mode: 'clarify' }),
      ).rejects.toThrow(/too long/i);

      expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('enhancePrompt accepts a prompt exactly at MAX_PROMPT_CHARS', async () => {
      const axiosInstance = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ mode: 'clarify', prompt: 'ok', variations: [] }),
                },
              },
            ],
          },
        }),
      };
      const service = createOpenRouterService({ axiosInstance });
      const boundary = 'a'.repeat(MAX_PROMPT_CHARS);

      await service.enhancePrompt({ apiKey: 'sk-or-v1-test', prompt: boundary, mode: 'clarify' });

      expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('suggestNegativePrompt rejects oversized prompt without making any HTTP call', async () => {
      const axiosInstance = { get: vi.fn(), post: vi.fn() };
      const service = createOpenRouterService({ axiosInstance });
      const oversized = 'a'.repeat(MAX_PROMPT_CHARS + 1);

      await expect(
        service.suggestNegativePrompt({ apiKey: 'sk-or-v1-test', prompt: oversized }),
      ).rejects.toThrow(/too long/i);

      expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('suggestNegativePrompt rejects oversized negativePrompt without making any HTTP call', async () => {
      const axiosInstance = { get: vi.fn(), post: vi.fn() };
      const service = createOpenRouterService({ axiosInstance });
      const oversized = 'a'.repeat(MAX_PROMPT_CHARS + 1);

      await expect(
        service.suggestNegativePrompt({
          apiKey: 'sk-or-v1-test',
          prompt: 'a portrait',
          negativePrompt: oversized,
        }),
      ).rejects.toThrow(/too long/i);

      expect(axiosInstance.post).not.toHaveBeenCalled();
    });

    it('generateImage rejects oversized prompt without making any HTTP call', async () => {
      const axiosInstance = { get: vi.fn(), post: vi.fn() };
      const service = createOpenRouterService({ axiosInstance });
      const oversized = 'a'.repeat(MAX_PROMPT_CHARS + 1);

      await expect(
        service.generateImage({
          apiKey: 'sk-or-v1-test',
          model: 'google/gemini-2.5-flash-image',
          prompt: oversized,
          width: 1024,
          height: 1024,
        }),
      ).rejects.toThrow(/too long/i);

      expect(axiosInstance.post).not.toHaveBeenCalled();
      expect(axiosInstance.get).not.toHaveBeenCalled();
    });

    it('generateImage rejects oversized negativePrompt without making any HTTP call', async () => {
      const axiosInstance = { get: vi.fn(), post: vi.fn() };
      const service = createOpenRouterService({ axiosInstance });
      const oversized = 'a'.repeat(MAX_PROMPT_CHARS + 1);

      await expect(
        service.generateImage({
          apiKey: 'sk-or-v1-test',
          model: 'google/gemini-2.5-flash-image',
          prompt: 'a cat',
          negativePrompt: oversized,
          width: 1024,
          height: 1024,
        }),
      ).rejects.toThrow(/too long/i);

      expect(axiosInstance.post).not.toHaveBeenCalled();
      expect(axiosInstance.get).not.toHaveBeenCalled();
    });
  });
});
