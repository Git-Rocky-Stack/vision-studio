import { memo } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Eye,
  EyeOff,
  GitBranch,
  Image as ImageIcon,
  PaintBucket,
  Pen,
  Paintbrush,
  Square,
  Eraser,
  Trash2,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import {
  requiredRecordsFor,
  supportedPreprocessors,
} from '@/features/generation/controlnetSupport';
import type { CanvasControlLayer, CanvasControlLayerType, MaskType } from '@/types/project';

type MaskTool = MaskType | 'select';

interface CanvasControlLayerPropertiesProps {
  layer: CanvasControlLayer;
  activeMaskTool: MaskTool;
  onMaskToolChange: (tool: MaskTool) => void;
  onUpdate: (updates: Partial<CanvasControlLayer>) => void;
  onDelete: () => void;
}

const LAYER_TYPES: Array<{
  id: CanvasControlLayerType;
  label: string;
  icon: typeof GitBranch;
}> = [
  { id: 'controlnet', label: 'ControlNet', icon: GitBranch },
  { id: 'reference-image', label: 'Reference', icon: ImageIcon },
  { id: 'inpaint-mask', label: 'Inpaint Mask', icon: PaintBucket },
];

const MASK_TOOLS: Array<{
  id: MaskTool;
  label: string;
  icon: typeof Square;
}> = [
  { id: 'select', label: 'Select', icon: Square },
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'polygon', label: 'Lasso', icon: Pen },
  { id: 'brush', label: 'Brush', icon: Paintbrush },
  { id: 'erase', label: 'Eraser', icon: Eraser },
];

