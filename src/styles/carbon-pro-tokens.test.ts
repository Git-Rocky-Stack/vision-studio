import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const appSourceRoot = join(process.cwd(), 'src');
const appSourceExtensions = new Set(['.css', '.ts', '.tsx']);
const arbitraryColorTokenPattern =
  /\b(?:hover:)?(?:text|bg|border|fill)-\[(?:var\(--color-[^)]+\)|rgba\([^)]+\))\]/;

describe('Carbon Pro design tokens', () => {
  it('defines an AMOLED-neutral Carbon Pro shell without green or blue tinted greys', () => {
    expect(css).toContain('--color-void: #000000');
    expect(css).toContain('--color-canvas: #050505');
    expect(css).toContain('--color-surface: #0d0d0d');
    expect(css).toContain('--color-elevated: #141414');
    expect(css).toContain('--color-panel: #101010');
    expect(css).toContain('--color-panel-raised: #1a1a1a');
    expect(css).toContain('--color-text-primary: #f5f5f5');
    expect(css).toContain('--color-text-body: #b3b3b3');
    expect(css).toContain('--color-text-muted: #7a7a7a');
    expect(css).toContain('--color-border: rgba(255, 255, 255, 0.08)');
  });

  it('defines the Carbon Pro primary accent and capability palette', () => {
    expect(css).toContain('--color-accent-primary: #e6e6e6');
    expect(css).toContain('--color-accent-primary-muted: rgba(230, 230, 230, 0.1)');
    expect(css).toContain('--color-capability-image:');
    expect(css).toContain('--color-capability-video:');
    expect(css).toContain('--color-capability-edit:');
    expect(css).toContain('--color-capability-local:');
    expect(css).toContain('--color-capability-cloud:');
  });

  it('keeps red as a status/error alias instead of the primary brand accent', () => {
    expect(css).toContain('--color-status-error: #ef4444');
    expect(css).toContain('--color-red-primary: var(--color-status-error)');
    expect(css).toContain('--color-red-aura: var(--color-status-error-muted)');
  });

  it('uses semantic token utilities instead of arbitrary color values in app source', () => {
    const filesWithArbitraryColorTokens = listAppSourceFiles(appSourceRoot)
      .filter((filePath) => !filePath.includes('.test.'))
      .flatMap((filePath) =>
        readFileSync(filePath, 'utf8')
          .split(/\r?\n/)
          .flatMap((line, lineIndex) =>
            arbitraryColorTokenPattern.test(line)
              ? [`${relative(process.cwd(), filePath)}:${lineIndex + 1}`]
              : []
          )
      );

    expect(filesWithArbitraryColorTokens).toEqual([]);
  });
});

function listAppSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return listAppSourceFiles(entryPath);
    }

    if (!appSourceExtensions.has(extname(entryPath))) {
      return [];
    }

    return [entryPath];
  });
}
