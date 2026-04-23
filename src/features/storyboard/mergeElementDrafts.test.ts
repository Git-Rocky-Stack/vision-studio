import { describe, expect, it } from 'vitest';
import type { ImportDraftElementCandidate, ImportDraftScene } from '@/types/project';
import { mergeElementDrafts } from './mergeElementDrafts';

function makeCandidate(
  id: string,
  type: ImportDraftElementCandidate['type'],
  name: string,
): ImportDraftElementCandidate {
  return {
    id,
    type,
    name,
    aliases: [],
    description: '',
    tags: [],
    continuityNotes: '',
    referenceSetIds: [],
    heroMediaAssetId: null,
    color: '#123456',
    mergeTargetElementId: null,
    accepted: true,
    metadata: {},
  };
}

function makeScene(sceneId: string, elementCandidateIds: string[]): ImportDraftScene {
  return {
    id: sceneId,
    name: sceneId,
    summary: '',
    promptSeed: '',
    notes: '',
    orderIndex: 0,
    elementCandidateIds,
    shotBeats: [
      {
        id: `${sceneId}-beat-1`,
        summary: 'Beat',
        promptSeed: 'Beat',
        notes: '',
        orderIndex: 0,
        durationMs: null,
        elementIds: [...elementCandidateIds],
        metadata: {},
      },
    ],
    accepted: true,
    metadata: {},
  };
}

describe('mergeElementDrafts', () => {
  it('merges duplicate candidates and remaps scene and beat links', () => {
    const first = makeCandidate('element-draft-character-1', 'character', 'Captain Nova');
    const duplicate = makeCandidate('element-draft-character-2', 'character', 'Captain Nova');
    duplicate.aliases = ['Nova'];
    const location = makeCandidate('element-draft-location-1', 'location', 'Bridge');

    const result = mergeElementDrafts({
      elementDrafts: [first, duplicate, location],
      sceneDrafts: [
        makeScene('scene-1', [first.id, location.id]),
        makeScene('scene-2', [duplicate.id]),
      ],
    });

    expect(result.elementDrafts).toHaveLength(2);
    expect(result.elementDrafts[0].aliases).toContain('Nova');
    expect(result.sceneDrafts[1].elementCandidateIds).toEqual([first.id]);
    expect(result.sceneDrafts[1].shotBeats[0].elementIds).toEqual([first.id]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'merged-duplicate-element',
        targetId: first.id,
      }),
    );
  });

  it('matches candidates against existing elements by canonicalized name', () => {
    const candidate = makeCandidate('element-draft-location-1', 'location', 'Control Room');

    const result = mergeElementDrafts({
      elementDrafts: [candidate],
      sceneDrafts: [makeScene('scene-1', [candidate.id])],
      existingElements: [
        {
          id: 'existing-location-1',
          type: 'location',
          name: 'The Control Room',
          aliases: ['Bridge'],
        },
      ],
    });

    expect(result.elementDrafts[0].mergeTargetElementId).toBe('existing-location-1');
  });
});
