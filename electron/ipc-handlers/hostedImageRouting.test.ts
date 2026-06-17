import { describe, expect, it } from 'vitest';
import {
  HUGGINGFACE_JOB_PREFIX,
  HUGGINGFACE_VIDEO_JOB_PREFIX,
  hasUnsupportedHuggingFaceImageInputs,
  isHuggingFaceJobId,
  isHuggingFaceVideoJobId,
  routedJobProvider,
} from './hostedImageRouting';

describe('hostedImageRouting', () => {
  it('discriminates HuggingFace image job ids by prefix + separator', () => {
    expect(isHuggingFaceJobId(`${HUGGINGFACE_JOB_PREFIX}-abc`)).toBe(true);
    expect(isHuggingFaceJobId('huggingface-images-abc')).toBe(false);
  });

  it('discriminates HuggingFace video job ids by prefix + separator', () => {
    expect(isHuggingFaceVideoJobId(`${HUGGINGFACE_VIDEO_JOB_PREFIX}-abc`)).toBe(true);
    expect(isHuggingFaceVideoJobId(`${HUGGINGFACE_JOB_PREFIX}-abc`)).toBe(false);
  });

  it('maps a job id to its provider (image + video both route to huggingface)', () => {
    expect(routedJobProvider('openrouter-image-1')).toBe('openrouter');
    expect(routedJobProvider('huggingface-image-1')).toBe('huggingface');
    expect(routedJobProvider('huggingface-video-1')).toBe('huggingface');
    expect(routedJobProvider('backend-uuid-1')).toBeNull();
  });
});

describe('hasUnsupportedHuggingFaceImageInputs', () => {
  it('allows prompt-only, ControlNet, and inpaint passes', () => {
    expect(hasUnsupportedHuggingFaceImageInputs({ prompt: 'a tree' })).toBe(false);
    expect(hasUnsupportedHuggingFaceImageInputs({ controlnet: [{ source_path: 'x.png' }] })).toBe(false);
    expect(
      hasUnsupportedHuggingFaceImageInputs({ inpaint: { image_path: 'b.png' }, image_path: 'b.png' }),
    ).toBe(false);
  });

  it('blocks reference images and bare img2img init images', () => {
    expect(hasUnsupportedHuggingFaceImageInputs({ reference_images: [{ source_path: 'r.png' }] })).toBe(true);
    expect(hasUnsupportedHuggingFaceImageInputs({ image_path: 'init.png' })).toBe(true);
  });
});
