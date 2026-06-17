import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HuggingFaceImageJobStore } from './huggingfaceImageJobs';
import {
  readImageFileAsBase64,
  rasterizeMaskToPng,
  type MaskGeometry,
  type ReadImageResult,
} from './hostedControlAssets';

type HuggingFaceImageGenResult = {
  model: string | null;
  images: Array<{ dataUrl: string; mimeType: string }>;
  usage: unknown;
};

/**
 * Runs a HuggingFace still-image job in the main process (M6). Resolves the
 * account token + model, calls the HF Inference client, persists normalized
 * images under <outputRoot>/huggingface/YYYY-MM-DD/, and patches the job store.
 * The token is read per-run and never persisted into the job record (Codex gate).
 */

type RunDeps = {
  store: HuggingFaceImageJobStore;
  userAccounts: {
    getAccount: (
      id?: string | null,
    ) => { id: string; preferences: { huggingFaceImageModel: string }; huggingFace: { tokenStored: boolean } } | null;
    getHuggingFaceToken: (id?: string | null) => string | null;
  };
  huggingFace: {
    generateImage: (args: {
      token: string;
      model: string;
      prompt: string;
      negativePrompt?: string;
      width: number;
      height: number;
      seed?: number;
      signal?: AbortSignal;
    }) => Promise<HuggingFaceImageGenResult>;
    generateControlNet: (args: {
      token: string;
      model: string;
      prompt: string;
      controlImageBase64: string;
      negativePrompt?: string;
      width: number;
      height: number;
      seed?: number;
      signal?: AbortSignal;
    }) => Promise<HuggingFaceImageGenResult>;
    generateInpaint: (args: {
      token: string;
      model: string;
      prompt: string;
      initImageBase64: string;
      maskImageBase64: string;
      negativePrompt?: string;
      width: number;
      height: number;
      seed?: number;
      signal?: AbortSignal;
    }) => Promise<HuggingFaceImageGenResult>;
  };
  outputRoots: {
    getResolvedOutputDirectory: () => string;
    rememberOutputRoot: (dir: string) => void;
    getManagedOutputRoots: () => string[];
  };
  /** Injectable for tests; defaults to the path-guarded fs reader. */
  readImageFile?: (filePath: string, allowedRoots: string[]) => Promise<ReadImageResult>;
  /** Injectable for tests; defaults to the pure PNG rasterizer. */
  rasterizeMask?: (mask: MaskGeometry, width: number, height: number) => Buffer;
};

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function failJob(store: HuggingFaceImageJobStore, jobId: string, message: string) {
  store.patch(jobId, {
    status: 'failed',
    progress: 100,
    completed_at: new Date().toISOString(),
    error: message,
    abortController: undefined,
  });
}

