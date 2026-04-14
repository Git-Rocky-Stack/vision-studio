import { useEffect, useRef } from 'react';
import { CinematicTransition } from '@/components/effects/CinematicTransition';

interface WorkspaceLayoutProps {
  activePanel: string;
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
          <div className="flex-1 flex min-h-0">
            {/* Tool strip */}
            {toolStrip && (
              <div className="w-14 flex-shrink-0 border-r border-border bg-surface">
                {toolStrip}
              </div>
            )}
            {/* Edit canvas */}
            <div className="flex-1 min-w-0">
              {editCanvas || canvas}
            </div>
            {/* Properties panel */}
            {editProperties && (
              <div className="w-[360px] flex-shrink-0 border-l border-border bg-surface overflow-hidden">
                {editProperties}
              </div>
            )}
          </div>
        );

      case 'batch':
        return (
          <div className="flex-1 flex min-h-0">
            {/* Results grid (main area) */}
            <div className="flex-1 min-w-0 bg-void">
              {batchResults || <div className="flex-1" />}
            </div>
            {/* Batch panel (right) — same width as Generate */}
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
          <div className="flex-1 flex min-h-0">
            {/* Canvas */}
            <div className="flex-1 min-w-0">
              {canvas}
            </div>
            {/* Generate/Quick panel (right) */}
            <div className="w-[clamp(320px,30%,420px)] flex-shrink-0 border-l border-border bg-surface flex flex-col min-h-0">
              {panels[activePanel]}
            </div>
          </div>
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

  const showTimeline = activePanel !== 'batch' && activePanel !== 'templates';

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
