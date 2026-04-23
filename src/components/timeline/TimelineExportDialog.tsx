import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clapperboard, Download, Film, FolderOpen, Loader2, AlertTriangle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { resolveTimelinePlayRange } from '@/features/timeline/sequenceComposition';
import { exportTimelineSequence, type TimelineExportStatusPatch } from '@/features/timeline/exportTimelineSequence';

interface TimelineExportDialogProps {
  open: boolean;
  sequenceId: string | null;
  onClose: () => void;
}

interface ExportUiState {
  isExporting: boolean;
  status: 'idle' | 'exporting' | 'success' | 'error';
  progress: number;
  activeJobId: string | null;
  errorMessage: string | null;
  outputPath: string | null;
}

const INITIAL_EXPORT_STATE: ExportUiState = {
  isExporting: false,
  status: 'idle',
  progress: 0,
  activeJobId: null,
  errorMessage: null,
  outputPath: null,
};

function formatTimecode(timeMs: number, fps = 24) {
  const totalSeconds = Math.max(0, timeMs / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);

  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function formatDurationLabel(durationMs: number) {
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
}

export function TimelineExportDialog({
  open,
  sequenceId,
  onClose,
}: TimelineExportDialogProps) {
  const { projects, timelineSequences } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      timelineSequences: state.timelineSequences,
    })),
  );
  const [uiState, setUiState] = useState<ExportUiState>(INITIAL_EXPORT_STATE);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const sequence = useMemo(
    () => (sequenceId ? timelineSequences.find((item) => item.id === sequenceId) ?? null : null),
    [sequenceId, timelineSequences],
  );
  const project = useMemo(
    () => (sequence ? projects.find((item) => item.id === sequence.projectId) ?? null : null),
    [projects, sequence],
  );
  const playRange = useMemo(
    () => (sequence ? resolveTimelinePlayRange(sequence) : null),
    [sequence],
  );
  const scopeLabel = sequence?.playRange ? 'Active Range' : 'Full Sequence';
  const effectiveFps = sequence?.fps ?? project?.fps ?? 24;

  useEffect(() => {
    if (!open) {
      setUiState(INITIAL_EXPORT_STATE);
      return;
    }

    setUiState(INITIAL_EXPORT_STATE);
  }, [open, sequenceId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && uiState.status !== 'exporting') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('[data-primary-action]')?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose, uiState.status]);

  if (!open || !sequence || !project || !playRange) {
    return null;
  }

  const handleClose = () => {
    if (uiState.status === 'exporting') {
      return;
    }

    onClose();
  };

  const handleStatusChange = (patch: TimelineExportStatusPatch) => {
    setUiState((current) => ({
      ...current,
      ...patch,
      isExporting: patch.isExporting ?? current.isExporting,
      status: patch.status ?? current.status,
      progress: patch.progress ?? current.progress,
      activeJobId: patch.activeJobId ?? current.activeJobId,
      errorMessage:
        patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
      outputPath: patch.outputPath === undefined ? current.outputPath : patch.outputPath,
    }));
  };

  const handleExport = async () => {
    setUiState({
      ...INITIAL_EXPORT_STATE,
      isExporting: true,
      status: 'exporting',
    });

    try {
      const result = await exportTimelineSequence({
        sequenceId: sequence.id,
        onStatusChange: handleStatusChange,
      });

      if (result.cancelled) {
        setUiState(INITIAL_EXPORT_STATE);
        return;
      }

      setUiState((current) =>
        current.status === 'success' && current.outputPath
          ? current
          : {
              ...INITIAL_EXPORT_STATE,
              status: 'success',
              progress: 100,
              outputPath: result.outputPath,
            },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Timeline export failed.';
      setUiState({
        ...INITIAL_EXPORT_STATE,
        status: 'error',
        errorMessage: message,
      });
    }
  };

  const handleOpenFile = async () => {
    if (!uiState.outputPath) {
      return;
    }

    const result = await window.electron.app.openPath(uiState.outputPath);
    if (!result.success) {
      setUiState((current) => ({
        ...current,
        status: 'error',
        errorMessage: result.error || 'Could not open the exported MP4.',
      }));
    }
  };

  const handleRevealFile = async () => {
    if (!uiState.outputPath) {
      return;
    }

    const result = await window.electron.assets.reveal(uiState.outputPath);
    if (!result.success) {
      setUiState((current) => ({
        ...current,
        status: 'error',
        errorMessage: result.error || 'Could not reveal the exported MP4.',
      }));
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-label="Timeline Export"
      >
        <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          onClick={(event) => event.stopPropagation()}
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-elevated shadow-cinematic"
          data-testid="timeline-export-dialog"
        >
          <div className="border-b border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-text-muted">
                  <Film className="h-3.5 w-3.5" />
                  Timeline Export
                </p>
                <h2 className="mt-3 font-display text-2xl text-text-primary">{sequence.name}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-text-body">
                  Export a silent MP4 using the same resolved sequence playback used by the center preview.
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={uiState.status === 'exporting'}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-body transition hover:bg-canvas hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard
                label="Scope"
                value={scopeLabel}
                detail={
                  sequence.playRange
                    ? 'Only the marked in/out range will render.'
                    : 'The entire active sequence will render.'
                }
              />
              <SummaryCard
                label="Range"
                value={`${formatTimecode(playRange.startMs, effectiveFps)} to ${formatTimecode(playRange.endMs, effectiveFps)}`}
                detail={formatDurationLabel(playRange.durationMs)}
              />
              <SummaryCard
                label="Format"
                value={`${project.dimensions.width}x${project.dimensions.height}`}
                detail={`Silent MP4 at ${effectiveFps} fps`}
              />
            </div>

            <div
              className={cn(
                'rounded-2xl border px-4 py-4',
                uiState.status === 'success'
                  ? 'border-status-success/40 bg-status-success-muted/40'
                  : uiState.status === 'error'
                    ? 'border-status-error/30 bg-status-error-muted/60'
                    : 'border-border bg-surface/70',
              )}
            >
              {uiState.status === 'success' ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-status-success" />
                  <div className="min-w-0">
                    <p className="font-display text-base text-text-primary">Export complete</p>
                    <p className="mt-1 text-sm text-text-body">
                      The sequence render finished successfully.
                    </p>
                    {uiState.outputPath ? (
                      <p className="mt-2 break-all font-mono text-xs text-text-muted">{uiState.outputPath}</p>
                    ) : null}
                  </div>
                </div>
              ) : uiState.status === 'error' ? (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-status-error" />
                  <div className="min-w-0">
                    <p className="font-display text-base text-text-primary">Export failed</p>
                    <p className="mt-1 text-sm text-text-body">
                      {uiState.errorMessage || 'Timeline export failed before a file was written.'}
                    </p>
                  </div>
                </div>
              ) : uiState.status === 'exporting' ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-base text-text-primary">Rendering MP4</p>
                      <p className="mt-1 text-sm text-text-body">
                        The export stays local and the dialog will remain open until the render finishes.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas px-3 py-1 text-sm text-text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {Math.round(uiState.progress)}%
                    </div>
                  </div>
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-void"
                    role="progressbar"
                    aria-label="Timeline export progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(uiState.progress)}
                    data-testid="timeline-export-progress"
                  >
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-gradient-progress-start),var(--color-gradient-progress-end))] transition-[width] duration-200"
                      style={{ width: `${Math.max(4, uiState.progress)}%` }}
                    />
                  </div>
                  {uiState.activeJobId ? (
                    <p className="mt-3 font-mono text-[11px] text-text-muted">Job {uiState.activeJobId}</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Clapperboard className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-primary" />
                  <div>
                    <p className="font-display text-base text-text-primary">Ready to export</p>
                    <p className="mt-1 text-sm text-text-body">
                      Choose a save destination, then the app will render this timeline view into one silent MP4.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface/60 px-6 py-4">
            <p className="text-xs text-text-muted">
              No GIF, image sequence, or audio export in this milestone.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {uiState.status === 'success' ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleRevealFile()}
                    icon={FolderOpen}
                  >
                    Show In Folder
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleOpenFile()}
                    icon={Film}
                  >
                    Open MP4
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleClose}
                    data-primary-action
                  >
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleClose}
                    disabled={uiState.status === 'exporting'}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={uiState.status === 'error' ? 'danger' : 'primary'}
                    size="sm"
                    icon={uiState.status === 'exporting' ? Loader2 : Download}
                    onClick={() => void handleExport()}
                    disabled={uiState.status === 'exporting'}
                    data-primary-action
                  >
                    {uiState.status === 'error' ? 'Retry Export' : 'Export MP4'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-2 font-display text-base text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{detail}</p>
    </div>
  );
}
