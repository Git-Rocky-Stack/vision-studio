import {
  REPLACED_BY_ASSET_PATH_PARAM,
  SUPPRESS_ASSET_SYNC_PARAM,
  previewUrlForAssetPath,
} from '@/features/jobs/jobOutput';
import type { GenerationJob } from '@/store/appStore.types';

import type { EditStore } from './editJobPolling';

/**
 * One result per Blend Edges run.
 *
 * A blended region run produces two files: the backend's raw full frame (the
 * job output) and the composite saved by regionBlendRunner. runGuidedEditTool
 * polls such a job with `landAssets: false`, so the raw frame is never
 * registered in the library or shown on the canvas; once the composite has
 * landed it is the run's only result, and this:
 *
 *   1. marks the job `suppressAssetSync` + `replacedByAssetPath` (through
 *      updateJob, which annotates the finished job's record), so any later
 *      job-status sync knows not to register the raw output and where the
 *      result really is, and points the run's Canvas iteration-history node
 *      at the composite (updateIterationNode);
 *   2. deletes the raw file only when every guard holds: it sits inside the
 *      job's output root, it is not the image the edit started from, and
 *      nothing else in the app references it. The main process additionally
 *      refuses any path outside the managed output roots (assets:delete ->
 *      resolveManagedAssetPath).
 *
 * Every step is best-effort: if a guard fails or the delete is refused, the
 * intermediate simply stays on disk, unlisted. It never fails the edit.
 */

export interface AssetDeleteApi {
  delete?: (path: string) => Promise<{ success: boolean; error?: string }>;
}

export interface SupersedeRawEditOutputParams {
  jobId: string;
  /** The raw output's library path (the job's images[0] resolved under the output root). */
  rawPath: string | null;
  /** Output root the job wrote into. */
  outputRoot: string;
  /** Library path of the image the edit started from: never deleted. */
  sourcePath: string | null;
  /** Library path of the blended composite that replaces the raw frame. */
  replacementPath: string;
}

export interface SupersedeRawEditOutputResult {
  deletedFile: boolean;
  /** Why the file was kept, when it was. */
  keptReason?: 'no-raw-path' | 'is-source' | 'outside-output-root' | 'referenced' | 'delete-failed';
}

/** State keys that record the job itself rather than consume its output. */
const JOB_BOOKKEEPING_KEYS = new Set(['activeJobs', 'completedJobs', 'taggingQueue']);
/** Object keys holding a job snapshot (iteration nodes keep one per run). */
const JOB_SNAPSHOT_KEYS = new Set(['generationJob']);

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * True when anything in the app state (other than the job bookkeeping that
 * produced the file) still mentions the file. `relativePath` is the file's
 * path under the output root (e.g. `job-1/generated.png`): every form the app
 * stores - absolute path, `/outputs/...`, preview URL - contains it. The
 * backend names every output `generated.png` inside a per-job folder, so the
 * bare file name would match every other job. A false positive only keeps an
 * orphaned intermediate on disk.
 */
export function isOutputReferenced(state: object, relativePath: string): boolean {
  const needle = normalizePath(relativePath).replace(/^\/+/, '');
  if (!needle) return true;
  const references: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'function') continue;
    // Job records are the producer, not consumers; the tagging queue holds
    // ids, which embed the output name.
    if (JOB_BOOKKEEPING_KEYS.has(key)) continue;
    references[key] = value;
  }
  let serialized: string;
  try {
    // Maps (iterationNodes) serialise as {} by default and would hide every
    // reference inside them; expand them. Job snapshots are bookkeeping.
    serialized = JSON.stringify(references, (key, value: unknown) => {
      if (JOB_SNAPSHOT_KEYS.has(key)) return undefined;
      if (value instanceof Map) return Array.from(value.entries());
      if (value instanceof Set) return Array.from(value.values());
      return value;
    });
  } catch {
    // Unserializable state: cannot prove the file is unused, so keep it.
    return true;
  }
  // A Windows path's backslash serialises as an escaped pair in JSON, and a
  // URL may percent-encode each segment.
  const variants = [
    needle,
    needle.replace(/\//g, '\\\\'),
    needle.split('/').map(encodeURIComponent).join('/'),
  ];
  return variants.some((variant) => serialized.includes(variant));
}

/** Job params with the superseded-output flags set. */
function flagSuperseded(job: GenerationJob, replacementPath: string): GenerationJob {
  return {
    ...job,
    params: {
      ...job.params,
      [SUPPRESS_ASSET_SYNC_PARAM]: true,
      [REPLACED_BY_ASSET_PATH_PARAM]: replacementPath,
    },
  };
}

export async function supersedeRawEditOutput(
  params: SupersedeRawEditOutputParams,
  {
    store,
    assetsApi = ((typeof window !== 'undefined' ? window.electron?.assets : undefined) ?? {}) as AssetDeleteApi,
  }: { store: EditStore; assetsApi?: AssetDeleteApi },
): Promise<SupersedeRawEditOutputResult> {
  const { jobId, rawPath, outputRoot, sourcePath, replacementPath } = params;

  // 1. Flag the job and show the composite in the run's iteration node.
  const state = store.getState();
  const job =
    state.activeJobs.find((entry) => entry.id === jobId) ??
    state.completedJobs.find((entry) => entry.id === jobId);
  if (job) {
    state.updateJob(jobId, { params: flagSuperseded(job, replacementPath).params });
  }
  const node = store.getState().iterationNodes.get(jobId);
  if (node) {
    store.getState().updateIterationNode(jobId, {
      thumbnail: previewUrlForAssetPath(replacementPath, store.getState().assetLibrary),
      generationJob: flagSuperseded(node.generationJob, replacementPath),
    });
  }

  // 2. Delete the intermediate file only when it is provably unused.
  if (!rawPath) return { deletedFile: false, keptReason: 'no-raw-path' };
  const raw = normalizePath(rawPath);
  if (sourcePath && normalizePath(sourcePath) === raw) {
    return { deletedFile: false, keptReason: 'is-source' };
  }
  const root = normalizePath(outputRoot);
  if (!root || !raw.startsWith(`${root}/`)) {
    return { deletedFile: false, keptReason: 'outside-output-root' };
  }
  if (isOutputReferenced(store.getState(), raw.slice(root.length + 1))) {
    return { deletedFile: false, keptReason: 'referenced' };
  }
  if (typeof assetsApi.delete !== 'function') {
    return { deletedFile: false, keptReason: 'delete-failed' };
  }
  try {
    const deleted = await assetsApi.delete(raw);
    return deleted.success
      ? { deletedFile: true }
      : { deletedFile: false, keptReason: 'delete-failed' };
  } catch {
    return { deletedFile: false, keptReason: 'delete-failed' };
  }
}
