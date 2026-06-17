import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HuggingFaceImageJobStore } from './huggingfaceImageJobs';

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
    }) => Promise<{ model: string | null; images: Array<{ dataUrl: string; mimeType: string }>; usage: unknown }>;
  };
  outputRoots: { getResolvedOutputDirectory: () => string; rememberOutputRoot: (dir: string) => void };
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
    const result = await huggingFace.generateImage({
      token,
      model,
      prompt: String(params.prompt ?? ''),
      negativePrompt: typeof params.negative_prompt === 'string' ? params.negative_prompt : undefined,
      width: typeof params.width === 'number' ? params.width : 1024,
      height: typeof params.height === 'number' ? params.height : 1024,
      seed: typeof params.seed === 'number' && params.seed >= 0 ? params.seed : undefined,
      signal: controller.signal,
    });

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
