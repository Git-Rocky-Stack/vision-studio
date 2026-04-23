import type {
  Element,
  ImportDraftElementCandidate,
  ImportDraftIssue,
  ImportDraftScene,
} from '@/types/project';

export interface MergeElementDraftsOptions {
  elementDrafts: ImportDraftElementCandidate[];
  sceneDrafts: ImportDraftScene[];
  existingElements?: Pick<Element, 'id' | 'type' | 'name' | 'aliases'>[];
}

export interface MergeElementDraftsResult {
  elementDrafts: ImportDraftElementCandidate[];
  sceneDrafts: ImportDraftScene[];
  issues: ImportDraftIssue[];
}

function canonicalize(value: string) {
  return value
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExistingElementMatchMap(
  existingElements: Pick<Element, 'id' | 'type' | 'name' | 'aliases'>[],
) {
  const matchMap = new Map<string, string>();

  for (const element of existingElements) {
    const names = [element.name, ...element.aliases];

    for (const name of names) {
      const key = canonicalize(name);
      if (!key) {
        continue;
      }

      matchMap.set(`${element.type}:${key}`, element.id);
    }
  }

  return matchMap;
}

function mergeCandidateGroup(group: ImportDraftElementCandidate[]) {
  const [first, ...rest] = group;

  return rest.reduce<ImportDraftElementCandidate>((merged, candidate) => ({
    ...merged,
    aliases: Array.from(
      new Set(
        [
          ...merged.aliases,
          merged.name !== candidate.name ? candidate.name : null,
          ...candidate.aliases,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    ),
    tags: Array.from(new Set([...merged.tags, ...candidate.tags])),
    referenceSetIds: Array.from(new Set([...merged.referenceSetIds, ...candidate.referenceSetIds])),
    description: merged.description || candidate.description,
    continuityNotes:
      merged.continuityNotes ||
      candidate.continuityNotes,
    heroMediaAssetId: merged.heroMediaAssetId ?? candidate.heroMediaAssetId ?? null,
    accepted: merged.accepted || candidate.accepted,
    metadata: {
      ...merged.metadata,
      ...candidate.metadata,
    },
  }), {
    ...first,
    aliases: [...first.aliases],
    tags: [...first.tags],
    referenceSetIds: [...first.referenceSetIds],
    metadata: { ...first.metadata },
  });
}

export function mergeElementDrafts({
  elementDrafts,
  sceneDrafts,
  existingElements = [],
}: MergeElementDraftsOptions): MergeElementDraftsResult {
  const grouped = new Map<string, ImportDraftElementCandidate[]>();
  const retainedOrder: string[] = [];
  const candidateIdMap = new Map<string, string>();
  const issues: ImportDraftIssue[] = [];
  const existingMatchMap = buildExistingElementMatchMap(existingElements);

  for (const candidate of elementDrafts) {
    const key = canonicalize(candidate.name);
    const dedupeKey = `${candidate.type}:${key || candidate.id}`;

    if (!grouped.has(dedupeKey)) {
      grouped.set(dedupeKey, []);
      retainedOrder.push(dedupeKey);
    }

    grouped.get(dedupeKey)?.push(candidate);
  }

  const mergedElementDrafts = retainedOrder.map((dedupeKey, index) => {
    const group = grouped.get(dedupeKey) ?? [];
    const mergedCandidate = mergeCandidateGroup(group);

    for (const candidate of group) {
      candidateIdMap.set(candidate.id, mergedCandidate.id);
    }

    if (group.length > 1) {
      issues.push({
        id: `merged-duplicate-element-${index + 1}`,
        severity: 'warning',
        code: 'merged-duplicate-element',
        message: `Merged duplicate ${mergedCandidate.type} candidates into "${mergedCandidate.name}".`,
        targetId: mergedCandidate.id,
      });
    }

    const mergeTargetElementId = existingMatchMap.get(
      `${mergedCandidate.type}:${canonicalize(mergedCandidate.name)}`,
    );

    return {
      ...mergedCandidate,
      mergeTargetElementId: mergeTargetElementId ?? mergedCandidate.mergeTargetElementId ?? null,
    };
  });

  const mergedSceneDrafts = sceneDrafts.map((sceneDraft) => ({
    ...sceneDraft,
    elementCandidateIds: Array.from(
      new Set(
        sceneDraft.elementCandidateIds.map((candidateId) => candidateIdMap.get(candidateId) ?? candidateId),
      ),
    ),
    shotBeats: sceneDraft.shotBeats.map((shotBeat) => ({
      ...shotBeat,
      elementIds: Array.from(
        new Set(shotBeat.elementIds.map((elementId) => candidateIdMap.get(elementId) ?? elementId)),
      ),
      metadata: { ...shotBeat.metadata },
    })),
    metadata: { ...sceneDraft.metadata },
  }));

  return {
    elementDrafts: mergedElementDrafts,
    sceneDrafts: mergedSceneDrafts,
    issues,
  };
}
