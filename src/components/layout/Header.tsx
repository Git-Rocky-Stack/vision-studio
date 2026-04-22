import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProjectDropdown } from './ProjectDropdown';
import logoUrl from '@/../public/s2.png';

export const Header = memo(function Header() {
  const currentProject = useAppStore((s) => s.currentProject);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const backendConnected = systemInfo.backendConnected;
  const backendLabel = backendConnected ? 'Backend ready' : 'Backend not ready';
  const projectStatus = currentProject
    ? currentProject.updatedAt
      ? `Edited ${new Date(currentProject.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Unsaved changes'
    : 'Build images, scenes, and workflows from one workspace.';

  return (
    <header
      className="app-region-drag relative flex h-14 flex-shrink-0 items-center gap-4 border-b border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] pl-4 pr-36 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-md"
      data-testid="app-header"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)]" />

      <div className="app-region-no-drag relative z-10">
        <ProjectDropdown />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="truncate type-ui text-text-primary">
          {currentProject?.name ?? 'Workspace'}
        </div>
        <div className="truncate type-caption">
          {projectStatus}
        </div>
      </div>

      <div className="app-region-no-drag relative z-10 ml-auto flex items-center gap-3" data-testid="header-right-actions">
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${
            backendConnected
              ? 'border-status-success-border bg-status-success-muted text-status-success'
              : 'border-status-error-border bg-status-error-muted text-status-error'
          }`}
          title={backendConnected ? 'AI generation backend ready' : 'AI generation backend not ready'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${backendConnected ? 'bg-status-success' : 'bg-status-error'} ${backendConnected ? '' : 'animate-pulse'}`}
            aria-label={backendLabel}
          />
          <span className="type-ui select-none">
            {backendConnected ? 'Ready' : 'Not ready'}
          </span>
        </div>

        <div className="hidden items-center gap-2 rounded-md border border-border bg-elevated/80 px-2.5 py-1.5 sm:flex">
          <img src={logoUrl} alt="Vision Studio" className="h-6 w-auto object-contain opacity-90" />
          <span className="type-caption text-text-body">
            Vision Studio
          </span>
        </div>
      </div>
    </header>
  );
});
