import { describe, expect, it } from 'vitest';
import { HUGGINGFACE_JOB_PREFIX, isHuggingFaceJobId, routedJobProvider } from './hostedImageRouting';

describe('hostedImageRouting', () => {
  it('discriminates HuggingFace job ids by prefix + separator', () => {
    expect(isHuggingFaceJobId(`${HUGGINGFACE_JOB_PREFIX}-abc`)).toBe(true);
    expect(isHuggingFaceJobId('huggingface-images-abc')).toBe(false);
  });

  it('maps a job id to its provider', () => {
    expect(routedJobProvider('openrouter-image-1')).toBe('openrouter');
    expect(routedJobProvider('huggingface-image-1')).toBe('huggingface');
    expect(routedJobProvider('backend-uuid-1')).toBeNull();
  });
});
