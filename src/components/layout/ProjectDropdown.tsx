import { memo, useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { ChevronDown, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { Led } from '@/components/hardware';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// Open-state trigger cap: chrome edge-ring + glow (DESIGN.md section depth system).
const OPEN_RING_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 0 1px var(--color-chrome-edge), 0 0 10px rgba(230,230,230,0.18), 0 4px 8px rgba(0,0,0,0.5)';

export const ProjectDropdown = memo(function ProjectDropdown() {
  const {
    projects,
    activeProjectId,
    setActiveProject,
    createProject,
    updateProject,
    deleteProject,
  } = useAppStore(useShallow(s => ({
    projects: s.projects,
    activeProjectId: s.activeProjectId,
    setActiveProject: s.setActiveProject,
    createProject: s.createProject,
    updateProject: s.updateProject,
    deleteProject: s.deleteProject,
  })));

  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const deleteTarget = projects.find((p) => p.id === deleteTargetId) ?? null;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on Escape (the delete confirmation handles its own Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !deleteTargetId && !renamingId) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, deleteTargetId, renamingId]);

  const handleSelectProject = (projectId: string) => {
    setActiveProject(projectId);
    setIsOpen(false);
  };

  const handleNewProject = () => {
    const project = createProject('Untitled Project');
    setActiveProject(project.id);
    setIsOpen(false);
  };

  const startRename = (projectId: string, name: string) => {
    setRenamingId(projectId);
    setRenameDraft(name);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    const current = projects.find((p) => p.id === renamingId);
    if (name && current && name !== current.name) {
      updateProject(renamingId, { name });
    }
    setRenamingId(null);
  };

  return (
    <div ref={dropdownRef} className="relative" data-testid="project-dropdown">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Select project"
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md raised-control vx-switch',
          'type-ui',
          'transition duration-200',
          isOpen ? 'text-accent-primary' : 'text-text-primary'
        )}
        style={isOpen ? { boxShadow: OPEN_RING_SHADOW } : undefined}
      >
        <FolderOpen className="w-4 h-4 text-accent-primary" aria-hidden="true" />
        <span className="truncate max-w-[160px]">
          {activeProject ? activeProject.name : 'No Project'}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-text-muted transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown: a dialog, not a listbox, because each row also carries
          rename and delete controls (options cannot contain buttons). */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Project list"
          className={cn(
            'absolute top-full left-0 mt-1 w-72 z-[var(--z-dropdown)]',
            'raised-panel overflow-hidden',
            'animate-in fade-in slide-in-from-top-1 duration-150'
          )}
          style={{ borderRadius: 'var(--radius-overlay)' }}
        >
          {/* Project list */}
          <div className="max-h-[240px] overflow-y-auto">
            {projects.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <FolderOpen className="w-6 h-6 text-text-muted mx-auto mb-2" aria-hidden="true" />
                <p className="type-caption">
                  No projects yet
                </p>
              </div>
            ) : (
              <ul aria-label="Projects">
                {projects.map((project) => {
                  const isActive = project.id === activeProjectId;
                  const isRenaming = renamingId === project.id;
                  return (
                    <li
                      key={project.id}
                      className={cn(
                        'group flex items-center gap-1 pr-2',
                        isActive ? 'bg-accent-primary-muted' : 'hover:bg-surface'
                      )}
                    >
                      {isRenaming ? (
                        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5">
                          <FolderOpen className="w-4 h-4 flex-shrink-0 text-text-body" aria-hidden="true" />
                          <input
                            type="text"
                            value={renameDraft}
                            autoFocus
                            aria-label={`Rename ${project.name}`}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setRenamingId(null);
                              }
                            }}
                            className="recessed-well min-w-0 flex-1 px-2 py-1 type-ui text-text-primary"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-current={isActive ? 'true' : undefined}
                          onClick={() => handleSelectProject(project.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left',
                            'transition-colors duration-150',
                            'hover:text-text-primary focus-visible:bg-surface',
                            isActive ? 'text-accent-primary' : 'text-text-body'
                          )}
                        >
                          <FolderOpen className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className="type-ui truncate text-text-primary">
                              {project.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 type-caption">
                              <span>{project.scenes.length} scene{project.scenes.length !== 1 ? 's' : ''}</span>
                              <span className="h-3 w-px bg-border" aria-hidden="true" />
                              <span>{project.characters.length} character{project.characters.length !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          {isActive && (
                            <Led color="var(--color-accent-primary)" className="flex-shrink-0" />
                          )}
                        </button>
                      )}
                      {!isRenaming && (
                        <>
                          <button
                            type="button"
                            onClick={() => startRename(project.id, project.name)}
                            aria-label={`Rename ${project.name}`}
                            className="rounded-md p-1.5 text-text-muted opacity-0 transition hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(project.id)}
                            aria-label={`Delete ${project.name}`}
                            className="rounded-md p-1.5 text-text-muted opacity-0 transition hover:text-status-error focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* New project button */}
          <div className="border-t border-border px-2 py-2">
            <button
              onClick={handleNewProject}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md',
                'type-ui text-text-body',
                'transition-colors duration-150',
                'hover:bg-surface hover:text-text-primary',
              )}
            >
              <Plus className="w-4 h-4 text-accent-primary" aria-hidden="true" />
              New Project
            </button>
          </div>
        </div>
      )}

      {/* Outside the animated popup, whose transform would trap the fixed
          overlay; inside the dropdown root, so clicks do not close it. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : 'Delete project?'}
        message="The project, its scenes and characters are removed. Generated files stay in Assets. This cannot be undone."
        confirmLabel="Delete project"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) deleteProject(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
});
