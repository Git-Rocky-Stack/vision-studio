import { memo, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { NavBar } from '@/components/layout/NavBar';
import { Canvas } from '@/components/layout/Canvas';
import { Timeline } from '@/components/layout/Timeline';
import { WorkbenchViewer } from '@/components/layout/WorkbenchViewer';
import { WorkflowWorkbench } from '@/components/workflow/WorkflowWorkbench';
import { DockviewSettingsPanel } from '@/components/layout/DockviewSettingsPanel';
import { DockviewGalleryPanel } from '@/components/layout/DockviewGalleryPanel';
import { DockviewBoardsPanel } from '@/components/layout/DockviewBoardsPanel';
import { DockviewLayersPanel } from '@/components/layout/DockviewLayersPanel';
import { AssetsPanel } from '@/pages/AssetsPanel';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { CompositionPreview } from '@/components/studio/CompositionPreview';
import { TimelinePlaybackPreview } from '@/components/timeline/TimelinePlaybackPreview';
import { IterationViewSelector } from '@/components/iteration/IterationViewSelector';
import { IterationWorkspacePanel } from '@/components/iteration/IterationWorkspacePanel';
import { getLayoutPreset } from '@/components/layout/layoutPresets';
import { MonoLabel } from '@/components/hardware';
import { cn } from '@/utils/cn';
import type { CenterView } from '@/types/navigation';

// Selected deck-tab cap: chrome edge-ring + machined depth (DESIGN.md §depth system).
const CENTER_TAB_ACTIVE_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 0 1px var(--color-chrome-edge), 0 3px 6px rgba(0,0,0,0.5)';
import {
  LEFT_DOCK_DEFAULT_WIDTH,
  LEFT_DOCK_MAX_WIDTH,
  LEFT_DOCK_MIN_WIDTH,
  RIGHT_DOCK_CANVAS_DEFAULT_RATIOS,
  RIGHT_DOCK_CANVAS_MIN_RATIO,
  RIGHT_DOCK_DEFAULT_WIDTH,
  RIGHT_DOCK_DUAL_DEFAULT_RATIOS,
  RIGHT_DOCK_DUAL_MIN_RATIO,
  RIGHT_DOCK_MAX_WIDTH,
  RIGHT_DOCK_MIN_WIDTH,
  RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
  RIGHT_DOCK_TRIPLE_MIN_RATIO,
  adjustAdjacentPanelRatios,
} from '@/store/layoutPreferences';

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

interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal';
  label: string;
  valueNow: number;
  valueMin: number;
  valueMax: number;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onReset: () => void;
  className?: string;
  dataTestId: string;
}

