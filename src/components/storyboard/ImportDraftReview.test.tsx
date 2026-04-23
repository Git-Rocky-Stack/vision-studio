import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import type { ImportDraft } from '@/types/project';
import { ImportDraftReview } from './ImportDraftReview';

afterEach(() => {
  cleanup();
});

function makeDraft(): ImportDraft {
  return {
    id: 'draft-1',
    projectId: 'project-1',
    title: 'Opening Sequence',
    sourceText: 'INT. CONTROL ROOM - NIGHT',
    status: 'reviewing',
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    metadata: {},
    issues: [],
    elementDrafts: [
      {
        id: 'element-draft-character-1',
        type: 'character',
        name: 'Captain Nova',
        aliases: [],
        description: 'Lead pilot.',
        tags: ['character'],
        continuityNotes: '',
        referenceSetIds: [],
        heroMediaAssetId: null,
        color: '#e63946',
        mergeTargetElementId: 'existing-character-1',
        accepted: true,
        metadata: {},
      },
    ],
    sceneDrafts: [
      {
        id: 'scene-draft-1',
        name: 'Control Room',
        summary: 'A tense opening.',
        promptSeed: 'control room at night',
        notes: '',
        orderIndex: 0,
        elementCandidateIds: ['element-draft-character-1'],
        shotBeats: [
          {
            id: 'beat-1',
            summary: 'Captain Nova scans the console.',
            promptSeed: 'Captain Nova scans the console.',
            notes: '',
            orderIndex: 0,
            durationMs: null,
            elementIds: ['element-draft-character-1'],
            metadata: {},
          },
        ],
        accepted: true,
        metadata: {},
      },
    ],
  };
}

function ImportDraftReviewHarness({
  onChangeSpy = vi.fn(),
  onApprove = vi.fn(),
}: {
  onChangeSpy?: ReturnType<typeof vi.fn>;
  onApprove?: ReturnType<typeof vi.fn>;
}) {
  const [draft, setDraft] = useState(makeDraft());

  return (
    <ImportDraftReview
      draft={draft}
      existingElements={[{ id: 'existing-character-1', type: 'character', name: 'Captain Nova' }]}
      onChange={(nextDraft) => {
        onChangeSpy(nextDraft);
        setDraft(nextDraft);
      }}
      onApprove={onApprove}
      onClose={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
}

describe('ImportDraftReview', () => {
  it('renders draft counts and issues', () => {
    render(
      <ImportDraftReview
        draft={{
          ...makeDraft(),
          issues: [
            {
              id: 'issue-1',
              severity: 'warning',
              code: 'fallback-scene-segmentation',
              message: 'Paragraph fallback was used.',
            },
          ],
        }}
        existingElements={[{ id: 'existing-character-1', type: 'character', name: 'Captain Nova' }]}
        onChange={vi.fn()}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText('Opening Sequence')).toBeInTheDocument();
    expect(screen.getByText('fallback-scene-segmentation')).toBeInTheDocument();
    expect(screen.getByText('Paragraph fallback was used.')).toBeInTheDocument();
    expect(screen.getByText('Suggested merge with existing character:')).toBeInTheDocument();
  });

  it('emits draft updates when scenes or linked elements change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ImportDraftReviewHarness onChangeSpy={onChange} />);

    const review = within(screen.getByTestId('import-draft-review'));
    const sceneNameInput = review.getByLabelText('Scene name');
    await user.clear(sceneNameInput);
    await user.type(sceneNameInput, 'Bridge');

    expect(sceneNameInput).toHaveValue('Bridge');

    const lastRenameCall = onChange.mock.calls.at(-1)?.[0] as ImportDraft;
    expect(lastRenameCall.sceneDrafts[0].name).toBe('Bridge');

    await user.click(review.getByLabelText('Remove Captain Nova from Bridge'));

    const lastLinkCall = onChange.mock.calls.at(-1)?.[0] as ImportDraft;
    expect(lastLinkCall.sceneDrafts[0].elementCandidateIds).toEqual([]);
    expect(lastLinkCall.sceneDrafts[0].shotBeats[0].elementIds).toEqual([]);

    await user.click(review.getByRole('button', { name: /^discard$/i }));

    const lastDiscardCall = onChange.mock.calls.at(-1)?.[0] as ImportDraft;
    expect(lastDiscardCall.elementDrafts[0].accepted).toBe(false);
  });

  it('approves review-ready drafts and blocks approval when errors remain', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    const { rerender } = render(
      <ImportDraftReview
        draft={makeDraft()}
        existingElements={[{ id: 'existing-character-1', type: 'character', name: 'Captain Nova' }]}
        onChange={vi.fn()}
        onApprove={onApprove}
        onClose={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    await user.click(within(screen.getByTestId('import-draft-review')).getByRole('button', { name: /mark ready/i }));
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));

    rerender(
      <ImportDraftReview
        draft={{
          ...makeDraft(),
          issues: [
            {
              id: 'issue-1',
              severity: 'error',
              code: 'no-scenes-detected',
              message: 'No scenes found.',
            },
          ],
        }}
        existingElements={[{ id: 'existing-character-1', type: 'character', name: 'Captain Nova' }]}
        onChange={vi.fn()}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(within(screen.getByTestId('import-draft-review')).getByRole('button', { name: /mark ready/i })).toBeDisabled();
  });
});
