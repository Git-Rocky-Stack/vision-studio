import { useCallback, useRef, useState } from 'react';

import {
  runEditTool,
  type EditOperation,
  type EditToolParams,
  type EditToolResult,
} from './runEditTool';
import {
  runGuidedEditTool,
  type GuidedEditInput,
  type GuidedEditOperation,
} from './runGuidedEditTool';

export type AnyEditOperation = EditOperation | GuidedEditOperation;

/**
 * Panel-facing lifecycle for one edit-tool run at a time (#34): progress,
 * honest error/notice feedback, and cancel via AbortSignal. Re-entrant run()
 * calls while a job is in flight are no-ops. PR2 adds runGuided() for the
 * guided-pass tools; both entries share the same single-flight state.
 */
export function useEditTool() {
  const [isRunning, setIsRunning] = useState(false);
  const [runningOperation, setRunningOperation] = useState<AnyEditOperation | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const track = useCallback(
    async (
      operation: AnyEditOperation,
      invoke: (signal: AbortSignal) => Promise<EditToolResult>,
    ): Promise<EditToolResult> => {
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
        const result = await invoke(controller.signal);
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

  const run = useCallback(
    (operation: EditOperation, params: EditToolParams) =>
      track(operation, (signal) =>
        runEditTool(operation, params, { signal, onProgress: setProgress }),
      ),
    [track],
  );

  const runGuided = useCallback(
    (operation: GuidedEditOperation, input: GuidedEditInput) =>
      track(operation, (signal) =>
        runGuidedEditTool(operation, input, { signal, onProgress: setProgress }),
      ),
    [track],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    run,
    runGuided,
    cancel,
    isRunning,
    runningOperation,
    progress,
    error,
    notice,
    clearFeedback,
  };
}
