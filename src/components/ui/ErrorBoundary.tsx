import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { UI_STRINGS } from '@/constants/strings';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface">
          <div className="w-12 h-12 rounded-xl bg-red-aura flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-primary" />
          </div>
          <h3 className="type-section mb-1">
            {this.props.fallbackLabel || UI_STRINGS.errors.somethingWentWrong}
          </h3>
          <p className="type-meta text-text-muted mb-4 max-w-xs text-center">
            {this.state.error?.message || UI_STRINGS.errors.unexpectedError}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-elevated border border-border type-ui text-text-primary hover:bg-surface transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {UI_STRINGS.actions.retry}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
