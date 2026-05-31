import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSourceRoot = join(process.cwd(), 'src');
const appSourceExtensions = new Set(['.css', '.ts', '.tsx']);
const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const decorativeGlyphPattern = new RegExp(
  String.raw`[\u00b7\u2022\u2014\u2013\u2212\u00d7\u2026]|&m${'iddot'};|&t${'imes'};`,
  'u'
);
const adHocShellTypographyPattern =
  /\b(?:font-display|font-mono|text-micro|tracking-\S+|uppercase|text-\[(?:\d|\.)[^\]]+\])/;
const shellTypographyFiles = [
  'src/components/layout/Canvas.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/ProjectDropdown.tsx',
  'src/components/layout/WorkbenchBoardsDock.tsx',
  'src/components/layout/WorkbenchGalleryDock.tsx',
  'src/components/layout/WorkbenchViewer.tsx',
  'src/components/canvas/CanvasContextMenu.tsx',
  'src/components/canvas/CanvasControlLayerProperties.tsx',
  'src/components/canvas/CanvasControlLayerRail.tsx',
  'src/components/canvas/ComparisonView.tsx',
  'src/components/canvas/ComparisonToolbar.tsx',
  'src/components/canvas/GenerationQueue.tsx',
  'src/components/canvas/GenerationProgress.tsx',
  'src/components/edit/AIToolsPanel.tsx',
  'src/components/edit/ColorPicker.tsx',
  'src/components/edit/CropControls.tsx',
  'src/components/edit/EditCanvas.tsx',
  'src/components/edit/EditPropertiesPanel.tsx',
  'src/components/edit/FilterGrid.tsx',
  'src/components/edit/LayerPanel.tsx',
  'src/components/edit/RegionLockOverlay.tsx',
  'src/components/edit/RegionLockProperties.tsx',
  'src/components/edit/RegionLockToolbar.tsx',
  'src/components/edit/RegionMaskDrawer.tsx',
  'src/components/edit/TextControls.tsx',
  'src/components/edit/ToolStrip.tsx',
  'src/components/storyboard/CharacterAssignmentChip.tsx',
  'src/components/storyboard/CharacterLibrary.tsx',
  'src/components/storyboard/CharacterRefCard.tsx',
  'src/components/storyboard/ElementLibrary.tsx',
  'src/components/storyboard/ImportDraftReview.tsx',
  'src/components/storyboard/SceneCard.tsx',
  'src/components/storyboard/ScenePlaybackStrip.tsx',
  'src/components/storyboard/ScriptImportDialog.tsx',
  'src/components/storyboard/TransitionIndicator.tsx',
  'src/components/ui/ConfirmDialog.tsx',
  'src/components/ui/ErrorBoundary.tsx',
  'src/components/ui/ImageWithFallback.tsx',
  'src/components/ui/Slider.tsx',
  'src/components/ui/Tooltip.tsx',
  'src/pages/GeneratePanel.tsx',
  'src/pages/QuickGeneratePanel.tsx',
  'src/pages/StoryboardPanel.tsx',
];

describe('app UI glyph policy', () => {
  it('does not ship emoji glyphs in app source', () => {
    const filesWithEmoji = listAppSourceFiles(appSourceRoot)
      .filter((filePath) => emojiPattern.test(readFileSync(filePath, 'utf8')))
      .map((filePath) => relative(process.cwd(), filePath));

    expect(filesWithEmoji).toEqual([]);
  });

  it('does not ship decorative text glyphs or HTML glyph entities in app source', () => {
    const filesWithGlyphs = listAppSourceFiles(appSourceRoot)
      .flatMap((filePath) =>
        readFileSync(filePath, 'utf8')
          .split(/\r?\n/)
          .flatMap((line, lineIndex) =>
            decorativeGlyphPattern.test(line)
              ? [`${relative(process.cwd(), filePath)}:${lineIndex + 1}`]
              : []
          )
      );

    expect(filesWithGlyphs).toEqual([]);
  });

  it('keeps shell typography on semantic utilities', () => {
    const filesWithAdHocTypography = shellTypographyFiles.flatMap((relativePath) => {
      const filePath = join(process.cwd(), relativePath);

      return readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, lineIndex) =>
          adHocShellTypographyPattern.test(line) ? [`${relativePath}:${lineIndex + 1}`] : []
        );
    });

    expect(filesWithAdHocTypography).toEqual([]);
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
