import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOpenRouterImageJobStore, type OpenRouterImageJob } from './openRouterImageJobs';
import { runOpenRouterImageJob } from './runOpenRouterImageJob';

// Background: runOpenRouterImageJob is the orchestrator the IPC layer
// hands a job over to once the renderer has decided to route to
// OpenRouter for still-image generation. It owns the full lifecycle:
// validate params, resolve the account, mint an AbortController, hit
// OpenRouter, persist images to disk, mark complete -- with two
// cancellation checkpoints (after the API call returns, and after the
// images are written to disk) so a user-cancel doesn't leave half a
// completed job behind, but also doesn't leak files on disk.

type ImageEnvelope = {
  responseId: string | null;
  model: string;
  content: string;
  images: { dataUrl: string; mimeType: string }[];
  usage?: unknown;
};

function makeImageResponse(overrides: Partial<ImageEnvelope> = {}): ImageEnvelope {
  return {
    responseId: 'resp-1',
    model: 'google/gemini-2.5-flash-image',
    content: '',
    images: [
      {
        dataUrl: `data:image/png;base64,${Buffer.from('PNG!', 'utf-8').toString('base64')}`,
        mimeType: 'image/png',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0 },
    ...overrides,
  };
}

function baseParams() {
  return {
    prompt: 'a sunlit studio portrait',
    width: 1024,
    height: 1024,
    seed: 42,
    model: 'google/gemini-2.5-flash-image',
    __openrouterAccountId: 'acct-1',
  };
}

function makeAccount() {
  return {
    id: 'acct-1',
    preferences: { openRouterImageModel: 'google/gemini-2.5-flash-image' },
  };
}

function setupHarness({
  account = makeAccount() as ReturnType<typeof makeAccount> | null,
  apiKey = 'sk-test',
  generateImage = vi.fn(async () => makeImageResponse()),
  outputDirectory,
  deleteOrphans = vi.fn(async () => undefined),
}: {
  account?: ReturnType<typeof makeAccount> | null;
  apiKey?: string | null;
  generateImage?: ReturnType<typeof vi.fn>;
  outputDirectory?: string;
  deleteOrphans?: ReturnType<typeof vi.fn>;
} = {}) {
  const emit = vi.fn();
  const store = createOpenRouterImageJobStore({ emit });
  const userAccounts = {
    getAccount: vi.fn(() => account),
    getOpenRouterApiKey: vi.fn(() => apiKey),
  };
  const openRouter = { generateImage };
  const rememberOutputRoot = vi.fn();
  const outputRoots = {
    getResolvedOutputDirectory: vi.fn(() => outputDirectory ?? ''),
    rememberOutputRoot,
  };

  function seedJob(jobId: string) {
    const job: OpenRouterImageJob = {
      job_id: jobId,
      status: 'pending',
      progress: 0,
      type: 'image',
      created_at: '2026-05-06T00:00:00.000Z',
    };
    store.set(job);
    emit.mockClear();
  }

  return {
    emit,
    store,
    userAccounts,
    openRouter,
    outputRoots,
    rememberOutputRoot,
    deleteOrphans,
    seedJob,
    deps: { store, userAccounts, openRouter, outputRoots, deleteOrphans },
  };
}

describe('runOpenRouterImageJob', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'or-job-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  describe('validation gates', () => {
    it('marks the job failed with the validation error when params are malformed', async () => {
      const h = setupHarness({ outputDirectory: tempRoot });
      h.seedJob('openrouter-image-bad-params');

      // Missing prompt entirely.
      await runOpenRouterImageJob(
        'openrouter-image-bad-params',
        { width: 1024, height: 1024, __openrouterAccountId: 'acct-1' },
        h.deps,
      );

      const job = h.store.get('openrouter-image-bad-params');
      expect(job?.status).toBe('failed');
      expect(job?.progress).toBe(100);
      expect(job?.error).toMatch(/invalid generation parameters/i);
      expect(job?.completed_at).toBeTruthy();
      expect(h.openRouter.generateImage).not.toHaveBeenCalled();
    });

    it('marks the job failed when no active account is available', async () => {
      const h = setupHarness({ account: null, outputDirectory: tempRoot });
      h.seedJob('openrouter-image-no-acct');

      await runOpenRouterImageJob('openrouter-image-no-acct', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-no-acct');
      expect(job?.status).toBe('failed');
      expect(job?.error).toMatch(/no active openrouter image account/i);
    });

    it('marks the job failed when the apiKey is missing for the account', async () => {
      const h = setupHarness({ apiKey: null, outputDirectory: tempRoot });
      h.seedJob('openrouter-image-no-key');

      await runOpenRouterImageJob('openrouter-image-no-key', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-no-key');
      expect(job?.status).toBe('failed');
      expect(job?.error).toMatch(/not fully configured/i);
    });

    it('marks the job failed when neither params.model nor account.preferences.openRouterImageModel resolves to a value', async () => {
      const h = setupHarness({
        account: { id: 'acct-1', preferences: { openRouterImageModel: '   ' } },
        outputDirectory: tempRoot,
      });
      h.seedJob('openrouter-image-no-model');

      const params = { ...baseParams(), model: '   ' };
      await runOpenRouterImageJob('openrouter-image-no-model', params, h.deps);

      const job = h.store.get('openrouter-image-no-model');
      expect(job?.status).toBe('failed');
      expect(job?.error).toMatch(/select an openrouter image model/i);
    });
  });

  describe('happy path', () => {
    it('runs the full lifecycle: pending -> processing(12) -> 72 -> completed(100)', async () => {
      const h = setupHarness({ outputDirectory: tempRoot });
      h.seedJob('openrouter-image-happy');

      await runOpenRouterImageJob('openrouter-image-happy', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-happy');
      expect(job?.status).toBe('completed');
      expect(job?.progress).toBe(100);
      expect(job?.completed_at).toBeTruthy();
      expect(job?.result?.images).toHaveLength(1);
      expect(job?.result?.provider).toBe('openrouter');
      expect(job?.result?.seed).toBe(42);
      expect(job?.result?.model).toBe('google/gemini-2.5-flash-image');
      // AbortController is cleared on completion so list-jobs payload is serializable.
      expect(job?.abortController).toBeUndefined();
    });

    it('persists each generated image to disk under <outputRoot>/openrouter/<date>/', async () => {
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () =>
          makeImageResponse({
            images: [
              {
                dataUrl: `data:image/png;base64,${Buffer.from('A', 'utf-8').toString('base64')}`,
                mimeType: 'image/png',
              },
              {
                dataUrl: `data:image/png;base64,${Buffer.from('B', 'utf-8').toString('base64')}`,
                mimeType: 'image/png',
              },
            ],
          }),
        ),
      });
      h.seedJob('openrouter-image-disk');

      await runOpenRouterImageJob('openrouter-image-disk', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-disk');
      expect(job?.result?.images).toHaveLength(2);
      const today = new Date().toISOString().slice(0, 10);
      for (const filePath of job?.result?.images ?? []) {
        expect(filePath).toContain(`/openrouter/${today}/`);
        const bytes = await fs.promises.readFile(filePath.replace(/\//g, path.sep));
        expect(['A', 'B']).toContain(bytes.toString('utf-8'));
      }
    });

    it('passes the prompt, model, and dimensions through to openRouter.generateImage', async () => {
      const h = setupHarness({ outputDirectory: tempRoot });
      h.seedJob('openrouter-image-passthrough');

      await runOpenRouterImageJob('openrouter-image-passthrough', baseParams(), h.deps);

      expect(h.openRouter.generateImage).toHaveBeenCalledTimes(1);
      const call = h.openRouter.generateImage.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.apiKey).toBe('sk-test');
      expect(call.model).toBe('google/gemini-2.5-flash-image');
      expect(call.prompt).toBe('a sunlit studio portrait');
      expect(call.width).toBe(1024);
      expect(call.height).toBe(1024);
      expect(call.seed).toBe(42);
      expect(call.signal).toBeInstanceOf(AbortSignal);
    });

    it('remembers the resolved output root after a successful write', async () => {
      const h = setupHarness({ outputDirectory: tempRoot });
      h.seedJob('openrouter-image-remember');

      await runOpenRouterImageJob('openrouter-image-remember', baseParams(), h.deps);

      expect(h.rememberOutputRoot).toHaveBeenCalledWith(tempRoot);
    });
  });

  describe('cancellation checkpoints', () => {
    it('between API response and disk write: bails without completing or writing', async () => {
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () => {
          // Simulate the user cancelling between the API call and the write.
          h.store.patch('openrouter-image-cancel-mid', {
            status: 'cancelled',
            completed_at: '2026-05-06T01:00:00.000Z',
          });
          return makeImageResponse();
        }),
      });
      h.seedJob('openrouter-image-cancel-mid');

      await runOpenRouterImageJob('openrouter-image-cancel-mid', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-cancel-mid');
      expect(job?.status).toBe('cancelled');
      expect(job?.result?.images).toBeUndefined();
      expect(h.deleteOrphans).not.toHaveBeenCalled();

      // Verify nothing was written to disk for this jobId.
      const today = new Date().toISOString().slice(0, 10);
      const dir = path.join(tempRoot, 'openrouter', today);
      const exists = await fs.promises
        .access(dir)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        const files = await fs.promises.readdir(dir);
        expect(files.filter((f) => f.startsWith('openrouter-image-cancel-mid-'))).toEqual([]);
      }
    });

    it('after disk write: deletes the orphaned files and bails without completing', async () => {
      let writeCount = 0;
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () => makeImageResponse()),
      });
      h.seedJob('openrouter-image-cancel-late');

      // Spy on patch so we can simulate a user-cancel landing in the
      // narrow window between disk-write completion and the post-write
      // checkpoint -- i.e., flip status to cancelled the instant the
      // orchestrator publishes its progress=72 marker.
      const originalPatch = h.store.patch.bind(h.store);
      vi.spyOn(h.store, 'patch').mockImplementation((id, patch) => {
        const result = originalPatch(id, patch);
        if (patch.progress === 72) {
          writeCount += 1;
          originalPatch(id, {
            status: 'cancelled',
            completed_at: '2026-05-06T01:00:00.000Z',
          });
        }
        return result;
      });

      await runOpenRouterImageJob('openrouter-image-cancel-late', baseParams(), h.deps);

      // The orchestrator wrote at least one file before we cancelled.
      expect(writeCount).toBe(1);
      // Job ended in cancelled, not completed.
      const job = h.store.get('openrouter-image-cancel-late');
      expect(job?.status).toBe('cancelled');
      // The orchestrator MUST have invoked the orphan cleanup with the
      // image paths it had already written -- otherwise we'd leak files.
      expect(h.deleteOrphans).toHaveBeenCalledTimes(1);
      const orphansArg = (h.deleteOrphans as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
        | string[]
        | undefined;
      expect(orphansArg).toBeDefined();
      expect(orphansArg?.length).toBeGreaterThan(0);
    });
  });

  describe('failure handling', () => {
    it('marks the job failed with the OpenRouter error message when generateImage rejects', async () => {
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () => {
          throw new Error('Rate limit exceeded for this key.');
        }),
      });
      h.seedJob('openrouter-image-rate-limit');

      await runOpenRouterImageJob('openrouter-image-rate-limit', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-rate-limit');
      expect(job?.status).toBe('failed');
      expect(job?.progress).toBe(100);
      expect(job?.error).toBe('Rate limit exceeded for this key.');
      expect(job?.completed_at).toBeTruthy();
      expect(job?.abortController).toBeUndefined();
    });

    it('does NOT overwrite a cancelled status when the API rejects with AbortError mid-flight', async () => {
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () => {
          // The orchestrator's cancel handler patches to cancelled before
          // the AbortError surfaces; verify we don't then overwrite it
          // with a 'failed' status.
          h.store.patch('openrouter-image-abort', {
            status: 'cancelled',
            completed_at: '2026-05-06T01:00:00.000Z',
          });
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }),
      });
      h.seedJob('openrouter-image-abort');

      await runOpenRouterImageJob('openrouter-image-abort', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-abort');
      expect(job?.status).toBe('cancelled');
    });

    it('uses the AbortError-specific copy when AbortError surfaces and the job is NOT already cancelled', async () => {
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () => {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }),
      });
      h.seedJob('openrouter-image-abort-only');

      await runOpenRouterImageJob('openrouter-image-abort-only', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-abort-only');
      expect(job?.status).toBe('failed');
      expect(job?.error).toMatch(/cancel/i);
    });

    it('falls back to a generic message for engine errors (does not leak internals)', async () => {
      const h = setupHarness({
        outputDirectory: tempRoot,
        generateImage: vi.fn(async () => {
          throw new TypeError("Cannot read properties of undefined (reading 'foo')");
        }),
      });
      h.seedJob('openrouter-image-engine');

      await runOpenRouterImageJob('openrouter-image-engine', baseParams(), h.deps);

      const job = h.store.get('openrouter-image-engine');
      expect(job?.status).toBe('failed');
      expect(job?.error).toMatch(/openrouter image generation failed/i);
      expect(job?.error).not.toMatch(/Cannot read properties/);
    });
  });
});
