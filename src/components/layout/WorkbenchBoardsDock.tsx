import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';

export function WorkbenchBoardsDock() {
  const { projects, activeProjectId, setActiveProject } = useAppStore();

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-4 text-center">
        <h3 className="font-display text-sm font-semibold text-text-primary">Quick Captures</h3>
        <p className="mt-2 text-xs text-text-muted">No scenes captured yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-2">
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
  );
}
