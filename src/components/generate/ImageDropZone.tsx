import { useState, useRef, useCallback } from 'react';
import { readFileAsDataUrl } from '@/utils/readFileAsDataUrl';
import { cn } from '@/utils/cn';
import { Slider } from '@/components/ui/Slider';
import {
  Upload,
  X,
  Image as ImageIcon,
  Paintbrush,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ReferenceMode = 'img2img' | 'inpaint' | 'controlnet';

interface ImageDropZoneProps {
  referenceImage: string | null;
  onImageChange: (imagePath: string | null) => void;
  denoisingStrength: number;
  onDenoisingStrengthChange: (value: number) => void;
  mode: ReferenceMode;
  onModeChange: (mode: ReferenceMode) => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const modes: { id: ReferenceMode; label: string; icon: React.ElementType }[] = [
  { id: 'img2img', label: 'img2img', icon: ImageIcon },
  { id: 'inpaint', label: 'Inpaint', icon: Paintbrush },
  { id: 'controlnet', label: 'ControlNet', icon: Layers },
];

export function ImageDropZone({
  referenceImage,
  onImageChange,
  denoisingStrength,
  onDenoisingStrengthChange,
  mode,
  onModeChange,
}: ImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) return;
      readFileAsDataUrl(file).then((dataUrl) => {
        onImageChange(dataUrl);
        setIsExpanded(true);
      }).catch((err) => { console.error('Failed to read file:', err); });
    },
    [onImageChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    onImageChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onImageChange]);

  // Collapsed state: just a button
  if (!referenceImage && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 w-full py-3 px-3 rounded-md border border-dashed border-border text-text-body hover:text-text-primary hover:border-border-hover transition-all text-sm"
      >
        <Upload className="w-4 h-4" />
        Add Reference Image
        <ChevronDown className="w-3.5 h-3.5 ml-auto" />
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-elevated/50 overflow-hidden">
      {/* Header */}
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!referenceImage) setIsExpanded(false);
        }}
        aria-expanded={!referenceImage && isExpanded}
        onClick={() => {
          if (!referenceImage) setIsExpanded(false);
        }}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        <Upload className="w-3.5 h-3.5 text-accent-primary" />
        <span className="text-label text-text-primary">Reference Image</span>
        {!referenceImage && (
          <ChevronUp className="w-3.5 h-3.5 ml-auto text-text-muted" />
        )}
      </button>

      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="px-3 pb-3 space-y-3">
            {/* Drop Zone / Image Preview */}
            {referenceImage ? (
              <div className="flex items-start gap-3">
                <div className="relative w-20 h-20 rounded-md overflow-hidden flex-shrink-0 border border-border">
                  <img
                    src={referenceImage}
                    alt="Reference"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={handleRemove}
                    aria-label="Remove reference image"
                    className="absolute top-1 right-1 p-0.5 rounded bg-void/70 text-text-primary hover:bg-status-error transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex-1 space-y-3">
                  {/* Mode Selector */}
                  <div className="flex gap-1">
                    {modes.map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          onClick={() => onModeChange(m.id)}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                            mode === m.id
                              ? 'bg-accent-primary-muted text-accent-primary'
                              : 'bg-surface text-text-body hover:text-text-primary'
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Denoising Strength */}
                  <Slider
                    label="Denoising"
                    value={denoisingStrength}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={onDenoisingStrengthChange}
                  />
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onPointerDown={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload reference image"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={cn(
                  'flex flex-col items-center justify-center py-6 rounded-md border-2 border-dashed cursor-pointer transition-all',
                  isDragOver
                    ? 'border-accent-primary bg-accent-primary-muted'
                    : 'border-border hover:border-border-hover hover:bg-surface'
                )}
              >
                <Upload
                  className={cn(
                    'w-6 h-6 mb-2',
                    isDragOver ? 'text-accent-primary' : 'text-text-muted'
                  )}
                />
                <p className="text-sm text-text-body">
                  {isDragOver ? 'Drop image here' : 'Drop image or click to upload'}
                </p>
                <p className="data-mono text-text-muted mt-1">
                  PNG, JPG, WebP
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
