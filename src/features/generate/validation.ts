export const SVD_REFERENCE_ERROR = 'Stable Video Diffusion requires a reference image.';

type ClearResolvedGenerationErrorParams = {
  generationType: 'image' | 'video';
  videoModel: string;
  referenceImage: string | null;
};

export function clearResolvedGenerationError(
  currentError: string,
  { generationType, videoModel, referenceImage }: ClearResolvedGenerationErrorParams
) {
  if (
    currentError === SVD_REFERENCE_ERROR &&
    generationType === 'video' &&
    videoModel === 'svd' &&
    referenceImage
  ) {
    return '';
  }

  return currentError;
}