function ResizeHandle({
  orientation,
  label,
  valueNow,
  valueMin,
  valueMax,
  onPointerDown,
  onKeyDown,
  onReset,
  className,
  dataTestId,
}: ResizeHandleProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={Math.round(valueMin)}
      aria-valuemax={Math.round(valueMax)}
      aria-valuetext={isVertical ? `${Math.round(valueNow)} pixels` : `${Math.round(valueNow)} percent`}
      tabIndex={0}
      data-testid={dataTestId}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={cn(
        'group relative z-10 flex touch-none select-none items-center justify-center bg-transparent outline-none',
        isVertical ? 'w-3 flex-shrink-0 cursor-col-resize' : 'h-3 flex-shrink-0 cursor-row-resize',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'rounded-full bg-border transition-colors duration-150 group-hover:bg-border-hover group-focus-visible:bg-accent-primary group-active:bg-accent-primary',
          isVertical ? 'h-full w-px' : 'h-px w-full',
        )}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DockviewLayout                                                            */
/* -------------------------------------------------------------------------- */

export const DockviewLayout = memo(function DockviewLayout() {
  const activeTab = useAppStore((s) => s.activeTab);
  const centerView = useAppStore((s) => s.centerView);
  const activeSubMode = useAppStore((s) => s.activeSubMode);
  const iterationView = useAppStore((s) => s.iterationView);
  const layoutPreferences = useAppStore((s) => s.layoutPreferences);
  const setCenterView = useAppStore((s) => s.setCenterView);
  const setLeftDockWidth = useAppStore((s) => s.setLeftDockWidth);
  const setRightDockWidth = useAppStore((s) => s.setRightDockWidth);
  const setRightDockCanvasRatios = useAppStore((s) => s.setRightDockCanvasRatios);
  const setRightDockDualRatios = useAppStore((s) => s.setRightDockDualRatios);
  const setRightDockTripleRatios = useAppStore((s) => s.setRightDockTripleRatios);

  const isCanvasTab = activeTab === 'canvas';
  const isStudioMode = activeTab === 'generate' && activeSubMode === 'studio';
  const showTimelineWorkspace = activeTab === 'generate' && centerView === 'canvas' && !isStudioMode;
  const showIterationView = activeTab === 'generate' || activeTab === 'canvas';
  const usesTripleRightDock = !isCanvasTab && showIterationView;

  const preset = getLayoutPreset(activeTab);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const rightDockStackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showIterationView && iterationView === 'overlay' && centerView !== 'canvas') {
      setCenterView('canvas');
    }
  }, [centerView, iterationView, setCenterView, showIterationView]);

  const handleCenterTabClick = useCallback(
    (view: CenterView) => {
      setCenterView(view);
    },
    [setCenterView],
  );

  const startVerticalResize = useCallback(
    (edge: 'left' | 'right') => (event: React.PointerEvent<HTMLDivElement>) => {
      const workspace = workspaceRef.current;
      if (!workspace) {
        return;
      }

      event.preventDefault();
      const rect = workspace.getBoundingClientRect();
      const abortController = new AbortController();

      const cleanup = () => abortController.abort();

      window.addEventListener(
        'pointermove',
        (moveEvent) => {
          const nextWidth = edge === 'left'
            ? moveEvent.clientX - rect.left
            : rect.right - moveEvent.clientX;

          if (edge === 'left') {
            setLeftDockWidth(nextWidth);
          } else {
            setRightDockWidth(nextWidth);
          }
        },
        { signal: abortController.signal },
      );
      window.addEventListener('pointerup', cleanup, { once: true, signal: abortController.signal });
      window.addEventListener('pointercancel', cleanup, { once: true, signal: abortController.signal });
    },
    [setLeftDockWidth, setRightDockWidth],
  );

  const startHorizontalResize = <T extends [number, number] | [number, number, number],>(
    event: React.PointerEvent<HTMLDivElement>,
    ratios: T,
    defaults: readonly number[],
    minRatio: number,
    leadingIndex: number,
    setRatios: (nextRatios: T) => void,
  ) => {
    const stack = rightDockStackRef.current;
    if (!stack) {
      return;
    }

    event.preventDefault();
    const rect = stack.getBoundingClientRect();
    const abortController = new AbortController();

    const cleanup = () => abortController.abort();

    window.addEventListener(
      'pointermove',
      (moveEvent) => {
        const pointerOffset = Math.min(rect.height, Math.max(0, moveEvent.clientY - rect.top));
        const absoluteRatio = pointerOffset / Math.max(rect.height, 1);
        const preceding = ratios
          .slice(0, leadingIndex)
          .reduce((sum, value) => sum + value, 0);

        const nextLeadingRatio = absoluteRatio - preceding;
        setRatios(
          adjustAdjacentPanelRatios(
            ratios,
            leadingIndex,
            nextLeadingRatio,
            defaults,
            minRatio,
          ) as typeof ratios,
        );
      },
      { signal: abortController.signal },
    );
    window.addEventListener('pointerup', cleanup, { once: true, signal: abortController.signal });
    window.addEventListener('pointercancel', cleanup, { once: true, signal: abortController.signal });
  };

  const handleWidthResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, edge: 'left' | 'right') => {
      const step = event.shiftKey ? 48 : 16;

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }

      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -step : step;
      if (edge === 'left') {
        setLeftDockWidth(layoutPreferences.leftDockWidth + delta);
      } else {
        setRightDockWidth(layoutPreferences.rightDockWidth - delta);
      }
    },
    [layoutPreferences.leftDockWidth, layoutPreferences.rightDockWidth, setLeftDockWidth, setRightDockWidth],
  );

  const handleRatioResizeKeyDown = <T extends [number, number] | [number, number, number],>(
    event: React.KeyboardEvent<HTMLDivElement>,
    ratios: T,
    defaults: readonly number[],
    minRatio: number,
    leadingIndex: number,
    setRatios: (nextRatios: T) => void,
  ) => {
    const step = event.shiftKey ? 0.08 : 0.04;

    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? -step : step;
    setRatios(
      adjustAdjacentPanelRatios(
        ratios,
        leadingIndex,
        ratios[leadingIndex] + delta,
        defaults,
        minRatio,
      ) as typeof ratios,
    );
  };

  /* ------------------------------------------------------------------------ */
  /*  Full-width tabs (assets, settings)                                      */
  /* ------------------------------------------------------------------------ */

  if (!preset.hasLeftDock && !preset.hasRightDock) {
    return (
      <div className="flex h-full min-h-0">
        <NavBar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-void">
          <section
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-label={`${activeTab} panel`}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <ErrorBoundary fallbackLabel={`${activeTab} panel error`}>
              {activeTab === 'assets' ? <AssetsPanel /> : activeTab === 'collections' ? <CollectionsPage /> : <SettingsPanel />}
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

  const canvasGridRows = `${layoutPreferences.rightDockCanvasRatios[0]}fr auto ${layoutPreferences.rightDockCanvasRatios[1]}fr`;
  const dualGridRows = `${layoutPreferences.rightDockDualRatios[0]}fr auto ${layoutPreferences.rightDockDualRatios[1]}fr`;
  const tripleGridRows = `${layoutPreferences.rightDockTripleRatios[0]}fr auto ${layoutPreferences.rightDockTripleRatios[1]}fr auto ${layoutPreferences.rightDockTripleRatios[2]}fr`;
  const responsiveLeftDockWidth = `clamp(120px, min(${layoutPreferences.leftDockWidth}px, 32vw), ${layoutPreferences.leftDockWidth}px)`;

  return (
    <div className="flex h-full min-h-0">
      <NavBar />

      <div ref={workspaceRef} className="flex min-h-0 flex-1 min-w-0">
        {/* Left dock - settings panel */}
        <aside
          data-testid="left-dock"
          role="complementary"
          aria-label="Settings panel"
          className={cn(
            'h-full flex-shrink-0 overflow-hidden border-r border-border bg-surface',
          )}
          style={{ width: responsiveLeftDockWidth }}
        >
          <ErrorBoundary fallbackLabel="Settings panel error">
            <DockviewSettingsPanel />
          </ErrorBoundary>
        </aside>
        <ResizeHandle
          orientation="vertical"
          label="Resize settings panel"
          valueNow={layoutPreferences.leftDockWidth}
          valueMin={LEFT_DOCK_MIN_WIDTH}
          valueMax={LEFT_DOCK_MAX_WIDTH}
          onPointerDown={startVerticalResize('left')}
          onKeyDown={(event) => handleWidthResizeKeyDown(event, 'left')}
          onReset={() => setLeftDockWidth(LEFT_DOCK_DEFAULT_WIDTH)}
          dataTestId="splitter-left-dock"
        />

        {/* Center workspace */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-void">
          {/* Center view tabs (only when preset has >1 center view) */}
          {centerTabs.length > 1 && !isStudioMode && (
            <div
              className="flex flex-shrink-0 items-center gap-1 border-b border-border px-2 py-1"
              data-testid="center-tab-bar"
            >
              <div role="tablist" aria-label="Center views" className="flex items-center gap-1">
                {centerTabs.map((tab) => (
                  <button
                    key={tab.id}
                    id={`center-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={centerView === tab.id}
                    aria-controls={`center-panel-${tab.id}`}
                    data-testid={`center-tab-${tab.id}`}
                    onClick={() => handleCenterTabClick(tab.id)}
                    className={cn(
                      'rounded-md px-3 py-1.5 transition-all duration-150',
                      centerView === tab.id
                        ? 'raised-control vx-pad text-accent-primary'
                        : 'text-text-body hover:bg-elevated/60 hover:text-text-primary',
                    )}
                    style={centerView === tab.id ? { boxShadow: CENTER_TAB_ACTIVE_SHADOW } : undefined}
                  >
                    <MonoLabel>{tab.label}</MonoLabel>
                  </button>
                ))}
              </div>

              {/* Iteration view selector for generate/canvas */}
              {showIterationView && (
                <div className="ml-auto">
                  <IterationViewSelector />
                </div>
              )}
            </div>
          )}

          {/* Center content */}
          <section
            id={`center-panel-${centerView}`}
            role="tabpanel"
            aria-labelledby={`center-tab-${centerView}`}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <ErrorBoundary fallbackLabel="Center view error">
              {isStudioMode ? (
                <CompositionPreview />
              ) : showTimelineWorkspace ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <TimelinePlaybackPreview className="h-full" />
                  </div>
                  <Timeline />
                </div>
              ) : (
                <CenterContent centerView={centerView} />
              )}
            </ErrorBoundary>
          </section>
        </main>

        {/* Right dock */}
        <ResizeHandle
          orientation="vertical"
          label="Resize review dock"
          valueNow={layoutPreferences.rightDockWidth}
          valueMin={RIGHT_DOCK_MIN_WIDTH}
          valueMax={RIGHT_DOCK_MAX_WIDTH}
          onPointerDown={startVerticalResize('right')}
          onKeyDown={(event) => handleWidthResizeKeyDown(event, 'right')}
          onReset={() => setRightDockWidth(RIGHT_DOCK_DEFAULT_WIDTH)}
          dataTestId="splitter-right-dock"
          className="hidden xl:flex"
        />
        <aside
          data-testid="right-dock"
          role="complementary"
          aria-label="Gallery panel"
          className={cn(
            'hidden h-full flex-shrink-0 overflow-hidden border-l border-border bg-surface xl:flex xl:flex-col',
          )}
          style={{ width: layoutPreferences.rightDockWidth }}
        >
          <ErrorBoundary fallbackLabel="Right dock error">
            {isCanvasTab ? (
              <div
                ref={rightDockStackRef}
                className="grid min-h-0 flex-1"
                style={{ gridTemplateRows: canvasGridRows }}
              >
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <DockviewLayersPanel />
                </div>
                <ResizeHandle
                  orientation="horizontal"
                  label="Resize layers and gallery panels"
                  valueNow={layoutPreferences.rightDockCanvasRatios[0] * 100}
                  valueMin={RIGHT_DOCK_CANVAS_MIN_RATIO * 100}
                  valueMax={(1 - RIGHT_DOCK_CANVAS_MIN_RATIO) * 100}
                  onPointerDown={(event) =>
                    startHorizontalResize(
                      event,
                      layoutPreferences.rightDockCanvasRatios,
                      RIGHT_DOCK_CANVAS_DEFAULT_RATIOS,
                      RIGHT_DOCK_CANVAS_MIN_RATIO,
                      0,
                      setRightDockCanvasRatios,
                    )
                  }
                  onKeyDown={(event) =>
                    handleRatioResizeKeyDown(
                      event,
                      layoutPreferences.rightDockCanvasRatios,
                      RIGHT_DOCK_CANVAS_DEFAULT_RATIOS,
                      RIGHT_DOCK_CANVAS_MIN_RATIO,
                      0,
                      setRightDockCanvasRatios,
                    )
                  }
                  onReset={() => setRightDockCanvasRatios([...RIGHT_DOCK_CANVAS_DEFAULT_RATIOS])}
                  dataTestId="splitter-right-dock-canvas-0"
                />
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <DockviewGalleryPanel />
                </div>
              </div>
            ) : (
              <div
                ref={rightDockStackRef}
                className="grid min-h-0 flex-1"
                style={{ gridTemplateRows: usesTripleRightDock ? tripleGridRows : dualGridRows }}
              >
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <DockviewGalleryPanel />
                </div>
                <ResizeHandle
                  orientation="horizontal"
                  label={usesTripleRightDock ? 'Resize gallery and boards panels' : 'Resize gallery and boards dock panels'}
                  valueNow={
                    (usesTripleRightDock
                      ? layoutPreferences.rightDockTripleRatios[0]
                      : layoutPreferences.rightDockDualRatios[0]) * 100
                  }
                  valueMin={
                    (usesTripleRightDock ? RIGHT_DOCK_TRIPLE_MIN_RATIO : RIGHT_DOCK_DUAL_MIN_RATIO) * 100
                  }
                  valueMax={
                    (usesTripleRightDock ? 1 - RIGHT_DOCK_TRIPLE_MIN_RATIO : 1 - RIGHT_DOCK_DUAL_MIN_RATIO) * 100
                  }
                  onPointerDown={(event) =>
                    usesTripleRightDock
                      ? startHorizontalResize(
                          event,
                          layoutPreferences.rightDockTripleRatios,
                          RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
                          RIGHT_DOCK_TRIPLE_MIN_RATIO,
                          0,
                          setRightDockTripleRatios,
                        )
                      : startHorizontalResize(
                          event,
                          layoutPreferences.rightDockDualRatios,
                          RIGHT_DOCK_DUAL_DEFAULT_RATIOS,
                          RIGHT_DOCK_DUAL_MIN_RATIO,
                          0,
                          setRightDockDualRatios,
                        )
                  }
                  onKeyDown={(event) =>
                    usesTripleRightDock
                      ? handleRatioResizeKeyDown(
                          event,
                          layoutPreferences.rightDockTripleRatios,
                          RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
                          RIGHT_DOCK_TRIPLE_MIN_RATIO,
                          0,
                          setRightDockTripleRatios,
                        )
                      : handleRatioResizeKeyDown(
                          event,
                          layoutPreferences.rightDockDualRatios,
                          RIGHT_DOCK_DUAL_DEFAULT_RATIOS,
                          RIGHT_DOCK_DUAL_MIN_RATIO,
                          0,
                          setRightDockDualRatios,
                        )
                  }
                  onReset={() =>
                    usesTripleRightDock
                      ? setRightDockTripleRatios([...RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS])
                      : setRightDockDualRatios([...RIGHT_DOCK_DUAL_DEFAULT_RATIOS])
                  }
                  dataTestId={usesTripleRightDock ? 'splitter-right-dock-triple-0' : 'splitter-right-dock-dual-0'}
                />
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <DockviewBoardsPanel />
                </div>
                {usesTripleRightDock && (
                  <>
                    <ResizeHandle
                      orientation="horizontal"
                      label="Resize boards and history panels"
                      valueNow={(layoutPreferences.rightDockTripleRatios[1] * 100)}
                      valueMin={RIGHT_DOCK_TRIPLE_MIN_RATIO * 100}
                      valueMax={(1 - RIGHT_DOCK_TRIPLE_MIN_RATIO) * 100}
                      onPointerDown={(event) =>
                        startHorizontalResize(
                          event,
                          layoutPreferences.rightDockTripleRatios,
                          RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
                          RIGHT_DOCK_TRIPLE_MIN_RATIO,
                          1,
                          setRightDockTripleRatios,
                        )
                      }
                      onKeyDown={(event) =>
                        handleRatioResizeKeyDown(
                          event,
                          layoutPreferences.rightDockTripleRatios,
                          RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS,
                          RIGHT_DOCK_TRIPLE_MIN_RATIO,
                          1,
                          setRightDockTripleRatios,
                        )
                      }
                      onReset={() => setRightDockTripleRatios([...RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS])}
                      dataTestId="splitter-right-dock-triple-1"
                    />
                    <div className="flex min-h-0 flex-col overflow-hidden">
                      <IterationWorkspacePanel />
                    </div>
                  </>
                )}
              </div>
            )}
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
});
