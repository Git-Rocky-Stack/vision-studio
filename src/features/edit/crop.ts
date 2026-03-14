export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clampDimension(value: number, fallback: number) {
  const rounded = Math.round(value);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
}

function getAspectRatioValue(
  cropAspect: string,
  customWidth: number,
  customHeight: number
) {
  switch (cropAspect) {
    case '1:1':
      return 1;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '4:3':
      return 4 / 3;
    case '3:2':
      return 3 / 2;
    case 'custom': {
      const width = clampDimension(customWidth, 1);
      const height = clampDimension(customHeight, 1);
      return width / height;
    }
    default:
      return null;
  }
}

export function buildCropBox(
  cropAspect: string,
  imageWidth: number,
  imageHeight: number,
  customWidth: number,
  customHeight: number
): CropBox | null {
  if (cropAspect === 'free') {
    return null;
  }

  if (cropAspect === 'custom') {
    const width = Math.min(clampDimension(customWidth, imageWidth), imageWidth);
    const height = Math.min(clampDimension(customHeight, imageHeight), imageHeight);
    return {
      left: Math.max(0, Math.floor((imageWidth - width) / 2)),
      top: Math.max(0, Math.floor((imageHeight - height) / 2)),
      width,
      height,
    };
  }

  const ratio = getAspectRatioValue(cropAspect, customWidth, customHeight);
  if (!ratio) {
    return null;
  }

  let width = imageWidth;
  let height = Math.round(width / ratio);

  if (height > imageHeight) {
    height = imageHeight;
    width = Math.round(height * ratio);
  }

  return {
    left: Math.max(0, Math.floor((imageWidth - width) / 2)),
    top: Math.max(0, Math.floor((imageHeight - height) / 2)),
    width,
    height,
  };
}

export function getCropDimensions(
  cropAspect: string,
  imageWidth: number,
  imageHeight: number,
  customWidth: number,
  customHeight: number
) {
  const cropBox = buildCropBox(cropAspect, imageWidth, imageHeight, customWidth, customHeight);
  if (!cropBox) {
    return {
      width: imageWidth,
      height: imageHeight,
    };
  }

  return {
    width: cropBox.width,
    height: cropBox.height,
  };
}
