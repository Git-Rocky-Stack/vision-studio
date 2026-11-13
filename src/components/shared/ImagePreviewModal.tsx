import { useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Copy,
  RefreshCw,
  Maximize2,
  Download,
  Trash2,
  Clock,
  Hash,
  Settings2,
  Monitor,
  Cpu,
  Sliders,
  Scale,
} from 'lucide-react';
import type { BatchResult } from '@/types/generation';
import { toGenerationDraftFromResult } from '@/features/batch/resultActions';
import { useEditTool } from '@/features/edit/useEditTool';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { pushNotice, reportActionError, runExport } from '@/features/notices';
import { AddToCollectionMenu } from '@/components/collections/AddToCollectionMenu';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { isEditableTarget } from '@/utils/isEditableTarget';

interface ImagePreviewModalProps {
  result: BatchResult | null;
  results: BatchResult[];
  onClose: () => void;
  onNavigate: (resultId: string) => void;
}

export function ImagePreviewModal({
  result,
  results,
  onClose,
  onNavigate,
}: ImagePreviewModalProps) {
  const {
    setCurrentImage,
    setActiveTab,
    setGenerationDraft,
    removeBatchResults,
    removeAssetRecordsByPaths,
  } = useAppStore(
    useShallow((s) => ({
      setCurrentImage: s.setCurrentImage,
      setActiveTab: s.setActiveTab,
      setGenerationDraft: s.setGenerationDraft,
      removeBatchResults: s.removeBatchResults,
      removeAssetRecordsByPaths: s.removeAssetRecordsByPaths,
    }))
  );

  const editTool = useEditTool();
  // Collections hold library asset ids; resolve this result's record by path.
  const libraryAssetId = useAppStore((s) =>
    result?.assetPath ? (s.assetLibrary.find((a) => a.path === result.assetPath)?.id ?? null) : null,
  );

  const currentIndex = result ? results.findIndex((r) => r.id === result.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < results.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(results[currentIndex - 1].id);
    }
  }, [hasPrev, currentIndex, results, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      onNavigate(results[currentIndex + 1].id);
    }
  }, [hasNext, currentIndex, results, onNavigate]);

  // Arrow-key navigation is this dialog's own shortcut, so it does not consult
  // the workspace modal guard; it does leave the arrows to text fields (the
  // Add to collection name field) and to widgets that already claimed them.
  useEffect(() => {
    if (!result) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [result, goToPrev, goToNext]);

  // Shared modal contract: focus in, Tab trapped, Escape closes (and never
  // reaches window shortcuts such as the timeline or Pen tool), focus restored.
  const modalRef = useRef<HTMLDivElement>(null);
  useDialogFocus(modalRef, { open: result !== null, onEscape: onClose });

  const handleSendToEdit = () => {
    if (result?.imagePath) {
      setCurrentImage(result.imagePath, result.assetPath);
      setActiveTab('canvas');
      useAppStore.getState().setActiveSubMode(null);
      useAppStore.getState().setCenterView('canvas');
      onClose();
    }
  };

  const handleCopyPrompt = () => {
    if (!result?.prompt) return;
    // The clipboard can refuse (no focus, permission): say so rather than
    // leaving an unhandled rejection and a silent no-op.
    navigator.clipboard.writeText(result.prompt).then(
      () => pushNotice('success', 'Prompt copied to the clipboard.'),
      () => reportActionError('Could not copy the prompt to the clipboard.'),
    );
  };

  const handleRegenerate = () => {
    if (result) {
      setGenerationDraft(toGenerationDraftFromResult(result));
      setActiveTab('generate');
      onClose();
    }
  };

  const handleExport = async () => {
    if (!result?.assetPath) {
      return;
    }

    const destinationPath = await window.electron.dialog.saveFile({
      defaultPath: result.assetPath.split('/').pop(),
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });

    if (!destinationPath) {
      return;
    }

    const assetPath = result.assetPath;
    await runExport(() => window.electron.assets.export(assetPath, destinationPath));
  };

  const handleDelete = async () => {
    if (!result?.assetPath) {
      onClose();
      return;
    }

    const deleteResult = await window.electron.assets.delete(result.assetPath);
    if (!deleteResult.success) {
      return;
    }

    removeBatchResults([result.id]);
    removeAssetRecordsByPaths([result.assetPath]);
    onClose();
  };

  // #34: real AI upscale (Real-ESRGAN job) - the LANCZOS resize masquerading
  // as AI is gone. The run handles asset sync + setCurrentImage on completion.
  const handleUpscale = async () => {
    if (!result?.assetPath || editTool.isRunning) {
      return;
    }

    const outcome = await editTool.run('upscale', {
      source_path: result.assetPath,
      scale: 2,
      model: 'general',
    });
    if (!outcome.ok) {
      return; // editTool.error carries the honest message (rendered below)
    }

    setActiveTab('canvas');
    useAppStore.getState().setActiveSubMode(null);
    useAppStore.getState().setCenterView('canvas');
    onClose();
  };

  if (!result) return null;

  const metadataRows: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: Cpu, label: 'Model', value: result.params?.model || 'Unknown' },
    { icon: Sliders, label: 'Steps', value: String(result.params?.steps || '-') },
    { icon: Scale, label: 'CFG Scale', value: String(result.params?.cfgScale || '-') },
    { icon: Hash, label: 'Seed', value: String(result.seed) },
    { icon: Settings2, label: 'Scheduler', value: result.params?.scheduler || '-' },
    { icon: Clock, label: 'Time', value: `${result.generationTime.toFixed(1)}s` },
    { icon: Monitor, label: 'Resolution', value: result.params?.resolution || `${result.params?.width || '-'} x ${result.params?.height || '-'}` },
  ];

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-void/90 backdrop-blur-sm" />

          {/* Content */}
          {/* Presentation: captures clicks bubbling from the content so they
              never reach the dialog's close-on-click below it. */}
          <div
            ref={modalRef}
            role="presentation"
            className="relative flex flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            {/* Sits over the image, so it keeps a backing the header-row
                version does not need. */}
            <DialogCloseButton
              label="Close preview"
              onClick={onClose}
              className="absolute top-4 right-4 z-10 bg-surface/80 backdrop-blur-sm"
            />

            {/* Image Area */}
            <div className="flex-1 flex items-center justify-center relative px-16">
              {/* Previous button */}
              {hasPrev && (
                <button
                  onClick={goToPrev}
                  aria-label="Previous image"
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-md bg-surface/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Image */}
              <motion.img
                key={result.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                src={result.imagePath}
                alt={result.prompt}
                className="max-h-[80vh] max-w-full object-contain rounded-sm shadow-overlay"
              />

              {/* Next button */}
              {hasNext && (
                <button
                  onClick={goToNext}
                  aria-label="Next image"
                  className="absolute right-[340px] top-1/2 -translate-y-1/2 p-3 rounded-md bg-surface/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              {/* Image counter */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-surface/80 backdrop-blur-sm">
                <span className="font-mono text-xs text-text-body">
                  {currentIndex + 1} / {results.length}
                </span>
              </div>
            </div>

            {/* Metadata Sidebar */}
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="w-[320px] bg-elevated border-l border-border flex flex-col overflow-hidden"
            >
              {/* Prompt */}
              <div className="p-4 border-b border-border">
                <h3 className="text-label text-text-muted mb-2">
                  Prompt
                </h3>
                <p className="text-sm text-text-primary leading-relaxed max-h-32 overflow-y-auto scrollbar-hide">
                  {result.prompt}
                </p>
              </div>

              {/* Negative Prompt */}
              {result.params?.negativePrompt && (
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-label text-text-muted mb-2">
                    Negative Prompt
                  </h3>
                  <p className="text-xs text-text-body leading-relaxed max-h-20 overflow-y-auto scrollbar-hide">
                    {result.params.negativePrompt}
                  </p>
                </div>
              )}

              {/* Settings Grid */}
              <div className="px-4 py-3 border-b border-border flex-1 overflow-y-auto scrollbar-hide">
                <h3 className="text-label text-text-muted mb-3">
                  Settings
                </h3>
                <div className="space-y-2.5">
                  {metadataRows.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-xs text-text-body">{label}</span>
                      </div>
                      <span className="text-xs text-text-primary font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 space-y-2">
                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  icon={Pencil}
                  onClick={handleSendToEdit}
                >
                  Send to Edit
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Copy}
                    onClick={handleCopyPrompt}
                  >
                    Copy Prompt
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={RefreshCw}
                    onClick={handleRegenerate}
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Maximize2}
                    isLoading={editTool.isRunning && editTool.runningOperation === 'upscale'}
                    loadingLabel={
                      editTool.progress > 0
                        ? `Upscaling ${Math.round(editTool.progress)}%`
                        : 'Upscaling...'
                    }
                    disabled={editTool.isRunning}
                    onClick={handleUpscale}
                  >
                    Upscale
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Download}
                    onClick={handleExport}
                  >
                    Export
                  </Button>
                </div>
                <AddToCollectionMenu
                  assetId={libraryAssetId}
                  triggerClassName="w-full justify-center rounded-md px-3 py-2 type-ui text-text-body transition hover:bg-elevated hover:text-text-primary"
                />
                {editTool.error && (
                  <div
                    role="alert"
                    data-testid="modal-upscale-error"
                    className="flex items-start gap-2 rounded-sm border border-status-error-border bg-status-error-muted px-3 py-2"
                  >
                    <p className="flex-1 type-caption text-status-error">{editTool.error}</p>
                    <button
                      type="button"
                      aria-label="Dismiss upscale error"
                      onClick={editTool.clearFeedback}
                      className="raised-control p-1 text-status-error hover:text-text-primary"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  icon={Trash2}
                  onClick={handleDelete}
                  className="text-status-error hover:bg-status-error-muted"
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
