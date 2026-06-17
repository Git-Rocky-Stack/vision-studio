import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HuggingFaceVideoJobStore } from './huggingfaceVideoJobs';

/**
 * Runs a HuggingFace text-to-video job in the main process (M6 PR2). Resolves
 * the account token + video model, calls the HF Inference client, persists the
 * normalized clip under <outputRoot>/huggingface/YYYY-MM-DD/, and patches the
 * job store. The token is read per-run and never persisted into the job record
 * (Codex gate).
 */

type RunDeps = {
  store: HuggingFaceVideoJobStore;
  userAccounts: {
    getAccount: (
      id?: string | null,
    ) => { id: string; preferences: { huggingFaceVideoModel: string }; huggingFace: { tokenStored: boolean } } | null;
    getHuggingFaceToken: (id?: string | null) => string | null;
  };
  huggingFace: {
    generateVideo: (args: {
      token: string;
      model: string;
      prompt: string;
      durationSeconds?: number;
      signal?: AbortSignal;
    }) => Promise<{ model: string | null; dataUrl: string; mimeType: string }>;
  };
  outputRoots: { getResolvedOutputDirectory: () => string; rememberOutputRoot: (dir: string) => void };
};

const MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function failJob(store: HuggingFaceVideoJobStore, jobId: string, message: string) {
  store.patch(jobId, {
    status: 'failed',
    progress: 100,
    completed_at: new Date().toISOString(),
    error: message,
    abortController: undefined,
  });
}

async function persistDataUrl(dir: string, jobId: string, dataUrl: string): Promise<string> {
  const match = /^data:(video\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Malformed video payload.');
  }
  const ext = MIME_EXT[match[1].toLowerCase()] ?? 'mp4';
  const today = new Date().toISOString().slice(0, 10);
  const targetDir = path.join(dir, 'huggingface', today);
  await fs.mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${jobId}.${ext}`);
  await fs.writeFile(filePath, Buffer.from(match[2], 'base64'));
  return filePath.replace(/\\/g, '/');
}

export async function runHuggingFaceVideoJob(
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
      (typeof params.model === 'string' && params.model.trim()) || account.preferences.huggingFaceVideoModel.trim();
    if (!model) {
      failJob(store, jobId, 'Select a HuggingFace video model before generating.');
      return;
    }
    const controller = new AbortController();
    store.patch(jobId, { status: 'processing', progress: 12, abortController: controller });

    const outputDir = outputRoots.getResolvedOutputDirectory();
    const result = await huggingFace.generateVideo({
      token,
      model,
      prompt: String(params.prompt ?? ''),
      durationSeconds: typeof params.duration === 'number' && params.duration > 0 ? params.duration : undefined,
      signal: controller.signal,
    });

    store.patch(jobId, { progress: 72 });
    const video = outputDir ? await persistDataUrl(outputDir, jobId, result.dataUrl) : result.dataUrl;
    if (outputDir) {
      outputRoots.rememberOutputRoot(outputDir);
    }

    store.patch(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      abortController: undefined,
      result: {
        video,
        provider: 'huggingface',
        model: result.model,
        seed: typeof params.seed === 'number' ? params.seed : undefined,
      },
    });
  } catch (error) {
    const message =
      (error as { name?: string } | null)?.name === 'AbortError'
        ? 'HuggingFace video generation was cancelled.'
        : error instanceof Error
          ? error.message
          : 'HuggingFace video generation failed.';
    failJob(store, jobId, message);
  }
}
