import { Plus } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

export function WorkbenchBoardsDock() {
  const { projects, activeProjectId, createProject, setActiveProject } = useAppStore();
  const nextBoardName = projects.length === 0 ? 'Untitled Board' : `Untitled Board ${projects.length + 1}`;

  const handleCreateBoard = () => {
    const project = createProject(nextBoardName, { width: 1024, height: 1024 });
    setActiveProject(project.id);
  };

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-4 text-center">
        <h3 className="font-display text-sm font-semibold text-text-primary">Quick Captures</h3>
        <p className="mt-2 text-xs text-text-muted">No scenes captured yet.</p>
        <button
          type="button"
          onClick={handleCreateBoard}
          className="mx-auto mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 font-display text-xs text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Board
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-text-primary">Boards</h2>
          <p className="mt-0.5 font-mono text-micro text-text-muted">{projects.length} active</p>
        </div>
        <button
          type="button"
          onClick={handleCreateBoard}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-display text-xs text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Board
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-1">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;

            return (
              <button
                key={project.id}
                type="button"
                onClick={() => setActiveProject(project.id)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left transition-all',
                  isActive
                    ? 'border-accent-primary-border bg-accent-primary-muted'
                    : 'border-transparent hover:border-border-hover hover:bg-elevated'
                )}
              >
                <span className="block truncate font-display text-xs font-semibold text-text-primary">
                  {project.name}
                </span>
                <span className="mt-1 block font-mono text-micro text-text-muted">
                  {project.scenes.length} scenes
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
