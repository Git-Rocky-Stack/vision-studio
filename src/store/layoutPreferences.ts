export const LEFT_DOCK_MIN_WIDTH = 200;
export const LEFT_DOCK_MAX_WIDTH = 420;
export const LEFT_DOCK_DEFAULT_WIDTH = 320;

export const RIGHT_DOCK_MIN_WIDTH = 280;
export const RIGHT_DOCK_MAX_WIDTH = 420;
export const RIGHT_DOCK_DEFAULT_WIDTH = 360;

export const RIGHT_DOCK_CANVAS_MIN_RATIO = 0.24;
export const RIGHT_DOCK_DUAL_MIN_RATIO = 0.28;
export const RIGHT_DOCK_TRIPLE_MIN_RATIO = 0.18;

export const RIGHT_DOCK_CANVAS_DEFAULT_RATIOS = [0.52, 0.48] as const;
export const RIGHT_DOCK_DUAL_DEFAULT_RATIOS = [0.58, 0.42] as const;
export const RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS = [0.4, 0.32, 0.28] as const;
export const GENERATE_COLLAPSIBLE_SECTION_IDS = [
  'reference-inputs',
  'control-layers',
  'advanced',
] as const;

export type GenerateCollapsibleSectionId = (typeof GENERATE_COLLAPSIBLE_SECTION_IDS)[number];

export const DEFAULT_COLLAPSED_GENERATE_SECTIONS: GenerateCollapsibleSectionId[] = ['advanced'];

export function createDefaultLayoutPreferences() {
  return {
    leftDockWidth: LEFT_DOCK_DEFAULT_WIDTH,
    rightDockWidth: RIGHT_DOCK_DEFAULT_WIDTH,
    rightDockCanvasRatios: [...RIGHT_DOCK_CANVAS_DEFAULT_RATIOS] as [number, number],
    rightDockDualRatios: [...RIGHT_DOCK_DUAL_DEFAULT_RATIOS] as [number, number],
    rightDockTripleRatios: [...RIGHT_DOCK_TRIPLE_DEFAULT_RATIOS] as [number, number, number],
    collapsedGenerateSections: [...DEFAULT_COLLAPSED_GENERATE_SECTIONS],
  };
}

export function normalizeCollapsedGenerateSections(
  sections: readonly string[] | undefined,
): GenerateCollapsibleSectionId[] {
  if (sections === undefined) {
    return [...DEFAULT_COLLAPSED_GENERATE_SECTIONS];
  }
  if (sections.length === 0) {
    return [];
  }

  const validSections = new Set<string>(GENERATE_COLLAPSIBLE_SECTION_IDS);
  const uniqueSections = Array.from(new Set(sections.filter((section) => validSections.has(section))));
  return uniqueSections as GenerateCollapsibleSectionId[];
}

export function clampDockWidth(width: number, minWidth: number, maxWidth: number) {
  if (!Number.isFinite(width)) {
    return minWidth;
  }

  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
}

export function normalizePanelRatios<T extends number[]>(
  ratios: readonly number[],
  defaults: readonly number[],
  minRatio: number,
): T {
  if (ratios.length !== defaults.length) {
    return [...defaults] as T;
  }

  let normalized = ratios.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  let total = normalized.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return [...defaults] as T;
  }

  normalized = normalized.map((value) => value / total);

  for (let pass = 0; pass < normalized.length; pass += 1) {
    let deficit = 0;
    let flexibleTotal = 0;

    for (let index = 0; index < normalized.length; index += 1) {
      if (normalized[index] < minRatio) {
        deficit += minRatio - normalized[index];
        normalized[index] = minRatio;
      } else {
        flexibleTotal += normalized[index];
      }
    }

    if (deficit <= 0) {
      break;
    }

    if (flexibleTotal <= 0) {
      return [...defaults] as T;
    }

    for (let index = 0; index < normalized.length; index += 1) {
      if (normalized[index] > minRatio) {
        normalized[index] -= deficit * (normalized[index] / flexibleTotal);
      }
    }
  }

  total = normalized.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return [...defaults] as T;
  }

  normalized = normalized.map((value) => value / total);
  return normalized as T;
}

export function adjustAdjacentPanelRatios<T extends number[]>(
  ratios: readonly number[],
  leadingIndex: number,
  nextLeadingRatio: number,
  defaults: readonly number[],
  minRatio: number,
): T {
  if (leadingIndex < 0 || leadingIndex >= ratios.length - 1) {
    return normalizePanelRatios<T>(ratios, defaults, minRatio);
  }

  const normalized = normalizePanelRatios<number[]>(ratios, defaults, minRatio);
  const pairTotal = normalized[leadingIndex] + normalized[leadingIndex + 1];
  const clampedLeading = Math.min(pairTotal - minRatio, Math.max(minRatio, nextLeadingRatio));

  const next = [...normalized];
  next[leadingIndex] = clampedLeading;
  next[leadingIndex + 1] = pairTotal - clampedLeading;
  return next as T;
}
