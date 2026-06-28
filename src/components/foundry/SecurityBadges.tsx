import type { ElementType } from 'react';
import { ShieldAlert, Lock, EyeOff, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/cn';

/** The security-relevant flags shared by ModelRecord and SearchResult. */
export interface SecurityFlags {
  format?: 'safetensors' | 'pickle' | 'diffusers' | null;
  trust_remote_code?: boolean;
  gated?: boolean;
  nsfw?: boolean;
}

interface SecurityBadgesProps {
  record: SecurityFlags;
}

const TONE_CLASS: Record<'warning' | 'info' | 'safe', string> = {
  warning: 'border-status-warning/40 text-status-warning',
  info: 'border-border-hover text-text-body',
  safe: 'border-border text-text-muted',
};

function Badge({
  tone,
  icon: Icon,
  label,
  testId,
}: {
  tone: 'warning' | 'info' | 'safe';
  icon: ElementType;
  label: string;
  testId: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'mono-label inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
        TONE_CLASS[tone],
      )}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {label}
    </span>
  );
}

/**
 * Security/trust badges for a model or search hit: pickle and trust-remote-code
 * are warnings (load-time code execution), gated is informational (license
 * acceptance required), nsfw is a warning, and a clean safetensors model gets a
 * reassuring tag.
 */
export function SecurityBadges({ record }: SecurityBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {record.format === 'pickle' && (
        <Badge tone="warning" icon={ShieldAlert} label="Pickle" testId="badge-pickle" />
      )}
      {record.trust_remote_code && (
        <Badge tone="warning" icon={ShieldAlert} label="Remote code" testId="badge-trust-remote-code" />
      )}
      {record.gated && <Badge tone="info" icon={Lock} label="Gated" testId="badge-gated" />}
      {record.nsfw && <Badge tone="warning" icon={EyeOff} label="NSFW" testId="badge-nsfw" />}
      {record.format === 'safetensors' && (
        <Badge tone="safe" icon={ShieldCheck} label="Safetensors" testId="badge-safetensors" />
      )}
    </div>
  );
}
