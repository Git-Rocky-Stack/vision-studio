import type { AssetJobStatus, AssetRecord, DerivedAssetResult } from '@/types/assets';

const BACKEND_ASSET_BASE_URL = 'http://localhost:8000';

export function toPreviewUrl(assetPath: string) {
  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
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
  const prefix = type === 'image' ? 'Image' : 'Video';
  return `${prefix} ${jobId.slice(0, 8)}${index > 0 ? `-${index + 1}` : ''}`;
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
      previewUrl: toPreviewUrl(outputPath),
      thumbnail:
        jobStatus.type === 'image' ? toPreviewUrl(outputPath) : previous?.thumbnail ?? '',
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
    previewUrl: toPreviewUrl(result.image),
    thumbnail: toPreviewUrl(result.image),
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
