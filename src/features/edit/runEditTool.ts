import { useAppStore } from '@/store/appStore';
import { resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';

import {
  pollEditJob,
  EDIT_POLL_LOST_MESSAGE,
  type EditJobPollApi,
  type EditStore,
} from './editJobPolling';

export { EDIT_POLL_LOST_MESSAGE };

export type EditOperation = 'remove-background' | 'upscale' | 'restore-faces';

export interface EditToolParams {
  source_path: string;
  edge_refinement?: number;
  scale?: 2 | 4;
  model?: 'general' | 'anime';
  face_enhance?: boolean;
  strength?: number;
}

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;

export const EDIT_BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend from Settings.';
export const NO_FACES_NOTICE = 'No faces detected - the image is unchanged.';

interface EditToolElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: EditJobPollApi & {
    editImage: (
      params: { operation: EditOperation } & EditToolParams,
    ) => Promise<{ success: boolean; jobId?: string; error?: string }>;
  };
}

export interface RunEditToolOptions {
  electron?: EditToolElectronApi;
  store?: EditStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface EditToolResult {
  ok: boolean;
  jobId?: string;
  error?: string;
  notice?: string;
}

/**
 * Real edit-tool run (#34): submits one /api/v1/edit job through the preload
 * bridge, polls it like a generation job, and lands the finished frame on
 * the Edit canvas (asset sync + setCurrentImage - the Studio handoff).
 * Failures surface the backend's honest message verbatim, including the
 * "install '<record>' from the Foundry first." pointers; cancels are silent.
 */
export async function runEditTool(
  operation: EditOperation,
  params: EditToolParams,
  {
    electron = window.electron as unknown as EditToolElectronApi,
    store = useAppStore,
    pollIntervalMs = POLL_INTERVAL_MS,
    pollRetryMs = POLL_RETRY_MS,
    signal,
    onProgress,
  }: RunEditToolOptions = {},
): Promise<EditToolResult> {
  const state = store.getState();
  if (!state.systemInfo.backendConnected) {
    return { ok: false, error: EDIT_BACKEND_DOWN_MESSAGE };
  }

  let jobId: string;
  let outputRoot: string;
  try {
    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitted = await electron.generation.editImage({ operation, ...params });
    if (!submitted.success || !submitted.jobId) {
      throw new Error(submitted.error || 'Edit operation failed');
    }
    jobId = submitted.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edit operation failed';
    return { ok: false, error: message };
  }

  store.getState().addJob({
    id: jobId,
    type: 'edit',
    status: 'pending',
    progress: 0,
    params: { operation, ...params, output_root: outputRoot, source: 'edit-tool' },
    createdAt: new Date(),
  });

  const polled = await pollEditJob({
    electron: electron.generation,
    store,
    jobId,
    outputRoot,
    fallbackErrorMessage: 'Edit operation failed',
    pollIntervalMs,
    pollRetryMs,
    signal,
    onProgress,
  });
  if (!polled.ok) {
    return polled.error ? { ok: false, jobId, error: polled.error } : { ok: false, jobId };
  }
  const facesDetected = polled.result?.faces_detected;
  const notice =
    operation === 'restore-faces' && facesDetected === 0 ? NO_FACES_NOTICE : undefined;
  return { ok: true, jobId, notice };
}
