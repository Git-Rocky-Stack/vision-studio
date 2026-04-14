import { memo } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import {
  Wand2,
  Palette,
  ArrowUpCircle,
  Trash2,
  Lock,
  Unlock,
  Blend,
  Eraser,
} from 'lucide-react';
import type { RegionLock, AITool } from '@/types/project';

interface RegionLockPropertiesProps {
  region: RegionLock;
  onUpdate: (updates: Partial<RegionLock>) => void;
  onDelete: () => void;
  onGenerate: () => void;
  isGenerating?: boolean;
}

const AI_TOOLS: { id: AITool; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'generative-fill', label: 'Generative Fill', icon: Wand2, description: 'Fill region with AI-generated content' },
  { id: 'style-transfer', label: 'Style Transfer', icon: Palette, description: 'Apply a style to the region' },
  { id: 'upscale', label: 'Upscale', icon: ArrowUpCircle, description: 'Upscale the region to higher resolution' },
  { id: 'remove', label: 'Remove', icon: Eraser, description: 'Remove content and fill with surroundings' },
];

export const RegionLockProperties = memo(function RegionLockProperties({
  region,
  onUpdate,
  onDelete,
  onGenerate,
  isGenerating = false,
}: RegionLockPropertiesProps) {
  const { name, aiTool, prompt, strength, invertMask, mask } = region;

  return (
    <div
      className="flex flex-col gap-4 p-4"
      data-testid="region-lock-properties"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-text-primary">
          Region Lock
        </h3>
        <button
          onClick={onDelete}
          className={cn(
            'p-1.5 rounded-lg text-text-muted',
            'hover:text-red-primary hover:bg-red-aura',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary'
          )}
          aria-label="Delete region lock"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Region name */}
      <div>
        <label className="block text-micro font-display font-medium text-text-muted uppercase tracking-wider mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className={cn(
            'w-full px-3 py-2 rounded-lg bg-void border border-border',
            'text-sm font-display text-text-primary',
            'focus:outline-none focus:border-red-primary focus:ring-1 focus:ring-red-primary',
            'transition-colors duration-150',
            'placeholder:text-text-muted'
          )}
          placeholder="Region name"
          aria-label="Region name"
        />
      </div>

      {/* Prompt */}
      {aiTool !== 'upscale' && (
        <div>
          <label className="block text-micro font-display font-medium text-text-muted uppercase tracking-wider mb-1.5">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            rows={3}
            className={cn(
              'w-full px-3 py-2 rounded-lg bg-void border border-border',
              'text-sm font-display text-text-primary resize-y',
              'focus:outline-none focus:border-red-primary focus:ring-1 focus:ring-red-primary',
              'transition-colors duration-150',
              'placeholder:text-text-muted'
            )}
            placeholder={
              aiTool === 'generative-fill'
                ? 'Describe what to generate in this region...'
                : aiTool === 'style-transfer'
                ? 'Describe the style to apply...'
                : 'Describe what to remove...'
            }
            aria-label="Region prompt"
          />
        </div>
      )}

      {/* AI Tool selector */}
      <div>
        <label className="block text-micro font-display font-medium text-text-muted uppercase tracking-wider mb-1.5">
          AI Tool
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {AI_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = aiTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => onUpdate({ aiTool: tool.id })}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-left',
                  'transition-all duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
                  isActive
                    ? 'bg-red-aura text-red-primary border border-red-primary/40'
                    : 'bg-void text-text-body border border-border hover:border-border-hover hover:text-text-primary'
                )}
                aria-pressed={isActive}
                title={tool.description}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="text-xs font-display font-medium truncate">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strength slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-micro font-display font-medium text-text-muted uppercase tracking-wider">
            Strength
          </label>
          <span className="text-micro font-display font-medium text-text-primary">
            {Math.round(strength * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(strength * 100)}
          onChange={(e) => onUpdate({ strength: Number(e.target.value) / 100 })}
          className="w-full accent-red-primary"
          aria-label="Generation strength"
        />
      </div>

      {/* Feather radius slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-micro font-display font-medium text-text-muted uppercase tracking-wider">
            Feather
          </label>
          <span className="text-micro font-display font-medium text-text-primary">
            {mask.featherRadius}px
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={20}
          value={mask.featherRadius}
          onChange={(e) =>
            onUpdate({
              mask: { ...mask, featherRadius: Number(e.target.value) },
            })
          }
          className="w-full accent-red-primary"
          aria-label="Feather radius"
        />
      </div>

      {/* Blend edges toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Blend className="w-4 h-4 text-text-muted" aria-hidden="true" />
          <span className="text-sm font-display text-text-primary">Blend Edges</span>
        </div>
        <button
          onClick={() =>
            onUpdate({
              mask: { ...mask, blendEdges: !mask.blendEdges },
            })
          }
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
            mask.blendEdges ? 'bg-red-primary' : 'bg-elevated border border-border'
          )}
          role="switch"
          aria-checked={mask.blendEdges}
          aria-label="Blend edges"
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200',
              mask.blendEdges ? 'translate-x-5 bg-white' : 'bg-text-muted'
            )}
          />
        </button>
      </div>

      {/* Invert mask toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {invertMask ? (
            <Unlock className="w-4 h-4 text-red-primary" aria-hidden="true" />
          ) : (
            <Lock className="w-4 h-4 text-text-muted" aria-hidden="true" />
          )}
          <span className="text-sm font-display text-text-primary">Invert Mask</span>
        </div>
        <button
          onClick={() => onUpdate({ invertMask: !invertMask })}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-primary',
            invertMask ? 'bg-red-primary' : 'bg-elevated border border-border'
          )}
          role="switch"
          aria-checked={invertMask}
          aria-label="Invert mask"
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200',
              invertMask ? 'translate-x-5 bg-white' : 'bg-text-muted'
            )}
          />
        </button>
      </div>

      {/* Generate button */}
      <Button
        variant="primary"
        fullWidth
        onClick={onGenerate}
        isLoading={isGenerating}
        className="mt-2"
      >
        <Wand2 className="w-4 h-4" aria-hidden="true" />
        {isGenerating ? 'Generating...' : 'Generate Region'}
      </Button>
    </div>
  );
});