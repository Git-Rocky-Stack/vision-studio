import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProjectDropdown } from './ProjectDropdown';

export const Header = memo(function Header() {
  const { currentProject, systemInfo } = useAppStore();
  const backendConnected = systemInfo.backendConnected;
  const backendLabel = backendConnected ? 'Backend ready' : 'Backend not ready';

  return (
    <header
      className="h-12 bg-surface border-b border-border flex items-center px-4 gap-4"
      data-testid="app-header"
    >
      <ProjectDropdown />
      <div className="flex items-center gap-2">
        {currentProject ? (
          <>
            <span className="text-xs text-text-muted">&middot;</span>
            <span className="text-xs text-text-muted">
              {currentProject.updatedAt
                ? `Edited ${new Date(currentProject.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Unsaved changes'}
            </span>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2" data-testid="header-right-actions">
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${
            backendConnected
              ? 'border-status-success-border bg-status-success-muted text-status-success'
              : 'border-status-error-border bg-status-error-muted text-status-error'
          }`}
          title={backendConnected ? 'AI generation backend ready' : 'AI generation backend not ready'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${backendConnected ? 'bg-status-success' : 'bg-status-error'} ${backendConnected ? '' : 'animate-pulse'}`}
            aria-label={backendLabel}
          />
          <span className="text-micro font-display font-medium select-none">
            {backendConnected ? 'Ready' : 'Not ready'}
          </span>
        </div>
      </div>
    </header>
  );
});
