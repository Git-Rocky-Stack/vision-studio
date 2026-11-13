import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { UI_STRINGS } from '@/constants/strings';
import { reportRendererError } from './ErrorBoundaryReporting';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
  /**
   * When any value changes while the fallback is showing, the boundary resets
   * and renders its children again (#J5). Pass the navigation state (tab,
   * sub-mode, centre view): moving elsewhere must not leave the new view
   * stuck behind the old view's error.
   */
  resetKeys?: readonly unknown[];
  /**
   * Runs before a Retry re-renders the children. Use it to recreate failed
   * lazy imports (retryableLazy().reset), which React would otherwise keep
   * rethrowing from its cache.
   */
  onRetry?: () => void;
  /** Root-level boundaries fill the window instead of their container. */
  fullScreen?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function resetKeysChanged(previous: readonly unknown[] = [], next: readonly unknown[] = []) {
  return (
    previous.length !== next.length || previous.some((value, index) => !Object.is(value, next[index]))
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The fallback is the user-facing report; this keeps a diagnosable log.
    reportRendererError(error, {
      source: this.props.fallbackLabel ?? 'render error',
      componentStack: info.componentStack,
      notify: false,
    });
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.hasError && resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.props.onRetry?.();
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.props.onRetry?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className={
            this.props.fullScreen
              ? 'flex h-full min-h-screen w-full flex-col items-center justify-center bg-void p-8'
              : 'flex-1 flex flex-col items-center justify-center p-8 bg-surface'
          }
        >
          <div className="w-12 h-12 rounded-md bg-status-error-muted flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-status-error" aria-hidden="true" />
          </div>
          <h3 className="type-section mb-1">
            {this.props.fallbackLabel || UI_STRINGS.errors.somethingWentWrong}
          </h3>
          <p className="type-meta text-text-muted mb-4 max-w-xs text-center">
            {UI_STRINGS.errors.unexpectedError}
          </p>
          {this.state.error?.message ? (
            <details className="mb-4 max-w-xs">
              {/* A disclosure control: at least a 32px target, like the app's icon controls. */}
              <summary className="flex min-h-[32px] cursor-pointer items-center justify-center type-meta text-text-muted">
                {UI_STRINGS.errors.technicalDetails}
              </summary>
              <p className="mt-1.5 type-caption text-text-muted break-words text-center">
                {this.state.error.message}
              </p>
            </details>
          ) : null}
          {/* The recovery action: the full 44px touch target (the 32px floor is
              for dense icon controls). */}
          <button
            type="button"
            onClick={this.handleRetry}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-elevated border border-border type-ui text-text-primary hover:bg-surface transition"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            {UI_STRINGS.actions.retry}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
