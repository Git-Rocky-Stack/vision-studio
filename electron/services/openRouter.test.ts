import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterService } from './openRouter';

describe('createOpenRouterService', () => {
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
});
