import { describe, expect, it } from 'vitest';

import { clearResolvedGenerationError, SVD_REFERENCE_ERROR } from './validation';

describe('clearResolvedGenerationError', () => {
  it('clears the SVD reference-image error once a reference image is attached', () => {
    const nextError = clearResolvedGenerationError(SVD_REFERENCE_ERROR, {
      generationType: 'video',
      videoModel: 'svd',
      referenceImage: 'data:image/png;base64,abc',
    });

    expect(nextError).toBe('');
  });

  it('keeps unrelated errors untouched', () => {
    const nextError = clearResolvedGenerationError('Backend exploded', {
      generationType: 'video',
      videoModel: 'svd',
      referenceImage: 'data:image/png;base64,abc',
    });

    expect(nextError).toBe('Backend exploded');
  });
});
