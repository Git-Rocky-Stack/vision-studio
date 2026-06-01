import { memo, useRef, useState, useCallback } from 'react';
import { readFileAsDataUrl } from '@/utils/readFileAsDataUrl';
import { cn } from '@/utils/cn';
import { Upload, X } from 'lucide-react';

interface CompactImageDropZoneProps {
  label: string;
  image: string | null;
  onImageChange: (image: string | null) => void;
}

export const CompactImageDropZone = memo(function CompactImageDropZone({
  label,
  image,
  onImageChange,
}: CompactImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      readFileAsDataUrl(file).then((dataUrl) => {
        onImageChange(dataUrl);
      }).catch((err) => {
        console.error('Failed to read file:', err);
      });
    },
    [onImageChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file?.type.startsWith('image/')) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
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

  return (
    <div>
      <label className="text-label text-text-body mb-1.5 block">{label}</label>

      {image ? (
        <div className="relative w-full aspect-video rounded-md overflow-hidden border border-border bg-void">
          <img src={image} alt={label} className="w-full h-full object-contain" />
          <button
            onClick={handleRemove}
            aria-label={`Remove ${label}`}
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-void/80 text-text-primary hover:bg-status-error transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label={`Upload ${label}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed py-4 cursor-pointer transition-all',
            isDragOver
              ? 'border-accent-primary bg-accent-primary-muted/20'
              : 'border-border hover:border-border-hover hover:bg-elevated/30'
          )}
        >
          <Upload className="w-4 h-4 text-text-muted" />
          <span className="text-xs text-text-body">Drop image or click</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
});
