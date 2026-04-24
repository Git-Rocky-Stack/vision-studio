import type { AssetJobStatus, AssetRecord, DerivedAssetResult } from '@/types/assets';
import type { ImportedAssetFile } from '@/types/electron';
import type { MediaAsset } from '@/types/media';

const BACKEND_ASSET_BASE_URL = 'http://localhost:8000';
const LOCAL_VIDEO_PLACEHOLDER_LABEL = 'Video';
const LOCAL_AUDIO_PLACEHOLDER_LABEL = 'Audio';

function toNormalizedPath(assetPath: string) {
  return assetPath.replace(/\\/g, '/');
}

function toFileUrl(assetPath: string) {
  const normalizedPath = toNormalizedPath(assetPath);

  if (/^file:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  const encodedPath = encodeURI(normalizedPath)
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F');

  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return `file:///${encodedPath}`;
  }

  if (normalizedPath.startsWith('/')) {
    return `file://${encodedPath}`;
  }

  return normalizedPath;
}

function splitFileName(assetPath: string) {
  const normalizedPath = toNormalizedPath(assetPath);
  const fileName = normalizedPath.split('/').pop() ?? normalizedPath;
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex <= 0) {
    return { fileName, stem: fileName, extension: '' };
  }

  return {
    fileName,
    stem: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex).toLowerCase(),
  };
}

function buildVideoPlaceholderPreview(label: string = LOCAL_VIDEO_PLACEHOLDER_LABEL) {
  const safeLabel = label.slice(0, 28);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#151821" />
          <stop offset="100%" stop-color="#202736" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="40" fill="url(#bg)" />
      <rect x="72" y="128" width="368" height="224" rx="24" fill="#0f1218" stroke="#485267" stroke-width="8" />
      <polygon points="232,184 232,296 320,240" fill="#f5f7fb" opacity="0.95" />
      <text x="256" y="404" fill="#f5f7fb" font-size="32" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">VIDEO</text>
      <text x="256" y="442" fill="#a5b0c5" font-size="20" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">${safeLabel}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildAudioPlaceholderPreview(label: string = LOCAL_AUDIO_PLACEHOLDER_LABEL) {
  const safeLabel = label.slice(0, 28);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#151821" />
          <stop offset="100%" stop-color="#1d2630" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="40" fill="url(#bg)" />
      <rect x="92" y="124" width="328" height="264" rx="28" fill="#0f1218" stroke="#485267" stroke-width="8" />
      <rect x="148" y="192" width="22" height="128" rx="11" fill="#f5f7fb" opacity="0.95" />
      <rect x="196" y="162" width="22" height="188" rx="11" fill="#f5f7fb" opacity="0.95" />
      <rect x="244" y="210" width="22" height="92" rx="11" fill="#f5f7fb" opacity="0.95" />
      <rect x="292" y="176" width="22" height="160" rx="11" fill="#f5f7fb" opacity="0.95" />
      <rect x="340" y="200" width="22" height="112" rx="11" fill="#f5f7fb" opacity="0.95" />
      <text x="256" y="430" fill="#f5f7fb" font-size="32" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">AUDIO</text>
      <text x="256" y="466" fill="#a5b0c5" font-size="20" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle">${safeLabel}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function toPreviewUrl(
  assetPath: string,
  options?: { type?: AssetRecord['type']; label?: string },
) {
  const type = options?.type ?? 'image';

  if (type === 'video') {
    return buildVideoPlaceholderPreview(options?.label);
  }

  if (type === 'audio') {
    return buildAudioPlaceholderPreview(options?.label);
  }

  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }

  if (assetPath.startsWith('/outputs/')) {
    return `${BACKEND_ASSET_BASE_URL}${assetPath}`;
  }

  if (/^[A-Za-z]:[\\/]/.test(assetPath) || assetPath.startsWith('/')) {
    return toFileUrl(assetPath);
  }

  return assetPath.startsWith('/')
    ? `${BACKEND_ASSET_BASE_URL}${assetPath}`
    : `${BACKEND_ASSET_BASE_URL}/${assetPath}`;
}

