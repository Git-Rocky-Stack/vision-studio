import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { SceneCard } from '@/components/storyboard/SceneCard';
import { CharacterLibrary } from '@/components/storyboard/CharacterLibrary';
import { CharacterAssignmentChip } from '@/components/storyboard/CharacterAssignmentChip';
import { TransitionIndicator } from '@/components/storyboard/TransitionIndicator';
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
import { Film, Plus, Copy, Trash2 } from 'lucide-react';
import type { Scene } from '@/types/project';

export function StoryboardPanel() {
  const {
    projects,
    activeProjectId,
    activeSceneId,
    setActiveScene,
    addScene,
    deleteScene,
    duplicateScene,
    reorderScenes,
    createProject,
    setActiveProject,
    removeCharacterFromScene,
  } = useAppStore(useShallow(s => ({
    projects: s.projects,
    activeProjectId: s.activeProjectId,
    activeSceneId: s.activeSceneId,
    setActiveScene: s.setActiveScene,
    addScene: s.addScene,
    deleteScene: s.deleteScene,
    duplicateScene: s.duplicateScene,
    reorderScenes: s.reorderScenes,
    createProject: s.createProject,
    setActiveProject: s.setActiveProject,
    removeCharacterFromScene: s.removeCharacterFromScene,
  })));

  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null);
  const [contextMenuScene, setContextMenuScene] = useState<Scene | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!activeProject || !over || active.id === over.id) return;

    const sceneIds = activeProject.scenes.map((s) => s.id);
    const oldIndex = sceneIds.indexOf(String(active.id));
    const newIndex = sceneIds.indexOf(String(over.id));

    const reordered = [...sceneIds];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, String(active.id));

    reorderScenes(activeProject.id, reordered);
  };

  const handleMoveScene = (sceneId: string, offset: -1 | 1) => {
    if (!activeProject) return;

    const sortedScenes = [...activeProject.scenes].sort((a, b) => a.orderIndex - b.orderIndex);
    const oldIndex = sortedScenes.findIndex((scene) => scene.id === sceneId);
    const newIndex = oldIndex + offset;
    if (oldIndex < 0 || newIndex < 0 || newIndex >= sortedScenes.length) return;

    const reordered = sortedScenes.map((scene) => scene.id);
    const [movedSceneId] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, movedSceneId);
    reorderScenes(activeProject.id, reordered);
  };

  const handleAddScene = () => {
    if (!activeProject) return;
    const scene = addScene(activeProject.id, { name: `Scene ${activeProject.scenes.length + 1}` });
    setActiveScene(scene.id);
  };

  const handleDuplicateScene = (scene: Scene) => {
    if (!activeProject) return;
    const duplicated = duplicateScene(activeProject.id, scene.id);
    setActiveScene(duplicated.id);
    setContextMenuScene(null);
  };

  const handleDeleteScene = () => {
    if (!deleteTarget || !activeProject) return;
    deleteScene(activeProject.id, deleteTarget.id);
    if (activeSceneId === deleteTarget.id) {
      setActiveScene(null);
    }
    setDeleteTarget(null);
  };

  const handleNewProject = () => {
    const project = createProject('Untitled Project');
    setActiveProject(project.id);
  };

  const handleTransitionClick = (fromSceneId: string) => {
    // Future: open transition editor modal
    // For now, cycles through transition types as a quick edit
    if (!activeProject) return;
    const transitionTypes = ['cut', 'fade', 'dissolve', 'wipe-left', 'wipe-right', 'zoom'] as const;
    const scene = activeProject.scenes.find((s) => s.id === fromSceneId);
    if (!scene) return;
    const currentIndex = transitionTypes.indexOf(scene.transitions.type);
    const nextType = transitionTypes[(currentIndex + 1) % transitionTypes.length];
    useAppStore.getState().updateScene(activeProject.id, fromSceneId, {
      transitions: { ...scene.transitions, type: nextType },
    });
  };

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h1 className="sr-only">Storyboard</h1>
        <div className="w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center mb-4">
          <Film className="w-8 h-8 text-text-muted" aria-hidden="true" />
        </div>
        <h2 className="mb-2 type-title">
          No Project Open
        </h2>
        <p className="mb-6 max-w-xs type-caption">
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
      <h1 className="sr-only">Storyboard</h1>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-red-primary" aria-hidden="true" />
          <h2 className="type-section">
            {activeProject.name}
          </h2>
          <span className="type-caption">
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
          <p className="mb-4 type-caption">
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
              <div className="p-3 space-y-1">
                {sortedScenes.map((scene, index) => {
                  const sceneCharacters = activeProject.characters.filter((c) =>
                    scene.characterRefs.includes(c.id)
                  );

                  return (
                    <div key={scene.id}>
                      <SceneCard
                        scene={scene}
                        isSelected={scene.id === activeSceneId}
                        onClick={() => setActiveScene(scene.id === activeSceneId ? null : scene.id)}
                        onDelete={() => setDeleteTarget(scene)}
                        onDuplicate={() => handleDuplicateScene(scene)}
                        onMoveUp={() => handleMoveScene(scene.id, -1)}
                        onMoveDown={() => handleMoveScene(scene.id, 1)}
                        canMoveUp={index > 0}
                        canMoveDown={index < sortedScenes.length - 1}
                      />

                      {/* Character assignment chips */}
                      {sceneCharacters.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 pl-9">
                          {sceneCharacters.map((char) => (
                            <CharacterAssignmentChip
                              key={char.id}
                              name={char.name}
                              color={char.color}
                              lockedFeatures={char.lockedFeatures}
                              onRemove={() =>
                                removeCharacterFromScene(activeProject.id, scene.id, char.id)
                              }
                            />
                          ))}
                        </div>
                      )}

                      {/* Transition indicator between scenes */}
                      {index < sortedScenes.length - 1 && (
                        <TransitionIndicator
                          type={scene.transitions.type}
                          duration={scene.transitions.duration}
                          onClick={() => handleTransitionClick(scene.id)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Character Library */}
      <CharacterLibrary projectId={activeProject.id} />

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
