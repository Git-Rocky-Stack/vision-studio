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
            {/* Prompt queue */}
            {batchQueue && (
              <div className="w-[420px] flex-shrink-0 border-r border-border bg-surface overflow-hidden">
                {batchQueue}
              </div>
            )}
            {/* Results grid */}
            <div className="flex-1 min-w-0 bg-void">
              {batchResults || <div className="flex-1" />}
            </div>
          </div>
        );

      case 'templates':
        return (
          <div className="flex-1 min-h-0 bg-void overflow-hidden">
            {templatesBrowser || panels['templates']}
          </div>
        );

      case 'generate':
        return (
          <div className="flex-1 flex min-h-0">
            {/* Canvas */}
            <div className="flex-1 min-w-0">
              {canvas}
            </div>
            {/* Generate panel (right) */}
            <div className="w-[400px] flex-shrink-0 border-l border-border bg-surface overflow-hidden">
              {panels['generate']}
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {header}

        {/* Workspace - transitions on panel switch */}
        <CinematicTransition transitionKey={activePanel}>
          {renderWorkspace()}
        </CinematicTransition>

        {/* Timeline - conditional */}
        {showTimeline && timeline}
      </div>
    </div>
  );
}
