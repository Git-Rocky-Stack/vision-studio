import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { CharacterRefCard } from '@/components/storyboard/CharacterRefCard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/utils/cn';
import { Users, Plus, Trash2 } from 'lucide-react';
import type { CharacterRef, LockedFeature } from '@/types/project';

interface CharacterLibraryProps {
  projectId: string;
}

export function CharacterLibrary({ projectId }: CharacterLibraryProps) {
  const { projects, deleteCharacter, updateCharacter } = useAppStore(
    useShallow((s) => ({ projects: s.projects, deleteCharacter: s.deleteCharacter, updateCharacter: s.updateCharacter }))
  );

  const [deleteTarget, setDeleteTarget] = useState<CharacterRef | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  const characters = project.characters;

  // Count how many scenes reference each character
  const getSceneCount = useCallback(
    (charId: string) =>
      project.scenes.filter((s) => s.characterRefs.includes(charId)).length,
    [project.scenes]
  );

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

  const handleAddCharacter = () => {
    setIsAdding(true);
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
              isSelected={false}
              sceneCount={getSceneCount(char.id)}
              onClick={() => {}}
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
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This will remove it from all scenes.`
            : ''
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        icon={<Trash2 className="w-5 h-5" aria-hidden="true" />}
      />
    </div>
  );
}
