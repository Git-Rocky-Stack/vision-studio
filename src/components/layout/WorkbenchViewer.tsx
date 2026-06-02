import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Columns2,
  GitBranch,
  GitCompare,
  Grid3X3,
  ImageIcon,
  ImagePlus,
  Layers,
  Pencil,
  Plus,
  SplitSquareHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';

import { useAppStore, type AppState } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { MediaPreview } from '@/components/ui/MediaPreview';
import type { GenerationDraft } from '@/types/generation';
import { DEFAULT_GENERATION_CONFIG } from '@/types/project';
import { cn } from '@/utils/cn';
import { extractFrameToEdit } from '@/features/media/frameExtraction';
import { ReviewDensityToggle } from './ReviewDensityToggle';

type CompareMode = Exclude<AppState['comparisonMode'], 'off'>;

const compareModes: { id: CompareMode; label: string; icon: LucideIcon }[] = [
  { id: 'side-by-side', label: 'Side by Side', icon: Columns2 },
  { id: 'slider', label: 'Slider', icon: SplitSquareHorizontal },
  { id: 'onion', label: 'Onion Skin', icon: Layers },
  { id: 'grid', label: 'Grid', icon: Grid3X3 },
];

interface ViewerItem {
  id: string;
  label: string;
  source: string;
  imagePath: string;
  posterPath: string | null;
  assetPath: string | null;
  thumbnail: string;
  prompt: string;
  model: string | null;
  seed: number | null;
  negativePrompt: string;
  generationType: 'image' | 'video';
  width: number | null;
  height: number | null;
  steps: number | null;
  cfgScale: number | null;
  scheduler: string | null;
  runtime: string | null;
  createdAt: number;
}

