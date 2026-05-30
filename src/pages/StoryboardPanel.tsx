import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { SceneCard } from '@/components/storyboard/SceneCard';
import { CharacterLibrary } from '@/components/storyboard/CharacterLibrary';
import { ElementLibrary } from '@/components/storyboard/ElementLibrary';
import { CharacterAssignmentChip } from '@/components/storyboard/CharacterAssignmentChip';
import { TransitionIndicator } from '@/components/storyboard/TransitionIndicator';
import { ScriptImportDialog } from '@/components/storyboard/ScriptImportDialog';
import { ImportDraftReview } from '@/components/storyboard/ImportDraftReview';
import { ReferenceMediaPanel } from '@/components/reference/ReferenceMediaPanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import type { StoryboardTimelineDerivationResult } from '@/store/appStore.types';
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
import { ArrowRight, CheckCircle2, Clapperboard, Film, FileText, Plus, Trash2 } from 'lucide-react';
import type { ElementType, ImportDraft, Scene } from '@/types/project';

interface TimelineBuildFeedback {
  scope: 'project' | 'scene';
  scopeLabel: string;
  title: string;
  summary: string;
  tone: 'success' | 'warning';
  sequenceId: string | null;
}

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
    storyboardImportDrafts,
    activeStoryboardImportDraftId,
    createStoryboardImportDraftFromText,
    commitStoryboardImportDraft,
    upsertStoryboardImportDraft,
    deleteStoryboardImportDraft,
    setActiveStoryboardImportDraft,
    deriveStoryboardTimeline,
    setActiveTimelineSequence,
    setActiveTab,
    setActiveSubMode,
    setCenterView,
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
    storyboardImportDrafts: s.storyboardImportDrafts,
    activeStoryboardImportDraftId: s.activeStoryboardImportDraftId,
    createStoryboardImportDraftFromText: s.createStoryboardImportDraftFromText,
    commitStoryboardImportDraft: s.commitStoryboardImportDraft,
    upsertStoryboardImportDraft: s.upsertStoryboardImportDraft,
    deleteStoryboardImportDraft: s.deleteStoryboardImportDraft,
    setActiveStoryboardImportDraft: s.setActiveStoryboardImportDraft,
    deriveStoryboardTimeline: s.deriveStoryboardTimeline,
    setActiveTimelineSequence: s.setActiveTimelineSequence,
    setActiveTab: s.setActiveTab,
    setActiveSubMode: s.setActiveSubMode,
    setCenterView: s.setCenterView,
  })));

  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImportReviewOpen, setIsImportReviewOpen] = useState(false);
  const [timelineBuildFeedback, setTimelineBuildFeedback] = useState<TimelineBuildFeedback | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const activeScene = activeProject?.scenes.find((scene) => scene.id === activeSceneId) ?? null;
  const sortedScenes = activeProject ? [...activeProject.scenes].sort((a, b) => a.orderIndex - b.orderIndex) : [];
  const activeImportDraft = useMemo(
    () =>
      storyboardImportDrafts.find((draft) => draft.id === activeStoryboardImportDraftId) ?? null,
    [activeStoryboardImportDraftId, storyboardImportDrafts],
  );
  const sceneElementChips = useMemo(() => {
    if (!activeProject) {
      return new Map<
        string,
        Array<{
          id: string;
          name: string;
          type: ElementType;
          color: string;
          sceneCount: number;
        }>
      >();
    }

    const elements = activeProject.elements ?? [];
    const sceneCountByElementId = new Map(
      elements.map((element) => [
        element.id,
        activeProject.scenes.filter((scene) => scene.elementIds?.includes(element.id)).length,
      ]),
    );

    return new Map(
      activeProject.scenes.map((scene) => [
        scene.id,
        (scene.elementIds ?? [])
          .map((elementId) => {
            const element = elements.find((item) => item.id === elementId);
            if (!element) {
              return null;
            }

            return {
              id: element.id,
              name: element.name,
              type: element.type,
              color: element.color,
              sceneCount: sceneCountByElementId.get(element.id) ?? 0,
            };
          })
          .filter(
            (
              element,
            ): element is {
              id: string;
              name: string;
              type: ElementType;
              color: string;
              sceneCount: number;
            } => Boolean(element),
          ),
      ]),
    );
  }, [activeProject]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (activeImportDraft) {
      setIsImportReviewOpen(true);
    }
  }, [activeImportDraft?.id]);

  useEffect(() => {
    setTimelineBuildFeedback(null);
  }, [activeProjectId]);

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

  const persistImportDraft = (draft: ImportDraft, status: ImportDraft['status']) => {
    upsertStoryboardImportDraft({
      ...draft,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleGenerateImportDraft = async ({
    title,
    sourceText,
  }: {
    title?: string;
    sourceText: string;
  }) => {
    if (!activeProject) {
      return;
    }

    const draft = createStoryboardImportDraftFromText(activeProject.id, sourceText, { title });
    if (!draft) {
      return;
    }

    setActiveStoryboardImportDraft(draft.id);
    setIsImportDialogOpen(false);
    setIsImportReviewOpen(true);
  };

  const handleImportDraftChange = (draft: ImportDraft) => {
    persistImportDraft(draft, draft.status === 'approved' ? 'reviewing' : draft.status);
  };

  const handleApproveImportDraft = (draft: ImportDraft) => {
    persistImportDraft(draft, 'approved');
    commitStoryboardImportDraft(draft.id);
    setIsImportReviewOpen(false);
  };

  const handleCommitDraftFromBanner = () => {
    if (!activeImportDraft) {
      return;
    }

    commitStoryboardImportDraft(activeImportDraft.id);
    setIsImportReviewOpen(false);
  };

  const handleDiscardImportDraft = () => {
    if (!activeImportDraft) {
      return;
    }

    deleteStoryboardImportDraft(activeImportDraft.id);
    setIsImportReviewOpen(false);
  };

  const buildTimelineFeedback = (
    scope: TimelineBuildFeedback['scope'],
    scopeLabel: string,
    result: StoryboardTimelineDerivationResult | null,
  ): TimelineBuildFeedback => {
    if (!result) {
      return {
        scope,
        scopeLabel,
        title: scope === 'scene' ? 'Scene not ready for timeline' : 'No storyboard scenes ready',
        summary:
          scope === 'scene'
            ? 'This scene does not have any derivable storyboard output yet.'
            : 'There were no storyboard scenes with derivable output or placeholder state to send.',
        tone: 'warning',
        sequenceId: null,
      };
    }

    const unchanged = result.skipped;
    const parts = [
      `${result.added} added`,
      `${result.updated} updated`,
      `${unchanged} unchanged`,
    ];

    if (result.placeholders > 0) {
      parts.push(`${result.placeholders} placeholder${result.placeholders === 1 ? '' : 's'}`);
    }

    const nothingChanged = result.added === 0 && result.updated === 0;

    return {
      scope,
      scopeLabel,
      title:
        scope === 'scene'
          ? (nothingChanged ? 'Scene already on timeline' : 'Scene sent to timeline')
          : (nothingChanged ? 'Timeline already up to date' : 'Timeline updated'),
      summary: parts.join(', '),
      tone: result.placeholders > 0 ? 'warning' : 'success',
      sequenceId: result.sequenceId,
    };
  };

  const handleOpenTimeline = (sequenceId: string | null) => {
    if (!sequenceId) {
      return;
    }

    setActiveTimelineSequence(sequenceId);
    setActiveTab('generate');
    setActiveSubMode('generate');
    setCenterView('canvas');
  };

  const handleBuildTimeline = (scope: TimelineBuildFeedback['scope'], scopeLabel: string, sceneIds?: string[]) => {
    if (!activeProject) {
      return;
    }

    const result = deriveStoryboardTimeline(
      activeProject.id,
      sceneIds && sceneIds.length > 0 ? { sceneIds } : undefined,
    );
    const feedback = buildTimelineFeedback(scope, scopeLabel, result);

    if (result?.sequenceId) {
      setActiveTimelineSequence(result.sequenceId);
    }

    setTimelineBuildFeedback(feedback);
  };

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h1 className="sr-only">Storyboard</h1>
        <div className="w-16 h-16 recessed-well flex items-center justify-center mb-4">
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
        <div className="flex items-center gap-2">
          {activeImportDraft ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsImportReviewOpen(true)}
            >
              <FileText className="w-4 h-4" aria-hidden="true" />
              {activeImportDraft.status === 'approved' ? 'Review Draft' : 'Resume Review'}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setIsImportDialogOpen(true)}>
            <FileText className="w-4 h-4" aria-hidden="true" />
            Import Script
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBuildTimeline('project', activeProject.name)}
            disabled={sortedScenes.length === 0}
          >
            <Clapperboard className="w-4 h-4" aria-hidden="true" />
            Build Timeline
          </Button>
          <Button variant="primary" size="sm" onClick={handleAddScene}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Scene
          </Button>
        </div>
      </div>

      {activeImportDraft && !isImportReviewOpen ? (
        <div className="border-b border-border bg-panel/50 px-4 py-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/70 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="type-caption text-text-muted">
                {activeImportDraft.status === 'approved' ? 'Draft Ready' : 'Draft In Review'}
              </p>
              <h3 className="mt-1 type-section text-text-primary">{activeImportDraft.title}</h3>
              <p className="mt-1 text-sm text-text-body">
                {activeImportDraft.sceneDrafts.filter((scene) => scene.accepted).length} accepted scenes and{' '}
                {activeImportDraft.elementDrafts.filter((candidate) => candidate.accepted).length} accepted elements are staged for review.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeImportDraft.status === 'approved' ? (
                <Button variant="primary" size="sm" onClick={handleCommitDraftFromBanner}>
                  Commit Draft
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setIsImportReviewOpen(true)}>
                {activeImportDraft.status === 'approved' ? 'Review Approved Draft' : 'Review Draft'}
              </Button>
              <Button variant="danger" size="sm" onClick={handleDiscardImportDraft}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Discard Draft
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {timelineBuildFeedback ? (
        <div className="border-b border-border bg-panel/40 px-4 py-3" role="status" aria-live="polite">
          <div
            data-testid="storyboard-timeline-feedback"
            className={[
              'flex flex-col gap-3 rounded-2xl border px-4 py-4 md:flex-row md:items-center md:justify-between',
              timelineBuildFeedback.tone === 'success'
                ? 'border-status-success-border bg-status-success-muted/40'
                : 'border-status-warning-border bg-status-warning-muted/40',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <div
                className={[
                  'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border',
                  timelineBuildFeedback.tone === 'success'
                    ? 'border-status-success-border bg-status-success-muted text-status-success'
                    : 'border-status-warning-border bg-status-warning-muted text-status-warning',
                ].join(' ')}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="type-caption text-text-muted">
                  {timelineBuildFeedback.scope === 'scene' ? 'Send To Timeline' : 'Build Timeline'}
                </p>
                <h3 className="mt-1 type-section text-text-primary">{timelineBuildFeedback.title}</h3>
                <p className="mt-1 text-sm text-text-body">
                  {timelineBuildFeedback.scopeLabel}: {timelineBuildFeedback.summary}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {timelineBuildFeedback.sequenceId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenTimeline(timelineBuildFeedback.sequenceId)}
                >
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  Open Timeline
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setTimelineBuildFeedback(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {activeImportDraft && isImportReviewOpen ? (
        <ImportDraftReview
          draft={activeImportDraft}
          existingElements={activeProject.elements ?? []}
          onChange={handleImportDraftChange}
          onApprove={handleApproveImportDraft}
          onClose={() => setIsImportReviewOpen(false)}
          onDiscard={handleDiscardImportDraft}
        />
      ) : null}

      {/* Scene list */}
      {sortedScenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <div className="w-14 h-14 recessed-well flex items-center justify-center mb-3">
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
                        linkedElements={sceneElementChips.get(scene.id) ?? []}
                        isSelected={scene.id === activeSceneId}
                        onClick={() => setActiveScene(scene.id === activeSceneId ? null : scene.id)}
                        onDelete={() => setDeleteTarget(scene)}
                        onDuplicate={() => handleDuplicateScene(scene)}
                        onSendToTimeline={() => handleBuildTimeline('scene', scene.name, [scene.id])}
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

      <div className="shrink-0 border-t border-border bg-panel/40 px-3 py-3">
        <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
          <ReferenceMediaPanel
            testId="storyboard-project-reference-panel"
            title={`${activeProject.name} Board References`}
            description="Keep shared style, character, and composition guides visible while you sequence the board."
            scope="project"
            projectId={activeProject.id}
          />

          {activeScene ? (
            <ReferenceMediaPanel
              testId="storyboard-scene-reference-panel"
              title={`${activeScene.name} Scene References`}
              description="Attach shot-specific references to the currently selected scene."
              scope="scene"
              projectId={activeProject.id}
              sceneId={activeScene.id}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-4 text-center">
              <p className="text-sm text-text-body">
                Select a scene to attach shot-specific references.
              </p>
            </div>
          )}
        </div>
      </div>

      <ElementLibrary projectId={activeProject.id} />

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

      <ScriptImportDialog
        open={isImportDialogOpen}
        projectName={activeProject.name}
        onClose={() => setIsImportDialogOpen(false)}
        onGenerate={handleGenerateImportDraft}
      />
    </div>
  );
}
