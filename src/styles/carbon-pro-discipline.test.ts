import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Carbon Pro design-discipline contract (Tier 4).
 *
 * Locks the two reputation-critical outcomes of the Carbon Pro translation
 * across the ENTIRE app source so neither can silently regress:
 *
 *  1. Machined radii. The scale is card 2px (rounded-sm), control 4px
 *     (rounded-md), overlay 8px (rounded-xl), pill (rounded-full). The
 *     off-scale legacy sizes (lg = 6px, plus 2xl and 3xl) are banned.
 *     See DESIGN.md section Radius.
 *  2. Single chrome accent. The only accent is chrome (accent-primary). The
 *     deprecated red accent family aliases the semantic error palette and must
 *     never be used decoratively; genuine errors and danger use status-error
 *     and status-error-muted, and functional legends use raw Tailwind scales.
 *     See DESIGN.md section Color.
 *
 * Both checks scan .ts/.tsx so const-string class recipes are covered, not just
 * inline JSX. Paths are normalised to POSIX so the allow-list matches on both
 * the Linux pr-gate and the Windows release runner.
 */

const appSourceRoot = join(process.cwd(), 'src');
const scanExtensions = new Set(['.ts', '.tsx']);

const illegalRadiusPattern = /\brounded-(?:lg|2xl|3xl)\b/;

const decorativeRedPattern =
  /\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|glow|gradient-text|decoration|outline|divide)-red-(?:primary|aura|highlight|pressed|deep|glow)\b|\bglow-red(?:-subtle|-strong)?\b|\bshadow-red-glow(?:-subtle|-strong)?\b/;

// Guard specs intentionally name the forbidden red utilities as string literals
// to assert their ABSENCE in rendered output. They are allowed to reference them.
const redGuardFiles = new Set([
  'src/pages/SecondaryPanelsCarbon.test.tsx',
  'src/pages/QuickGeneratePanel.test.tsx',
  'src/components/workflow/WorkflowWorkbench.test.tsx',
  'src/components/canvas/GenerationQueue.test.tsx',
  'src/styles/carbon-pro-discipline.test.ts',
]);

const toPosix = (filePath: string) => relative(process.cwd(), filePath).split(/[\\/]/).join('/');

describe('Carbon Pro design discipline', () => {
  it('does not ship off-scale border radii in app source', () => {
    const offenders = listSourceFiles(appSourceRoot).flatMap((filePath) =>
      collectMatches(filePath, illegalRadiusPattern)
    );

    expect(offenders).toEqual([]);
  });

  it('does not use the deprecated decorative red accent family', () => {
    const offenders = listSourceFiles(appSourceRoot)
      .filter((filePath) => !redGuardFiles.has(toPosix(filePath)))
      .flatMap((filePath) => collectMatches(filePath, decorativeRedPattern));

    expect(offenders).toEqual([]);
  });
});

function collectMatches(filePath: string, pattern: RegExp): string[] {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, lineIndex) =>
      pattern.test(line) ? [`${toPosix(filePath)}:${lineIndex + 1}`] : []
    );
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    if (!scanExtensions.has(extname(entryPath))) {
      return [];
    }

    return [entryPath];
  });
}
