import axios from 'axios';

/**
 * Shared HTTP client for Electron -> local Python backend calls.
 *
 * Plain axios has no timeout, so a wedged backend (stuck model load, GIL
 * contention, a half-open socket) left IPC handlers awaiting forever and the
 * renderer spinner never resolved. Control calls - job submit / status /
 * cancel, list endpoints, provisioning toggles - answer in well under a
 * second, so they get a 30s ceiling by default.
 *
 * Calls that legitimately run long on the backend (library import + rescan,
 * safetensors conversion, runtime resolution, retrieval ingest) pass
 * BACKEND_LONG_OPERATION_TIMEOUT_MS explicitly. Generation itself is never
 * awaited over HTTP: the backend returns a job id and progress arrives over
 * the WebSocket.
 */
export const BACKEND_CONTROL_TIMEOUT_MS = 30_000;
export const BACKEND_LONG_OPERATION_TIMEOUT_MS = 10 * 60_000;

export const backendHttp = axios.create({ timeout: BACKEND_CONTROL_TIMEOUT_MS });
