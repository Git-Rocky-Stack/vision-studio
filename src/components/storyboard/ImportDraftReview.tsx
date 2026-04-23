import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/utils/cn';
import type { Element, ImportDraft, ImportDraftElementCandidate, ImportDraftScene } from '@/types/project';
import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  Link2,
  RefreshCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface ImportDraftReviewProps {
  draft: ImportDraft;
  existingElements?: Pick<Element, 'id' | 'name' | 'type'>[];
  onChange: (draft: ImportDraft) => void;
  onApprove: (draft: ImportDraft) => void;
  onClose: () => void;
  onDiscard: () => void;
}

function issueStyles(severity: 'info' | 'warning' | 'error') {
  if (severity === 'error') {
    return 'border-status-error/30 bg-status-error-muted/50 text-text-primary';
  }

  if (severity === 'warning') {
    return 'border-accent-secondary/40 bg-accent-secondary/10 text-text-primary';
  }

  return 'border-border bg-surface text-text-body';
}

function sceneBorder(accepted: boolean) {
  return accepted
    ? 'border-border bg-surface/80'
    : 'border-border/60 bg-surface/30 opacity-70';
}

function elementTypeLabel(type: ImportDraftElementCandidate['type']) {
  switch (type) {
    case 'character':
      return 'Character';
    case 'location':
      return 'Location';
    case 'object':
      return 'Object';
    case 'style':
      return 'Style';
    default:
      return 'Element';
  }
}

