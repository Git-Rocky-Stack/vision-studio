import { memo, useMemo } from 'react';
import { Sparkles, Zap, Layers3, Clapperboard, FolderPlus, ImageOff } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { MonoLabel } from '@/components/hardware';
import { cn } from '@/utils/cn';
import type { ActiveSubMode, ActiveTab } from '@/types/navigation';

/**
 * Launchpad - the entry surface of the Generate workspace.
 *
 * Everything here is drawn from state the app already holds: the real asset
 * library for recent renders and the real project list for storyboards. It adds
 * no data of its own, and every control performs a navigation the app already
 * supports, so nothing on this screen is decorative.
 */

/** Recent renders shown in the strip. */
const RECENT_LIMIT = 8;
/** Projects listed before the list is truncated. */
const PROJECT_LIMIT = 6;

interface QuickAction {
  id: string;
  label: string;
  hint: string;
  icon: typeof Sparkles;
  tab: ActiveTab;
  subMode: ActiveSubMode;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'generate',
    label: 'New generation',
    hint: 'Full control over prompt, model and sampler',
    icon: Sparkles,
    tab: 'generate',
    subMode: 'generate',
  },
  {
    id: 'quick',
    label: 'Quick generate',
    hint: 'Prompt in, image out',
    icon: Zap,
    tab: 'generate',
    subMode: 'quick',
  },
  {
    id: 'batch',
    label: 'Batch run',
    hint: 'Sweep prompts or settings in one pass',
    icon: Layers3,
    tab: 'generate',
    subMode: 'batch',
  },
  {
    id: 'storyboard',
    label: 'Storyboard',
    hint: 'Plan scenes, characters and shots',
    icon: Clapperboard,
    tab: 'story',
    subMode: 'storyboard',
  },
];

export const LaunchpadPanel = memo(function LaunchpadPanel() {
  const {
    assetLibrary,
    projects,
    setActiveTab,
    setActiveSubMode,
    setCenterView,
    setActiveViewerItemId,
    setActiveProject,
    createProject,
  } = useAppStore(
    useShallow((s) => ({
      assetLibrary: s.assetLibrary,
      projects: s.projects,
      setActiveTab: s.setActiveTab,
      setActiveSubMode: s.setActiveSubMode,
      setCenterView: s.setCenterView,
      setActiveViewerItemId: s.setActiveViewerItemId,
      setActiveProject: s.setActiveProject,
      createProject: s.createProject,
    })),
  );

  const recent = useMemo(
    () =>
      [...assetLibrary]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, RECENT_LIMIT),
    [assetLibrary],
  );

  const runQuickAction = (action: QuickAction) => {
    setActiveTab(action.tab);
    setActiveSubMode(action.subMode);
    if (action.tab === 'generate') setCenterView('canvas');
  };

  const openInViewer = (assetId: string) => {
    setActiveViewerItemId(assetId);
    setCenterView('viewer');
  };

  const openProject = (projectId: string) => {
    setActiveProject(projectId);
    setActiveTab('story');
    setActiveSubMode('storyboard');
  };

  const startProject = () => {
    const project = createProject('Untitled Project');
    openProject(project.id);
  };

  return (
    <div className="h-full overflow-y-auto bg-void">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
        {/* Quick actions */}
        <section aria-labelledby="launchpad-start">
          <MonoLabel as="h2" id="launchpad-start" tone="chrome">
            Start
          </MonoLabel>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => runQuickAction(action)}
                className={cn(
                  'raised-panel flex items-start gap-3 rounded-md p-3 text-left transition',
                  'hover:border-border-hover hover:shadow-accent-subtle',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40',
                )}
              >
                <action.icon
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate type-body-sm font-medium text-text-primary">
                    {action.label}
                  </span>
                  <span className="block type-micro text-text-muted">{action.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent renders */}
        <section aria-labelledby="launchpad-recent">
          <MonoLabel as="h2" id="launchpad-recent" tone="chrome">
            Recent renders
          </MonoLabel>
          {recent.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-md border border-border bg-surface py-8 text-text-muted">
              <ImageOff className="h-6 w-6 opacity-40" aria-hidden="true" />
              <p className="type-body-sm">No renders yet</p>
              <p className="type-micro">Anything you generate lands here</p>
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
              {recent.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => openInViewer(asset.id)}
                    aria-label={`Open ${asset.name}`}
                    title={asset.prompt || asset.name}
                    className={cn(
                      'group block w-full overflow-hidden rounded-md border border-border bg-canvas transition',
                      'hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40',
                    )}
                  >
                    <span className="block aspect-square overflow-hidden bg-void">
                      <img
                        src={asset.thumbnail || asset.previewUrl}
                        alt={asset.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </span>
                    <span className="block truncate px-2 py-1 type-micro text-text-muted">
                      {asset.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Projects */}
        <section aria-labelledby="launchpad-projects">
          <div className="flex items-center gap-3">
            <MonoLabel as="h2" id="launchpad-projects" tone="chrome">
              Projects
            </MonoLabel>
            <button
              type="button"
              onClick={startProject}
              className={cn(
                'ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1',
                'type-micro text-text-body transition hover:border-border-hover hover:bg-elevated hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40',
              )}
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
              New project
            </button>
          </div>

          {projects.length === 0 ? (
            <p className="mt-3 rounded-md border border-border bg-surface p-4 type-body-sm text-text-muted">
              No projects yet. Create one to plan scenes, characters and shots.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {projects.slice(0, PROJECT_LIMIT).map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => openProject(project.id)}
                    aria-label={`Open project ${project.name}`}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left transition',
                      'hover:border-border-hover hover:bg-elevated',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40',
                    )}
                  >
                    <span className="truncate type-body-sm text-text-primary">{project.name}</span>
                    <span className="flex-shrink-0 type-micro text-text-muted">
                      {project.scenes.length} {project.scenes.length === 1 ? 'scene' : 'scenes'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
});
