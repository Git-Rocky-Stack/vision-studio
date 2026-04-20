import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

interface PanelErrorBoundaryProps {
  label: string;
  children: ReactNode;
}

/**
 * Wraps a panel component in an ErrorBoundary with a panel-specific label.
 * If the panel crashes, only that panel shows an error; the rest of the app
 * remains functional.
 */
export function PanelErrorBoundary({ label, children }: PanelErrorBoundaryProps) {
  return <ErrorBoundary fallbackLabel={`${label} error`}>{children}</ErrorBoundary>;
}