export function ImportDraftReview({
  draft,
  existingElements = [],
  onChange,
  onApprove,
  onClose,
  onDiscard,
}: ImportDraftReviewProps) {
  const acceptedSceneCount = draft.sceneDrafts.filter((scene) => scene.accepted).length;
  const acceptedElementCount = draft.elementDrafts.filter((candidate) => candidate.accepted).length;
  const hasBlockingIssues = draft.issues.some((issue) => issue.severity === 'error');
  const canApprove = !hasBlockingIssues && acceptedSceneCount > 0;
  const existingElementMap = new Map(existingElements.map((element) => [element.id, element]));

  const updateScene = (sceneId: string, updates: Partial<ImportDraftScene>) => {
    onChange({
      ...draft,
      sceneDrafts: draft.sceneDrafts.map((sceneDraft) =>
        sceneDraft.id === sceneId
          ? {
              ...sceneDraft,
              ...updates,
              shotBeats: updates.shotBeats ?? sceneDraft.shotBeats,
              elementCandidateIds: updates.elementCandidateIds ?? sceneDraft.elementCandidateIds,
            }
          : sceneDraft,
      ),
    });
  };

  const updateElement = (
    elementId: string,
    updates: Partial<ImportDraftElementCandidate>,
  ) => {
    onChange({
      ...draft,
      elementDrafts: draft.elementDrafts.map((candidate) =>
        candidate.id === elementId ? { ...candidate, ...updates } : candidate,
      ),
    });
  };

  const removeElementLinkFromScene = (sceneId: string, elementId: string) => {
    const sceneDraft = draft.sceneDrafts.find((scene) => scene.id === sceneId);
    if (!sceneDraft) {
      return;
    }

    updateScene(sceneId, {
      elementCandidateIds: sceneDraft.elementCandidateIds.filter((candidateId) => candidateId !== elementId),
      shotBeats: sceneDraft.shotBeats.map((shotBeat) => ({
        ...shotBeat,
        elementIds: shotBeat.elementIds.filter((candidateId) => candidateId !== elementId),
        metadata: { ...shotBeat.metadata },
      })),
    });
  };

  return (
    <section
      className="border-b border-border bg-panel/60"
      data-testid="import-draft-review"
    >
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 type-caption text-text-muted">
              <FileStack className="h-3.5 w-3.5" />
              Import Review
            </p>
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 type-caption',
                draft.status === 'approved'
                  ? 'border-status-success/40 bg-status-success-muted/40 text-status-success'
                  : 'border-accent-primary/30 bg-accent-primary-muted/30 text-accent-primary',
              )}
            >
              {draft.status === 'approved' ? 'Ready' : 'Reviewing'}
            </span>
          </div>
          <h3 className="mt-3 type-section text-text-primary">{draft.title || 'Import Draft'}</h3>
          <p className="mt-1 text-sm text-text-body">
            Review the generated scenes and continuity candidates before the storyboard changes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close Review
          </Button>
          <Button variant="danger" size="sm" onClick={onDiscard}>
            <Trash2 className="h-4 w-4" />
            Discard Draft
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onApprove({ ...draft, status: 'approved' })}
            disabled={!canApprove}
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark Ready
          </Button>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border px-4 py-3 md:grid-cols-3">
        <SummaryCard label="Scenes" value={acceptedSceneCount} detail={`${draft.sceneDrafts.length} detected`} />
        <SummaryCard label="Elements" value={acceptedElementCount} detail={`${draft.elementDrafts.length} candidates`} />
        <SummaryCard label="Issues" value={draft.issues.length} detail={hasBlockingIssues ? 'Blocking review items present' : 'No blocking import errors'} />
      </div>

      {draft.issues.length > 0 ? (
        <div className="space-y-2 border-t border-border px-4 py-3">
          {draft.issues.map((issue) => (
            <div
              key={issue.id}
              className={cn('rounded-2xl border px-3 py-3 text-sm', issueStyles(issue.severity))}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="type-ui text-text-primary">{issue.code}</p>
                  <p className="mt-1 text-sm text-text-body">{issue.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 border-t border-border px-4 py-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-3">
          {draft.sceneDrafts.map((sceneDraft) => {
            const linkedCandidates = sceneDraft.elementCandidateIds
              .map((candidateId) => draft.elementDrafts.find((candidate) => candidate.id === candidateId))
              .filter((candidate): candidate is ImportDraftElementCandidate => Boolean(candidate));

            return (
              <article
                key={sceneDraft.id}
                className={cn('rounded-2xl border p-4 transition-colors', sceneBorder(sceneDraft.accepted))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="type-caption text-text-muted">
                      Scene {sceneDraft.orderIndex + 1}
                    </p>
                    <p className="mt-1 text-sm text-text-body">
                      {sceneDraft.shotBeats.length} beat{sceneDraft.shotBeats.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateScene(sceneDraft.id, { accepted: !sceneDraft.accepted })}
                  >
                    {sceneDraft.accepted ? (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="h-4 w-4" />
                        Restore
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <Input
                    label="Scene name"
                    value={sceneDraft.name}
                    onChange={(event) => updateScene(sceneDraft.id, { name: event.target.value })}
                    disabled={!sceneDraft.accepted}
                  />
                  <Input
                    label="Prompt seed"
                    value={sceneDraft.promptSeed}
                    onChange={(event) => updateScene(sceneDraft.id, { promptSeed: event.target.value })}
                    disabled={!sceneDraft.accepted}
                  />
                </div>

                <div className="mt-3">
                  <Textarea
                    label="Summary"
                    rows={3}
                    value={sceneDraft.summary}
                    onChange={(event) => updateScene(sceneDraft.id, { summary: event.target.value })}
                    disabled={!sceneDraft.accepted}
                  />
                </div>

                {linkedCandidates.length > 0 ? (
                  <div className="mt-4">
                    <p className="type-caption text-text-muted">Linked elements</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {linkedCandidates.map((candidate) => (
                        <span
                          key={`${sceneDraft.id}-${candidate.id}`}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
                            candidate.accepted
                              ? 'border-border bg-canvas text-text-body'
                              : 'border-border/60 bg-surface/40 text-text-muted',
                          )}
                        >
                          <Link2 className="h-3 w-3" />
                          {candidate.name}
                          {sceneDraft.accepted ? (
                            <button
                              type="button"
                              onClick={() => removeElementLinkFromScene(sceneDraft.id, candidate.id)}
                              className="text-text-muted transition hover:text-text-primary"
                              aria-label={`Remove ${candidate.name} from ${sceneDraft.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="space-y-3">
          {draft.elementDrafts.map((candidate) => {
            const mergeTarget = candidate.mergeTargetElementId
              ? existingElementMap.get(candidate.mergeTargetElementId) ?? null
              : null;

            return (
              <article
                key={candidate.id}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  candidate.accepted ? 'border-border bg-surface/80' : 'border-border/60 bg-surface/30 opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full border border-border bg-canvas px-2.5 py-1 type-caption text-text-muted">
                      {elementTypeLabel(candidate.type)}
                    </span>
                    {mergeTarget ? (
                      <p className="mt-2 text-sm text-text-body">
                        Suggested merge with existing {mergeTarget.type}: <span className="text-text-primary">{mergeTarget.name}</span>
                      </p>
                    ) : null}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateElement(candidate.id, { accepted: !candidate.accepted })}
                  >
                    {candidate.accepted ? (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Discard
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="h-4 w-4" />
                        Restore
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-4">
                  <Input
                    label="Element name"
                    value={candidate.name}
                    onChange={(event) => updateElement(candidate.id, { name: event.target.value })}
                    disabled={!candidate.accepted}
                  />
                </div>

                {candidate.description ? (
                  <p className="mt-3 text-sm leading-6 text-text-body">{candidate.description}</p>
                ) : null}

                {candidate.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidate.tags.map((tag) => (
                      <span
                        key={`${candidate.id}-${tag}`}
                        className="rounded-full border border-border bg-canvas px-2.5 py-1 type-caption text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}

          {draft.elementDrafts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-text-body">
              No reusable elements were detected. You can still approve the scene draft and add elements later.
            </div>
          ) : null}
        </div>
      </div>

      {!canApprove ? (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface/70 px-4 py-3 text-sm text-text-body">
            <Sparkles className="mt-0.5 h-4 w-4 text-accent-primary" />
            <div>
              {hasBlockingIssues
                ? 'Resolve the blocking review issues before marking this draft ready.'
                : 'Keep at least one accepted scene in the draft before marking it ready.'}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3">
      <p className="type-caption text-text-muted">{label}</p>
      <p className="mt-2 type-title text-text-primary">{value}</p>
      <p className="mt-1 text-sm text-text-body">{detail}</p>
    </div>
  );
}