export function WorkbenchViewer() {
  const {
    assetLibrary,
    activeProjectId,
    activeViewerItemId,
    activeTimelineClipId,
    batchResults,
    comparisonImages,
    comparisonMode,
    layoutPreferences,
    mediaAssets,
    projects,
    timelineClips,
    addScene,
    setActiveViewerItemId,
    setActiveScene,
    setSceneStatus,
    setComparisonImages,
    setComparisonMode,
    setGenerationDraft,
    setCurrentImage,
    setActiveTab,
    setCenterView,
    setReviewDensity,
  } = useAppStore(useShallow(s => ({
    assetLibrary: s.assetLibrary,
    activeProjectId: s.activeProjectId,
    activeViewerItemId: s.activeViewerItemId,
    activeTimelineClipId: s.activeTimelineClipId,
    batchResults: s.batchResults,
    comparisonImages: s.comparisonImages,
    comparisonMode: s.comparisonMode,
    layoutPreferences: s.layoutPreferences,
    mediaAssets: s.mediaAssets,
    projects: s.projects,
    timelineClips: s.timelineClips,
    addScene: s.addScene,
    setActiveViewerItemId: s.setActiveViewerItemId,
    setActiveScene: s.setActiveScene,
    setSceneStatus: s.setSceneStatus,
    setComparisonImages: s.setComparisonImages,
    setComparisonMode: s.setComparisonMode,
    setGenerationDraft: s.setGenerationDraft,
    setCurrentImage: s.setCurrentImage,
    setActiveTab: s.setActiveTab,
    setCenterView: s.setCenterView,
    setReviewDensity: s.setReviewDensity,
  })));
  const activePreviewRef = useRef<HTMLDivElement>(null);
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);
  const [frameStatus, setFrameStatus] = useState<string | null>(null);

  const items = useMemo<ViewerItem[]>(() => {
    const assets = assetLibrary.map((asset) => ({
      id: `asset-${asset.id}`,
      label: asset.name || 'Generated asset',
      source: asset.type === 'video' ? 'Video asset' : 'Image asset',
      imagePath: asset.type === 'video' ? asset.path : asset.previewUrl || asset.path,
      posterPath: asset.thumbnail || asset.previewUrl || asset.path,
      assetPath: asset.path,
      thumbnail: asset.thumbnail || asset.previewUrl || asset.path,
      prompt: asset.prompt || 'No prompt saved',
      model: asset.model ?? getStringParam(asset.params, 'model'),
      seed: asset.seed ?? null,
      negativePrompt: asset.negativePrompt || getStringParam(asset.params, 'negativePrompt', 'negative_prompt') || '',
      generationType: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      width: asset.width ?? getNumberParam(asset.params, 'width'),
      height: asset.height ?? getNumberParam(asset.params, 'height'),
      steps: getNumberParam(asset.params, 'steps'),
      cfgScale: getNumberParam(asset.params, 'cfgScale', 'cfg_scale'),
      scheduler: getStringParam(asset.params, 'scheduler'),
      runtime: null,
      createdAt: new Date(asset.createdAt).getTime(),
    }));

    const results = batchResults.map((result) => ({
      id: `batch-${result.id}`,
      label: 'Batch result',
      source: result.isFavorite ? 'Favorite batch' : 'Batch result',
      imagePath: result.imagePath,
      posterPath: result.imagePath,
      assetPath: result.assetPath ?? null,
      thumbnail: result.imagePath,
      prompt: result.prompt,
      model: typeof result.params.model === 'string' ? result.params.model : null,
      seed: result.seed,
      negativePrompt: getStringParam(result.params, 'negativePrompt', 'negative_prompt') || '',
      generationType: 'image' as const,
      width: getNumberParam(result.params, 'width'),
      height: getNumberParam(result.params, 'height'),
      steps: getNumberParam(result.params, 'steps'),
      cfgScale: getNumberParam(result.params, 'cfgScale', 'cfg_scale'),
      scheduler: getStringParam(result.params, 'scheduler'),
      runtime: `${result.generationTime.toFixed(1)}s`,
      createdAt: new Date(result.createdAt).getTime(),
    }));

    return [...assets, ...results]
      .filter((item) => item.imagePath)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [assetLibrary, batchResults]);

  const activeItem = items.find((item) => item.id === activeViewerItemId) ?? items[0] ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const isPinned = activeItem ? comparisonImages.includes(activeItem.imagePath) : false;
  const pinnedItems = useMemo<ViewerItem[]>(() => {
    const itemsByPath = new Map(items.map((item) => [item.imagePath, item]));

    return comparisonImages.slice(0, 4).map((imagePath, index) => {
      const item = itemsByPath.get(imagePath);
      if (item) return item;

      return {
        id: `pinned-${index}-${imagePath}`,
        label: `Pinned output ${index + 1}`,
        source: 'Pinned output',
        imagePath,
        posterPath: imagePath,
        assetPath: null,
        thumbnail: imagePath,
        prompt: 'Pinned output',
        model: null,
        seed: null,
        negativePrompt: '',
        generationType: 'image',
        width: null,
        height: null,
        steps: null,
        cfgScale: null,
        scheduler: null,
        runtime: null,
        createdAt: 0,
      };
    });
  }, [comparisonImages, items]);
  const showCompareReview = pinnedItems.length >= 2;
  const reviewDensity = layoutPreferences.reviewDensity;
  const isCompact = reviewDensity === 'compact';
  const activeTimelineClip = useMemo(
    () => timelineClips.find((clip) => clip.id === activeTimelineClipId) ?? null,
    [activeTimelineClipId, timelineClips],
  );
  const activeTimelineClipMediaPath = useMemo(() => {
    if (!activeTimelineClip) {
      return null;
    }

    return (
      mediaAssets.find((asset) => asset.id === activeTimelineClip.mediaAssetId)?.path?.replace(/\\/g, '/') ??
      null
    );
  }, [activeTimelineClip, mediaAssets]);
  const compareModeLabel =
    compareModes.find((item) => item.id === comparisonMode)?.label ?? 'Side by Side';

  useEffect(() => {
    setFrameStatus(null);
    setIsExtractingFrame(false);
  }, [activeItem?.id]);

  const updateComparisonImages = (nextImages: string[]) => {
    setComparisonImages(nextImages);

    if (nextImages.length >= 2 && comparisonMode === 'off') {
      setComparisonMode('side-by-side');
    }

    if (nextImages.length < 2) {
      setComparisonMode('off');
    }
  };

  const resolveExtractionTimeMs = () => {
    const activeVideo = activePreviewRef.current?.querySelector('video');
    if (activeVideo && Number.isFinite(activeVideo.currentTime) && activeVideo.currentTime > 0) {
      return Math.round(activeVideo.currentTime * 1000);
    }

    if (
      activeItem?.assetPath &&
      activeTimelineClip &&
      activeTimelineClipMediaPath &&
      activeTimelineClipMediaPath === activeItem.assetPath.replace(/\\/g, '/')
    ) {
      return activeTimelineClip.sourceInMs;
    }

    return 0;
  };

  const sendToEdit = async () => {
    if (!activeItem) return;

    if (activeItem.generationType === 'video') {
      const sourcePath = activeItem.assetPath ?? activeItem.imagePath;
      if (!sourcePath) {
        setFrameStatus('The selected video does not have a managed source path yet.');
        return;
      }

      setIsExtractingFrame(true);
      setFrameStatus(null);

      try {
        const extracted = await extractFrameToEdit({
          sourcePath,
          timeMs: resolveExtractionTimeMs(),
          prompt: activeItem.prompt === 'No prompt saved' ? '' : activeItem.prompt,
          negativePrompt: activeItem.negativePrompt,
          model: activeItem.model ?? undefined,
        });
        setFrameStatus(
          `Frame extracted at ${(extracted.timeMs / 1000).toFixed(1)}s and opened in Canvas.`,
        );
      } catch (error) {
        setFrameStatus(error instanceof Error ? error.message : 'Video frame extraction failed.');
      } finally {
        setIsExtractingFrame(false);
      }

      return;
    }

    setCurrentImage(
      activeItem.imagePath,
      activeItem.assetPath,
    );
    setCenterView('canvas');
    setActiveTab('canvas');
  };

  const branchVariant = () => {
    if (!activeItem) return;

    setGenerationDraft(toGenerationDraft(activeItem));
    setCenterView('canvas');
    setActiveTab('generate');
  };

  const addToBoard = () => {
    if (!activeItem || !activeProject) return;

    const scene = addScene(activeProject.id, {
      name: activeItem.label,
      prompt: activeItem.prompt === 'No prompt saved' ? '' : activeItem.prompt,
      negativePrompt: activeItem.negativePrompt,
      generationConfig: toSceneGenerationConfig(activeItem),
      thumbnail: activeItem.posterPath ?? activeItem.imagePath,
      status: 'complete',
    });
    setSceneStatus(activeProject.id, scene.id, 'complete');
    setActiveScene(scene.id);
  };

  const toggleComparePin = () => {
    if (!activeItem) return;

    if (isPinned) {
      updateComparisonImages(comparisonImages.filter((image) => image !== activeItem.imagePath));
      return;
    }

    updateComparisonImages([...comparisonImages, activeItem.imagePath].slice(-4));
  };

  const clearCompare = () => {
    updateComparisonImages([]);
  };

  const removeCompareImage = (imagePath: string) => {
    updateComparisonImages(comparisonImages.filter((image) => image !== imagePath));
  };

  if (!activeItem) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-void px-6 text-center">
        <ImageIcon className="h-9 w-9 text-text-muted opacity-40" />
        <h2 className="mt-4 type-title">Outputs will appear here.</h2>
        <p className="mt-2 max-w-sm text-sm text-text-body">
          Generate or import an image or video to review it beside Canvas and Workflow.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated"
          >
            Open Generate
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('assets')}
            className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
          >
            Open Assets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-void">
      <div ref={activePreviewRef} className="flex min-h-0 flex-1 items-center justify-center p-4">
        {showCompareReview ? (
          <CompareReview
            density={reviewDensity}
            items={pinnedItems}
            mode={comparisonMode === 'off' ? 'side-by-side' : comparisonMode}
            onClear={clearCompare}
            onModeChange={setComparisonMode}
            onRemove={removeCompareImage}
          />
        ) : (
          <MediaPreview
            kind={activeItem.generationType}
            src={activeItem.imagePath}
            poster={activeItem.posterPath}
            alt={activeItem.label}
            className="h-full w-full"
            mediaClassName="max-h-full max-w-full object-contain"
            fallbackClassName="h-full w-full"
            showControls={activeItem.generationType === 'video'}
            showPlayBadge={activeItem.generationType === 'video'}
            testId="viewer-active-preview"
          />
        )}
      </div>

      <div className="flex flex-shrink-0 border-t border-border bg-surface">
        <section className="min-w-0 flex-1 border-r border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate type-section">
                  {activeItem.label}
                </h2>
                <span className="rounded border border-border px-2 py-0.5 type-caption">
                  {activeItem.source}
                </span>
                {activeItem.generationType === 'video' ? (
                  <span className="rounded border border-border px-2 py-0.5 type-caption">
                    Motion
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-text-body">{activeItem.prompt}</p>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={addToBoard}
                disabled={!activeProject}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to Board
              </button>
              <button
                type="button"
                onClick={branchVariant}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Branch Variant
              </button>
              <button
                type="button"
                onClick={toggleComparePin}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-3 py-2 type-ui transition-all',
                  isPinned
                    ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                    : 'border-border text-text-body hover:border-border-hover hover:bg-elevated hover:text-text-primary'
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {isPinned ? 'Pinned' : 'Pin Compare'}
              </button>
              <button
                type="button"
                onClick={() => void sendToEdit()}
                disabled={isExtractingFrame}
                className="inline-flex items-center gap-2 rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated"
              >
                {activeItem.generationType === 'video' ? (
                  <ImagePlus className="h-3.5 w-3.5" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
                {activeItem.generationType === 'video'
                  ? isExtractingFrame
                    ? 'Extracting...'
                    : 'Extract to Edit'
                  : 'Send to Edit'}
              </button>
            </div>
          </div>

          {activeItem.generationType === 'video' ? (
            <div className="mt-3 rounded-md border border-border bg-elevated px-3 py-2">
              <p className="type-ui text-text-primary">Video review is live</p>
              <p className="mt-1 type-caption text-text-body">
                Playback controls are active above. Extract the current frame into Canvas and it will land in Assets as a reusable still.
              </p>
              {frameStatus ? (
                <p className="mt-2 type-caption text-text-primary">{frameStatus}</p>
              ) : null}
            </div>
          ) : null}

          {comparisonImages.length > 0 ? (
            <div
              data-testid="viewer-compare-status"
              className={cn(
                'mt-3 rounded-md border px-3 py-2',
                showCompareReview
                  ? 'border-accent-primary-border bg-accent-primary-muted'
                  : 'border-border bg-elevated',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-ui text-text-primary">
                  {showCompareReview ? 'Compare review ready' : 'Compare queue started'}
                </p>
                <span className="rounded-full border border-border px-2 py-0.5 type-caption text-text-body">
                  {comparisonImages.length} pinned
                </span>
              </div>
              <p className="mt-1 type-caption text-text-body">
                {showCompareReview
                  ? `${compareModeLabel} is active for the pinned outputs.`
                  : 'Pin one more output to open the compare review surface.'}
              </p>
            </div>
          ) : null}

          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Metadata label="Model" value={activeItem.model ?? 'Unknown'} />
            <Metadata label="Seed" value={activeItem.seed === null ? 'Random' : String(activeItem.seed)} />
            <Metadata
              label={activeItem.generationType === 'video' ? 'Playback' : 'Runtime'}
              value={activeItem.runtime ?? (activeItem.generationType === 'video' ? 'Video ready' : 'Recorded')}
            />
            <Metadata label="Compare" value={`${comparisonImages.length} pinned`} />
          </dl>
        </section>

        <aside
          className={cn(
            'shrink-0 border-l border-border bg-surface',
            isCompact ? 'w-[232px]' : 'w-[280px]',
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="type-caption text-text-muted">Recent outputs</p>
              <p className="truncate type-caption text-text-muted">
                {items.length} items ready for review
              </p>
            </div>
            <ReviewDensityToggle density={reviewDensity} onChange={setReviewDensity} />
          </div>
          <div
            data-testid="viewer-thumbnail-rail"
            className={cn('scroll-shadow-x flex overflow-x-auto p-3', isCompact ? 'gap-1.5' : 'gap-2')}
          >
            {items.slice(0, isCompact ? 16 : 12).map((item) => {
              const isActive = item.id === activeItem.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Review ${item.label}`}
                  onClick={() => setActiveViewerItemId(item.id)}
                  className={cn(
                    'shrink-0 overflow-hidden rounded-md border bg-void transition-all',
                    isCompact ? 'h-16 w-16' : 'h-20 w-20',
                    isActive
                      ? 'border-accent-primary-border ring-1 ring-accent-primary-border'
                      : 'border-border hover:border-border-hover'
                  )}
                >
                  <MediaPreview
                    kind={item.generationType}
                    src={item.imagePath}
                    poster={item.posterPath}
                    alt=""
                    className="h-full w-full"
                    mediaClassName="h-full w-full object-cover"
                    fallbackClassName="h-full w-full"
                    showPlayBadge={item.generationType === 'video'}
                  />
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function CompareReview({
  density,
  items,
  mode,
  onClear,
  onModeChange,
  onRemove,
}: {
  density: 'comfortable' | 'compact';
  items: ViewerItem[];
  mode: CompareMode;
  onClear: () => void;
  onModeChange: (mode: CompareMode) => void;
  onRemove: (imagePath: string) => void;
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [onionOpacity, setOnionOpacity] = useState(50);
  const [firstItem, secondItem] = items;

  return (
    <section
      aria-label="Compare review"
      className="flex h-full w-full min-h-0 flex-col rounded-md border border-border bg-canvas"
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="type-section">Compare review</h2>
          <p className="mt-1 type-caption">{items.length} pinned</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="flex rounded-md border border-border bg-void p-1">
            {compareModes.map((compareMode) => {
              const Icon = compareMode.icon;
              const isActive = mode === compareMode.id;

              return (
                <button
                  key={compareMode.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onModeChange(compareMode.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded px-2.5 py-1.5 type-ui transition-all',
                    isActive
                      ? 'bg-accent-primary-muted text-accent-primary'
                      : 'text-text-body hover:bg-elevated hover:text-text-primary'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {compareMode.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
          >
            Clear Compare
          </button>
        </div>
      </div>

      {mode === 'side-by-side' && (
        <SideBySideCompare density={density} items={items} onRemove={onRemove} />
      )}

      {mode === 'slider' && firstItem && secondItem && (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-void">
          <MediaPreview
            kind={secondItem.generationType}
            src={secondItem.imagePath}
            poster={secondItem.posterPath}
            alt={`Slider after ${secondItem.label}`}
            className="h-full w-full"
            mediaClassName="h-full w-full object-contain"
            fallbackClassName="absolute inset-0 h-full w-full"
            showPlayBadge={secondItem.generationType === 'video'}
          />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <MediaPreview
              kind={firstItem.generationType}
              src={firstItem.imagePath}
              poster={firstItem.posterPath}
              alt={`Slider before ${firstItem.label}`}
              className="h-full w-full"
              mediaClassName="h-full w-full object-contain"
              fallbackClassName="h-full w-full"
              showPlayBadge={firstItem.generationType === 'video'}
            />
          </div>
          <CompareLabel item={firstItem} className="absolute left-3 top-3" />
          <CompareLabel item={secondItem} className="absolute right-3 top-3" />
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-md border border-border bg-void/80 px-3 py-2 backdrop-blur-sm">
            <span className="type-caption">Before</span>
            <input
              type="range"
              aria-label="Comparison split"
              min={0}
              max={100}
              value={sliderPosition}
              onChange={(event) => setSliderPosition(Number(event.target.value))}
              className="min-w-0 flex-1 accent-accent-primary"
            />
            <span className="type-caption">After</span>
          </div>
        </div>
      )}

      {mode === 'onion' && firstItem && secondItem && (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-void">
          <MediaPreview
            kind={firstItem.generationType}
            src={firstItem.imagePath}
            poster={firstItem.posterPath}
            alt={`Onion base ${firstItem.label}`}
            className="h-full w-full"
            mediaClassName="h-full w-full object-contain"
            fallbackClassName="absolute inset-0 h-full w-full"
            showPlayBadge={firstItem.generationType === 'video'}
          />
          <div className="absolute inset-0" style={{ opacity: onionOpacity / 100 }}>
            <MediaPreview
              kind={secondItem.generationType}
              src={secondItem.imagePath}
              poster={secondItem.posterPath}
              alt={`Onion overlay ${secondItem.label}`}
              className="h-full w-full"
              mediaClassName="h-full w-full object-contain"
              fallbackClassName="absolute inset-0 h-full w-full"
              showPlayBadge={secondItem.generationType === 'video'}
            />
          </div>
          <CompareLabel item={firstItem} className="absolute left-3 top-3" />
          <CompareLabel item={secondItem} className="absolute right-3 top-3" />
          <label className="absolute bottom-4 left-1/2 flex w-72 max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-void/80 px-3 py-2 backdrop-blur-sm">
            <span className="type-ui text-text-body">Overlay</span>
            <input
              type="range"
              aria-label="Overlay opacity"
              min={0}
              max={100}
              value={onionOpacity}
              onChange={(event) => setOnionOpacity(Number(event.target.value))}
              className="min-w-0 flex-1 accent-accent-primary"
            />
            <span className="w-8 text-right type-meta text-text-muted">{onionOpacity}%</span>
          </label>
        </div>
      )}

      {mode === 'grid' && (
        <ul
          aria-label="Pinned comparison outputs"
          className={cn(
            'grid min-h-0 flex-1 list-none overflow-auto lg:grid-cols-4',
            density === 'compact' ? 'grid-cols-2 gap-2 p-2' : 'grid-cols-2 gap-3 p-3',
          )}
        >
          {items.map((item, index) => (
            <li
              key={`${item.id}-${index}`}
              className="relative min-h-[220px] overflow-hidden rounded-md border border-border bg-void"
            >
              <MediaPreview
                kind={item.generationType}
                src={item.imagePath}
                poster={item.posterPath}
                alt={`Grid compare ${item.label}`}
                className="h-full w-full"
                mediaClassName="h-full w-full object-contain"
                fallbackClassName="h-full w-full"
                showPlayBadge={item.generationType === 'video'}
              />
              <CompareLabel item={item} className="absolute left-3 right-3 top-3" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function getNumberParam(params: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getStringParam(params: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function toGenerationDraft(item: ViewerItem): GenerationDraft {
  return {
    generationType: item.generationType,
    prompt: item.prompt === 'No prompt saved' ? '' : item.prompt,
    negativePrompt: item.negativePrompt,
    width: item.width ?? 1024,
    height: item.height ?? 1024,
    steps: item.steps ?? 25,
    cfgScale: item.cfgScale ?? 7.5,
    model: item.model ?? 'flux-dev',
    scheduler: item.scheduler ?? 'Euler a',
    seed: item.seed ?? -1,
  };
}

function toSceneGenerationConfig(item: ViewerItem) {
  return {
    ...DEFAULT_GENERATION_CONFIG,
    model: item.model ?? DEFAULT_GENERATION_CONFIG.model,
    steps: item.steps ?? DEFAULT_GENERATION_CONFIG.steps,
    cfgScale: item.cfgScale ?? DEFAULT_GENERATION_CONFIG.cfgScale,
    scheduler: item.scheduler ?? DEFAULT_GENERATION_CONFIG.scheduler,
    seed: item.seed ?? DEFAULT_GENERATION_CONFIG.seed,
    width: item.width ?? DEFAULT_GENERATION_CONFIG.width,
    height: item.height ?? DEFAULT_GENERATION_CONFIG.height,
  };
}

function SideBySideCompare({
  density,
  items,
  onRemove,
}: {
  density: 'comfortable' | 'compact';
  items: ViewerItem[];
  onRemove: (imagePath: string) => void;
}) {
  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 grid-cols-2',
        density === 'compact' ? 'gap-2 p-2' : 'gap-3 p-3',
      )}
    >
      {items.map((item, index) => (
        <article key={`${item.id}-${index}`} className="relative min-h-0 overflow-hidden rounded-md border border-border bg-void">
          <MediaPreview
            kind={item.generationType}
            src={item.imagePath}
            poster={item.posterPath}
            alt={`Compare ${item.label}`}
            className="h-full w-full"
            mediaClassName="h-full w-full object-contain"
            fallbackClassName="h-full w-full"
            showPlayBadge={item.generationType === 'video'}
          />
          <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
            <CompareLabel item={item} />
            <button
              type="button"
              aria-label={`Remove ${item.label} from compare`}
              onClick={() => onRemove(item.imagePath)}
              className="rounded-md border border-border bg-void/70 p-1.5 text-text-muted transition-all hover:border-border-hover hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CompareLabel({ item, className }: { item: ViewerItem; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-md border border-border bg-void/70 px-2 py-1 backdrop-blur-sm', className)}>
      <p className="truncate type-ui text-text-primary">{item.label}</p>
      <p className="mt-0.5 type-caption">{item.source}</p>
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="type-caption">{label}</dt>
      <dd className="mt-1 truncate type-meta text-text-primary">{value}</dd>
    </div>
  );
}
