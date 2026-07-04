import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasControlLayerProperties } from './CanvasControlLayerProperties';
import { useAppStore } from '@/store/appStore';
import type { CanvasControlLayer } from '@/types/project';
import type { ModelRecord } from '@/types/model';
import { DEFAULT_CANVAS_CONTROL_LAYER_MASK } from '@/types/project';

function buildLayer(overrides: Partial<CanvasControlLayer> = {}): CanvasControlLayer {
  return {
    id: 'layer-1',
    sceneId: 'scene-1',
    name: 'Pose Guide',
    type: 'controlnet',
    mask: {
      ...DEFAULT_CANVAS_CONTROL_LAYER_MASK,
      points: [
        { x: 10, y: 20 },
        { x: 180, y: 20 },
        { x: 180, y: 160 },
        { x: 10, y: 160 },
      ],
      bounds: { x: 10, y: 20, width: 170, height: 140 },
    },
    visible: true,
    opacity: 0.8,
    previewTint: '#d1d5db',
    sourcePath: 'C:/vision-studio/inputs/guide.png',
    preprocessor: 'canny',
    weight: 1.1,
    startStep: 5,
    endStep: 80,
    prompt: 'cinematic rim light',
    negativePrompt: 'warped hands',
    metadata: {},
    ...overrides,
  };
}

function buildRecord(overrides: Partial<ModelRecord>): ModelRecord {
  return {
    id: 'record', name: 'Record', artifact_type: 'controlnet', capability: 'image',
    base_architecture: 'sd15', source: 'huggingface', repo_id: null, revision: null,
    aux_repo_id: null, size: 'Unknown', status: 'ready', tier: 'verified',
    quality: 'balanced', runtime: 'local', hardware_class: 'laptop', vram: 'Unknown',
    description: '', license: null, gated: false,
    ...overrides,
  };
}

function seedModels(model: string, records: ModelRecord[]) {
  useAppStore.setState({
    availableModels: records,
    selectedImageModelId: model,
  });
}

describe('CanvasControlLayerProperties', () => {
  afterEach(cleanup);

  beforeEach(() => {
    seedModels('sd-1-5', [
      buildRecord({ id: 'sd-1-5', artifact_type: 'checkpoint', base_architecture: 'sd15' }),
    ]);
  });

  it('renders controlnet controls and forwards edits', () => {
    const onMaskToolChange = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    render(
      <CanvasControlLayerProperties
        layer={buildLayer()}
        activeMaskTool="rectangle"
        onMaskToolChange={onMaskToolChange}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    fireEvent.change(screen.getByLabelText(/control layer name/i), {
      target: { value: 'Depth Guide' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lasso mask tool/i }));
    fireEvent.change(screen.getByLabelText(/control layer weight/i), {
      target: { value: '1.55' },
    });
    fireEvent.click(screen.getByRole('button', { name: /visible/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete control layer/i }));

    expect(onUpdate).toHaveBeenCalledWith({ name: 'Depth Guide' });
    expect(onMaskToolChange).toHaveBeenCalledWith('polygon');
    expect(onUpdate).toHaveBeenCalledWith({ weight: 1.55 });
    expect(onUpdate).toHaveBeenCalledWith({ visible: false });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/controlnet preprocessor/i)).toBeInTheDocument();
    expect(screen.getByText(/layer ready for generation/i)).toBeInTheDocument();
  });

  it('offers only the active family preprocessors in a select and forwards changes', () => {
    const onUpdate = vi.fn();
    render(
      <CanvasControlLayerProperties
        layer={buildLayer()}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );

    const select = screen.getByLabelText(/controlnet preprocessor/i);
    const options = [...select.querySelectorAll('option')].map((option) => option.value);
    expect(options).toEqual(['canny', 'depth', 'normal', 'openpose', 'scribble']);
    fireEvent.change(select, { target: { value: 'depth' } });
    expect(onUpdate).toHaveBeenCalledWith({ preprocessor: 'depth' });
  });

  it('surfaces missing records with a Manage in Foundry link', () => {
    const setActiveTab = vi.fn();
    useAppStore.setState({ setActiveTab } as never);

    render(
      <CanvasControlLayerProperties
        layer={buildLayer({ preprocessor: 'depth' })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(/controlnet-depth-sd15/)).toBeInTheDocument();
    expect(screen.getByText(/annotator-midas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /manage in foundry/i }));
    expect(setActiveTab).toHaveBeenCalledWith('foundry');
  });

  it('shows installed state when every required record is ready', () => {
    seedModels('sd-1-5', [
      buildRecord({ id: 'sd-1-5', artifact_type: 'checkpoint', base_architecture: 'sd15' }),
      buildRecord({ id: 'controlnet-canny-sd15' }),
    ]);
    render(
      <CanvasControlLayerProperties
        layer={buildLayer()}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/models installed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage in foundry/i })).not.toBeInTheDocument();
  });

  it('never claims an unsupported legacy preprocessor value is installed', () => {
    render(
      <CanvasControlLayerProperties
        layer={buildLayer({ preprocessor: 'segmentation' })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/'segmentation' is not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/models installed/i)).not.toBeInTheDocument();
  });

  it('marks prompt overrides inpaint-only', () => {
    const { rerender } = render(
      <CanvasControlLayerProperties
        layer={buildLayer()} // controlnet layer
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // diffusers has no per-layer ControlNet prompting - the fields are gone.
    expect(screen.queryByLabelText(/control layer prompt override/i)).not.toBeInTheDocument();

    rerender(
      <CanvasControlLayerProperties
        layer={buildLayer({ type: 'inpaint-mask', preprocessor: undefined })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/control layer prompt override/i)).toBeInTheDocument();
  });

  it('hides controlnet-only controls for reference image layers and exposes setup issues', () => {
    render(
      <CanvasControlLayerProperties
        layer={buildLayer({
          type: 'reference-image',
          name: 'Style Board',
          preprocessor: undefined,
          sourcePath: undefined,
          mask: {
            ...DEFAULT_CANVAS_CONTROL_LAYER_MASK,
            points: [],
            bounds: { x: 0, y: 0, width: 0, height: 0 },
          },
          prompt: undefined,
          negativePrompt: undefined,
        })}
        activeMaskTool="select"
        onMaskToolChange={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/controlnet preprocessor/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/control layer prompt override/i)).not.toBeInTheDocument();
    expect(screen.getByText(/layer needs setup/i)).toBeInTheDocument();
    expect(screen.getByText(/draw a mask on the canvas/i)).toBeInTheDocument();
    expect(screen.getByText(/attach the reference image/i)).toBeInTheDocument();
  });
});
