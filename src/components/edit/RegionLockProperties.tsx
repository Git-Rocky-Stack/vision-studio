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
        <h3 className="type-section">
          Region Lock
        </h3>
        <button
          onClick={onDelete}
          className={cn(
            'p-1.5 rounded-md text-text-muted',
            'hover:text-status-error hover:bg-status-error-muted',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary'
          )}
          aria-label="Delete region lock"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Region name */}
      <div>
        <label className="block type-caption font-medium mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className={cn(
            'w-full px-3 py-2 rounded-md bg-void border border-border',
            'type-ui text-text-primary',
            'focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary',
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
          <label className="block type-caption font-medium mb-1.5">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            rows={3}
            className={cn(
              'w-full px-3 py-2 rounded-md bg-void border border-border',
              'type-ui text-text-primary resize-y',
              'focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary',
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
        <label className="block type-caption font-medium mb-1.5">
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
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-md text-left',
                  'transition-all duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                  isActive
                    ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                    : 'bg-void text-text-body border border-border hover:border-border-hover hover:text-text-primary'
                )}
                aria-pressed={isActive}
                title={tool.description}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="type-ui truncate">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strength slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="type-caption font-medium">
            Strength
          </label>
          <span className="type-ui text-text-primary">
            {Math.round(strength * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(strength * 100)}
          onChange={(e) => onUpdate({ strength: Number(e.target.value) / 100 })}
          className="w-full accent-[var(--color-accent-primary)]"
          aria-label="Generation strength"
        />
      </div>

      {/* Feather radius slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="type-caption font-medium">
            Feather
          </label>
          <span className="type-ui text-text-primary">
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
          className="w-full accent-[var(--color-accent-primary)]"
          aria-label="Feather radius"
        />
      </div>

      {/* Blend edges toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Blend className="w-4 h-4 text-text-muted" aria-hidden="true" />
          <span className="type-ui text-text-primary">Blend Edges</span>
        </div>
        <button
          onClick={() =>
            onUpdate({
              mask: { ...mask, blendEdges: !mask.blendEdges },
            })
          }
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
            mask.blendEdges ? 'bg-accent-primary' : 'bg-elevated border border-border'
          )}
          role="switch"
          aria-checked={mask.blendEdges}
          aria-label="Blend edges"
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200',
              mask.blendEdges ? 'translate-x-5 bg-void' : 'bg-text-muted'
            )}
          />
        </button>
      </div>

      {/* Invert mask toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {invertMask ? (
            <Unlock className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          ) : (
            <Lock className="w-4 h-4 text-text-muted" aria-hidden="true" />
          )}
          <span className="type-ui text-text-primary">Invert Mask</span>
        </div>
        <button
          onClick={() => onUpdate({ invertMask: !invertMask })}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
            invertMask ? 'bg-accent-primary' : 'bg-elevated border border-border'
          )}
          role="switch"
          aria-checked={invertMask}
          aria-label="Invert mask"
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200',
              invertMask ? 'translate-x-5 bg-void' : 'bg-text-muted'
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
