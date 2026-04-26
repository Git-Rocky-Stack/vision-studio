import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

interface GuideCalloutProps {
  title: string;
  tone?: 'info' | 'accent' | 'warning';
  children: ReactNode;
}

const TONE_STYLES: Record<NonNullable<GuideCalloutProps['tone']>, string> = {
  info: 'border-border bg-elevated text-text-body',
  accent: 'border-accent-primary-border bg-accent-primary-muted/40 text-text-body',
  warning: 'border-status-warning-border bg-status-warning-muted/40 text-text-body',
};

export function GuideCallout({
  title,
  tone = 'info',
  children,
}: GuideCalloutProps) {
  return (
    <div className={cn('rounded-xl border px-4 py-4', TONE_STYLES[tone])}>
      <p className="type-ui text-text-primary">{title}</p>
      <div className="mt-2 space-y-2 text-sm leading-6">{children}</div>
    </div>
  );
}
