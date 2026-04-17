import { useEffect, useRef } from 'react';
import { CinematicTransition } from '@/components/effects/CinematicTransition';
import type { WorkbenchView } from '@/store/appStore';
import { WorkbenchShell } from './WorkbenchShell';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';
import { WorkbenchGalleryDock } from './WorkbenchGalleryDock';
import { WorkbenchRightStack } from './WorkbenchRightStack';
import { WorkbenchViewer } from './WorkbenchViewer';
import { WorkflowPlaceholder } from '@/components/workflow/WorkflowPlaceholder';
import { LayerPanel } from '@/components/edit/LayerPanel';

interface WorkspaceLayoutProps {
  activePanel: string;
  activeWorkbenchView: WorkbenchView;
  onWorkbenchViewChange: (view: WorkbenchView) => void;
  sidebar: React.ReactNode;
  header: React.ReactNode;
  timeline: React.ReactNode;
  canvas: React.ReactNode;
  panels: Record<string, React.ReactNode>;
  // Edit mode specific
  toolStrip?: React.ReactNode;
  editCanvas?: React.ReactNode;
  editProperties?: React.ReactNode;
  // Batch mode specific
  batchQueue?: React.ReactNode;
  batchResults?: React.ReactNode;
  // Templates mode
  templatesBrowser?: React.ReactNode;
}

export function WorkspaceLayout({
  activePanel,
  activeWorkbenchView,
  onWorkbenchViewChange,
  sidebar,
  header,
  timeline,
  canvas,
  panels,
  toolStrip,
  editCanvas,
  editProperties,
  batchQueue,
  batchResults,
  templatesBrowser,
}: WorkspaceLayoutProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const previousPanelRef = useRef(activePanel);

  useEffect(() => {
    if (previousPanelRef.current === activePanel) return;
    previousPanelRef.current = activePanel;

    // Wait for the cinematic transition to complete (200ms based on cinema-fade animation)
    const timer = setTimeout(() => {
      const workspace = workspaceRef.current;
      if (!workspace) return;

      // Find the first focusable element in the new panel content
      const focusable = workspace.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]), select:not([disabled])'
      );

      if (focusable) {
        focusable.focus({ preventScroll: true });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [activePanel]);

  const renderWorkspace = () => {
    switch (activePanel) {
      case 'edit':
        return (
          <WorkbenchShell
            activeView={activeWorkbenchView}
            onViewChange={onWorkbenchViewChange}
            leftDock={editProperties}
            toolRail={toolStrip}
            canvas={editCanvas || canvas}
            viewer={<WorkbenchViewer />}
            workflow={<WorkflowPlaceholder />}
            rightDock={
              <WorkbenchRightStack
                sections={[
                  {
                    id: 'layers',
                    label: 'Layers',
                    content: <LayerPanel />,
                    defaultHeight: '45%',
                  },
                  {
                    id: 'gallery',
                    label: 'Gallery',
                    content: <WorkbenchGalleryDock />,
                  },
                ]}
              />
            }
            bottom={timeline}
          />
        );

      case 'batch':
        return (
          <div className="flex-1 flex min-h-0">
            {/* Results grid (main area) */}
            <div className="flex-1 min-w-0 bg-void">
              {batchResults || <div className="flex-1" />}
            </div>
            {/* Batch panel (right) - same width as Generate */}
            {batchQueue && (
              <div className="w-[400px] flex-shrink-0 border-l border-border bg-surface overflow-hidden">
                {batchQueue}
              </div>
            )}
          </div>
        );

      case 'templates':
        return (
          <div className="flex-1 min-h-0 bg-void overflow-hidden">
            {templatesBrowser || panels['templates']}
          </div>
        );

      case 'generate':
      case 'quick':
        return (
          <WorkbenchShell
            activeView={activeWorkbenchView}
            onViewChange={onWorkbenchViewChange}
            leftDock={panels[activePanel]}
            canvas={canvas}
            viewer={<WorkbenchViewer />}
            workflow={<WorkflowPlaceholder />}
            rightDock={
              <WorkbenchRightStack
                sections={[
                  {
                    id: 'boards',
                    label: 'Boards',
                    content: <WorkbenchBoardsDock />,
                    defaultHeight: '34%',
                  },
                  {
                    id: 'gallery',
                    label: 'Gallery',
                    content: <WorkbenchGalleryDock />,
                  },
                ]}
              />
            }
            bottom={timeline}
          />
        );

      case 'storyboard':
        return (
          <div className="flex-1 flex min-h-0">
            {/* Canvas */}
            <div className="flex-1 min-w-0">
              {canvas}
            </div>
            {/* Storyboard panel (right) */}
            <div className="w-[380px] flex-shrink-0 border-l border-border bg-surface flex flex-col min-h-0 overflow-hidden">
              {panels['storyboard']}
            </div>
          </div>
        );

      default:
        // assets, settings - standard canvas + right panel layout
        return (
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 min-w-0">
              {canvas}
            </div>
            <div
              className={`flex-shrink-0 border-l border-border bg-surface overflow-hidden ${
                activePanel === 'settings' ? 'w-[600px]' : 'w-80'
              }`}
            >
              {panels[activePanel]}
            </div>
          </div>
        );
    }
  };

  const showTimeline =
    activePanel !== 'batch' &&
    activePanel !== 'templates' &&
    activePanel !== 'generate' &&
    activePanel !== 'quick' &&
    activePanel !== 'edit';

  return (
    <div className="h-screen w-screen bg-void flex overflow-hidden">
      {/* Sidebar - always mounted */}
      {sidebar}

      {/* Main content */}
      <div ref={workspaceRef} className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {header}

        {/* Workspace - transitions on panel switch */}
        <CinematicTransition transitionKey={activePanel}>
          {renderWorkspace()}
        </CinematicTransition>

        {/* Timeline - conditional, fixed height so it doesn't squeeze workspace */}
        {showTimeline && <div className="flex-shrink-0">{timeline}</div>}
      </div>
    </div>
  );
}
