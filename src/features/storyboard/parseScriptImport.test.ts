import { describe, expect, it } from 'vitest';
import { parseScriptImport } from './parseScriptImport';

describe('parseScriptImport', () => {
  it('parses screenplay headings, beat lines, and continuity candidates into a draft', () => {
    const result = parseScriptImport({
      projectId: 'project-1',
      draftId: 'draft-1',
      now: '2026-04-23T22:00:00.000Z',
      sourceText: `
INT. CONTROL ROOM - NIGHT
- Captain Nova scans the neon console.
- A surveillance drone circles overhead.

CAPTAIN NOVA
We're out of time.

EXT. ROOFTOP - DAWN
- Captain Nova grips the briefcase.
- The city glows in a noir haze.
      `,
      existingElements: [
        {
          id: 'element-existing-character-1',
          type: 'character',
          name: 'Captain Nova',
          aliases: [],
        },
      ],
    });

    expect(result.id).toBe('draft-1');
    expect(result.sceneDrafts).toHaveLength(2);
    expect(result.sceneDrafts[0].name).toBe('Control Room');
    expect(result.sceneDrafts[0].shotBeats).toHaveLength(2);
    expect(result.elementDrafts.some((candidate) => candidate.type === 'location' && candidate.name === 'Control Room')).toBe(
      true,
    );
    expect(result.elementDrafts.some((candidate) => candidate.type === 'character' && candidate.name === 'Captain Nova')).toBe(
      true,
    );
    expect(result.elementDrafts.some((candidate) => candidate.type === 'object' && candidate.name === 'Drone')).toBe(
      true,
    );
    expect(result.elementDrafts.some((candidate) => candidate.type === 'style' && candidate.name === 'Noir')).toBe(
      true,
    );
    expect(
      result.elementDrafts.find((candidate) => candidate.type === 'character' && candidate.name === 'Captain Nova')
        ?.mergeTargetElementId,
    ).toBe('element-existing-character-1');
    expect(result.metadata).toEqual(
      expect.objectContaining({
        segmentation: 'scene-headings',
        sceneCount: 2,
      }),
    );
  });

  it('falls back to paragraph segmentation and still produces a reviewable draft', () => {
    const result = parseScriptImport({
      projectId: 'project-1',
      draftId: 'draft-2',
      now: '2026-04-23T22:00:00.000Z',
      sourceText: `
Maya and Jules drift through a watercolor market at dusk, chasing a stolen key.

They reach the tram platform and realize the artifact is already moving without them.
      `,
    });

    expect(result.sceneDrafts).toHaveLength(2);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'fallback-scene-segmentation',
      }),
    );
    expect(result.elementDrafts.some((candidate) => candidate.type === 'style' && candidate.name === 'Watercolor')).toBe(
      true,
    );
    expect(result.elementDrafts.some((candidate) => candidate.type === 'object' && candidate.name === 'Key')).toBe(
      true,
    );
    expect(result.elementDrafts.some((candidate) => candidate.type === 'object' && candidate.name === 'Artifact')).toBe(
      true,
    );
    expect(result.sceneDrafts[0].shotBeats).not.toHaveLength(0);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        segmentation: 'paragraphs',
      }),
    );
  });

  it('warns when no reusable continuity elements are detected', () => {
    const result = parseScriptImport({
      projectId: 'project-1',
      draftId: 'draft-4',
      now: '2026-04-23T22:00:00.000Z',
      sourceText: `
The room is quiet.

Two people wait for an answer that never comes.
      `,
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'no-elements-detected',
      }),
    );
  });

  it('returns an explicit error for empty source text', () => {
    const result = parseScriptImport({
      projectId: 'project-1',
      draftId: 'draft-3',
      now: '2026-04-23T22:00:00.000Z',
      sourceText: '   ',
    });

    expect(result.sceneDrafts).toEqual([]);
    expect(result.elementDrafts).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'empty-source',
        severity: 'error',
      }),
    );
  });
});
