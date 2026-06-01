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
    upsertDerivedAsset,
  } = useAppStore(
    useShallow((s) => ({
      setCurrentImage: s.setCurrentImage,
      setActiveTab: s.setActiveTab,
      setGenerationDraft: s.setGenerationDraft,
      removeBatchResults: s.removeBatchResults,
      removeAssetRecordsByPaths: s.removeAssetRecordsByPaths,
      upsertDerivedAsset: s.upsertDerivedAsset,
    }))
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

  // Keyboard navigation
  useEffect(() => {
    if (!result) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [result, onClose, goToPrev, goToNext]);

  // Focus trap
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result) return;
    const previousFocus = document.activeElement as HTMLElement;

    // Focus the first focusable element when modal opens
    const container = modalRef.current;
    if (container) {
      const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
      const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = modalRef.current;
      if (!container) return;

      const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [result]);

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
    if (result?.prompt) {
      navigator.clipboard.writeText(result.prompt);
    }
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

    await window.electron.assets.export(result.assetPath, destinationPath);
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

  const handleUpscale = async () => {
    if (!result?.assetPath) {
      return;
    }

    const upscaleResult = await window.electron.generation.upscaleImage({
      source_path: result.assetPath,
      scale_factor: 2,
    });

    if (!upscaleResult?.image || !upscaleResult?.output_path) {
      return;
    }

    upsertDerivedAsset(upscaleResult, {
      prompt: result.prompt,
      negativePrompt:
        typeof result.params?.negativePrompt === 'string' ? result.params.negativePrompt : '',
      model: typeof result.params?.model === 'string' ? result.params.model : undefined,
      seed: result.seed,
      params: result.params,
    });

    setCurrentImage(
      upscaleResult.image.startsWith('http')
        ? upscaleResult.image
        : `http://localhost:8000${upscaleResult.image}`,
      upscaleResult.output_path
    );
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
          <div
            ref={modalRef}
            className="relative flex flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-surface/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Image Area */}
            <div className="flex-1 flex items-center justify-center relative px-16">
              {/* Previous button */}
              {hasPrev && (
                <button
                  onClick={goToPrev}
                  aria-label="Previous image"
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-xl bg-surface/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
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
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-cinematic"
              />

              {/* Next button */}
              {hasNext && (
                <button
                  onClick={goToNext}
                  aria-label="Next image"
                  className="absolute right-[340px] top-1/2 -translate-y-1/2 p-3 rounded-xl bg-surface/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
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
                <p className="text-sm text-text-primary font-display leading-relaxed max-h-32 overflow-y-auto scrollbar-hide">
                  {result.prompt}
                </p>
              </div>

              {/* Negative Prompt */}
              {result.params?.negativePrompt && (
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-label text-text-muted mb-2">
                    Negative Prompt
                  </h3>
                  <p className="text-xs text-text-body font-display leading-relaxed max-h-20 overflow-y-auto scrollbar-hide">
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
                        <span className="text-xs text-text-body font-display">{label}</span>
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
