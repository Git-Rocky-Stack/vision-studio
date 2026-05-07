import { deleteOrphanedFiles } from './orphanFileCleanup';
import type { OpenRouterImageJobStore } from './openRouterImageJobs';
import { parseOpenRouterImageJobParams } from './openRouterImageJobParams';
import { resolveOpenRouterFailureMessage } from './openRouterImageRouting';
import { writeOpenRouterImageDataUrl } from './openRouterImageWrite';

/**
 * Orchestrator for an OpenRouter still-image job.
 *
 * Owns the full lifecycle: validate the renderer-supplied params, resolve
 * the active account + key + model, mint an AbortController so cancel can
 * unblock an in-flight HTTP call, hit OpenRouter, persist returned images
 * to disk under the resolved output root, and mark the job complete.
 *
 * Two cancellation checkpoints are intentional: one between the API
 * response and the disk write (so a user-cancel doesn't burn disk space
 * for output we'll throw away), and one after the disk write (so a
 * cancel that arrived during writes still gets the orphan-cleanup run
 * instead of leaving files behind). Failures are mapped to a renderer-
 * safe message that distinguishes hand-authored OpenRouter errors from
 * engine errors that may leak internals.
 *
 * All side-effecting collaborators are dependency-injected so the
 * orchestrator can be unit-tested without mocking the whole electron
 * service graph.
 */

export type RunOpenRouterImageJobAccount = {
  id: string;
  preferences: { openRouterImageModel: string };
};

export type RunOpenRouterImageJobUserAccountsContract = {
  getAccount: (accountId: string | null) => RunOpenRouterImageJobAccount | null;
  getOpenRouterApiKey: (accountId: string) => string | null;
};

export type RunOpenRouterImageJobOpenRouterContract = {
  generateImage: (input: {
    apiKey: string;
    model: string;
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    signal?: AbortSignal;
  }) => Promise<{
    responseId: string | null;
    model: string | null;
    content: string;
    images: { dataUrl: string; mimeType: string }[];
    usage?: unknown;
  }>;
};

export type RunOpenRouterImageJobOutputRootsContract = {
  getResolvedOutputDirectory: () => string;
  rememberOutputRoot: (root: string) => void;
};

export type RunOpenRouterImageJobDeps = {
  store: OpenRouterImageJobStore;
  userAccounts: RunOpenRouterImageJobUserAccountsContract;
  openRouter: RunOpenRouterImageJobOpenRouterContract;
  outputRoots: RunOpenRouterImageJobOutputRootsContract;
  // Allow test overrides for the orphan-cleanup side-effect.
  deleteOrphans?: typeof deleteOrphanedFiles;
};

export async function runOpenRouterImageJob(
  jobId: string,
  params: unknown,
  deps: RunOpenRouterImageJobDeps,
): Promise<void> {
  const { store, userAccounts, openRouter, outputRoots } = deps;
  const orphanCleanup = deps.deleteOrphans ?? deleteOrphanedFiles;

  const parsedParams = parseOpenRouterImageJobParams(params);
  if (!parsedParams.ok) {
    store.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: parsedParams.error,
    });
    return;
  }
  const validated = parsedParams.value;

  const accountId =
    typeof (params as { __openrouterAccountId?: unknown })?.__openrouterAccountId === 'string'
      ? ((params as { __openrouterAccountId: string }).__openrouterAccountId)
      : null;
  const activeAccount = userAccounts.getAccount(accountId);

  if (!activeAccount) {
    store.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'No active OpenRouter image account is available.',
    });
    return;
  }

  const apiKey = userAccounts.getOpenRouterApiKey(activeAccount.id);
  const model =
    (validated.model && validated.model.trim()) ||
    activeAccount.preferences.openRouterImageModel.trim();

  if (!apiKey) {
    store.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'OpenRouter is selected for still images, but the active account is not fully configured.',
    });
    return;
  }

  if (!model) {
    store.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: 'Select an OpenRouter image model for the active account before generating.',
    });
    return;
  }

  const abortController = new AbortController();
  store.patch(jobId, {
    status: 'processing',
    progress: 12,
    abortController,
  });

  try {
    const response = await openRouter.generateImage({
      apiKey,
      model,
      prompt: validated.prompt,
      negativePrompt: validated.negative_prompt,
      width: validated.width,
      height: validated.height,
      seed: validated.seed,
      signal: abortController.signal,
    });

    const jobAfterResponse = store.get(jobId);
    if (!jobAfterResponse || jobAfterResponse.status === 'cancelled') {
      return;
    }

    store.patch(jobId, { progress: 72 });

    const outputRoot = outputRoots.getResolvedOutputDirectory();
    outputRoots.rememberOutputRoot(outputRoot);
    const imagePaths = await Promise.all(
      response.images.map((image, index) =>
        writeOpenRouterImageDataUrl({
          dataUrl: image.dataUrl,
          mimeType: image.mimeType,
          jobId,
          index,
          outputRoot,
        }),
      ),
    );

    const jobAfterWrite = store.get(jobId);
    if (!jobAfterWrite || jobAfterWrite.status === 'cancelled') {
      // The user cancelled after the files had already landed on disk
      // but before we could mark the job complete. Delete the orphans
      // so we do not accumulate cancelled-job output in the user's
      // outputs/openrouter directory across sessions.
      await orphanCleanup(imagePaths, console);
      return;
    }

    store.patch(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      result: {
        images: imagePaths,
        seed: validated.seed,
        provider: 'openrouter',
        provider_response_id: response.responseId,
        provider_message: response.content || undefined,
        model: response.model ?? model,
        usage: response.usage,
      },
      abortController: undefined,
    });
  } catch (error) {
    const currentJob = store.get(jobId);
    if (currentJob?.status === 'cancelled') {
      return;
    }

    store.patch(jobId, {
      status: 'failed',
      progress: 100,
      completed_at: new Date().toISOString(),
      error: resolveOpenRouterFailureMessage(error),
      abortController: undefined,
    });
  }
}
