import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProjectDropdown } from './ProjectDropdown';

export const Header = memo(function Header() {
  const { currentProject } = useAppStore();

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
    </header>
  );
});