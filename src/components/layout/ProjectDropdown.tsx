import { memo, useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { ChevronDown, FolderOpen, Plus } from 'lucide-react';

export const ProjectDropdown = memo(function ProjectDropdown() {
  const {
    projects,
    activeProjectId,
    setActiveProject,
    createProject,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

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

  // Close dropdown on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSelectProject = (projectId: string) => {
    setActiveProject(projectId);
    setIsOpen(false);
  };

  const handleNewProject = () => {
    const project = createProject('Untitled Project');
    setActiveProject(project.id);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative" data-testid="project-dropdown">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select project"
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md',
          'bg-elevated border border-border',
          'type-ui text-text-primary',
          'transition-all duration-200',
          'hover:border-accent-primary-border hover:bg-surface',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
          isOpen && 'border-accent-primary-border bg-accent-primary-muted'
        )}
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

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Project list"
          className={cn(
            'absolute top-full left-0 mt-1 w-64 z-dropdown',
            'bg-elevated border border-border rounded-md shadow-xl',
            'overflow-hidden',
            'animate-in fade-in slide-in-from-top-1 duration-150'
          )}
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
              projects.map((project) => (
                <button
                  key={project.id}
                  role="option"
                  aria-selected={project.id === activeProjectId}
                  onClick={() => handleSelectProject(project.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left',
                    'transition-colors duration-150',
                    'hover:bg-surface hover:text-text-primary',
                    'focus:outline-none focus-visible:bg-surface',
                    project.id === activeProjectId
                      ? 'bg-accent-primary-muted text-accent-primary'
                      : 'text-text-body'
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
                  {project.id === activeProjectId && (
                    <div className="w-2 h-2 rounded-full bg-accent-primary flex-shrink-0" aria-hidden="true" />
                  )}
                </button>
              ))
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
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary'
              )}
            >
              <Plus className="w-4 h-4 text-accent-primary" aria-hidden="true" />
              New Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
