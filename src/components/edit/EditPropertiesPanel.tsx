import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { exportEditedImage } from '@/features/edit/exportEdit';
import { toggleLookFilter } from '@/features/edit/imageFilters';
import { planRegionLockGeneration } from '@/features/edit/regionLockGeneration';
import { useEditTool } from '@/features/edit/useEditTool';
import { useAppStore } from '@/store/appStore';
import { selectActiveRegionLock, selectActiveScene } from '@/store/slices/projectSlice';
import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/Slider';
import { FilterGrid } from './FilterGrid';
import { CropControls } from './CropControls';
import { TextControls } from './TextControls';
import { AIToolsPanel } from './AIToolsPanel';
import { RegionLockProperties } from './RegionLockProperties';
import { CanvasControlLayerProperties } from '@/components/canvas/CanvasControlLayerProperties';
import { buildCropBox, getCropDimensions } from '@/features/edit/crop';
import {
  promoteFrameToClip,
  promoteFrameToReference,
} from '@/features/media/frameExtraction';
import type { ImageAdjustments } from '@/types/editor';
import type { ReferenceSlotType } from '@/types/media';
import type { CanvasControlLayer } from '@/types/project';
import {
  Sun,
  Sparkles,
  Crop,
  Type,
  Wand2,
  Palette,
  RotateCcw,
  Undo2,
  Redo2,
  SplitSquareHorizontal,
  History,
  Lock,
  Layers3,
  GitBranch,
  Image as ImageIcon,
  PaintBucket,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isLikelyVideoPath } from '@/components/ui/MediaPreview';

type PropertiesTab = 'adjustments' | 'filters' | 'crop' | 'text' | 'ai' | 'control' | 'region';

