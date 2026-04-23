import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasControlLayerProperties } from './CanvasControlLayerProperties';
import type { CanvasControlLayer } from '@/types/project';
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

describe('CanvasControlLayerProperties', () => {
  afterEach(cleanup);

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
    expect(screen.getByLabelText(/control layer prompt override/i)).toBeInTheDocument();
    expect(screen.getByText(/layer ready for generation/i)).toBeInTheDocument();
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
    expect(screen.queryByLabelText(/control layer negative prompt override/i)).not.toBeInTheDocument();
    expect(screen.getByText(/layer needs setup/i)).toBeInTheDocument();
    expect(screen.getByText(/draw a mask on the canvas/i)).toBeInTheDocument();
    expect(screen.getByText(/attach the reference image/i)).toBeInTheDocument();
  });
});