export function resolveStoredAssetPath(assetPath: string, params: Record<string, unknown>) {
  if (/^https?:\/\//.test(assetPath) || /^[A-Za-z]:\//.test(assetPath)) {
    return assetPath.replace(/\\/g, '/');
  }

  const outputRoot =
    typeof params.output_root === 'string'
      ? params.output_root
      : typeof params.outputRoot === 'string'
        ? params.outputRoot
        : undefined;

  if (!outputRoot) {
    return assetPath;
  }

  const normalizedRoot = outputRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const relativePath = assetPath.replace(/^\/?outputs\/+/, '');
  return `${normalizedRoot}/${relativePath}`;
}

function buildAssetName(type: AssetRecord['type'], jobId: string, index: number) {
  const prefix = type === 'image' ? 'Image' : type === 'video' ? 'Video' : 'Audio';
  return `${prefix} ${jobId.slice(0, 8)}${index > 0 ? `-${index + 1}` : ''}`;
}

export function createImportedAssetRecords(
  currentAssets: AssetRecord[],
  importedFiles: ImportedAssetFile[],
): AssetRecord[] {
  const existingById = new Map(currentAssets.map((asset) => [asset.id, asset]));

  importedFiles.forEach((importedFile) => {
    const normalizedPath = toNormalizedPath(importedFile.importedPath);
    const assetId = `import::${normalizedPath}`;
    const previous = existingById.get(assetId);
    const { stem } = splitFileName(importedFile.name || importedFile.importedPath);
    const previewUrl = toPreviewUrl(normalizedPath, {
      type: importedFile.type,
      label: stem,
    });

    existingById.set(assetId, {
      id: assetId,
      jobId: assetId,
      name:
        stem ||
        (importedFile.type === 'image'
          ? 'Imported image'
          : importedFile.type === 'video'
            ? 'Imported video'
            : 'Imported audio'),
      type: importedFile.type,
      path: normalizedPath,
      previewUrl,
      thumbnail: previewUrl,
      createdAt: previous?.createdAt ?? importedFile.importedAt,
      prompt: previous?.prompt ?? '',
      negativePrompt: previous?.negativePrompt ?? '',
      model: previous?.model,
      width: previous?.width,
      height: previous?.height,
      fps: previous?.fps,
      duration: previous?.duration,
      seed: previous?.seed,
      favorite: previous?.favorite ?? false,
      params: {
        ...(previous?.params ?? {}),
        source: 'imported',
        original_path: toNormalizedPath(importedFile.originalPath),
        reference_ready: true,
      },
    });
  });

  return Array.from(existingById.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function createMediaAssetFromImportedFile(importedFile: ImportedAssetFile): MediaAsset {
  const normalizedPath = toNormalizedPath(importedFile.importedPath);
  const { stem } = splitFileName(importedFile.name || importedFile.importedPath);
  const previewUrl = importedFile.type === 'image' ? toPreviewUrl(normalizedPath) : toFileUrl(normalizedPath);
  const thumbnailUrl =
    importedFile.type === 'video'
      ? buildVideoPlaceholderPreview(stem)
      : importedFile.type === 'audio'
        ? buildAudioPlaceholderPreview(stem)
        : previewUrl;
  const posterUrl = importedFile.type === 'video' ? thumbnailUrl : null;

  return {
    id: `media::${normalizedPath}`,
    legacyAssetId: `import::${normalizedPath}`,
    jobId: null,
    name:
      stem ||
      (importedFile.type === 'image'
        ? 'Imported image'
        : importedFile.type === 'video'
          ? 'Imported video'
          : 'Imported audio'),
    type: importedFile.type,
    source: 'imported',
    path: normalizedPath,
    previewUrl,
    thumbnailUrl,
    posterUrl,
    metadata: {
      originalPath: toNormalizedPath(importedFile.originalPath),
      referenceReady: true,
    },
    createdAt: importedFile.importedAt,
  };
}

function normalizeMediaSource(source: unknown): MediaAsset['source'] {
  return source === 'imported' || source === 'derived' ? source : 'generated';
}

export function createMediaAssetFromAssetRecord(asset: AssetRecord): MediaAsset {
  return {
    id: `media::asset::${asset.id}`,
    legacyAssetId: asset.id,
    jobId: asset.jobId,
    name: asset.name || 'Derived image',
    type: asset.type,
    source: normalizeMediaSource(asset.params.source),
    path: asset.path,
    previewUrl: asset.previewUrl || asset.path,
    thumbnailUrl: asset.thumbnail || asset.previewUrl || asset.path,
    posterUrl:
      asset.type === 'image' ? asset.thumbnail || asset.previewUrl || asset.path : null,
    width: asset.width,
    height: asset.height,
    durationMs: typeof asset.duration === 'number' ? asset.duration * 1000 : undefined,
    fps: asset.fps,
    metadata: {
      fromAssetLibrary: true,
      prompt: asset.prompt,
      model: asset.model,
      referenceReady: asset.params.reference_ready !== false,
      ...asset.params,
    },
    createdAt: asset.createdAt,
  };
}

export function upsertAssetsFromJobStatus(
  currentAssets: AssetRecord[],
  jobStatus: AssetJobStatus
): AssetRecord[] {
  if (jobStatus.status !== 'completed' || !jobStatus.result) {
    return currentAssets;
  }

  const params = jobStatus.params ?? {};
  const outputPaths =
    jobStatus.type === 'video'
      ? jobStatus.result.video
        ? [jobStatus.result.video]
        : []
      : (jobStatus.result.images ?? []);

  if (outputPaths.length === 0) {
    return currentAssets;
  }

  const existingById = new Map(currentAssets.map((asset) => [asset.id, asset]));

  outputPaths.forEach((outputPath, index) => {
    const assetId = `${jobStatus.job_id}::${outputPath}`;
    const previous = existingById.get(assetId);
    const width = typeof params.width === 'number' ? params.width : undefined;
    const height = typeof params.height === 'number' ? params.height : undefined;
    const fps = typeof params.fps === 'number' ? params.fps : undefined;
    const duration =
      typeof jobStatus.result?.duration === 'number'
        ? jobStatus.result.duration
        : typeof params.duration === 'number'
          ? params.duration
          : undefined;
    const seed =
      typeof jobStatus.result?.seed === 'number'
        ? jobStatus.result.seed
        : typeof params.seed === 'number'
          ? params.seed
          : undefined;

    existingById.set(assetId, {
      id: assetId,
      jobId: jobStatus.job_id,
      name: buildAssetName(jobStatus.type, jobStatus.job_id, index),
      type: jobStatus.type,
      path: resolveStoredAssetPath(outputPath, params),
      previewUrl: toPreviewUrl(outputPath, {
        type: jobStatus.type,
        label: buildAssetName(jobStatus.type, jobStatus.job_id, index),
      }),
      thumbnail:
        previous?.thumbnail ??
        toPreviewUrl(outputPath, {
          type: jobStatus.type,
          label: buildAssetName(jobStatus.type, jobStatus.job_id, index),
        }),
      createdAt: previous?.createdAt ?? jobStatus.created_at,
      prompt: typeof params.prompt === 'string' ? params.prompt : '',
      negativePrompt:
        typeof params.negative_prompt === 'string'
          ? params.negative_prompt
          : typeof params.negativePrompt === 'string'
            ? params.negativePrompt
            : '',
      model: typeof params.model === 'string' ? params.model : undefined,
      width,
      height,
      fps,
      duration,
      seed,
      favorite: previous?.favorite ?? false,
      params: {
        ...params,
        source: 'generated',
        reference_ready: jobStatus.type === 'image',
        width,
        height,
        fps,
        duration,
        seed,
      },
    });
  });

  return Array.from(existingById.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function createDerivedAssetRecord(
  currentAssets: AssetRecord[],
  result: DerivedAssetResult,
  context: {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    seed?: number;
    params?: Record<string, unknown>;
  }
) {
  const assetId = `derived::${result.output_path}`;
  const previous = currentAssets.find((asset) => asset.id === assetId);
  const createdAt = previous?.createdAt ?? new Date().toISOString();

  const nextRecord: AssetRecord = {
    id: assetId,
    jobId: assetId,
    name: `Derived ${assetId.slice(-8)}`,
    type: 'image',
    path: result.output_path.replace(/\\/g, '/'),
    previewUrl: toPreviewUrl(result.image, { type: 'image' }),
    thumbnail: toPreviewUrl(result.image, { type: 'image' }),
    createdAt,
    prompt: context.prompt,
    negativePrompt: context.negativePrompt ?? '',
    model: context.model,
    width: result.width,
    height: result.height,
    seed: context.seed,
    favorite: previous?.favorite ?? false,
    params: {
      ...(context.params ?? {}),
      source: 'derived',
      reference_ready: true,
      width: result.width,
      height: result.height,
    },
  };

  const map = new Map(currentAssets.map((asset) => [asset.id, asset]));
  map.set(nextRecord.id, nextRecord);
  return Array.from(map.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