async function persistDataUrl(dir: string, jobId: string, index: number, dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Malformed image payload.');
  }
  const ext = MIME_EXT[match[1].toLowerCase()] ?? 'png';
  const today = new Date().toISOString().slice(0, 10);
  const targetDir = path.join(dir, 'huggingface', today);
  await fs.mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${jobId}-${index}.${ext}`);
  await fs.writeFile(filePath, Buffer.from(match[2], 'base64'));
  return filePath.replace(/\\/g, '/');
}

export async function runHuggingFaceImageJob(
  jobId: string,
  params: Record<string, unknown>,
  deps: RunDeps,
): Promise<void> {
  const { store, userAccounts, huggingFace, outputRoots } = deps;
  const accountId = typeof params.__huggingFaceAccountId === 'string' ? params.__huggingFaceAccountId : null;
  try {
    const account = userAccounts.getAccount(accountId);
    const token = userAccounts.getHuggingFaceToken(accountId);
    if (!account || !account.huggingFace.tokenStored || !token) {
      failJob(store, jobId, 'HuggingFace is selected, but no token is stored for the active account.');
      return;
    }
    const model =
      (typeof params.model === 'string' && params.model.trim()) || account.preferences.huggingFaceImageModel.trim();
    if (!model) {
      failJob(store, jobId, 'Select a HuggingFace image model before generating.');
      return;
    }
    const controller = new AbortController();
    store.patch(jobId, { status: 'processing', progress: 12, abortController: controller });

    const outputDir = outputRoots.getResolvedOutputDirectory();
    const readImage = deps.readImageFile ?? readImageFileAsBase64;
    const rasterize = deps.rasterizeMask ?? rasterizeMaskToPng;
    const allowedRoots = outputRoots.getManagedOutputRoots();
    const prompt = String(params.prompt ?? '');
    const negativePrompt = typeof params.negative_prompt === 'string' ? params.negative_prompt : undefined;
    const width = typeof params.width === 'number' ? params.width : 1024;
    const height = typeof params.height === 'number' ? params.height : 1024;
    const seed = typeof params.seed === 'number' && params.seed >= 0 ? params.seed : undefined;

    const inpaint = params.inpaint as { image_path?: string; mask?: MaskGeometry } | undefined;
    const controlnetLayers = Array.isArray(params.controlnet)
      ? (params.controlnet as Array<{ source_path?: string; negative_prompt?: string }>)
      : [];
    const controlLayersWithSource = controlnetLayers.filter((layer) => Boolean(layer?.source_path));

    let result: HuggingFaceImageGenResult;
    if (inpaint?.mask) {
      const initPath =
        inpaint.image_path ?? (typeof params.image_path === 'string' ? params.image_path : '');
      if (!initPath) {
        failJob(store, jobId, 'Inpaint needs a base image on the canvas before HuggingFace can run it.');
        return;
      }
      const init = await readImage(initPath, allowedRoots);
      const maskPng = rasterize(inpaint.mask, init.dimensions.width, init.dimensions.height);
      result = await huggingFace.generateInpaint({
        token,
        model,
        prompt,
        initImageBase64: init.base64,
        maskImageBase64: maskPng.toString('base64'),
        negativePrompt,
        width: init.dimensions.width,
        height: init.dimensions.height,
        seed,
        signal: controller.signal,
      });
    } else if (controlLayersWithSource.length > 0) {
      // HF's Inference Providers ControlNet endpoint takes exactly one control
      // image. Rather than silently dropping the extra guides (which would look
      // accepted but quietly ignore all but the first), reject multi-layer jobs
      // so the user makes an explicit "switch back to Local" decision.
      if (controlLayersWithSource.length > 1) {
        failJob(
          store,
          jobId,
          'HuggingFace ControlNet supports a single control image. Switch the active account back to Local to run multi-layer ControlNet.',
        );
        return;
      }
      // The per-layer region mask is a local-only refinement and is not applied
      // by the hosted endpoint.
      const layer = controlLayersWithSource[0];
      const control = await readImage(layer.source_path as string, allowedRoots);
      result = await huggingFace.generateControlNet({
        token,
        model,
        prompt,
        controlImageBase64: control.base64,
        negativePrompt: layer.negative_prompt ?? negativePrompt,
        width,
        height,
        seed,
        signal: controller.signal,
      });
    } else {
      result = await huggingFace.generateImage({
        token,
        model,
        prompt,
        negativePrompt,
        width,
        height,
        seed,
        signal: controller.signal,
      });
    }

    store.patch(jobId, { progress: 72 });
    const images: string[] = [];
    if (outputDir) {
      for (let index = 0; index < result.images.length; index += 1) {
        images.push(await persistDataUrl(outputDir, jobId, index, result.images[index].dataUrl));
      }
      outputRoots.rememberOutputRoot(outputDir);
    } else {
      images.push(...result.images.map((image) => image.dataUrl));
    }

    store.patch(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      abortController: undefined,
      result: {
        images,
        provider: 'huggingface',
        model: result.model,
        seed: typeof params.seed === 'number' ? params.seed : undefined,
      },
    });
  } catch (error) {
    const message =
      (error as { name?: string } | null)?.name === 'AbortError'
        ? 'HuggingFace image generation was cancelled.'
        : error instanceof Error
          ? error.message
          : 'HuggingFace image generation failed.';
    failJob(store, jobId, message);
  }
}
