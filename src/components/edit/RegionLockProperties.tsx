import { memo, useId } from 'react';
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
import { REGION_TOOL_AVAILABILITY, regionToolUsesPrompt } from '@/features/edit/regionLockGeneration';
import { FEATHER_MAX } from '@/features/edit/regionBlend';

interface RegionLockPropertiesProps {
  region: RegionLock;
  onUpdate: (updates: Partial<RegionLock>) => void;
  onDelete: () => void;
  onGenerate: () => void;
  isGenerating?: boolean;
}

const AI_TOOLS: { id: AITool; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'generative-fill', label: 'Generative Fill', icon: Wand2, description: 'Fill region with AI-generated content' },
  { id: 'style-transfer', label: 'Style Transfer', icon: Palette, description: 'Restyle the region, keeping its structure' },
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
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const promptId = `${fieldId}-prompt`;
  const toolsLabelId = `${fieldId}-tools`;
  const strengthId = `${fieldId}-strength`;
  const strengthHelpId = `${fieldId}-strength-help`;
  const featherId = `${fieldId}-feather`;
  const featherHelpId = `${fieldId}-feather-help`;
  const blendLabelId = `${fieldId}-blend`;
  const blendHelpId = `${fieldId}-blend-help`;
  const invertHelpId = `${fieldId}-invert-help`;
  const unavailableTools = AI_TOOLS.filter((tool) => !REGION_TOOL_AVAILABILITY[tool.id].available);
  const strengthHelp =
    aiTool === 'style-transfer'
      ? 'How strongly the style replaces the region (denoising 30-90%).'
      : 'How much of the region is repainted (denoising strength).';

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
          type="button"
          onClick={onDelete}
          className={cn(
            'p-2 rounded-md text-text-muted',
            'hover:text-status-error hover:bg-status-error-muted',
            'transition-colors duration-150',
          )}
          aria-label="Delete region lock"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Region name */}
      <div>
        <label htmlFor={nameId} className="block type-caption font-medium mb-1.5">
          Name
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className={cn(
            'w-full px-3 py-2 rounded-md bg-void border border-border',
            'type-ui text-text-primary',
            'focus:border-accent-primary',
            'transition-colors duration-150',
            'placeholder:text-text-muted'
          )}
          placeholder="Region name"
          aria-label="Region name"
        />
      </div>

      {/* Prompt - only for tools that use it (Remove and Upscale ignore it) */}
      {regionToolUsesPrompt(aiTool) && (
        <div>
          <label htmlFor={promptId} className="block type-caption font-medium mb-1.5">
            Prompt
          </label>
          <textarea
            id={promptId}
            value={prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            rows={3}
            className={cn(
              'w-full px-3 py-2 rounded-md bg-void border border-border',
              'type-ui text-text-primary resize-y',
              'focus:border-accent-primary',
              'transition-colors duration-150',
              'placeholder:text-text-muted'
            )}
            placeholder={
              aiTool === 'generative-fill'
                ? 'Describe what to generate in this region...'
                : 'Describe the style to apply...'
            }
            aria-label="Region prompt"
          />
        </div>
      )}

      {/* AI Tool selector */}
      <div role="group" aria-labelledby={toolsLabelId}>
        <p id={toolsLabelId} className="block type-caption font-medium mb-1.5">
          AI Tool
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {AI_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = aiTool === tool.id;
            const availability = REGION_TOOL_AVAILABILITY[tool.id];
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onUpdate({ aiTool: tool.id })}
                disabled={!availability.available}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-2 rounded-md text-left',
                  'transition duration-150',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  isActive
                    ? 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border'
                    : 'bg-void text-text-body border border-border enabled:hover:border-border-hover enabled:hover:text-text-primary'
                )}
                aria-pressed={isActive}
                aria-describedby={availability.available ? undefined : `${fieldId}-unavailable-${tool.id}`}
                title={availability.available ? tool.description : availability.reason}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="type-ui truncate">{tool.label}</span>
              </button>
            );
          })}
        </div>
        {unavailableTools.map((tool) => (
          <p
            key={tool.id}
            id={`${fieldId}-unavailable-${tool.id}`}
            className="mt-1.5 type-caption text-text-muted"
          >
            {tool.label}: {REGION_TOOL_AVAILABILITY[tool.id].reason}
          </p>
        ))}
      </div>

      {/* Strength slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={strengthId} className="type-caption font-medium">
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
          id={strengthId}
          value={Math.round(strength * 100)}
          onChange={(e) => onUpdate({ strength: Number(e.target.value) / 100 })}
          className="w-full accent-[var(--color-accent-primary)]"
          aria-label="Generation strength"
          aria-describedby={strengthHelpId}
        />
        <p id={strengthHelpId} className="mt-1 type-caption text-text-muted">
          {strengthHelp}
        </p>
      </div>

      {/* Blend edges toggle - drives the client-side paste-back (regionBlend.ts) */}
      <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Blend className="w-4 h-4 text-text-muted" aria-hidden="true" />
          <span id={blendLabelId} className="type-ui text-text-primary">Blend Edges</span>
        </div>
        <button
          type="button"
          onClick={() =>
            onUpdate({
              mask: { ...mask, blendEdges: !mask.blendEdges },
            })
          }
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200',
            mask.blendEdges ? 'bg-accent-primary' : 'bg-elevated border border-border'
          )}
          role="switch"
          aria-checked={mask.blendEdges}
          aria-labelledby={blendLabelId}
          aria-describedby={blendHelpId}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200',
              mask.blendEdges ? 'translate-x-5 bg-void' : 'bg-text-muted'
            )}
          />
        </button>
      </div>
        <p id={blendHelpId} className="mt-1 type-caption text-text-muted">
          {mask.blendEdges
            ? 'The result is pasted back over the original through the mask, so everything outside the region stays exactly as it was.'
            : 'Off: the whole generated frame is used as-is, including slight drift outside the region.'}
        </p>
      </div>

      {/* Feather radius slider - the width of the paste-back's soft edge */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={featherId} className="type-caption font-medium">
            Feather
          </label>
          <span className={cn('type-ui', mask.blendEdges ? 'text-text-primary' : 'text-text-muted')}>
            {mask.featherRadius}px
          </span>
        </div>
        <input
          id={featherId}
          type="range"
          min={0}
          max={FEATHER_MAX}
          value={mask.featherRadius}
          disabled={!mask.blendEdges}
          onChange={(e) =>
            onUpdate({
              mask: { ...mask, featherRadius: Number(e.target.value) },
            })
          }
          className="w-full accent-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-describedby={featherHelpId}
        />
        <p id={featherHelpId} className="mt-1 type-caption text-text-muted">
          {mask.blendEdges
            ? 'Width of the soft edge where the region fades into the original (0 = hard edge).'
            : 'Feather softens the Blend Edges seam; turn Blend Edges on to use it.'}
        </p>
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
          type="button"
          onClick={() => onUpdate({ invertMask: !invertMask })}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors duration-200',
            invertMask ? 'bg-accent-primary' : 'bg-elevated border border-border'
          )}
          role="switch"
          aria-checked={invertMask}
          aria-label="Invert mask"
          aria-describedby={invertHelpId}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200',
              invertMask ? 'translate-x-5 bg-void' : 'bg-text-muted'
            )}
          />
        </button>
      </div>

      <p id={invertHelpId} className="-mt-2 type-caption text-text-muted">
        {invertMask
          ? 'Everything outside the region is regenerated; the region itself is kept.'
          : 'Only the region is regenerated.'}
      </p>

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
