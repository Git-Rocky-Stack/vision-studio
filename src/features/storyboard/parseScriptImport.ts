import type {
  Element,
  ElementType,
  ImportDraft,
  ImportDraftElementCandidate,
  ImportDraftIssue,
  ImportDraftScene,
  SceneShotBeat,
} from '@/types/project';
import { mergeElementDrafts } from './mergeElementDrafts';

const SCREENPLAY_HEADING_RE =
  /^(?:(?:scene)\s+\d+\s*[:.\-]\s*)?(?:(?:int|ext|int\/ext|ext\/int|i\/e|est)\.?\s+.+)$/i;
const SCENE_OUTLINE_RE = /^scene\s+\d+(?:\s*[:.\-]\s*|\s+)(.+)$/i;
const BULLET_RE = /^\s*(?:[-*\u2022]|\d+[.)])\s+(.*\S)\s*$/;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9'(). -]{1,30}$/;
const STYLE_KEYWORDS = [
  'noir',
  'cyberpunk',
  'watercolor',
  'anime',
  'cinematic',
  'documentary',
  'vintage',
  'retro',
  'surreal',
  'neon',
];
const OBJECT_KEYWORDS = [
  'briefcase',
  'console',
  'orb',
  'helmet',
  'sword',
  'mask',
  'camera',
  'map',
  'artifact',
  'drone',
  'key',
  'phone',
];
const HEADING_STOPWORDS = new Set([
  'INT',
  'EXT',
  'EST',
  'DAY',
  'NIGHT',
  'DAWN',
  'DUSK',
  'MORNING',
  'EVENING',
  'LATER',
  'CONTINUOUS',
  'SCENE',
  'CUT TO',
  'FADE IN',
  'FADE OUT',
  'ANGLE ON',
  'CLOSE ON',
  'BEAT',
]);
const DEFAULT_ELEMENT_COLORS: Record<ElementType, string> = {
  character: '#e63946',
  object: '#f4a261',
  location: '#457b9d',
  style: '#9b5de5',
};

interface ScriptSceneBlock {
  heading: string | null;
  lines: string[];
}

export interface ParseScriptImportOptions {
  projectId: string;
  sourceText: string;
  title?: string;
  existingElements?: Pick<Element, 'id' | 'type' | 'name' | 'aliases'>[];
  draftId?: string;
  now?: string;
}

