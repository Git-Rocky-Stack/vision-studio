import { useState } from 'react';
import { cn } from '@/utils/cn';
import { ImageIcon, AlertCircle } from 'lucide-react';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackClassName?: string;
  srcSet?: string;
  sizes?: string;
}

export function ImageWithFallback({
  src,
  alt,
  className,
  fallbackClassName,
  onLoad,
  onError,
  loading = 'lazy',
  decoding = 'async',
  ...props
}: ImageWithFallbackProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className={cn('relative', fallbackClassName)}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-elevated animate-pulse">
          <ImageIcon className="w-5 h-5 text-text-muted" aria-hidden="true" />
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-elevated gap-1">
          <AlertCircle className="w-5 h-5 text-status-error" aria-hidden="true" />
          <span className="type-caption">Failed to load</span>
        </div>
      )}
      {src && (
        // The caller's props go first and its handlers are chained: spreading
        // them last replaced the internal onLoad/onError, so an image whose
        // caller passed either handler never left the invisible loading state.
        <img
          {...props}
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          className={cn(className, state !== 'loaded' && 'invisible')}
          onLoad={(event) => {
            setState('loaded');
            onLoad?.(event);
          }}
          onError={(event) => {
            setState('error');
            onError?.(event);
          }}
        />
      )}
    </div>
  );
}
