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
          <AlertCircle className="w-5 h-5 text-red-primary" aria-hidden="true" />
          <span className="text-micro text-text-muted font-display">Failed to load</span>
        </div>
      )}
      {src && (
        <img
          src={src}
          srcSet={props.srcSet}
          sizes={props.sizes}
          alt={alt}
          className={cn(className, state !== 'loaded' && 'invisible')}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          loading={props.loading ?? 'lazy'}
          {...props}
        />
      )}
    </div>
  );
}