function sanitizeLine(line: string) {
  return line.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
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

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function isSceneHeading(line: string) {
  return SCREENPLAY_HEADING_RE.test(line) || SCENE_OUTLINE_RE.test(line);
}

function segmentScript(sourceText: string) {
  const lines = sourceText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => sanitizeLine(line));

  const explicitBlocks: ScriptSceneBlock[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let sawExplicitHeading = false;

  const pushCurrent = () => {
    if (!currentHeading && currentLines.every((line) => line.length === 0)) {
      return;
    }

    if (currentHeading || currentLines.some((line) => line.length > 0)) {
      explicitBlocks.push({
        heading: currentHeading,
        lines: currentLines.filter((line) => line.length > 0),
      });
    }
  };

  for (const line of lines) {
    if (isSceneHeading(line)) {
      sawExplicitHeading = true;
      if (currentHeading || currentLines.length > 0) {
        pushCurrent();
      }
      currentHeading = line;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  if (currentHeading || currentLines.length > 0) {
    pushCurrent();
  }

  if (sawExplicitHeading) {
    return {
      blocks: explicitBlocks.filter((block) => block.heading || block.lines.length > 0),
      usedFallback: false,
    };
  }

  const paragraphBlocks = sourceText
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.split('\n').map((line) => sanitizeLine(line)).filter(Boolean))
    .filter((block) => block.length > 0)
    .map<ScriptSceneBlock>((block) => ({ heading: null, lines: block }));

  return {
    blocks: paragraphBlocks,
    usedFallback: true,
  };
}

function cleanSceneHeading(heading: string) {
  return heading
    .replace(/^scene\s+\d+\s*[:.\-]\s*/i, '')
    .replace(/^(int|ext|int\/ext|ext\/int|i\/e|est)\.?\s*/i, '')
    .trim();
}

function deriveSceneName(block: ScriptSceneBlock, sceneIndex: number) {
  if (block.heading) {
    const cleaned = cleanSceneHeading(block.heading);
    const [locationPart] = cleaned.split(/\s[-\u2013\u2014]\s|:\s/);
    const name = titleCase(locationPart);

    if (name) {
      return name;
    }
  }

  const firstNarrativeLine = block.lines.find((line) => !CHARACTER_CUE_RE.test(line));
  if (firstNarrativeLine) {
    return firstNarrativeLine.length > 48
      ? `${firstNarrativeLine.slice(0, 45).trim()}...`
      : firstNarrativeLine;
  }

  return `Scene ${sceneIndex + 1}`;
}

function collectCharacterCues(block: ScriptSceneBlock) {
  return dedupeStrings(
    block.lines
      .filter((line) => CHARACTER_CUE_RE.test(line))
      .map((line) => line.replace(/\(.*?\)/g, '').trim())
      .filter((line) => {
        const canonical = canonicalize(line);
        return canonical.length > 1 && !HEADING_STOPWORDS.has(line);
      })
      .map((line) => titleCase(line)),
  );
}

function extractSceneSummary(block: ScriptSceneBlock, beatLines: string[], sceneName: string) {
  const narrativeLines = block.lines.filter(
    (line) => line.length > 0 && !BULLET_RE.test(line) && !CHARACTER_CUE_RE.test(line),
  );

  const source = narrativeLines[0] ?? beatLines[0] ?? cleanSceneHeading(block.heading ?? '') ?? sceneName;
  return source.length > 160 ? `${source.slice(0, 157).trim()}...` : source;
}

function extractBeatTexts(block: ScriptSceneBlock) {
  const explicitBeatLines = block.lines
    .map((line) => line.match(BULLET_RE)?.[1]?.trim() ?? null)
    .filter((line): line is string => Boolean(line));

  if (explicitBeatLines.length > 0) {
    return explicitBeatLines.slice(0, 6);
  }

  const beats: string[] = [];

  for (let index = 0; index < block.lines.length; index += 1) {
    const line = block.lines[index];

    if (line.length === 0) {
      continue;
    }

    if (CHARACTER_CUE_RE.test(line)) {
      const nextLine = block.lines[index + 1];

      if (nextLine && nextLine.length > 0 && !CHARACTER_CUE_RE.test(nextLine)) {
        beats.push(`${titleCase(line)}: ${nextLine}`);
      }

      continue;
    }

    beats.push(line);
  }

  return dedupeStrings(beats).slice(0, 6);
}

function findStyleCandidates(text: string) {
  const lowercase = text.toLowerCase();

  return STYLE_KEYWORDS.filter((keyword) => lowercase.includes(keyword)).map((keyword) => ({
    name: titleCase(keyword),
    tags: ['style'],
  }));
}

function findObjectCandidates(text: string) {
  const lowercase = text.toLowerCase();

  return OBJECT_KEYWORDS.filter((keyword) => lowercase.includes(keyword)).map((keyword) => ({
    name: titleCase(keyword),
    tags: ['prop'],
  }));
}

function createElementDraftCandidate(
  type: ElementType,
  name: string,
  index: number,
  extras?: Partial<Omit<ImportDraftElementCandidate, 'id' | 'type' | 'name' | 'accepted' | 'mergeTargetElementId'>>,
): ImportDraftElementCandidate {
  return {
    id: `element-draft-${type}-${index + 1}`,
    type,
    name,
    aliases: extras?.aliases ? [...extras.aliases] : [],
    description: extras?.description ?? '',
    tags: extras?.tags ? [...extras.tags] : [],
    continuityNotes: extras?.continuityNotes ?? '',
    referenceSetIds: extras?.referenceSetIds ? [...extras.referenceSetIds] : [],
    heroMediaAssetId: extras?.heroMediaAssetId ?? null,
    color: extras?.color ?? DEFAULT_ELEMENT_COLORS[type],
    mergeTargetElementId: null,
    accepted: true,
    metadata: extras?.metadata ? { ...extras.metadata } : {},
  };
}

function buildImportDraftScene(
  block: ScriptSceneBlock,
  sceneIndex: number,
  sceneElementCandidateIds: string[],
  beatTexts: string[],
): ImportDraftScene {
  const sceneName = deriveSceneName(block, sceneIndex);
  const summary = extractSceneSummary(block, beatTexts, sceneName);

  const shotBeats: SceneShotBeat[] = beatTexts.map((beatText, beatIndex) => ({
    id: `beat-${sceneIndex + 1}-${beatIndex + 1}`,
    summary: beatText,
    promptSeed: beatText,
    notes: '',
    orderIndex: beatIndex,
    durationMs: null,
    elementIds: [...sceneElementCandidateIds],
    metadata: {},
  }));

  return {
    id: `scene-draft-${sceneIndex + 1}`,
    name: sceneName,
    summary,
    promptSeed: [cleanSceneHeading(block.heading ?? ''), beatTexts[0] ?? ''].filter(Boolean).join(', '),
    notes: '',
    orderIndex: sceneIndex,
    elementCandidateIds: [...sceneElementCandidateIds],
    shotBeats,
    accepted: true,
    metadata: {
      sourceHeading: block.heading,
    },
  };
}

export function parseScriptImport({
  projectId,
  sourceText,
  title,
  existingElements = [],
  draftId = crypto.randomUUID(),
  now = new Date().toISOString(),
}: ParseScriptImportOptions): ImportDraft {
  const trimmedSourceText = sourceText.trim();
  const issues: ImportDraftIssue[] = [];

  if (!trimmedSourceText) {
    return {
      id: draftId,
      projectId,
      title: title ?? 'Imported Storyboard',
      sourceText: '',
      sceneDrafts: [],
      elementDrafts: [],
      issues: [
        {
          id: 'import-issue-empty-source',
          severity: 'error',
          code: 'empty-source',
          message: 'Paste a script, outline, or scene brief to generate a storyboard draft.',
        },
      ],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      metadata: {
        segmentation: 'empty',
      },
    };
  }

  const { blocks, usedFallback } = segmentScript(trimmedSourceText);
  const rawElementDrafts: ImportDraftElementCandidate[] = [];
  const rawSceneDrafts: ImportDraftScene[] = [];

  if (usedFallback) {
    issues.push({
      id: 'import-issue-fallback-segmentation',
      severity: 'info',
      code: 'fallback-scene-segmentation',
      message: 'No explicit scene headings were found, so the import was segmented by paragraph breaks.',
    });
  }

  blocks.forEach((block, sceneIndex) => {
    const sceneCandidateIds: string[] = [];

    const locationName = block.heading ? deriveSceneName(block, sceneIndex) : '';
    if (block.heading && locationName && !/^scene\s+\d+/i.test(locationName)) {
      const candidate = createElementDraftCandidate('location', locationName, rawElementDrafts.length, {
        description: block.heading ? cleanSceneHeading(block.heading) : '',
        tags: ['scene'],
      });
      rawElementDrafts.push(candidate);
      sceneCandidateIds.push(candidate.id);
    }

    for (const characterName of collectCharacterCues(block)) {
      const candidate = createElementDraftCandidate('character', characterName, rawElementDrafts.length, {
        description: `Detected from screenplay cue in ${deriveSceneName(block, sceneIndex)}.`,
        tags: ['character'],
      });
      rawElementDrafts.push(candidate);
      sceneCandidateIds.push(candidate.id);
    }

    const sceneText = [block.heading ?? '', ...block.lines].join(' ');
    for (const objectCandidate of findObjectCandidates(sceneText)) {
      const candidate = createElementDraftCandidate('object', objectCandidate.name, rawElementDrafts.length, {
        tags: objectCandidate.tags,
      });
      rawElementDrafts.push(candidate);
      sceneCandidateIds.push(candidate.id);
    }

    for (const styleCandidate of findStyleCandidates(sceneText)) {
      const candidate = createElementDraftCandidate('style', styleCandidate.name, rawElementDrafts.length, {
        tags: styleCandidate.tags,
      });
      rawElementDrafts.push(candidate);
      sceneCandidateIds.push(candidate.id);
    }

    const beatTexts = extractBeatTexts(block);
    rawSceneDrafts.push(
      buildImportDraftScene(block, sceneIndex, dedupeStrings(sceneCandidateIds), beatTexts),
    );
  });

  const merged = mergeElementDrafts({
    elementDrafts: rawElementDrafts,
    sceneDrafts: rawSceneDrafts,
    existingElements,
  });

  issues.push(...merged.issues);

  if (merged.sceneDrafts.length === 0) {
    issues.push({
      id: 'import-issue-no-scenes',
      severity: 'error',
      code: 'no-scenes-detected',
      message: 'The import could not detect any scene blocks from the provided text.',
    });
  }

  if (merged.elementDrafts.length === 0) {
    issues.push({
      id: 'import-issue-no-elements',
      severity: 'warning',
      code: 'no-elements-detected',
      message: 'No reusable continuity elements were detected. You can still review and add them manually.',
    });
  }

  const firstHeading = blocks[0]?.heading ? cleanSceneHeading(blocks[0].heading) : null;
  const draftTitle =
    title ??
    (firstHeading && firstHeading.length > 0
      ? titleCase(firstHeading.split(/\s[-\u2013\u2014]\s|:\s/)[0])
      : 'Imported Storyboard');

  return {
    id: draftId,
    projectId,
    title: draftTitle,
    sourceText: trimmedSourceText,
    sceneDrafts: merged.sceneDrafts,
    elementDrafts: merged.elementDrafts,
    issues,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    metadata: {
      segmentation: usedFallback ? 'paragraphs' : 'scene-headings',
      sceneCount: merged.sceneDrafts.length,
      elementCount: merged.elementDrafts.length,
    },
  };
}
