import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProjectDropdown } from './ProjectDropdown';

export const Header = memo(function Header() {
  const { currentProject, systemInfo } = useAppStore();
  const backendConnected = systemInfo.backendConnected;

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-4">
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

      <div className="ml-auto flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-status-success' : 'bg-red-primary'} animate-pulse`}
          title={backendConnected ? 'AI backend connected' : 'AI backend not connected'}
          aria-label={backendConnected ? 'Backend connected' : 'Backend disconnected'}
        />
        <span className="text-micro text-text-muted">
          {backendConnected ? 'Backend' : 'Offline'}
        </span>
      </div>
    </header>
  );
});