const ADJUSTMENT_GROUPS: {
  title: string;
  icon: React.ElementType;
  fields: { key: keyof ImageAdjustments; label: string; min: number; max: number }[];
}[] = [
  {
    title: 'Light',
    icon: Sun,
    fields: [
      { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
      { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
      { key: 'whites', label: 'Whites', min: -100, max: 100 },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100 },
    ],
  },
  {
    title: 'Color',
    icon: Palette,
    fields: [
      { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
      { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
      { key: 'tint', label: 'Tint', min: -100, max: 100 },
    ],
  },
  {
    title: 'Detail',
    icon: Sparkles,
    fields: [
      { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
      { key: 'noiseReduction', label: 'Noise Reduction', min: 0, max: 100 },
    ],
  },
  {
    title: 'Effects',
    icon: Wand2,
    fields: [
      { key: 'blur', label: 'Blur', min: 0, max: 100 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
      { key: 'grain', label: 'Grain', min: 0, max: 100 },
    ],
  },
];

export function EditPropertiesPanel() {
  const {
    imageAdjustments,
    setImageAdjustments,
    resetImageAdjustments,
    editHistory,
    editHistoryIndex,
    undo,
    redo,
    jumpToEditHistory,
    editFilters,
    setEditFilters,
    editCompareOriginal,
    setEditCompareOriginal,
    activeEditTool,
    currentImage,
    currentImageAssetPath,
    setCurrentImage,
    upsertDerivedAsset,
    activeTab: navTab,
    regionMode,
    activeRegionId,
    activeMaskTool,
    activeRegionLock,
    activeScene,
    activeProjectId,
    activeSceneId,
    activeTimelineClipId,
    updateRegionLock,
    deleteRegionLock,
    createRegionLock,
    setActiveRegionId,
    setActiveMaskTool,
    setRegionMode,
    setActiveCanvasControlLayerId,
    updateCanvasControlLayer,
    deleteCanvasControlLayer,
    createCanvasControlLayer,
  } = useAppStore(
    useShallow((s) => ({
      imageAdjustments: s.imageAdjustments,
      setImageAdjustments: s.setImageAdjustments,
      resetImageAdjustments: s.resetImageAdjustments,
      editHistory: s.editHistory,
      editHistoryIndex: s.editHistoryIndex,
      undo: s.undo,
      redo: s.redo,
      jumpToEditHistory: s.jumpToEditHistory,
      editFilters: s.editFilters,
      setEditFilters: s.setEditFilters,
      editCompareOriginal: s.editCompareOriginal,
      setEditCompareOriginal: s.setEditCompareOriginal,
      activeEditTool: s.activeEditTool,
      currentImage: s.currentImage,
      currentImageAssetPath: s.currentImageAssetPath,
      setCurrentImage: s.setCurrentImage,
      upsertDerivedAsset: s.upsertDerivedAsset,
      activeTab: s.activeTab,
      regionMode: s.regionMode,
      activeRegionId: s.activeRegionId,
      activeMaskTool: s.activeMaskTool,
      // Resolved in the selectors, never as a `state.projects` subscription.
      // Every project writer rebuilds the `projects` array wholesale
      // (projectSlice.ts:715), so subscribing to the array re-rendered this
      // whole inspector -- filter grid, every slider -- on writes to other
      // scenes and other projects. The resolved lock and scene keep their
      // identity through those writes, which is what lets useShallow compare
      // them by reference (see projectSlice.ts:940).
      activeRegionLock: selectActiveRegionLock(s),
      activeScene: selectActiveScene(s),
      activeProjectId: s.activeProjectId,
      activeSceneId: s.activeSceneId,
      activeTimelineClipId: s.activeTimelineClipId,
      updateRegionLock: s.updateRegionLock,
      deleteRegionLock: s.deleteRegionLock,
      createRegionLock: s.createRegionLock,
      setActiveRegionId: s.setActiveRegionId,
      setActiveMaskTool: s.setActiveMaskTool,
      setRegionMode: s.setRegionMode,
      setActiveCanvasControlLayerId: s.setActiveCanvasControlLayerId,
      updateCanvasControlLayer: s.updateCanvasControlLayer,
      deleteCanvasControlLayer: s.deleteCanvasControlLayer,
      createCanvasControlLayer: s.createCanvasControlLayer,
    }))
  );

  const [activeTab, setActiveTab] = useState<PropertiesTab>('adjustments');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Light', 'Color']);
  const [promotionSlot, setPromotionSlot] = useState<ReferenceSlotType>('composition');
  const [promotionStatus, setPromotionStatus] = useState<string | null>(null);

  const activeCanvasControlLayer = (() => {
    if (!activeScene?.activeCanvasControlLayerId) {
      return null;
    }

    return (
      activeScene.canvasControlLayers.find(
        (layer) => layer.id === activeScene.activeCanvasControlLayerId,
      ) ?? null
    );
  })();

  // Auto-switch to region tab when region mode is active and a region is selected
  useEffect(() => {
    if (regionMode && activeRegionId && activeTab !== 'region') {
      setActiveTab('region');
    }
  }, [regionMode, activeRegionId, activeTab]);

  useEffect(() => {
    if (activeCanvasControlLayer && !activeRegionId && activeTab !== 'control') {
      setActiveTab('control');
    }
  }, [activeCanvasControlLayer, activeRegionId, activeTab]);

  // Sync regionMode with the region tab: entering the tab enables region mode,
  // leaving it disables region mode. This gives users a single, discoverable
  // entry point to region-lock features.
  useEffect(() => {
    if ((activeTab === 'region' || activeTab === 'control') && !regionMode) {
      setRegionMode(true);
    } else if (activeTab !== 'region' && activeTab !== 'control' && regionMode) {
      setRegionMode(false);
    }
  }, [activeTab, regionMode, setRegionMode]);

  // The Crop tool's controls live in the Crop tab: picking the tool (strip or
  // C key) opens it. Keyed on the tool alone so the tab can still be left.
  useEffect(() => {
    if (activeEditTool === 'crop') {
      setActiveTab('crop');
    }
  }, [activeEditTool]);

  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showHistory) return;
    const onPointerDown = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHistory(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showHistory]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus(null);
    try {
      const result = await exportEditedImage();
      setExportStatus(
        result.ok
          ? { tone: 'success', message: 'Edited image saved to Assets.' }
          : { tone: 'error', message: result.error ?? 'Export failed.' },
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Region Lock generation runs the masked inpaint pass (see
  // regionLockGeneration.ts), with its own progress and honest errors.
  const regionTool = useEditTool();
  const [regionError, setRegionError] = useState<string | null>(null);
  useEffect(() => {
    setRegionError(null);
  }, [activeRegionId]);

  // Crop state
  const [cropAspect, setCropAspect] = useState('free');
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [customWidth, setCustomWidth] = useState(1024);
  const [customHeight, setCustomHeight] = useState(1024);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!currentImage) {
      setImageSize(null);
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      setImageSize({ width, height });
      setCustomWidth(width);
      setCustomHeight(height);
    };
    image.src = currentImage;
  }, [currentImage]);

  useEffect(() => {
    setPromotionStatus(null);
  }, [currentImageAssetPath, activeTimelineClipId, activeSceneId, activeProjectId]);

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) =>
      prev.includes(title) ? prev.filter((g) => g !== title) : [...prev, title]
    );
  };

  const handleToggleFilter = (filterId: string) => {
    setEditFilters({ selected: toggleLookFilter(editFilters, filterId) });
  };

  const tabs: { id: PropertiesTab; label: string; icon: React.ElementType }[] = [
    { id: 'adjustments', label: 'Adjust', icon: Sun },
    { id: 'filters', label: 'Filters', icon: Sparkles },
    { id: 'crop', label: 'Crop', icon: Crop },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'ai', label: 'AI Tools', icon: Wand2 },
    { id: 'control', label: 'Control', icon: Layers3 },
    { id: 'region', label: 'Region', icon: Lock },
  ];

  const handleCreateCanvasControlLayer = (type: CanvasControlLayer['type']) => {
    if (!activeSceneId) {
      return;
    }

    setActiveRegionId(null);
    const layer = createCanvasControlLayer(activeSceneId, { type });
    if (layer) {
      setActiveCanvasControlLayerId(activeSceneId, layer.id);
      setActiveMaskTool('rectangle');
    }
  };

  // Undo steps available: every entry before the current one.
  const undoCount = Math.max(0, editHistoryIndex);
  const canUndo = editHistoryIndex > 0;
  const canRedo = editHistoryIndex < editHistory.length - 1;
  const [isCropping, setIsCropping] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const isVideoSource = isLikelyVideoPath(currentImageAssetPath ?? currentImage);
  const computedCropBox = imageSize
    ? buildCropBox(cropAspect, imageSize.width, imageSize.height, customWidth, customHeight)
    : null;
  const cropDimensions = imageSize
    ? getCropDimensions(cropAspect, imageSize.width, imageSize.height, customWidth, customHeight)
    : null;

  const handleApplyCrop = async () => {
    if (isCropping) return;
    if (!currentImageAssetPath || isVideoSource) {
      setCropError(
        isVideoSource
          ? 'Extract a still frame before cropping.'
          : 'Crop needs an image saved in Assets. Load one from the Viewer or Assets.',
      );
      return;
    }

    setIsCropping(true);
    setCropError(null);
    let result: Awaited<ReturnType<typeof window.electron.generation.cropImage>>;
    try {
      result = await window.electron.generation.cropImage({
        source_path: currentImageAssetPath,
        crop_box: computedCropBox ?? undefined,
        rotation,
        flip_horizontal: flipH,
        flip_vertical: flipV,
      });
    } catch (error) {
      setCropError(error instanceof Error ? error.message : 'Crop failed.');
      return;
    } finally {
      setIsCropping(false);
    }

    if (!result?.image || !result?.output_path) {
      setCropError('Crop failed: the backend returned no image.');
      return;
    }

    upsertDerivedAsset(result, {
      prompt: '',
      params: {
        sourceTab: navTab,
        rotation,
        flipH,
        flipV,
      },
    });
    setCurrentImage(
      result.image.startsWith('http') ? result.image : `http://localhost:8000${result.image}`,
      result.output_path
    );
    setActiveTab('adjustments');
  };

  const handlePromoteReference = () => {
    if (!currentImageAssetPath || isVideoSource) {
      return;
    }

    try {
      promoteFrameToReference({
        assetPath: currentImageAssetPath,
        slot: promotionSlot,
        projectId: activeProjectId,
        sceneId: activeSceneId,
        clipId: activeTimelineClipId,
      });
      setPromotionStatus(
        activeTimelineClipId
          ? 'Frame added to the selected clip reference set.'
          : activeSceneId
            ? 'Frame added to the current scene reference set.'
            : activeProjectId
              ? 'Frame added to the current project reference set.'
              : 'Frame added to the working reference set.',
      );
    } catch (error) {
      setPromotionStatus(error instanceof Error ? error.message : 'Reference promotion failed.');
    }
  };

  const handlePromoteClipPoster = () => {
    if (!currentImageAssetPath || isVideoSource || !activeTimelineClipId) {
      return;
    }

    try {
      promoteFrameToClip({
        assetPath: currentImageAssetPath,
        clipId: activeTimelineClipId,
      });
      setPromotionStatus('Selected clip poster updated. Future clip variants now inherit this frame.');
    } catch (error) {
      setPromotionStatus(error instanceof Error ? error.message : 'Clip poster update failed.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Edit Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-elevated">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className={cn(
              'relative p-2 rounded-md transition',
              canUndo
                ? 'text-text-body hover:text-text-primary hover:bg-surface'
                : 'text-text-muted/40 cursor-not-allowed'
            )}
            title="Undo (Ctrl+Z)"
            aria-label={canUndo ? `Undo (${undoCount} actions)` : 'Undo'}
          >
            <Undo2 className="w-4 h-4" />
            {undoCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-accent-primary text-void type-badge flex items-center justify-center">
                {Math.min(undoCount, 99)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className={cn(
              'p-2 rounded-md transition',
              canRedo
                ? 'text-text-body hover:text-text-primary hover:bg-surface'
                : 'text-text-muted/40 cursor-not-allowed'
            )}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditCompareOriginal(!editCompareOriginal)}
            disabled={!currentImage}
            aria-pressed={editCompareOriginal}
            aria-label="Before/After compare"
            className={cn(
              'p-2 rounded-md transition disabled:cursor-not-allowed disabled:opacity-40',
              editCompareOriginal
                ? 'bg-accent-primary-muted text-accent-primary'
                : 'text-text-body hover:text-text-primary hover:bg-surface'
            )}
            title="Before/After: show the original without edits"
          >
            <SplitSquareHorizontal className="w-4 h-4" />
          </button>
          <div className="relative" ref={historyRef}>
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              aria-expanded={showHistory}
              aria-haspopup="true"
              aria-label="Edit history"
              className={cn(
                'p-2 rounded-md transition',
                showHistory
                  ? 'bg-accent-primary-muted text-accent-primary'
                  : 'text-text-body hover:text-text-primary hover:bg-surface'
              )}
              title="History"
            >
              <History className="w-4 h-4" />
            </button>
            {showHistory && (
              <div
                role="dialog"
                aria-label="Edit history"
                className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-elevated p-2 shadow-cinematic"
              >
                <p className="mono-label px-2 pb-2 text-text-muted">History</p>
                {editHistory.length === 0 ? (
                  <p className="px-2 pb-1 type-caption text-text-body">No edits yet.</p>
                ) : (
                  <ol className="max-h-64 space-y-0.5 overflow-y-auto">
                    {editHistory.map((entry, index) => {
                      const isCurrent = index === editHistoryIndex;
                      const isFuture = index > editHistoryIndex;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => jumpToEditHistory(index)}
                            aria-current={isCurrent ? 'step' : undefined}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left type-caption transition',
                              isCurrent
                                ? 'raised-control text-text-primary'
                                : isFuture
                                  ? 'text-text-muted hover:bg-surface'
                                  : 'text-text-body hover:bg-surface hover:text-text-primary'
                            )}
                          >
                            <span className="truncate">{entry.action}</span>
                            <span className="data-mono text-text-muted">
                              {new Date(entry.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!currentImage || isExporting || editCompareOriginal}
            aria-label="Export edited image to Assets"
            title={editCompareOriginal ? 'Turn off Before/After to export' : 'Export to Assets'}
            className="p-2 rounded-md text-text-body transition hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      {exportStatus && (
        <p
          role={exportStatus.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'border-b border-border px-3 py-2 type-caption',
            exportStatus.tone === 'error' ? 'text-status-error' : 'text-status-success'
          )}
        >
          {exportStatus.message}
        </p>
      )}

      {/* Tab Bar */}
      <div className="px-2 py-2 border-b border-border">
        <div className="flex gap-1" role="tablist" aria-label="Edit properties">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-2 rounded-md transition type-caption',
                  isActive
                    ? 'bg-accent-primary-muted text-accent-primary'
                    : 'text-text-body hover:text-text-primary hover:bg-elevated'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-border bg-elevated/70 px-3 py-3">
        {isVideoSource ? (
          <div className="space-y-1">
            <p className="type-ui text-text-primary">Frame-first editing</p>
            <p className="type-caption text-text-body">
              A video source is selected. Extract a frame from Viewer, Canvas, or Composition Preview before using still-image edit tools.
            </p>
          </div>
        ) : currentImageAssetPath ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="type-ui text-text-primary">Round-trip this frame</p>
              <p className="type-caption text-text-body">
                Derived edits are already saved into Assets. Promote the current frame into references or the selected clip workflow.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,132px),minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="type-caption text-text-muted">Reference slot</span>
                <select
                  value={promotionSlot}
                  onChange={(event) => setPromotionSlot(event.target.value as ReferenceSlotType)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                >
                  <option value="style">Style</option>
                  <option value="composition">Composition</option>
                  <option value="character">Character</option>
                  <option value="pose">Pose</option>
                  <option value="motion">Motion</option>
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  onClick={handlePromoteReference}
                  className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition hover:bg-elevated"
                >
                  {activeTimelineClipId
                    ? 'Add as clip reference'
                    : activeSceneId
                      ? 'Add as scene reference'
                      : activeProjectId
                        ? 'Add as project reference'
                        : 'Add as working reference'}
                </button>
                {activeTimelineClipId ? (
                  <button
                    type="button"
                    onClick={handlePromoteClipPoster}
                    className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition hover:border-border-hover hover:bg-surface hover:text-text-primary"
                  >
                    Set selected clip poster
                  </button>
                ) : null}
              </div>
            </div>
            {promotionStatus ? (
              <p className="type-caption text-text-primary">{promotionStatus}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="type-ui text-text-primary">Round-trip will appear here</p>
            <p className="type-caption text-text-body">
              Load or extract a still frame to promote it into Assets, references, and timeline clip workflows.
            </p>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        <AnimatePresence mode="wait">
          {/* Adjustments Tab */}
          {activeTab === 'adjustments' && (
            <motion.div
              key="adjustments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              {ADJUSTMENT_GROUPS.map((group) => {
                const Icon = group.icon;
                const isExpanded = expandedGroups.includes(group.title);
                return (
                  <div key={group.title}>
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="flex min-h-6 items-center gap-2 w-full text-left mb-3"
                      aria-expanded={isExpanded}
                    >
                      <Icon className="w-3.5 h-3.5 text-accent-primary" />
                      <span className="text-label text-text-primary">{group.title}</span>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden space-y-4 pl-1"
                        >
                          {group.fields.map((field) => (
                            <Slider
                              key={field.key}
                              label={field.label}
                              value={imageAdjustments[field.key]}
                              min={field.min}
                              max={field.max}
                              onChange={(v) => setImageAdjustments({ [field.key]: v })}
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <div className="pt-4 border-t border-border">
                <button
                  onClick={resetImageAdjustments}
                  className="flex items-center gap-2 w-full py-2 type-ui text-text-muted hover:text-text-primary transition justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset All Adjustments
                </button>
              </div>
            </motion.div>
          )}

          {/* Filters Tab */}
          {activeTab === 'filters' && (
            <motion.div
              key="filters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <FilterGrid
                selectedFilters={editFilters.selected}
                onToggleFilter={handleToggleFilter}
                intensity={editFilters.intensity}
                onIntensityChange={(intensity) => setEditFilters({ intensity })}
                stackMode={editFilters.stackMode}
                onStackModeChange={(stackMode) => setEditFilters({ stackMode })}
                previewImage={currentImage ?? undefined}
              />
            </motion.div>
          )}

          {/* Crop Tab */}
          {activeTab === 'crop' && (
            <motion.div
              key="crop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <CropControls
                cropAspect={cropAspect}
                onCropAspectChange={setCropAspect}
                rotation={rotation}
                onRotationChange={setRotation}
                flipH={flipH}
                onFlipHChange={setFlipH}
                flipV={flipV}
                onFlipVChange={setFlipV}
                cropDimensions={cropDimensions}
                customWidth={customWidth}
                onCustomWidthChange={setCustomWidth}
                customHeight={customHeight}
                onCustomHeightChange={setCustomHeight}
                onApply={handleApplyCrop}
                onCancel={() => setActiveTab('adjustments')}
                isApplying={isCropping}
              />
              {cropError && (
                <p role="alert" className="mt-3 type-caption text-status-error">
                  {cropError}
                </p>
              )}
            </motion.div>
          )}

          {/* Text Tab */}
          {activeTab === 'text' && (
            <motion.div
              key="text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <TextControls />
            </motion.div>
          )}

          {/* AI Tools Tab */}
          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <AIToolsPanel />
            </motion.div>
          )}

          {/* Canvas Control Layer Tab */}
          {activeTab === 'control' && (
            <motion.div
              key="control"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              {activeCanvasControlLayer && activeSceneId ? (
                <CanvasControlLayerProperties
                  layer={activeCanvasControlLayer}
                  activeMaskTool={activeMaskTool}
                  onMaskToolChange={setActiveMaskTool}
                  onUpdate={(updates) =>
                    updateCanvasControlLayer(activeSceneId, activeCanvasControlLayer.id, updates)
                  }
                  onDelete={() => deleteCanvasControlLayer(activeSceneId, activeCanvasControlLayer.id)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Layers3 className="mb-3 h-8 w-8 text-text-muted opacity-40" />
                  <p className="type-caption">No control layer selected</p>
                  <p className="mt-1 mb-4 type-caption">
                    Create or select a canvas control layer, then draw its mask on the canvas.
                  </p>
                  <div className="grid w-full max-w-xs grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCreateCanvasControlLayer('controlnet')}
                      disabled={!activeSceneId}
                      className="btn-chrome vx-btn-chrome inline-flex items-center justify-center gap-2 px-4 py-2 type-ui transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <GitBranch className="h-4 w-4" />
                      Add ControlNet Layer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateCanvasControlLayer('reference-image')}
                      disabled={!activeSceneId}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-text-primary type-ui transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Add Reference Layer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateCanvasControlLayer('inpaint-mask')}
                      disabled={!activeSceneId}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-text-primary type-ui transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <PaintBucket className="h-4 w-4" />
                      Add Inpaint Mask
                    </button>
                  </div>
                  {!activeSceneId && <p className="mt-3 type-caption">Select a scene first</p>}
                </div>
              )}
            </motion.div>
          )}

          {/* Region Lock Tab */}
          {activeTab === 'region' && (
            <motion.div
              key="region"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              {activeRegionLock ? (
                <>
                  <RegionLockProperties
                    region={activeRegionLock}
                    onUpdate={(updates) => updateRegionLock(activeRegionLock.sceneId, activeRegionLock.id, updates)}
                    onDelete={() => {
                      deleteRegionLock(activeRegionLock.sceneId, activeRegionLock.id);
                    }}
                    isGenerating={regionTool.isRunning}
                    onGenerate={() => {
                      if (regionTool.isRunning) return;
                      if (!currentImageAssetPath || isVideoSource) {
                        setRegionError('Load a still image from Assets before generating a region.');
                        return;
                      }
                      const plan = planRegionLockGeneration(activeRegionLock, currentImageAssetPath);
                      if (!plan.ok) {
                        setRegionError(plan.error);
                        return;
                      }
                      setRegionError(null);
                      void regionTool.runGuided(plan.operation, plan.input);
                    }}
                  />
                  {(regionError || regionTool.error) && (
                    <p role="alert" className="mt-2 px-4 type-caption text-status-error">
                      {regionError ?? regionTool.error}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Lock className="w-8 h-8 text-text-muted mb-3 opacity-40" />
                  <p className="type-caption">
                    No region selected
                  </p>
                  <p className="type-caption mt-1 mb-4">
                    Create a region lock, then draw its mask on the canvas
                  </p>
                  <button
                    type="button"
                    data-testid="create-region-lock"
                    disabled={!activeSceneId}
                    onClick={() => {
                      if (!activeSceneId) return;
                      const frameId = activeScene?.frames[0]?.id ?? `${activeSceneId}-frame-default`;
                      const index = (activeScene?.regionLocks.length ?? 0) + 1;
                      const lock = createRegionLock(activeSceneId, frameId, {
                        name: `Region ${index}`,
                      });
                      setActiveRegionId(lock.id);
                      setActiveMaskTool('rectangle');
                    }}
                    className="btn-chrome vx-btn-chrome px-4 py-2 type-ui transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Create Region Lock
                  </button>
                  {!activeSceneId && (
                    <p className="type-caption mt-3">
                      Select a scene first
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
