import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { Slider } from '@/components/ui/Slider';
import { FilterGrid } from './FilterGrid';
import { CropControls } from './CropControls';
import { TextControls } from './TextControls';
import { AIToolsPanel } from './AIToolsPanel';
import { RegionLockProperties } from './RegionLockProperties';
import { LayerPanel } from './LayerPanel';
import { buildCropBox, getCropDimensions } from '@/features/edit/crop';
import type { ImageAdjustments } from '@/types/editor';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type PropertiesTab = 'adjustments' | 'filters' | 'crop' | 'text' | 'ai' | 'region';

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
    currentImage,
    currentImageAssetPath,
    setCurrentImage,
    upsertDerivedAsset,
    activePanel,
    regionMode,
    activeRegionId,
    projects,
    activeProjectId,
    activeSceneId,
    updateRegionLock,
    deleteRegionLock,
    createRegionLock,
    setActiveRegionId,
    setActiveMaskTool,
  } = useAppStore();

  // Find the active region lock
  const activeRegionLock = (() => {
    if (!activeProjectId || !activeSceneId || !activeRegionId) return null;
    const project = projects.find((p) => p.id === activeProjectId);
    const scene = project?.scenes.find((s) => s.id === activeSceneId);
    return scene?.regionLocks.find((l) => l.id === activeRegionId) ?? null;
  })();

  // Auto-switch to region tab when region mode is active and a region is selected
  useEffect(() => {
    if (regionMode && activeRegionId && activeTab !== 'region') {
      setActiveTab('region');
    }
  }, [regionMode, activeRegionId]);

  const [activeTab, setActiveTab] = useState<PropertiesTab>('adjustments');
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Light', 'Color']);

  // Filter state
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filterIntensity, setFilterIntensity] = useState(100);
  const [stackMode, setStackMode] = useState(false);

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

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) =>
      prev.includes(title) ? prev.filter((g) => g !== title) : [...prev, title]
    );
  };

  const handleToggleFilter = (filterId: string) => {
    if (stackMode) {
      setSelectedFilters((prev) =>
        prev.includes(filterId)
          ? prev.filter((id) => id !== filterId)
          : [...prev, filterId]
      );
    } else {
      setSelectedFilters((prev) =>
        prev.includes(filterId) ? [] : [filterId]
      );
    }
  };

  const tabs: { id: PropertiesTab; label: string; icon: React.ElementType }[] = [
    { id: 'adjustments', label: 'Adjust', icon: Sun },
    { id: 'filters', label: 'Filters', icon: Sparkles },
    { id: 'crop', label: 'Crop', icon: Crop },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'ai', label: 'AI Tools', icon: Wand2 },
    { id: 'region', label: 'Region', icon: Lock },
  ];

  const undoCount = editHistory.length;
  const computedCropBox = imageSize
    ? buildCropBox(cropAspect, imageSize.width, imageSize.height, customWidth, customHeight)
    : null;
  const cropDimensions = imageSize
    ? getCropDimensions(cropAspect, imageSize.width, imageSize.height, customWidth, customHeight)
    : null;

  const handleApplyCrop = async () => {
    if (!currentImageAssetPath) {
      return;
    }

    const result = await window.electron.generation.cropImage({
      source_path: currentImageAssetPath,
      crop_box: computedCropBox ?? undefined,
      rotation,
      flip_horizontal: flipH,
      flip_vertical: flipV,
    });

    if (!result?.image || !result?.output_path) {
      return;
    }

    upsertDerivedAsset(result, {
      prompt: '',
      params: {
        sourcePanel: activePanel,
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

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Edit Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-elevated">
        <div className="flex items-center gap-1">
          <button
            disabled={undoCount === 0}
            className={cn(
              'relative p-2 rounded-lg transition-all',
              undoCount > 0
                ? 'text-text-body hover:text-text-primary hover:bg-surface'
                : 'text-text-muted/40 cursor-not-allowed'
            )}
            title="Undo"
            aria-label={undoCount > 0 ? `Undo (${undoCount} actions)` : 'Undo'}
          >
            <Undo2 className="w-4 h-4" />
            {undoCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-primary text-text-primary text-[8px] font-mono flex items-center justify-center">
                {Math.min(undoCount, 99)}
              </span>
            )}
          </button>
          <button
            disabled
            className="p-2 rounded-lg text-text-muted/40 cursor-not-allowed"
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all"
            title="Before/After"
          >
            <SplitSquareHorizontal className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all"
            title="History"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

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
                  'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all font-display text-micro',
                  isActive
                    ? 'bg-red-aura text-red-primary'
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
                      className="flex items-center gap-2 w-full text-left mb-3"
                      aria-expanded={isExpanded}
                    >
                      <Icon className="w-3.5 h-3.5 text-red-primary" />
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
                  className="flex items-center gap-2 w-full py-2 text-sm text-text-muted hover:text-text-primary transition-all font-display justify-center"
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
                selectedFilters={selectedFilters}
                onToggleFilter={handleToggleFilter}
                intensity={filterIntensity}
                onIntensityChange={setFilterIntensity}
                stackMode={stackMode}
                onStackModeChange={setStackMode}
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
              />
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
                <RegionLockProperties
                  region={activeRegionLock}
                  onUpdate={(updates) => updateRegionLock(activeRegionLock.sceneId, activeRegionLock.id, updates)}
                  onDelete={() => {
                    deleteRegionLock(activeRegionLock.sceneId, activeRegionLock.id);
                  }}
                  onGenerate={() => {
                    // TODO: Wire to generation pipeline
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Lock className="w-8 h-8 text-text-muted mb-3 opacity-40" />
                  <p className="font-display text-sm text-text-muted">
                    No region selected
                  </p>
                  <p className="font-display text-xs text-text-muted mt-1 mb-4">
                    Create a region lock, then draw its mask on the canvas
                  </p>
                  <button
                    type="button"
                    data-testid="create-region-lock"
                    disabled={!activeSceneId}
                    onClick={() => {
                      if (!activeSceneId) return;
                      const project = projects.find((p) => p.id === activeProjectId);
                      const scene = project?.scenes.find((s) => s.id === activeSceneId);
                      const frameId = scene?.frames[0]?.id ?? `${activeSceneId}-frame-default`;
                      const index = (scene?.regionLocks.length ?? 0) + 1;
                      const lock = createRegionLock(activeSceneId, frameId, {
                        name: `Region ${index}`,
                      });
                      setActiveRegionId(lock.id);
                      setActiveMaskTool('rectangle');
                    }}
                    className="px-4 py-2 rounded-lg bg-red-primary text-white text-sm font-display font-medium hover:bg-red-highlight active:bg-red-pressed transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary"
                  >
                    Create Region Lock
                  </button>
                  {!activeSceneId && (
                    <p className="font-display text-xs text-text-muted mt-3">
                      Select a scene first
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Layer Panel — Always visible at bottom */}
      <LayerPanel />
    </div>
  );
}
