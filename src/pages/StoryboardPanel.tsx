import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import { SceneCard } from '@/components/storyboard/SceneCard';
import { CharacterLibrary } from '@/components/storyboard/CharacterLibrary';
import { SceneCameraPanel } from '@/components/storyboard/SceneCameraPanel';
import { ElementLibrary } from '@/components/storyboard/ElementLibrary';
import { CharacterAssignmentChip } from '@/components/storyboard/CharacterAssignmentChip';
import { TransitionPicker } from '@/components/storyboard/TransitionPicker';
import { ScriptImportDialog } from '@/components/storyboard/ScriptImportDialog';
import { ImportDraftReview } from '@/components/storyboard/ImportDraftReview';
import { ReferenceMediaPanel } from '@/components/reference/ReferenceMediaPanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Led } from '@/components/hardware';
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
import type { ElementType, ImportDraft, Scene, SceneTransition } from '@/types/project';

interface TimelineBuildFeedback {
  scope: 'project' | 'scene';
  scopeLabel: string;
  title: string;
  summary: string;
  tone: 'success' | 'warning';
  sequenceId: string | null;
}

interface SceneElementChip {
  id: string;
  name: string;
  type: ElementType;
  color: string;
  sceneCount: number;
}

/** Shared fallback, so a scene with no linked elements keeps a stable prop. */
const NO_SCENE_ELEMENTS: readonly SceneElementChip[] = [];

function sameChips(left: readonly SceneElementChip[], right: readonly SceneElementChip[]) {
  return (
    left.length === right.length &&
    left.every((chip, index) => {
      const other = right[index];
      return (
        chip.id === other.id &&
        chip.name === other.name &&
        chip.type === other.type &&
        chip.color === other.color &&
        chip.sceneCount === other.sceneCount
      );
    })
  );
}

/**
 * The scene-card callbacks read the active project from the store when they
 * run instead of closing over it, so they never change identity and the
 * memoised SceneCard rows skip re-rendering when an unrelated scene changes.
 */
function getActiveProjectSnapshot() {
  const state = useAppStore.getState();
  return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
}

