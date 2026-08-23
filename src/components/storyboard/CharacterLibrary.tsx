import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { CharacterRefCard } from '@/components/storyboard/CharacterRefCard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Users, Plus } from 'lucide-react';
import type { CharacterRef, LockedFeature } from '@/types/project';

interface CharacterLibraryProps {
  projectId: string;
}

export function CharacterLibrary({ projectId }: CharacterLibraryProps) {
  const {
    projects,
    addCharacter,
    deleteCharacter,
    updateCharacter,
    activeSceneId,
    assignCharacterToScene,
    removeCharacterFromScene,
  } = useAppStore(
    useShallow((s) => ({
      projects: s.projects,
      addCharacter: s.addCharacter,
      deleteCharacter: s.deleteCharacter,
      updateCharacter: s.updateCharacter,
      activeSceneId: s.activeSceneId,
      assignCharacterToScene: s.assignCharacterToScene,
      removeCharacterFromScene: s.removeCharacterFromScene,
    }))
  );

  const [deleteTarget, setDeleteTarget] = useState<CharacterRef | null>(null);
  const project = projects.find((p) => p.id === projectId);

  // Count how many scenes reference each character
  const getSceneCount = useCallback(
    (charId: string) =>
      project?.scenes.filter((s) => s.characterRefs.includes(charId)).length ?? 0,
    [project?.scenes]
  );

  if (!project) return null;

  const characters = project.characters;
  const importedCharacterElementCount =
    project.elements?.filter((element) => element.type === 'character').length ?? 0;

  const handleToggleFeature = (charId: string, feature: LockedFeature) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;

    const isLocked = char.lockedFeatures.includes(feature);
    const updated = isLocked
      ? char.lockedFeatures.filter((f) => f !== feature)
      : [...char.lockedFeatures, feature];

    updateCharacter(projectId, charId, { lockedFeatures: updated });
  };

  const handleDeleteCharacter = () => {
    if (!deleteTarget) return;
    deleteCharacter(projectId, deleteTarget.id);
    setDeleteTarget(null);
  };

  const activeScene = project.scenes.find((s) => s.id === activeSceneId) ?? null;

  /**
   * A character card toggles that character on the scene currently being
   * worked on - the only assignment gesture the storyboard offers. Without an
   * active scene there is nothing to assign to, so the cards stay inert and
   * say so rather than pretending to act.
   */
  const handleCharacterClick = (charId: string) => {
    if (!activeScene) return;
    if (activeScene.characterRefs.includes(charId)) {
      removeCharacterFromScene(projectId, activeScene.id, charId);
    } else {
      assignCharacterToScene(projectId, activeScene.id, charId);
    }
  };

  const handleAddCharacter = () => {
    addCharacter(projectId, {
      name: `Character ${characters.length + 1}`,
      description: '',
      faceImages: [],
      bodyImages: [],
      styleImages: [],
      lockedFeatures: [],
      consistencyStrength: 0.85,
      color: '#e63946',
    });
  };

  return (
    <div className="flex flex-col border-t border-border">
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-text-muted" aria-hidden="true" />
          <h3 className="type-ui font-semibold text-text-primary">
            Characters
          </h3>
          {characters.length > 0 && (
            <span className="type-caption">
              {characters.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleAddCharacter}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </div>

      {characters.length > 0 && !activeScene ? (
        <div className="px-4 pb-2">
          <p className="type-caption text-text-body">
            Select a scene to assign characters to it.
          </p>
        </div>
      ) : null}

      {importedCharacterElementCount > 0 ? (
        <div className="px-4 pb-2">
          <p className="type-caption text-text-body">
            Imported character Elements now live above. Manual character refs stay available here for
            legacy consistency passes.
          </p>
        </div>
      ) : null}

      {/* Character list */}
      <div className="px-3 pb-3 space-y-1.5 max-h-[240px] overflow-y-auto">
        {characters.length === 0 ? (
          <div className="text-center py-4">
            <Users className="w-6 h-6 text-text-muted mx-auto mb-2" aria-hidden="true" />
            <p className="type-caption">
              No characters yet
            </p>
            <p className="type-caption mt-1">
              Add characters for cross-scene consistency
            </p>
          </div>
        ) : (
          characters.map((char) => (
            <CharacterRefCard
              key={char.id}
              character={char}
              isSelected={activeScene?.characterRefs.includes(char.id) ?? false}
              sceneCount={getSceneCount(char.id)}
              onClick={() => handleCharacterClick(char.id)}
              onDelete={() => setDeleteTarget(char)}
              onToggleFeature={(feature) => handleToggleFeature(char.id, feature)}
            />
          ))
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteCharacter}
        title="Delete Character"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This will remove it from all scenes.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
