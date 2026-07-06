import { useCallback, useRef, useState } from 'react';

import {
  runEditTool,
  type EditOperation,
  type EditToolParams,
  type EditToolResult,
} from './runEditTool';

/**
 * Panel-facing lifecycle for one edit-tool run at a time (#34): progress,
 * honest error/notice feedback, and cancel via AbortSignal. Re-entrant run()
 * calls while a job is in flight are no-ops.
 */
export function useEditTool() {
  const [isRunning, setIsRunning] = useState(false);
  const [runningOperation, setRunningOperation] = useState<EditOperation | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (operation: EditOperation, params: EditToolParams): Promise<EditToolResult> => {
      if (abortRef.current) {
        return { ok: false };
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);
      setRunningOperation(operation);
      setProgress(0);
      setError(null);
      setNotice(null);
      try {
        const result = await runEditTool(operation, params, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (!result.ok && result.error) {
          setError(result.error);
        }
        if (result.notice) {
          setNotice(result.notice);
        }
        return result;
      } finally {
        abortRef.current = null;
        setIsRunning(false);
        setRunningOperation(null);
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return { run, cancel, isRunning, runningOperation, progress, error, notice, clearFeedback };
}
