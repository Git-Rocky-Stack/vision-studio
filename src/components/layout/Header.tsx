import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { ProjectDropdown } from './ProjectDropdown';
import logoUrl from '@/../public/s2.png';

type HeaderStatusTone = 'success' | 'warning' | 'error' | 'accent';

interface HeaderStatusPresentation {
  label: string;
  detail: string;
  tone: HeaderStatusTone;
  pulse: boolean;
  ariaLabel: string;
}

const STATUS_TONE_CLASSES: Record<HeaderStatusTone, string> = {
  success: 'border-status-success-border bg-status-success-muted text-status-success',
  warning: 'border-status-warning-border bg-status-warning-muted text-status-warning',
  error: 'border-status-error-border bg-status-error-muted text-status-error',
  accent: 'border-accent-primary-border bg-accent-primary-muted text-accent-primary',
};

const STATUS_DOT_CLASSES: Record<HeaderStatusTone, string> = {
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  error: 'bg-status-error',
  accent: 'bg-accent-primary',
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getBackendStatusPresentation(params: {
  systemInfo: ReturnType<typeof useAppStore.getState>['systemInfo'];
  activeJobs: ReturnType<typeof useAppStore.getState>['activeJobs'];
  generationQueue: ReturnType<typeof useAppStore.getState>['generationQueue'];
  availableModels: ReturnType<typeof useAppStore.getState>['availableModels'];
}): HeaderStatusPresentation {
  const { systemInfo, activeJobs, generationQueue, availableModels } = params;
  const runningCount = activeJobs.length;
  const queuedCount = generationQueue.length;
  const downloadingCount = availableModels.filter((model) => model.status === 'downloading').length;

  if (runningCount > 0 || queuedCount > 0) {
    const parts: string[] = [];
    if (runningCount > 0) {
      parts.push(formatCount(runningCount, 'running job'));
    }
    if (queuedCount > 0) {
      parts.push(formatCount(queuedCount, 'queued item'));
    }
    return {
      label: 'Queue active',
      detail: parts.join(', '),
      tone: 'accent',
      pulse: true,
      ariaLabel: 'Generation queue active',
    };
  }

  if (downloadingCount > 0) {
    return {
      label: 'Downloading models',
      detail: `${formatCount(downloadingCount, 'download')} in progress`,
      tone: 'warning',
      pulse: true,
      ariaLabel: 'Model downloads in progress',
    };
  }

  if (systemInfo.backendConnected && systemInfo.modelsCount === 0) {
    return {
      label: 'No models',
      detail: 'Backend ready, nothing loaded',
      tone: 'warning',
      pulse: false,
      ariaLabel: 'Backend ready but no models are loaded',
    };
  }

  if (systemInfo.backendConnected && systemInfo.gpuAvailable) {
    return {
      label: 'GPU ready',
      detail: `${formatCount(systemInfo.modelsCount, 'model')} online`,
      tone: 'success',
      pulse: false,
      ariaLabel: 'GPU backend ready',
    };
  }

  if (systemInfo.backendConnected) {
    return {
      label: 'CPU mode',
      detail: systemInfo.modelsCount > 0
        ? `${formatCount(systemInfo.modelsCount, 'model')} online`
        : 'Backend ready without GPU',
      tone: 'warning',
      pulse: false,
      ariaLabel: 'Backend ready in CPU mode',
    };
  }

  if (systemInfo.backendRunning) {
    return {
      label: 'Warming',
      detail: systemInfo.bundledBackend ? 'Bundled backend starting' : 'Backend process starting',
      tone: 'warning',
      pulse: true,
      ariaLabel: 'Backend is warming up',
    };
  }

  return {
    label: 'Not ready',
    detail: 'Backend offline',
    tone: 'error',
    pulse: true,
    ariaLabel: 'Backend not ready',
  };
}

export const Header = memo(function Header() {
  const currentProject = useAppStore((s) => s.currentProject);
  const systemInfo = useAppStore((s) => s.systemInfo);
  const availableModels = useAppStore((s) => s.availableModels);
  const activeJobs = useAppStore((s) => s.activeJobs);
  const generationQueue = useAppStore((s) => s.generationQueue);

  const backendStatus = getBackendStatusPresentation({
    systemInfo,
    availableModels,
    activeJobs,
    generationQueue,
  });

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
          data-testid="header-backend-status"
          className={`flex min-w-[176px] items-center gap-2 rounded-md border px-2.5 py-1.5 ${STATUS_TONE_CLASSES[backendStatus.tone]}`}
          title={`${backendStatus.label}: ${backendStatus.detail}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASSES[backendStatus.tone]} ${backendStatus.pulse ? 'animate-pulse' : ''}`}
            aria-label={backendStatus.ariaLabel}
          />
          <div className="min-w-0 select-none">
            <div className="truncate type-ui">
              {backendStatus.label}
            </div>
            <div className="truncate type-badge opacity-80">
              {backendStatus.detail}
            </div>
          </div>
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
