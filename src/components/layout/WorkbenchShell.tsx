import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { WorkbenchView } from '@/store/appStore';
import { cn } from '@/utils/cn';

export interface WorkbenchDockTab {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

interface WorkbenchShellProps {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  canvas: ReactNode;
  viewer: ReactNode;
  workflow: ReactNode;
  leftDock?: ReactNode;
  rightDock?: ReactNode;
  rightDockTabs?: WorkbenchDockTab[];
  defaultDockTabId?: string;
  activeDockTabId?: string | null;
  onDockTabChange?: (tabId: string) => void;
  toolRail?: ReactNode;
  bottom?: ReactNode;
}

const workbenchViews: { id: WorkbenchView; label: string }[] = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'viewer', label: 'Viewer' },
  { id: 'workflow', label: 'Workflow' },
];

export function WorkbenchShell({
  activeView,
  onViewChange,
  canvas,
  viewer,
  workflow,
  leftDock,
  rightDock,
  rightDockTabs = [],
  defaultDockTabId,
  activeDockTabId: controlledDockTabId,
  onDockTabChange,
  toolRail,
  bottom,
}: WorkbenchShellProps) {
  const initialDockTabId =
    defaultDockTabId ?? rightDockTabs.find((tab) => !tab.disabled)?.id ?? rightDockTabs[0]?.id ?? null;
  const [uncontrolledDockTabId, setUncontrolledDockTabId] = useState<string | null>(initialDockTabId);
  const selectedDockTabId = controlledDockTabId ?? uncontrolledDockTabId;

  const activeDockTab = useMemo(
    () =>
      rightDockTabs.find((tab) => tab.id === selectedDockTabId && !tab.disabled) ??
      rightDockTabs.find((tab) => !tab.disabled) ??
      null,
    [selectedDockTabId, rightDockTabs]
  );

  const handleDockTabChange = (tabId: string) => {
    setUncontrolledDockTabId(tabId);
    onDockTabChange?.(tabId);
  };

  const activeContent =
    activeView === 'viewer' ? viewer : activeView === 'workflow' ? workflow : canvas;

  return (
    <div className="flex h-full min-h-0 bg-void">
      {leftDock && (
        <aside
          data-testid="workbench-left-dock"
          className="hidden w-[clamp(300px,32%,420px)] flex-shrink-0 flex-col border-r border-border bg-surface sm:flex"
        >
          {leftDock}
        </aside>
      )}

      {toolRail && (
        <aside
          data-testid="workbench-tool-rail"
          className="w-14 flex-shrink-0 border-r border-border bg-surface"
        >
          {toolRail}
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-void">
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
          <div className="flex gap-1" role="tablist" aria-label="Workbench view">
            {workbenchViews.map((view) => {
              const isActive = activeView === view.id;

              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`workbench-${view.id}-panel`}
                  id={`workbench-${view.id}-tab`}
                  onClick={() => onViewChange(view.id)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 type-ui transition-all',
                    isActive
                      ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                      : 'border-transparent text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
                  )}
                >
                  {view.label}
                </button>
              );
            })}
          </div>
        </div>

        <section
          role="tabpanel"
          id={`workbench-${activeView}-panel`}
          aria-labelledby={`workbench-${activeView}-tab`}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {activeContent}
        </section>

        {bottom && (
          <div data-testid="workbench-bottom" className="flex-shrink-0 border-t border-border">
            {bottom}
          </div>
        )}
      </main>

      {rightDock && (
        <aside
          data-testid="workbench-right-dock"
          className="hidden w-[clamp(280px,30%,420px)] flex-shrink-0 flex-col border-l border-border bg-surface lg:flex"
        >
          {rightDock}
        </aside>
      )}

      {!rightDock && rightDockTabs.length > 0 && (
        <aside
          data-testid="workbench-right-dock"
          className="hidden w-[clamp(280px,30%,420px)] flex-shrink-0 flex-col border-l border-border bg-surface lg:flex"
        >
          <div className="border-b border-border px-2 py-2">
            <div className="flex gap-1" role="tablist" aria-label="Workbench context">
              {rightDockTabs.map((tab) => {
                const isActive = activeDockTab?.id === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`workbench-dock-${tab.id}`}
                    id={`workbench-dock-${tab.id}-tab`}
                    disabled={tab.disabled}
                    onClick={() => handleDockTabChange(tab.id)}
                    className={cn(
                      'flex-1 rounded-md border px-2.5 py-1.5 type-ui transition-all',
                      isActive
                        ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                        : 'border-transparent text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary',
                      tab.disabled && 'cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            role="tabpanel"
            id={activeDockTab ? `workbench-dock-${activeDockTab.id}` : undefined}
            aria-labelledby={activeDockTab ? `workbench-dock-${activeDockTab.id}-tab` : undefined}
            className="min-h-0 flex-1 overflow-hidden"
          >
            {activeDockTab?.content}
          </div>
        </aside>
      )}
    </div>
  );
}
