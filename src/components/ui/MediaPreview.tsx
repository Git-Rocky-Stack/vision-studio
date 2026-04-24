import { useMemo, useState } from 'react';
import { AlertCircle, AudioLines, Film, Play } from 'lucide-react';

import { cn } from '@/utils/cn';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';

export type MediaPreviewKind = 'image' | 'video' | 'audio';

export function isLikelyVideoPath(path: string | null | undefined) {
  if (!path) {
    return false;
  }

  const normalizedPath = path.replace(/\\/g, '/').split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi|mkv|gif)$/i.test(normalizedPath);
}

export function resolveMediaSourceUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const normalizedPath = path.replace(/\\/g, '/');

  if (/^(https?:)?\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith('/outputs/')) {
    return `http://localhost:8000${normalizedPath}`;
  }

  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23').replace(/\?/g, '%3F');
    return `file:///${encodedPath}`;
  }

  if (normalizedPath.startsWith('/')) {
    return `file://${encodeURI(normalizedPath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  }

  return normalizedPath;
}

interface MediaPreviewProps {
  kind: MediaPreviewKind;
  src: string | null | undefined;
  alt: string;
  poster?: string | null;
  className?: string;
  mediaClassName?: string;
  fallbackClassName?: string;
  showControls?: boolean;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  showPlayBadge?: boolean;
  testId?: string;
}

export function MediaPreview({
  kind,
  src,
  alt,
  poster = null,
  className,
  mediaClassName,
  fallbackClassName,
  showControls = false,
  muted,
  loop = false,
  autoPlay = false,
  showPlayBadge = false,
  testId,
}: MediaPreviewProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const resolvedSrc = useMemo(() => resolveMediaSourceUrl(src), [src]);
  const resolvedPoster = useMemo(() => resolveMediaSourceUrl(poster), [poster]);

  if (kind === 'image') {
    return (
      <div data-testid={testId} className={cn('relative overflow-hidden', className)}>
        <ImageWithFallback
          src={resolvedSrc ?? undefined}
          alt={alt}
          className={cn('h-full w-full', mediaClassName)}
          fallbackClassName={fallbackClassName}
        />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div
        data-testid={testId}
        className={cn('relative overflow-hidden bg-void', className)}
      >
        <div
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-2 bg-elevated text-text-muted',
            fallbackClassName,
          )}
        >
          <AudioLines className="h-6 w-6 text-text-primary/80" aria-hidden="true" />
          <span className="type-caption">Audio</span>
        </div>

        <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-border bg-void/75 px-2 py-0.5 type-caption text-text-body backdrop-blur-sm">
          <span className="inline-flex items-center gap-1">
            <AudioLines className="h-3 w-3" aria-hidden="true" />
            Audio
          </span>
        </div>
      </div>
    );
  }

  const showVideoElement = Boolean(resolvedSrc) && !videoFailed;

  return (
    <div
      data-testid={testId}
      className={cn('relative overflow-hidden bg-void', className)}
    >
      {showVideoElement ? (
        <video
          src={resolvedSrc ?? undefined}
          poster={resolvedPoster ?? undefined}
          controls={showControls}
          muted={muted ?? !showControls}
          loop={loop}
          autoPlay={autoPlay}
          playsInline
          preload="metadata"
          className={cn('h-full w-full', mediaClassName)}
          onError={() => setVideoFailed(true)}
          aria-label={alt}
        />
      ) : resolvedPoster ? (
        <img
          src={resolvedPoster}
          alt={alt}
          className={cn('h-full w-full', mediaClassName)}
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-2 bg-elevated text-text-muted',
            fallbackClassName,
          )}
        >
          <AlertCircle className="h-5 w-5 text-status-error" aria-hidden="true" />
          <span className="type-caption">Video unavailable</span>
        </div>
      )}

      <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-border bg-void/75 px-2 py-0.5 type-caption text-text-body backdrop-blur-sm">
        <span className="inline-flex items-center gap-1">
          <Film className="h-3 w-3" aria-hidden="true" />
          Video
        </span>
      </div>

      {showPlayBadge && !showControls ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-void/70 text-text-primary shadow-cinematic backdrop-blur-sm">
            <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
