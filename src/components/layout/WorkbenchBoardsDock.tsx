import { Plus } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import type { Project } from '@/types/project';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { cn } from '@/utils/cn';

const boardDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function WorkbenchBoardsDock() {
  const {
    projects,
    activeProjectId,
    activeSceneId,
    addScene,
    createProject,
    setActivePanel,
    setActiveProject,
    setActiveScene,
  } = useAppStore();
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const orderedProjects = [...projects].sort(compareProjectsByActivity);
  const nextBoardName = projects.length === 0 ? 'Untitled Board' : `Untitled Board ${projects.length + 1}`;

  const handleCreateBoard = () => {
    const project = createProject(nextBoardName, { width: 1024, height: 1024 });
    setActiveProject(project.id);
  };

  const handleOpenStoryboard = () => {
    if (!activeProjectId) return;
    setActivePanel('storyboard');
  };

  const handleAddScene = () => {
    if (!activeProject) return;
    const scene = addScene(activeProject.id, { name: `Scene ${activeProject.scenes.length + 1}` });
    setActiveScene(scene.id);
  };

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-4 text-center">
        <h3 className="type-section">Quick Captures</h3>
        <p className="mt-2 text-xs text-text-muted">No scenes captured yet.</p>
        <button
          type="button"
          onClick={handleCreateBoard}
          className="mx-auto mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New Board
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <h2 className="type-section">Boards</h2>
          <p className="mt-0.5 type-caption">{projects.length} active</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenStoryboard}
            disabled={!activeProjectId}
            className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Storyboard
          </button>
          <button
            type="button"
            onClick={handleAddScene}
            disabled={!activeProject}
            className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Scene
          </button>
          <button
            type="button"
            onClick={handleCreateBoard}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New Board
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-1">
          {orderedProjects.map((project) => {
            const isActive = project.id === activeProjectId;

            return (
              <div key={project.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setActiveProject(project.id)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left transition-all',
                    isActive
                      ? 'border-accent-primary-border bg-accent-primary-muted'
                      : 'border-transparent hover:border-border-hover hover:bg-elevated'
                  )}
                >
                  <span className="block truncate type-ui text-text-primary">
                    {project.name}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 type-caption">
                    <span>{project.scenes.length} scenes</span>
                    <span>{project.dimensions.width} x {project.dimensions.height}</span>
                    <span>{project.fps} fps</span>
                    <span>{formatBoardUpdated(project.modified)}</span>
                  </span>
                </button>

                {isActive && project.scenes.length > 0 ? (
                  <div className="ml-3 flex flex-col gap-1 border-l border-border pl-2">
                    {project.scenes.map((scene) => {
                      const isSceneActive = scene.id === activeSceneId;

                      return (
                        <button
                          key={scene.id}
                          type="button"
                          aria-label={scene.name}
                          aria-pressed={isSceneActive}
                          onClick={() => setActiveScene(scene.id)}
                          className={cn(
                            'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left type-ui transition-all',
                            isSceneActive
                              ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                              : 'border-transparent text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
                          )}
                        >
                          {scene.thumbnail ? (
                            <ImageWithFallback
                              src={scene.thumbnail}
                              alt={`${scene.name} thumbnail`}
                              className="h-full w-full object-cover"
                              fallbackClassName="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-void"
                            />
                          ) : null}
                          <span className="min-w-0 truncate">{scene.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function compareProjectsByActivity(a: Project, b: Project) {
  return (
    timestampOf(b.modified) - timestampOf(a.modified) ||
    timestampOf(b.created) - timestampOf(a.created) ||
    a.name.localeCompare(b.name)
  );
}

function timestampOf(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatBoardUpdated(modified: string) {
  const date = new Date(modified);

  if (Number.isNaN(date.getTime())) {
    return 'Updated date unavailable';
  }

  return `Updated ${boardDateFormatter.format(date)}`;
}
