import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { hasLiveProvisionJob } from '@/store/slices/provisioningSlice';
import { ProjectDropdown } from './ProjectDropdown';
import { WORKSPACE_TAB_LABELS } from './workspaceTabs';
import { Led } from '@/components/hardware';
import type { LedColor } from '@/components/hardware';
import logoUrl from '@/../public/s2.png';

type HeaderStatusTone = 'success' | 'warning' | 'error' | 'accent';

interface HeaderStatusPresentation {
  label: string;
  detail?: string;
  tone: HeaderStatusTone;
  pulse: boolean;
  ariaLabel: string;
}

// The backend-status pill is a carbon recessed-well instrument bay (see DESIGN.md
// depth system); tone drives the phosphor text color and the LED indicator hue.
const STATUS_TEXT_CLASSES: Record<HeaderStatusTone, string> = {
  success: 'text-status-success',
  warning: 'text-status-warning',
  error: 'text-status-error',
  accent: 'text-accent-primary',
};

const STATUS_LED: Record<HeaderStatusTone, LedColor> = {
  success: 'play',
  warning: 'cue',
  error: 'rec',
  accent: 'jog',
};

function formatEdited(modified: string) {
  const date = new Date(modified);
  if (Number.isNaN(date.getTime())) return 'Unsaved changes';
  return `Edited ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getBackendStatusPresentation(params: {
  systemInfo: ReturnType<typeof useAppStore.getState>['systemInfo'];
  activeJobs: ReturnType<typeof useAppStore.getState>['activeJobs'];
  generationQueue: ReturnType<typeof useAppStore.getState>['generationQueue'];
  availableModels: ReturnType<typeof useAppStore.getState>['availableModels'];
  provisionStatus: ReturnType<typeof useAppStore.getState>['provisionStatus'];
}): HeaderStatusPresentation {
  const { systemInfo, activeJobs, generationQueue, availableModels, provisionStatus } = params;
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
      label: `Queue active: ${parts.join(', ')}`,
      tone: 'accent',
      pulse: true,
      ariaLabel: 'Generation queue active',
    };
  }

  // #34 installer PR3: background auto-provisioning outranks the generic
  // download counter (its jobs would otherwise read as plain model downloads).
  if (provisionStatus && !provisionStatus.complete && hasLiveProvisionJob(provisionStatus)) {
    return {
      label: `Provisioning models: ${Math.round(provisionStatus.overall_progress * 100)}% (${provisionStatus.ready_count}/${provisionStatus.total_count})`,
      tone: 'accent',
      pulse: true,
      ariaLabel: 'Model provisioning in progress',
    };
  }

  if (downloadingCount > 0) {
    return {
      label: `Downloading ${formatCount(downloadingCount, 'model')}`,
      tone: 'warning',
      pulse: true,
      ariaLabel: 'Model downloads in progress',
    };
  }

  if (systemInfo.backendConnected && systemInfo.modelsCount === 0) {
    return {
      label: 'Backend ready: no models',
      tone: 'warning',
      pulse: false,
      ariaLabel: 'Backend ready but no models are loaded',
    };
  }

  if (systemInfo.backendConnected && systemInfo.gpuAvailable) {
    return {
      label: `GPU ready: ${formatCount(systemInfo.modelsCount, 'model')} online`,
      tone: 'success',
      pulse: false,
      ariaLabel: 'GPU backend ready',
    };
  }

  if (systemInfo.backendConnected) {
    return {
      label: systemInfo.modelsCount > 0
        ? `CPU mode: ${formatCount(systemInfo.modelsCount, 'model')} online`
        : 'CPU mode: backend ready',
      tone: 'warning',
      pulse: false,
      ariaLabel: 'Backend ready in CPU mode',
    };
  }

  if (systemInfo.backendRunning) {
    return {
      label: systemInfo.bundledBackend ? 'Backend warming: bundled' : 'Backend warming',
      tone: 'warning',
      pulse: true,
      ariaLabel: 'Backend is warming up',
    };
  }

  return {
    label: 'Backend offline',
    tone: 'error',
    pulse: true,
    ariaLabel: 'Backend not ready',
  };
}

export const Header = memo(function Header() {
  const activeTab = useAppStore((s) => s.activeTab);
  const activeProject = useAppStore(
    (s) => s.projects.find((project) => project.id === s.activeProjectId) ?? null,
  );
  const systemInfo = useAppStore((s) => s.systemInfo);
  const availableModels = useAppStore((s) => s.availableModels);
  const activeJobs = useAppStore((s) => s.activeJobs);
  const generationQueue = useAppStore((s) => s.generationQueue);
  const provisionStatus = useAppStore((s) => s.provisionStatus);

  const backendStatus = getBackendStatusPresentation({
    systemInfo,
    availableModels,
    activeJobs,
    generationQueue,
    provisionStatus,
  });

  // The project's name is already on the dropdown beside this block, so the
  // block says where the user is (the nav rail is icons only) and how fresh
  // the open project is.
  const projectStatus = activeProject ? formatEdited(activeProject.modified) : 'No project open';

  return (
    <header
      className="app-region-drag relative z-[var(--z-sticky)] flex h-14 flex-shrink-0 items-center gap-4 border-b border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] pl-4 pr-36 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      data-testid="app-header"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)]" />

      <div className="app-region-no-drag relative z-10">
        <ProjectDropdown />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div data-testid="header-workspace-title" className="truncate type-ui text-text-primary">
          {WORKSPACE_TAB_LABELS[activeTab]}
        </div>
        <div data-testid="header-project-status" className="truncate type-caption">
          {projectStatus}
        </div>
      </div>

      <div className="app-region-no-drag relative z-10 ml-auto flex items-center gap-3" data-testid="header-right-actions">
        <div
          data-testid="header-backend-status"
          className={`recessed-well flex min-w-[176px] max-w-[260px] items-center gap-2 px-3 py-2 ${STATUS_TEXT_CLASSES[backendStatus.tone]}`}
          title={backendStatus.detail ? `${backendStatus.label}: ${backendStatus.detail}` : backendStatus.label}
        >
          {/* Decorative instrument LED; the a11y meaning lives on the sr-only status span. */}
          <Led color={STATUS_LED[backendStatus.tone]} pulse={backendStatus.pulse} />
          <span className="sr-only" role="status" aria-label={backendStatus.ariaLabel} />
          <span className="min-w-0 truncate type-ui select-none">{backendStatus.label}</span>
        </div>

        <div className="hidden h-11 items-center gap-2 rounded-md border border-border bg-elevated/80 px-3 sm:flex">
          {/* The wordmark's letters fill the middle 116px of a 300px-tall image.
              Shown whole at this height they were about 14px tall and too thin
              to read, so the image is drawn larger and its empty margins are
              cropped by the frame. */}
          <span className="flex h-6 w-[234px] items-center overflow-hidden">
            <img src={logoUrl} alt="Strategia-X" className="h-[54px] w-auto max-w-none" />
          </span>
          <span className="type-caption text-text-body whitespace-nowrap">
            Vision Studio
          </span>
        </div>
      </div>
    </header>
  );
});
