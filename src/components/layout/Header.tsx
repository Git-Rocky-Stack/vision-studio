import { memo } from 'react';
import { useAppStore } from '@/store/appStore';

export const Header = memo(function Header() {
  const { currentProject } = useAppStore();

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4">
      <div className="flex items-center gap-2">
        {currentProject ? (
          <>
            <span className="font-display font-medium text-sm text-text-primary">{currentProject.name}</span>
            <span className="text-xs text-text-muted">&middot;</span>
            <span className="text-xs text-text-muted">
              {currentProject.updatedAt
                ? `Edited ${new Date(currentProject.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Unsaved changes'}
            </span>
          </>
        ) : (
          <span className="font-display text-sm text-text-body">Untitled Project</span>
        )}
      </div>
    </header>
  );
});
