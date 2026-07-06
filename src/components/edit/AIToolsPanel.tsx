import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { isLikelyVideoPath } from '@/components/ui/MediaPreview';
import { useAppStore } from '@/store/appStore';
import { useEditTool } from '@/features/edit/useEditTool';
import type { EditOperation } from '@/features/edit/runEditTool';
import {
  Scissors,
  Maximize2,
  Palette,
  Paintbrush,
  User,
  Eraser,
  Expand,
  ChevronDown,
  Loader2,
  Wand2,
  AlertCircle,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AITool {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
}

const AI_TOOLS: AITool[] = [
  { id: 'bg-removal', name: 'Background Removal', description: 'Remove the background with U2-Net', icon: Scissors },
  { id: 'upscale', name: 'AI Upscale', description: 'Enhance resolution with Real-ESRGAN', icon: Maximize2 },
  { id: 'style-transfer', name: 'Style Transfer', description: 'Apply artistic styles to your image', icon: Palette },
  { id: 'gen-fill', name: 'Generative Fill', description: 'Fill masked areas with AI content', icon: Paintbrush },
  { id: 'face-enhance', name: 'Face Enhancement', description: 'Restore facial detail with GFPGAN', icon: User },
  { id: 'object-removal', name: 'Object Removal', description: 'Remove unwanted objects seamlessly', icon: Eraser },
  { id: 'outpaint', name: 'AI Expand', description: 'Extend image boundaries with AI', icon: Expand },
];

const STYLE_PRESETS = [
  { id: 'van-gogh', name: 'Van Gogh', color: 'var(--color-feature-04)' },
  { id: 'monet', name: 'Monet', color: 'var(--color-feature-08)' },
  { id: 'ukiyo-e', name: 'Ukiyo-e', color: 'var(--color-feature-01)' },
  { id: 'comic', name: 'Comic', color: 'var(--color-feature-07)' },
  { id: 'watercolor', name: 'Watercolor', color: 'var(--color-feature-02)' },
  { id: 'pencil', name: 'Pencil Sketch', color: '#636e72' },
];

// The three PR1 model-backed tools; the other four route through the guided
// passes and arrive with the next update (their Apply stays disabled - no
// fake spinners, ever).
const OPERATION_BY_TOOL: Record<string, EditOperation> = {
  'bg-removal': 'remove-background',
  upscale: 'upscale',
  'face-enhance': 'restore-faces',
};

const GUIDED_TOOL_CAPTION = 'Ships with the guided-pass update.';

export function AIToolsPanel() {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Tool-specific state
  const [edgeRefinement, setEdgeRefinement] = useState(50);
  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);
  const [upscaleModel, setUpscaleModel] = useState('general');
  const [stylePreset, setStylePreset] = useState('van-gogh');
  const [styleStrength, setStyleStrength] = useState(75);
  const [genFillPrompt, setGenFillPrompt] = useState('');
  const [faceStrength, setFaceStrength] = useState(50);
  const [expandDirection, setExpandDirection] = useState<string[]>(['right']);
  const [expandPixels, setExpandPixels] = useState(256);
  const [expandPrompt, setExpandPrompt] = useState('');

  const { currentImage, currentImageAssetPath, setActiveTab } = useAppStore(
    useShallow((s) => ({
      currentImage: s.currentImage,
      currentImageAssetPath: s.currentImageAssetPath,
      setActiveTab: s.setActiveTab,
    })),
  );
  const { run, isRunning, runningOperation, progress, error, notice, clearFeedback } =
    useEditTool();

  const isVideoSource = isLikelyVideoPath(currentImageAssetPath ?? currentImage);
  const canApply = Boolean(currentImageAssetPath) && !isVideoSource && !isRunning;

  const handleApply = (toolId: string) => {
    const operation = OPERATION_BY_TOOL[toolId];
    if (!operation || !canApply || !currentImageAssetPath) {
      return;
    }
    if (operation === 'remove-background') {
      void run(operation, {
        source_path: currentImageAssetPath,
        edge_refinement: edgeRefinement,
      });
    } else if (operation === 'upscale') {
      void run(operation, {
        source_path: currentImageAssetPath,
        scale: upscaleFactor,
        model: upscaleModel === 'anime' ? 'anime' : 'general',
        face_enhance: upscaleModel === 'face',
      });
    } else {
      void run(operation, {
        source_path: currentImageAssetPath,
        strength: faceStrength,
      });
    }
  };

  const toggleTool = (toolId: string) => {
    setExpandedTool(expandedTool === toolId ? null : toolId);
  };

  const toggleDirection = (dir: string) => {
    setExpandDirection((prev) =>
      prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]
    );
  };

  const isToolProcessing = (toolId: string) => {
    const operation = OPERATION_BY_TOOL[toolId];
    return Boolean(isRunning && operation && runningOperation === operation);
  };

  // Real progress next to the spinner while a tool runs (Button loadingLabel).
  const processingLabel = progress > 0 ? `${Math.round(progress)}%` : undefined;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wand2 className="w-3.5 h-3.5 text-accent-primary" />
        <span className="text-label text-text-primary">AI Tools</span>
      </div>

      {/* Last run failed - honest message, Foundry pointer when installable */}
      {error && (
        <div
          role="alert"
          data-testid="edit-tool-error"
          className="flex items-start gap-2 rounded-sm border border-status-error-border bg-status-error-muted px-3 py-2"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
          <p className="flex-1 type-caption text-status-error">{error}</p>
          {/install .* from the Foundry/i.test(error) && (
            <button
              type="button"
              aria-label="Open Foundry"
              onClick={() => setActiveTab('foundry')}
              className="type-caption font-medium text-status-error underline underline-offset-2"
            >
              Open Foundry
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={clearFeedback}
            className="raised-control p-1 text-status-error hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          data-testid="edit-tool-notice"
          className="flex items-start gap-2 rounded-sm border border-border bg-elevated px-3 py-2"
        >
          <p className="flex-1 type-caption text-text-body">{notice}</p>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={clearFeedback}
            className="raised-control p-1 text-text-muted hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Tool Cards */}
      {AI_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isExpanded = expandedTool === tool.id;
        const isProcessing = isToolProcessing(tool.id);

        return (
          <div
            key={tool.id}
            className={cn(
              'rounded-md border transition-all overflow-hidden',
              isExpanded
                ? 'border-border-hover bg-elevated'
                : 'border-border bg-elevated/50 hover:border-border-hover'
            )}
          >
            {/* Card Header */}
            <button
              onClick={() => toggleTool(tool.id)}
              aria-expanded={isExpanded}
              className="w-full flex items-center gap-3 px-3 py-3 text-left"
            >
              <div className="raised-control flex h-8 w-8 flex-shrink-0 items-center justify-center text-accent-primary">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="type-section">
                  {tool.name}
                </h4>
                <p className="type-caption">{tool.description}</p>
              </div>
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>

            {/* Expanded Controls */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-3">
                    {/* Background Removal */}
                    {tool.id === 'bg-removal' && (
                      <>
                        <Slider
                          label="Edge Refinement"
                          value={edgeRefinement}
                          min={0}
                          max={100}
                          onChange={setEdgeRefinement}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={isProcessing ? Loader2 : Scissors}
                          isLoading={isProcessing}
                          loadingLabel={processingLabel}
                          disabled={!canApply}
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with Background Removal"
                        >
                          Remove Background
                        </Button>
                      </>
                    )}

                    {/* AI Upscale */}
                    {tool.id === 'upscale' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-label text-text-body">Scale</label>
                          <div className="flex gap-2">
                            {([2, 4] as const).map((factor) => (
                              <button
                                key={factor}
                                onClick={() => setUpscaleFactor(factor)}
                                className={cn(
                                  'flex-1 py-2 rounded-md border text-sm font-medium transition-all',
                                  upscaleFactor === factor
                                    ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                                    : 'border-border bg-surface text-text-body'
                                )}
                              >
                                {factor}x
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-label text-text-body">Model</label>
                          <select
                            value={upscaleModel}
                            onChange={(e) => setUpscaleModel(e.target.value)}
                            className="w-full appearance-none bg-elevated border border-border rounded-md px-3 py-2 text-xs text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
                          >
                            <option value="general">General</option>
                            <option value="face">Face</option>
                            <option value="anime">Anime</option>
                          </select>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={isProcessing ? Loader2 : Maximize2}
                          isLoading={isProcessing}
                          loadingLabel={processingLabel}
                          disabled={!canApply}
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with AI Upscale"
                        >
                          Upscale
                        </Button>
                      </>
                    )}

                    {/* Style Transfer (guided pass - PR2) */}
                    {tool.id === 'style-transfer' && (
                      <>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                          {STYLE_PRESETS.map((style) => (
                            <button
                              key={style.id}
                              onClick={() => setStylePreset(style.id)}
                              className={cn(
                                'py-2 rounded-md text-xs font-medium transition-all text-center',
                                stylePreset === style.id
                                  ? 'text-text-primary'
                                  : 'bg-surface text-text-body border border-border'
                              )}
                              style={
                                stylePreset === style.id
                                  ? {
                                      backgroundColor: hexToRgba(style.color, 0.13),
                                      color: style.color,
                                      border: `1px solid ${hexToRgba(style.color, 0.25)}`,
                                    }
                                  : undefined
                              }
                            >
                              {style.name}
                            </button>
                          ))}
                        </div>
                        <Slider
                          label="Strength"
                          value={styleStrength}
                          min={0}
                          max={100}
                          onChange={setStyleStrength}
                          valueFormatter={(v) => `${v}%`}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={Palette}
                          disabled
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with Style Transfer"
                        >
                          Apply Style
                        </Button>
                        <p className="type-caption text-text-muted">{GUIDED_TOOL_CAPTION}</p>
                      </>
                    )}

                    {/* Generative Fill (guided pass - PR2) */}
                    {tool.id === 'gen-fill' && (
                      <>
                        <p className="text-xs text-text-muted">
                          Paint over the area you want to fill, then describe the content.
                        </p>
                        <input
                          value={genFillPrompt}
                          onChange={(e) => setGenFillPrompt(e.target.value)}
                          placeholder="Describe fill content..."
                          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary transition-all"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={Paintbrush}
                          disabled
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with Generative Fill"
                        >
                          Generate Fill
                        </Button>
                        <p className="type-caption text-text-muted">{GUIDED_TOOL_CAPTION}</p>
                      </>
                    )}

                    {/* Face Enhancement */}
                    {tool.id === 'face-enhance' && (
                      <>
                        <Slider
                          label="Enhancement"
                          value={faceStrength}
                          min={0}
                          max={100}
                          onChange={setFaceStrength}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={isProcessing ? Loader2 : User}
                          isLoading={isProcessing}
                          loadingLabel={processingLabel}
                          disabled={!canApply}
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with Face Enhancement"
                        >
                          Enhance Face
                        </Button>
                      </>
                    )}

                    {/* Object Removal (guided pass - PR2) */}
                    {tool.id === 'object-removal' && (
                      <>
                        <p className="text-xs text-text-muted">
                          Brush over the object you want to remove, then click Remove.
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={Eraser}
                          disabled
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with Object Removal"
                        >
                          Remove Object
                        </Button>
                        <p className="type-caption text-text-muted">{GUIDED_TOOL_CAPTION}</p>
                      </>
                    )}

                    {/* AI Expand (guided pass - PR2) */}
                    {tool.id === 'outpaint' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-label text-text-body">Direction</label>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { id: 'up', icon: ArrowUp, label: 'Up' },
                              { id: 'down', icon: ArrowDown, label: 'Down' },
                              { id: 'left', icon: ArrowLeft, label: 'Left' },
                              { id: 'right', icon: ArrowRight, label: 'Right' },
                            ].map(({ id, icon: DirIcon, label }) => (
                              <button
                                key={id}
                                onClick={() => toggleDirection(id)}
                                className={cn(
                                  'flex flex-col items-center gap-1 py-2 rounded-md border text-xs transition-all',
                                  expandDirection.includes(id)
                                    ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                                    : 'border-border bg-surface text-text-body'
                                )}
                              >
                                <DirIcon className="w-3.5 h-3.5" />
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-label text-text-body">Pixels</label>
                          <input
                            type="number"
                            value={expandPixels}
                            onChange={(e) => setExpandPixels(Number(e.target.value))}
                            className="w-full bg-surface border border-border rounded-md px-3 py-2 data-mono text-text-primary focus:border-accent-primary transition-all"
                          />
                        </div>
                        <input
                          value={expandPrompt}
                          onChange={(e) => setExpandPrompt(e.target.value)}
                          placeholder="Describe expanded area..."
                          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary transition-all"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          icon={Expand}
                          disabled
                          onClick={() => handleApply(tool.id)}
                          aria-label="Process with AI Expand"
                        >
                          Expand Image
                        </Button>
                        <p className="type-caption text-text-muted">{GUIDED_TOOL_CAPTION}</p>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
