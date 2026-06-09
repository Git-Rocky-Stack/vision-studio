/**
 * Minimal in-process HTTP mock of the Vision Studio Python backend, for Electron
 * E2E tests that need a generation job to actually COMPLETE without a real GPU
 * backend. It implements exactly the endpoints the renderer -> main-process flow
 * calls during a generation:
 *
 *   GET  /                     liveness root
 *   GET  /api/system/info      connectivity probe -> flips systemInfo.backendConnected
 *   GET  /api/models           model list (renderer loads on mount; [] is fine)
 *   POST /api/generate/image   job submission -> { job_id }
 *   POST /api/generate/video   job submission -> { job_id }
 *   GET  /api/jobs/:id          status poll -> 'processing' (first N polls) then 'completed'
 *   GET  /outputs/:file         serves a real PNG so the <img> preview actually paints
 *   POST /api/jobs/:id/cancel   cancel (no-op)
 *
 * Auth headers sent by the main process are intentionally ignored.
 *
 * The server binds to the unspecified address (dual-stack) so BOTH the main
 * process (http://127.0.0.1:8000, used by axios/fetch in electron/ipc-handlers)
 * and the renderer's <img src="http://localhost:8000/outputs/...">  (where
 * `localhost` may resolve to 127.0.0.1 or ::1) reach the same listener.
 *
 * Pairs with the app's `VISION_STUDIO_BACKEND_EXTERNAL` env flag, which tells the
 * main process to probe this externally-managed backend over HTTP.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// 1x1 opaque PNG. A valid raster so a successfully-loaded <img> reports naturalWidth > 0.
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const CREATED_AT = '2026-06-08T00:00:00.000Z';

export interface MockBackendOptions {
  /** Port to bind. Defaults to 8000 (the hardcoded backend port the app targets). */
  port?: number;
  /** Job id returned from submission and echoed in status polls. */
  jobId?: string;
  /** 'image' populates result.images; 'video' populates result.video. */
  kind?: 'image' | 'video';
  /** Output filename served under /outputs and referenced by the completed job. */
  outputFile?: string;
  /** Number of 'processing' status polls before the job reports 'completed'. */
  processingPolls?: number;
}

export interface MockBackend {
  port: number;
  jobId: string;
  /** e.g. '/outputs/e2e.png' - the path the completed job reports and serves. */
  outputPath: string;
  /** Every request received, as "METHOD /path" - for assertions/debugging. */
  requests: string[];
  close: () => Promise<void>;
}

export async function startMockBackend(options: MockBackendOptions = {}): Promise<MockBackend> {
  const port = options.port ?? 8000;
  const jobId = options.jobId ?? 'e2e-job-1';
  const kind = options.kind ?? 'image';
  const outputFile = options.outputFile ?? 'e2e.png';
  const processingPolls = options.processingPolls ?? 1;
  const outputPath = `/outputs/${outputFile}`;

  const requests: string[] = [];
  let pollCount = 0;

  const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    requests.push(`${method} ${pathname}`);
    // Drain any request body so the socket is released.
    req.resume();

    if (method === 'GET' && pathname === '/') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (method === 'GET' && pathname === '/api/system/info') {
      return sendJson(res, 200, {
        backendConnected: true,
        gpu_available: true,
        gpu_name: 'Mock GPU (E2E)',
        gpu_vram: '24 GB',
        cuda_version: '12.4',
        comfyui_connected: false,
        models_count: 1,
      });
    }

    if (method === 'GET' && pathname === '/api/models') {
      return sendJson(res, 200, []);
    }

    if (method === 'POST' && (pathname === '/api/generate/image' || pathname === '/api/generate/video')) {
      return sendJson(res, 200, { job_id: jobId });
    }

    if (method === 'GET' && pathname === `/api/jobs/${jobId}`) {
      pollCount += 1;
      if (pollCount <= processingPolls) {
        return sendJson(res, 200, {
          job_id: jobId,
          status: 'processing',
          type: kind,
          progress: 45,
          step: 11,
          created_at: CREATED_AT,
        });
      }
      const result =
        kind === 'video'
          ? { video: outputPath, duration: 2, seed: 12345 }
          : { images: [outputPath], seed: 12345 };
      return sendJson(res, 200, {
        job_id: jobId,
        status: 'completed',
        type: kind,
        progress: 100,
        created_at: CREATED_AT,
        completed_at: CREATED_AT,
        result,
        params: { prompt: 'e2e', width: 512, height: 512 },
      });
    }

    if (method === 'GET' && pathname === outputPath) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': ONE_BY_ONE_PNG.length });
      return res.end(ONE_BY_ONE_PNG);
    }

    if (method === 'POST' && pathname === `/api/jobs/${jobId}/cancel`) {
      return sendJson(res, 200, {});
    }

    return sendJson(res, 404, { error: 'not found', path: pathname });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve());
  });

  return {
    port: (server.address() as AddressInfo).port,
    jobId,
    outputPath,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
