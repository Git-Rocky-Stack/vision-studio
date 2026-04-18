import { memo, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { NavBar } from '@/components/layout/NavBar';
import { Canvas } from '@/components/layout/Canvas';
import { WorkbenchViewer } from '@/components/layout/WorkbenchViewer';
import { WorkflowWorkbench } from '@/components/workflow/WorkflowWorkbench';
import { DockviewSettingsPanel } from '@/components/layout/DockviewSettingsPanel';
import { DockviewGalleryPanel } from '@/components/layout/DockviewGalleryPanel';
import { DockviewBoardsPanel } from '@/components/layout/DockviewBoardsPanel';
import { DockviewLayersPanel } from '@/components/layout/DockviewLayersPanel';
import { AssetsPanel } from '@/pages/AssetsPanel';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { getLayoutPreset } from '@/components/layout/layoutPresets';
import { cn } from '@/utils/cn';
import type { CenterView } from '@/types/navigation';

/* -------------------------------------------------------------------------- */
/*  Center content renderer                                                   */
/* -------------------------------------------------------------------------- */

function CenterContent({ centerView }: { centerView: CenterView }) {
  switch (centerView) {
    case 'canvas':
      return <Canvas />;
    case 'viewer':
      return <WorkbenchViewer />;
    case 'workflow':
      return <WorkflowWorkbench />;
    case 'launchpad':
      return (
        <div className="flex h-full items-center justify-center text-text-muted type-body">
          Launchpad
        </div>
      );
    default:
      return (
        <div className="flex h-full items-center justify-center text-text-muted type-body">
          Unknown view
        </div>
      );
  }
}

/* -------------------------------------------------------------------------- */
/*  Center tab bar                                                            */
/* -------------------------------------------------------------------------- */

interface CenterTabDef {
  id: CenterView;
  label: string;
}

const CENTER_VIEW_LABELS: Record<CenterView, string> = {
  canvas: 'Canvas',
  viewer: 'Viewer',
  workflow: 'Workflow',
  launchpad: 'Launchpad',
};

/* -------------------------------------------------------------------------- */
/*  DockviewLayout                                                            */
/* -------------------------------------------------------------------------- */

export const DockviewLayout = memo(function DockviewLayout() {
  const activeTab = useAppStore((s) => s.activeTab);
  const centerView = useAppStore((s) => s.centerView);
  const setCenterView = useAppStore((s) => s.setCenterView);

  const preset = getLayoutPreset(activeTab);

  const handleCenterTabClick = useCallback(
    (view: CenterView) => {
      setCenterView(view);
    },
    [setCenterView],
  );

  /* ------------------------------------------------------------------------ */
  /*  Full-width tabs (assets, settings)                                      */
  /* ------------------------------------------------------------------------ */

  if (!preset.hasLeftDock && !preset.hasRightDock) {
    return (
      <div className="flex h-full">
        <NavBar />
        <main className="flex min-w-0 flex-1 flex-col bg-void">
          <section className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary fallbackLabel={`${activeTab} panel error`}>
              {activeTab === 'assets' ? <AssetsPanel /> : <SettingsPanel />}
            </ErrorBoundary>
          </section>
        </main>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  Three-panel layout (generate, canvas, story, workflows)                  */
  /* ------------------------------------------------------------------------ */

  const centerTabs: CenterTabDef[] = preset.centerViews.map((id) => ({
    id,
    label: CENTER_VIEW_LABELS[id],
  }));

  const isCanvasTab = activeTab === 'canvas';

  return (
    <div className="flex h-full">
      <NavBar />

      <div className="flex flex-1 min-w-0">
        {/* Left dock - settings panel */}
        <aside
          data-testid="left-dock"
          role="complementary"
          aria-label="Settings panel"
          className={cn(
            'h-full flex-shrink-0 border-r border-border bg-surface',
            'w-[clamp(340px,32%,420px)]',
          )}
        >
          <ErrorBoundary fallbackLabel="Settings panel error">
            <DockviewSettingsPanel />
          </ErrorBoundary>
        </aside>

        {/* Center workspace */}
        <main className="flex min-w-0 flex-1 flex-col bg-void">
          {/* Center view tabs (only when preset has >1 center view) */}
          {centerTabs.length > 1 && (
            <div
              className="flex flex-shrink-0 items-center gap-1 border-b border-border px-2 py-1"
              role="tablist"
              aria-label="Center views"
              data-testid="center-tab-bar"
            >
              {centerTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={centerView === tab.id}
                  data-testid={`center-tab-${tab.id}`}
                  onClick={() => handleCenterTabClick(tab.id)}
                  className={cn(
                    'rounded-sm px-2.5 py-1.5 type-ui transition-colors',
                    centerView === tab.id
                      ? 'bg-elevated text-text-primary shadow-sm'
                      : 'text-text-body hover:bg-elevated hover:text-text-primary',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Center content */}
          <section className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary fallbackLabel="Center view error">
              <CenterContent centerView={centerView} />
            </ErrorBoundary>
          </section>
        </main>

        {/* Right dock */}
        <aside
          data-testid="right-dock"
          role="complementary"
          aria-label="Gallery panel"
          className={cn(
            'h-full flex-shrink-0 border-l border-border bg-surface',
            'w-[clamp(280px,30%,420px)]',
            'flex flex-col',
          )}
        >
          <ErrorBoundary fallbackLabel="Right dock error">
            {isCanvasTab ? (
              <>
                <div className="flex min-h-0 flex-1 flex-col">
                  <DockviewLayersPanel />
                </div>
                <div className="flex min-h-0 flex-1 flex-col border-t border-border">
                  <DockviewGalleryPanel />
                </div>
              </>
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col">
                  <DockviewGalleryPanel />
                </div>
                <div className="flex min-h-0 flex-1 flex-col border-t border-border">
                  <DockviewBoardsPanel />
                </div>
              </>
            )}
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
});