export const CanvasControlLayerProperties = memo(function CanvasControlLayerProperties({
  layer,
  activeMaskTool,
  onMaskToolChange,
  onUpdate,
  onDelete,
}: CanvasControlLayerPropertiesProps) {
  const availableModels = useAppStore((s) => s.availableModels);
  const activeModelId = useAppStore((s) => s.selectedImageModelId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const baseArchitecture =
    availableModels.find((model) => model.id === activeModelId)?.base_architecture ?? null;
  const preprocessorOptions = supportedPreprocessors(baseArchitecture);
  const requiredRecords =
    layer.type === 'controlnet' && layer.preprocessor
      ? requiredRecordsFor(layer.preprocessor, baseArchitecture)
      : [];
  const missingRecords = requiredRecords.filter(
    (recordId) => availableModels.find((model) => model.id === recordId)?.status !== 'ready',
  );

  const supportsControlNetSettings = layer.type === 'controlnet';
  // diffusers has no per-layer ControlNet prompting (#34 PR3): the override
  // fields are inpaint-only; the backend notices any legacy values it ignores.
  const supportsPromptOverrides = layer.type === 'inpaint-mask';
  const hasSource = Boolean(layer.sourcePath || layer.sourceMediaAssetId || layer.referenceSetId);
  const hasMask = layer.mask.points.length > 0;
  const hasValidStepRange =
    layer.startStep === undefined ||
    layer.endStep === undefined ||
    layer.startStep <= layer.endStep;
  const readinessIssues = [
    ...(hasMask ? [] : ['Draw a mask on the canvas.']),
    ...(layer.type === 'controlnet' && !hasSource ? ['Attach a ControlNet source image or media asset.'] : []),
    ...(layer.type === 'reference-image' && !hasSource ? ['Attach the reference image for this layer.'] : []),
    ...(layer.type === 'controlnet' && !layer.preprocessor ? ['Choose a ControlNet preprocessor.'] : []),
    ...(hasValidStepRange ? [] : ['Start Step must be less than or equal to End Step.']),
  ];
  const isReady = readinessIssues.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="canvas-control-layer-properties">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="type-section">Control Layer</h3>
          <p className="mt-1 type-caption text-text-body">
            Configure the selected canvas-native generation layer.
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            'rounded-md p-1.5 text-text-muted transition-colors duration-150',
            'hover:bg-status-error-muted hover:text-status-error',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
          )}
          aria-label="Delete control layer"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className={cn(
          'rounded-xl border px-3 py-3',
          isReady
            ? 'border-accent-primary-border bg-accent-primary-muted'
            : 'border-status-warning-border bg-status-warning-muted',
        )}
      >
        <div className="flex items-center gap-2">
          {isReady ? (
            <CheckCircle2 className="h-4 w-4 text-accent-primary" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-status-warning" aria-hidden="true" />
          )}
          <p className="type-ui text-text-primary">
            {isReady ? 'Layer ready for generation' : 'Layer needs setup'}
          </p>
        </div>
        {isReady ? (
          <p className="mt-1 type-caption text-text-body">
            Mask, source inputs, and step settings are ready to resolve into generation requests.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {readinessIssues.map((issue) => (
              <li key={issue} className="type-caption text-text-body">
                {issue}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4">
        <label className="block">
          <span className="mb-1.5 block type-caption font-medium">Name</span>
          <input
            type="text"
            value={layer.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
            className={cn(
              'w-full rounded-md border border-border bg-void px-3 py-2',
              'type-ui text-text-primary placeholder:text-text-muted',
              'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
            )}
            placeholder="Layer name"
            aria-label="Control layer name"
          />
        </label>

        <div>
          <span className="mb-1.5 block type-caption font-medium">Layer Type</span>
          <div className="grid grid-cols-3 gap-1.5">
            {LAYER_TYPES.map((option) => {
              const Icon = option.icon;
              const isActive = layer.type === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onUpdate({ type: option.id })}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-center transition-all duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                    isActive
                      ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                      : 'border-border bg-void text-text-body hover:border-border-hover hover:text-text-primary',
                  )}
                  aria-pressed={isActive}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="type-ui">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="type-caption font-medium">Mask Editing</span>
            <span className="type-caption text-text-muted">
              {layer.mask.points.length > 0
                ? `${layer.mask.type} mask`
                : 'No mask drawn yet'}
            </span>
          </div>
          <p className="mt-1 type-caption text-text-body">
            Use the canvas mask tools to define where this layer applies.
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {MASK_TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeMaskTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onMaskToolChange(tool.id)}
                  className={cn(
                    'flex items-center justify-center rounded-md border px-2 py-2 transition-all duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                    isActive
                      ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                      : 'border-border bg-void text-text-body hover:border-border-hover hover:text-text-primary',
                  )}
                  aria-label={`${tool.label} mask tool`}
                  aria-pressed={isActive}
                  title={tool.label}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block type-caption font-medium">Source Path</span>
          <input
            type="text"
            value={layer.sourcePath ?? ''}
            onChange={(event) => onUpdate({ sourcePath: event.target.value || undefined })}
            className={cn(
              'w-full rounded-md border border-border bg-void px-3 py-2',
              'type-ui text-text-primary placeholder:text-text-muted',
              'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
            )}
            placeholder="C:/path/to/source.png"
            aria-label="Control layer source path"
          />
        </label>

        {supportsControlNetSettings && (
          <>
            <label className="block">
              <span className="mb-1.5 block type-caption font-medium">Preprocessor</span>
              <select
                value={layer.preprocessor ?? ''}
                onChange={(event) => onUpdate({ preprocessor: event.target.value || undefined })}
                className={cn(
                  'w-full rounded-md border border-border bg-void px-3 py-2',
                  'type-ui text-text-primary',
                  'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                )}
                aria-label="ControlNet preprocessor"
              >
                {!layer.preprocessor ? <option value="">Choose a preprocessor</option> : null}
                {preprocessorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {layer.preprocessor && baseArchitecture ? (
              <div
                className={cn(
                  'rounded-xl border px-3 py-3',
                  requiredRecords.length > 0 && missingRecords.length === 0
                    ? 'border-border bg-void'
                    : 'border-status-warning-border bg-status-warning-muted',
                )}
                data-testid="controlnet-record-status"
              >
                {requiredRecords.length === 0 ? (
                  // A legacy free-text value (e.g. "segmentation") that no
                  // stack serves - never claim it is installed.
                  <p className="type-caption text-text-body">
                    {`'${layer.preprocessor}' is not available on the current checkpoint - choose one of: ${preprocessorOptions.join(', ')}.`}
                  </p>
                ) : missingRecords.length === 0 ? (
                  <p className="type-caption text-text-body">
                    Models installed - this layer can resolve on the current checkpoint.
                  </p>
                ) : (
                  <>
                    <p className="type-caption text-text-body">
                      This layer needs {missingRecords.map((id) => `'${id}'`).join(' and ')} on the
                      current checkpoint.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('foundry')}
                      className={cn(
                        'mt-2 type-caption font-medium text-accent-primary underline underline-offset-2',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                      )}
                    >
                      Manage in Foundry
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <label className="block">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="type-caption font-medium">Weight</span>
                <span className="type-ui text-text-primary">
                  {(layer.weight ?? 1).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={layer.weight ?? 1}
                onChange={(event) => onUpdate({ weight: Number(event.target.value) })}
                className="w-full accent-[var(--color-accent-primary)]"
                aria-label="Control layer weight"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block type-caption font-medium">Start Step</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={layer.startStep ?? ''}
                  onChange={(event) =>
                    onUpdate({
                      startStep:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                  className={cn(
                    'w-full rounded-md border border-border bg-void px-3 py-2',
                    'type-ui text-text-primary placeholder:text-text-muted',
                    'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                  )}
                  placeholder="0"
                  aria-label="Control layer start step"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block type-caption font-medium">End Step</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={layer.endStep ?? ''}
                  onChange={(event) =>
                    onUpdate({
                      endStep:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                  className={cn(
                    'w-full rounded-md border border-border bg-void px-3 py-2',
                    'type-ui text-text-primary placeholder:text-text-muted',
                    'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                  )}
                  placeholder="100"
                  aria-label="Control layer end step"
                />
              </label>
            </div>
          </>
        )}

        {supportsPromptOverrides && (
          <>
            <label className="block">
              <span className="mb-1.5 block type-caption font-medium">Prompt Override</span>
              <textarea
                value={layer.prompt ?? ''}
                onChange={(event) => onUpdate({ prompt: event.target.value || undefined })}
                rows={3}
                className={cn(
                  'w-full rounded-md border border-border bg-void px-3 py-2',
                  'type-ui text-text-primary placeholder:text-text-muted resize-y',
                  'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                )}
                placeholder="Optional prompt override for this layer"
                aria-label="Control layer prompt override"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block type-caption font-medium">Negative Override</span>
              <textarea
                value={layer.negativePrompt ?? ''}
                onChange={(event) =>
                  onUpdate({ negativePrompt: event.target.value || undefined })
                }
                rows={2}
                className={cn(
                  'w-full rounded-md border border-border bg-void px-3 py-2',
                  'type-ui text-text-primary placeholder:text-text-muted resize-y',
                  'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                )}
                placeholder="Optional negative override"
                aria-label="Control layer negative prompt override"
              />
            </label>
          </>
        )}

        <div className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 rounded-xl border border-border bg-void px-3 py-3">
          <div>
            <p className="type-ui text-text-primary">Layer Visibility</p>
            <p className="type-caption text-text-body">
              Hidden layers stay persisted but do not participate in generation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUpdate({ visible: !layer.visible })}
            className={cn(
              'relative flex h-9 min-w-20 items-center justify-center gap-1.5 rounded-md px-3 transition-all duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
              layer.visible
                ? 'bg-accent-primary-muted text-accent-primary'
                : 'border border-border bg-surface text-text-body',
            )}
            aria-pressed={layer.visible}
          >
            {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span className="type-ui">{layer.visible ? 'Visible' : 'Hidden'}</span>
          </button>
        </div>

        <label className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="type-caption font-medium">Preview Opacity</span>
            <span className="type-ui text-text-primary">
              {Math.round(layer.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(layer.opacity * 100)}
            onChange={(event) => onUpdate({ opacity: Number(event.target.value) / 100 })}
            className="w-full accent-[var(--color-accent-primary)]"
            aria-label="Preview opacity"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block type-caption font-medium">Preview Tint</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={layer.previewTint}
              onChange={(event) => onUpdate({ previewTint: event.target.value })}
              className="h-10 w-12 rounded-md border border-border bg-void p-1"
              aria-label="Preview tint color"
            />
            <input
              type="text"
              value={layer.previewTint}
              onChange={(event) => onUpdate({ previewTint: event.target.value })}
              className={cn(
                'w-full rounded-md border border-border bg-void px-3 py-2',
                'type-ui text-text-primary placeholder:text-text-muted',
                'transition-colors duration-150 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
              )}
              placeholder="#d1d5db"
              aria-label="Preview tint value"
            />
          </div>
        </label>

        <div className="rounded-xl border border-border bg-void px-3 py-3">
          <div className="mb-2 flex items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-text-muted" aria-hidden="true" />
            <span className="type-ui text-text-primary">Mask Bounds</span>
          </div>
          <p className="type-caption text-text-body">
            {`${Math.round(layer.mask.bounds.x)}, ${Math.round(layer.mask.bounds.y)} / ${Math.round(layer.mask.bounds.width)} x ${Math.round(layer.mask.bounds.height)}`}
          </p>
        </div>
      </div>
    </div>
  );
});
