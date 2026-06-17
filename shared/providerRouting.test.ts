import { describe, expect, it } from 'vitest';
import {
  PROVIDER_CAPABILITIES,
  providerSupports,
  type ProviderId,
  type RequestModality,
} from './providerRouting';

describe('PROVIDER_CAPABILITIES', () => {
  it('encodes the honest provider x modality matrix (S4)', () => {
    expect(PROVIDER_CAPABILITIES.local).toMatchObject({
      stillImage: true,
      controlNet: true,
      inpaint: true,
      video: true,
      llmAssist: true,
      reportsUsage: false,
    });
    expect(PROVIDER_CAPABILITIES.openrouter).toMatchObject({
      stillImage: true,
      controlNet: false,
      inpaint: false,
      video: false,
      llmAssist: true,
      reportsUsage: true,
    });
    expect(PROVIDER_CAPABILITIES.huggingface).toMatchObject({
      stillImage: true,
      controlNet: false,
      inpaint: false,
      video: false,
      llmAssist: true,
      reportsUsage: true,
    });
  });

  it('lists every provider id exactly once', () => {
    const ids: ProviderId[] = ['local', 'openrouter', 'huggingface'];
    expect(Object.keys(PROVIDER_CAPABILITIES).sort()).toEqual([...ids].sort());
  });
});

describe('providerSupports', () => {
  it('refuses OpenRouter for video, ControlNet, and inpaint', () => {
    const blocked: RequestModality[] = ['video', 'controlnet', 'inpaint'];
    for (const modality of blocked) {
      expect(providerSupports('openrouter', modality)).toBe(false);
    }
  });

  it('allows Local for every modality', () => {
    const all: RequestModality[] = ['still-image', 'controlnet', 'inpaint', 'video', 'llm-assist'];
    for (const modality of all) {
      expect(providerSupports('local', modality)).toBe(true);
    }
  });

  it('limits HuggingFace to still-image + LLM-assist this slice (CN/inpaint/video land in PR2)', () => {
    expect(providerSupports('huggingface', 'still-image')).toBe(true);
    expect(providerSupports('huggingface', 'llm-assist')).toBe(true);
    for (const modality of ['controlnet', 'inpaint', 'video'] as RequestModality[]) {
      expect(providerSupports('huggingface', modality)).toBe(false);
    }
  });
});