function buildTimelineFeedback(
  scope: TimelineBuildFeedback['scope'],
  scopeLabel: string,
  result: StoryboardTimelineDerivationResult | null,
): TimelineBuildFeedback {
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
    updateScene,
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
    syncStoryboardTransitions,
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
    updateScene: s.updateScene,
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
    syncStoryboardTransitions: s.syncStoryboardTransitions,
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
  // Chip arrays are reused from the previous render while their content is
  // unchanged, so editing one scene does not hand every card a fresh array.
  const previousChipsRef = useRef(new Map<string, readonly SceneElementChip[]>());
  const sceneElementChips = useMemo(() => {
    const next = new Map<string, readonly SceneElementChip[]>();
    if (!activeProject) {
      previousChipsRef.current = next;
      return next;
    }

    const elements = activeProject.elements ?? [];
    const sceneCountByElementId = new Map(
      elements.map((element) => [
        element.id,
        activeProject.scenes.filter((scene) => scene.elementIds?.includes(element.id)).length,
      ]),
    );

    for (const scene of activeProject.scenes) {
      const chips = (scene.elementIds ?? [])
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
        .filter((element): element is SceneElementChip => Boolean(element));
      if (chips.length === 0) continue;
      const previous = previousChipsRef.current.get(scene.id);
      next.set(scene.id, previous && sameChips(previous, chips) ? previous : chips);
    }

    previousChipsRef.current = next;
    return next;
  }, [activeProject]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A newly active import draft (by id) opens its review once.
  const activeImportDraftId = activeImportDraft?.id ?? null;
  useEffect(() => {
    if (activeImportDraftId) {
      setIsImportReviewOpen(true);
    }
  }, [activeImportDraftId]);

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

  const handleMoveScene = useCallback(
    (sceneId: string, offset: -1 | 1) => {
      const project = getActiveProjectSnapshot();
      if (!project) return;

      const ordered = [...project.scenes].sort((a, b) => a.orderIndex - b.orderIndex);
      const oldIndex = ordered.findIndex((scene) => scene.id === sceneId);
      const newIndex = oldIndex + offset;
      if (oldIndex < 0 || newIndex < 0 || newIndex >= ordered.length) return;

      const reordered = ordered.map((scene) => scene.id);
      const [movedSceneId] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, movedSceneId);
      reorderScenes(project.id, reordered);
    },
    [reorderScenes],
  );
  const handleMoveSceneUp = useCallback((sceneId: string) => handleMoveScene(sceneId, -1), [handleMoveScene]);
  const handleMoveSceneDown = useCallback((sceneId: string) => handleMoveScene(sceneId, 1), [handleMoveScene]);

  const handleSelectScene = useCallback(
    (sceneId: string) => {
      setActiveScene(useAppStore.getState().activeSceneId === sceneId ? null : sceneId);
    },
    [setActiveScene],
  );

  const handleRequestDeleteScene = useCallback((sceneId: string) => {
    const scene = getActiveProjectSnapshot()?.scenes.find((item) => item.id === sceneId) ?? null;
    if (scene) setDeleteTarget(scene);
  }, []);

  const handleAddScene = () => {
    if (!activeProject) return;
    const scene = addScene(activeProject.id, { name: `Scene ${activeProject.scenes.length + 1}` });
    setActiveScene(scene.id);
  };

  const handleDuplicateScene = useCallback(
    (sceneId: string) => {
      const project = getActiveProjectSnapshot();
      if (!project) return;
      const duplicated = duplicateScene(project.id, sceneId);
      if (duplicated) {
        setActiveScene(duplicated.id);
      }
    },
    [duplicateScene, setActiveScene],
  );

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

  const handleTransitionChange = useCallback(
    (fromSceneId: string, transitions: SceneTransition) => {
      const project = getActiveProjectSnapshot();
      if (!project) return;
      updateScene(project.id, fromSceneId, { transitions });
      // A scene already on the timeline follows its new transition at once.
      syncStoryboardTransitions(project.id, { sceneIds: [fromSceneId] });
    },
    [updateScene, syncStoryboardTransitions],
  );

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

  const handleOpenTimeline = (sequenceId: string | null) => {
    if (!sequenceId) {
      return;
    }

    setActiveTimelineSequence(sequenceId);
    setActiveTab('generate');
    setActiveSubMode('generate');
    setCenterView('canvas');
  };

  const handleBuildTimeline = useCallback(
    (scope: TimelineBuildFeedback['scope'], scopeLabel: string, sceneIds?: string[]) => {
      const project = getActiveProjectSnapshot();
      if (!project) {
        return;
      }

      const result = deriveStoryboardTimeline(
        project.id,
        sceneIds && sceneIds.length > 0 ? { sceneIds } : undefined,
      );
      const feedback = buildTimelineFeedback(scope, scopeLabel, result);

      // The derivation carries each scene's transition onto its clips itself.
      if (result?.sequenceId) {
        setActiveTimelineSequence(result.sequenceId);
      }

      setTimelineBuildFeedback(feedback);
    },
    [deriveStoryboardTimeline, setActiveTimelineSequence],
  );

  const handleSendSceneToTimeline = useCallback(
    (sceneId: string) => {
      const scene = getActiveProjectSnapshot()?.scenes.find((item) => item.id === sceneId);
      if (scene) handleBuildTimeline('scene', scene.name, [scene.id]);
    },
    [handleBuildTimeline],
  );

  if (!activeProject) {
    return (
      <>
        <h1 className="sr-only">Storyboard</h1>
        <EmptyState
          icon={Film}
          title="No Project Open"
          titleAs="h2"
          description="Create a new project to start building your storyboard with scenes, characters, and AI-generated frames."
        >
          <Button variant="primary" size="sm" icon={Plus} onClick={handleNewProject}>
            New Project
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <h1 className="sr-only">Storyboard</h1>
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="raised-control flex h-8 w-8 flex-shrink-0 items-center justify-center text-accent-primary">
            <Film className="w-4 h-4" aria-hidden="true" />
          </div>
          <h2 className="min-w-0 truncate type-section text-text-primary">
            {activeProject.name}
          </h2>
          <span className="type-caption">
            {sortedScenes.length} scene{sortedScenes.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-col gap-3 rounded-md border border-border bg-surface/70 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Led color={activeImportDraft.status === 'approved' ? 'play' : 'cue'} size={7} />
                <p className="type-caption text-text-muted">
                  {activeImportDraft.status === 'approved' ? 'Draft Ready' : 'Draft In Review'}
                </p>
              </div>
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
              'flex flex-col gap-3 rounded-md border px-4 py-4 md:flex-row md:items-center md:justify-between',
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
        <div className="flex min-h-0 flex-[3] flex-col items-center justify-center overflow-y-auto p-8 text-center">
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
        <div className="min-h-0 flex-[3] overflow-y-auto">
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
                        linkedElements={sceneElementChips.get(scene.id) ?? NO_SCENE_ELEMENTS}
                        isSelected={scene.id === activeSceneId}
                        onClick={handleSelectScene}
                        onDelete={handleRequestDeleteScene}
                        onDuplicate={handleDuplicateScene}
                        onSendToTimeline={handleSendSceneToTimeline}
                        onMoveUp={handleMoveSceneUp}
                        onMoveDown={handleMoveSceneDown}
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
                        <TransitionPicker
                          sceneId={scene.id}
                          sceneName={scene.name}
                          transition={scene.transitions}
                          onChange={handleTransitionChange}
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

      {/* References and the element and character libraries are secondary to the
          scene list, so they share one scroller under it. Each used to claim a
          fixed height, which left the scenes a single row. */}
      <div className="min-h-0 flex-[2] overflow-y-auto border-t border-border">
        <div className="space-y-3 bg-panel/40 px-3 py-3">
          <ReferenceMediaPanel
            testId="storyboard-project-reference-panel"
            title={`${activeProject.name} Board References`}
            description="Keep shared style, character, and composition guides visible while you sequence the board."
            scope="project"
            projectId={activeProject.id}
          />

          {activeScene ? (
            <>
              <ReferenceMediaPanel
                testId="storyboard-scene-reference-panel"
                title={`${activeScene.name} Scene References`}
                description="Attach shot-specific references to the currently selected scene."
                scope="scene"
                projectId={activeProject.id}
                sceneId={activeScene.id}
              />
              <SceneCameraPanel projectId={activeProject.id} sceneId={activeScene.id} />
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border px-4 py-4 text-center">
              <p className="text-sm text-text-body">
                Select a scene to attach shot-specific references.
              </p>
            </div>
          )}
        </div>

        <ElementLibrary projectId={activeProject.id} />

        {/* Character Library */}
        <CharacterLibrary projectId={activeProject.id} />
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteScene}
        title="Delete Scene"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
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
