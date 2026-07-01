import { useState } from 'react';
import {
  Download,
  ExternalLink,
  Heart,
  ArrowDownToLine,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import type { SearchResult, ConsentKind } from '@/types/model';
import { SecurityBadges } from './SecurityBadges';
import { ConsentDialog } from './ConsentDialog';

interface SearchResultCardProps {
  result: SearchResult;
}

/** Compact count formatting: 12345 -> "12.3k", 1500000 -> "1.5M". */
function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

const TIER_CLASS: Record<SearchResult['tier'], string> = {
  verified: 'border-status-success/40 text-status-success',
  compatible: 'border-border-hover text-text-body',
  experimental: 'border-status-warning/40 text-status-warning',
};

/**
 * One hub search hit with the acquire flow. A clean result downloads directly;
 * a pickle or trust_remote_code result is gated behind the security ConsentDialog
 * and only downloads once consent is granted. A started job with a gate_url
 * (license acceptance required) surfaces an "Accept license" action that opens
 * the gate page externally; otherwise the live job status is reflected inline.
 */
export function SearchResultCard({ result }: SearchResultCardProps) {
  const { enqueueDownload, grantConsent } = useAppStore(
    useShallow((s) => ({
      enqueueDownload: s.enqueueDownload,
      grantConsent: s.grantConsent,
    })),
  );
  const job = useAppStore((s) => s.downloads[result.id] ?? null);

  const [consentOpen, setConsentOpen] = useState(false);

  const consentKind: ConsentKind | null =
    result.format === 'pickle' ? 'pickle' : result.trust_remote_code ? 'trust_remote_code' : null;

  const startAcquire = () => {
    if (consentKind) {
      setConsentOpen(true);
      return;
    }
    void enqueueDownload(result.id);
  };

  const confirmConsent = async () => {
    setConsentOpen(false);
    if (!consentKind) return;
    const outcome = await grantConsent(result.id, consentKind, true);
    // Only proceed if the grant persisted; a {success:false} envelope means the
    // backend rejected it, so we must not start the download.
    if (outcome && typeof outcome === 'object' && 'success' in outcome && outcome.success === false) {
      return;
    }
    void enqueueDownload(result.id);
  };

  const openGate = () => {
    if (job?.gate_url) void window.electron?.app?.openExternal(job.gate_url);
  };

  const renderAction = () => {
    if (job?.gate_url) {
      return (
        <Button variant="primary" size="sm" icon={ExternalLink} onClick={openGate}>
          Accept license
        </Button>
      );
    }
    if (job) {
      if (job.status === 'ready') {
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-status-success">
            <Check aria-hidden="true" className="h-4 w-4" /> Installed
          </span>
        );
      }
      if (job.status === 'error') {
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-status-error">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" /> Failed
          </span>
        );
      }
      // queued / downloading / verifying / paused
      const label =
        job.status === 'downloading'
          ? `Downloading ${Math.round(job.progress)}%`
          : job.status.charAt(0).toUpperCase() + job.status.slice(1);
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {label}
        </span>
      );
    }
    return (
      <Button variant="primary" size="sm" icon={Download} onClick={startAcquire}>
        Acquire
      </Button>
    );
  };

  return (
    <div className="raised-panel flex flex-col gap-3 rounded-md p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary" title={result.name}>
            {result.name}
          </p>
          {result.author && (
            <p className="mono-label truncate text-text-muted">{result.author}</p>
          )}
        </div>
        <span
          className={cn(
            'mono-label flex-shrink-0 rounded border px-1.5 py-0.5',
            TIER_CLASS[result.tier],
          )}
          title={result.tier_reason}
        >
          {result.tier}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <span className="mono-label">{result.capability}</span>
        <span className="inline-flex items-center gap-1">
          <ArrowDownToLine aria-hidden="true" className="h-3 w-3" />
          {formatCount(result.downloads)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart aria-hidden="true" className="h-3 w-3" />
          {formatCount(result.likes)}
        </span>
        <span>{result.size}</span>
      </div>

      <SecurityBadges record={result} />

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {result.license ? (
          <span className="mono-label truncate text-text-muted" title={result.license}>
            {result.license}
          </span>
        ) : (
          <span />
        )}
        {renderAction()}
      </div>

      <ConsentDialog
        open={consentOpen}
        kind={consentKind ?? 'pickle'}
        modelName={result.name}
        onConfirm={confirmConsent}
        onCancel={() => setConsentOpen(false)}
      />
    </div>
  );
}
