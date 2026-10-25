import type { ReactNode } from 'react';
import { Cloud, type LucideIcon } from 'lucide-react';
import { Led } from '@/components/hardware';

interface RouteStatusCardProps {
  /** The route's name, e.g. "OpenRouter Still Image Route". */
  title: string;
  /**
   * Whether the route can actually run: a hosted model is chosen and the
   * account holds a key. Drives the LED - play when ready, cue when the route
   * is selected but not configured - so the indicator reports real state.
   */
  ready: boolean;
  /** Spoken in place of the LED, which is decorative to assistive tech. */
  readyLabel?: string;
  notReadyLabel?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}

/**
 * The hosted-route summary shown where a panel would otherwise offer its
 * local model picker (Generate, Quick Generate, Batch). One recipe: a
 * recessed well holding a raised icon cap, a status LED, the route name and
 * its details.
 */
export function RouteStatusCard({
  title,
  ready,
  readyLabel = 'Ready',
  notReadyLabel = 'Not configured',
  icon: Icon = Cloud,
  children,
}: RouteStatusCardProps) {
  return (
    <div className="recessed-well px-4 py-3" data-route-ready={ready ? 'true' : 'false'}>
      <div className="flex items-start gap-3">
        <div className="raised-control mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center text-accent-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Led color={ready ? 'play' : 'cue'} size={7} />
            <p className="type-section text-text-primary">{title}</p>
            <span className="sr-only">{ready ? readyLabel : notReadyLabel}</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
