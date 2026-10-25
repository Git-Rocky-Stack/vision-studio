import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The overlay radius belongs to overlays.
 *
 * The machined scale is card 2px (rounded-sm), control 4px (rounded-md) and
 * overlay 8px (rounded-xl) - see DESIGN.md section Border Radius: the overlay
 * radius is "the only soft surface". It had spread to about 45 inspector cards,
 * timeline clips, guide callouts and buttons, which softened the whole
 * instrument. Dialog shells use .raised-panel.dialog-shell instead.
 *
 * rounded-xl is allowed only in the files below, each of which draws a menu,
 * popover, floating notice or dialog. A popover in a file that also draws
 * cards uses the token-named rounded-overlay utility instead, so the file
 * never has to be allowlisted.
 */

const overlayFiles = new Set([
  'src/components/generate/PromptHistory.tsx', // popover
  'src/components/timeline/TimelinePlaybackPreview.tsx', // floating playback warning
  'src/components/edit/ColorPicker.tsx', // popover
  'src/components/edit/TextControls.tsx', // font dropdown
  'src/components/canvas/CanvasContextMenu.tsx', // context menu
  'src/components/ui/KeyboardShortcuts.tsx', // dialog shell
]);

const appSourceRoot = join(process.cwd(), 'src');
const scanExtensions = new Set(['.ts', '.tsx']);
const overlayRadiusPattern = /\brounded-xl\b/;

const toPosix = (filePath: string) => relative(process.cwd(), filePath).split(/[\\/]/).join('/');

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, out);
      continue;
    }
    if (!scanExtensions.has(extname(entry))) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe('overlay radius', () => {
  it('uses rounded-xl only on overlays', () => {
    const offenders = listSourceFiles(appSourceRoot)
      .filter((filePath) => {
        const rel = toPosix(filePath);
        return !overlayFiles.has(rel);
      })
      .flatMap((filePath) =>
        readFileSync(filePath, 'utf8')
          .split(/\r?\n/)
          .flatMap((line, index) => (overlayRadiusPattern.test(line) ? [`${toPosix(filePath)}:${index + 1}`] : [])),
      );

    expect(offenders).toEqual([]);
  });

  it('gives the dialog shell the overlay radius', () => {
    const css = readFileSync(join(appSourceRoot, 'index.css'), 'utf8');
    expect(css).toMatch(/\.dialog-shell\s*\{\s*border-radius:\s*var\(--radius-overlay\);\s*\}/);
  });
});
