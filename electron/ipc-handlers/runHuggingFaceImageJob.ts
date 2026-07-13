import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateHuggingFaceLoraDispatch } from '../../shared/hostedLoraRouting';
import type { HuggingFaceImageJobStore } from './huggingfaceImageJobs';

type HuggingFaceImageGenResult = {
  model: string | null;
  images: Array<{ dataUrl: string; mimeType: string }>;
  usage: unknown;
};

/**
 * Runs a HuggingFace still-image job in the main process (M6). Resolves the
 * account token + model, calls the HF Inference client (prompt-only
 * text-to-image), persists normalized images under
 * <outputRoot>/huggingface/YYYY-MM-DD/, and patches the job store. The token is
 * read per-run and never persisted into the job record (Codex gate).
 *
 * ControlNet and inpaint are NOT routed here: HuggingFace's Inference Providers
 * task API documents no control_image / mask_image contract, so the renderer
 * and the generate-image IPC guard keep those passes Local. As an authoritative
 * main-process backstop this runner also fails any CN/inpaint request that
 * reaches it rather than silently degrading it to a plain prompt (Codex M6 gate).
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
      /** #42: Hub LoRA repo id for adapter-by-model-id dispatch. */
      adapterRepoId?: string;
      prompt: string;
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
};

/** Hosted CN/inpaint has no documented Inference Providers contract; stay Local. */
const HUGGINGFACE_GUIDED_PASS_UNSUPPORTED =
  'HuggingFace does not support ControlNet or inpaint. Switch the active account back to Local to run ControlNet and inpaint passes.';

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
    // Authoritative main-process guard: HuggingFace has no documented hosted
    // ControlNet/inpaint contract, so reject those passes outright instead of
    // silently running a plain prompt and discarding the user's guides.
    const inpaint = params.inpaint as { mask?: unknown } | undefined;
    const controlnetLayers = Array.isArray(params.controlnet)
      ? (params.controlnet as Array<{ source_path?: string }>)
      : [];
    const hasControlLayer = controlnetLayers.some((layer) => Boolean(layer?.source_path));
    if (inpaint?.mask || hasControlLayer) {
      failJob(store, jobId, HUGGINGFACE_GUIDED_PASS_UNSUPPORTED);
      return;
    }

    // #42 authoritative backstop: a LoRA-bearing job must satisfy the narrow
    // adapter contract (exactly one selection, weight 1.0, resolved Hub repo
    // id) or fail outright - never silently degrade to a prompt-only run that
    // discards the user's LoRA.
    const loraDispatch = validateHuggingFaceLoraDispatch(params.loras, params.__huggingFaceLoraAdapter);
    if (!loraDispatch.ok) {
      failJob(store, jobId, loraDispatch.reason);
      return;
    }

    const controller = new AbortController();
    store.patch(jobId, { status: 'processing', progress: 12, abortController: controller });

    const outputDir = outputRoots.getResolvedOutputDirectory();
    const prompt = String(params.prompt ?? '');
    const negativePrompt = typeof params.negative_prompt === 'string' ? params.negative_prompt : undefined;
    const width = typeof params.width === 'number' ? params.width : 1024;
    const height = typeof params.height === 'number' ? params.height : 1024;
    const seed = typeof params.seed === 'number' && params.seed >= 0 ? params.seed : undefined;

    const result = await huggingFace.generateImage({
      token,
      model,
      ...(loraDispatch.adapterRepoId ? { adapterRepoId: loraDispatch.adapterRepoId } : {}),
      prompt,
      negativePrompt,
      width,
      height,
      seed,
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
