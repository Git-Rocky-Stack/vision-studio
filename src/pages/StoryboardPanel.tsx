import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { SceneCard } from '@/components/storyboard/SceneCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Film, Plus, Trash2 } from 'lucide-react';
import type { Scene } from '@/types/project';

export function StoryboardPanel() {
  const {
    projects,
    activeProjectId,
    activeSceneId,
    setActiveScene,
    addScene,
    deleteScene,
    reorderScenes,
    createProject,
    setActiveProject,
  } = useAppStore();

  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !activeProject || active.id === over.id) return;

    const sceneIds = activeProject.scenes.map((s) => s.id);
    const oldIndex = sceneIds.indexOf(String(active.id));
    const newIndex = sceneIds.indexOf(String(over.id));

    const reordered = [...sceneIds];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, String(active.id));

    reorderScenes(activeProject.id, reordered);
  };

  const handleAddScene = () => {
    if (!activeProject) return;
    const scene = addScene(activeProject.id, { name: `Scene ${activeProject.scenes.length + 1}` });
    setActiveScene(scene.id);
  };

  const handleDeleteScene = () => {
    if (!deleteTarget || !activeProject) return;
    deleteScene(activeProject.id, deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleNewProject = () => {
    const project = createProject('Untitled Project');
    setActiveProject(project.id);
  };

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center mb-4">
          <Film className="w-8 h-8 text-text-muted" aria-hidden="true" />
        </div>
        <h2 className="font-display font-semibold text-lg text-text-primary mb-2">
          No Project Open
        </h2>
        <p className="text-sm text-text-muted font-display max-w-xs mb-6">
          Create a new project to start building your storyboard with scenes, characters, and AI-generated frames.
        </p>
        <Button variant="primary" onClick={handleNewProject}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          New Project
        </Button>
      </div>
    );
  }

  const sortedScenes = [...activeProject.scenes].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-red-primary" aria-hidden="true" />
          <h2 className="font-display font-semibold text-sm text-text-primary">
            {activeProject.name}
          </h2>
          <span className="text-micro text-text-muted font-display">
            {sortedScenes.length} scene{sortedScenes.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button variant="primary" size="sm" onClick={handleAddScene}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Scene
        </Button>
      </div>

      {/* Scene list */}
      {sortedScenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <div className="w-14 h-14 rounded-xl bg-elevated border border-border flex items-center justify-center mb-3">
            <Film className="w-6 h-6 text-text-muted" aria-hidden="true" />
          </div>
          <p className="text-sm text-text-muted font-display mb-4">
            No scenes yet. Add your first scene to start building your storyboard.
          </p>
          <Button variant="primary" size="sm" onClick={handleAddScene}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Scene
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedScenes.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="p-3 space-y-2">
                {sortedScenes.map((scene) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    isSelected={scene.id === activeSceneId}
                    onClick={() => setActiveScene(scene.id === activeSceneId ? null : scene.id)}
                    onDelete={() => setDeleteTarget(scene)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteScene}
        title="Delete Scene"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        icon={<Trash2 className="w-5 h-5" aria-hidden="true" />}
      />
    </div>
  );
}
