import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AIToolsPanel } from './AIToolsPanel';
import { useAppStore } from '@/store/appStore';
import type { EditOperation } from '@/features/edit/runEditTool';
import type { GuidedEditOperation } from '@/features/edit/runGuidedEditTool';
import type { RegionMask } from '@/types/project';

const runMock = vi.fn().mockResolvedValue({ ok: true });
const runGuidedMock = vi.fn().mockResolvedValue({ ok: true });
const hookState = {
  run: runMock,
  runGuided: runGuidedMock,
  cancel: vi.fn(),
  isRunning: false,
  runningOperation: null as EditOperation | GuidedEditOperation | null,
  progress: 0,
  error: null as string | null,
  notice: null as string | null,
  clearFeedback: vi.fn(),
};

vi.mock('@/features/edit/useEditTool', () => ({
  useEditTool: () => hookState,
}));

const DRAWN_MASK: RegionMask = {
  type: 'brush',
  points: [
    { x: 10, y: 10 },
    { x: 40, y: 40 },
  ],
  bounds: { x: 10, y: 10, width: 30, height: 30 },
  brushSize: 32,
  featherRadius: 2,
  blendEdges: true,
};

function seedImage(path: string | null) {
  useAppStore.setState({
    currentImage: path ? 'http://localhost:8000/outputs/x/img.png' : null,
    currentImageAssetPath: path,
  });
}

describe('AIToolsPanel (#34 real tools)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    runMock.mockClear();
    runGuidedMock.mockClear();
    hookState.isRunning = false;
    hookState.runningOperation = null;
    hookState.error = null;
    hookState.notice = null;
    seedImage('C:/outputs/x/img.png');
    useAppStore.setState({
      editAiMask: null,
      editAiMaskTool: 'brush',
      editAiMaskBrushSize: 40,
      editAiMaskDrawing: false,
    });
  });

  it('contains no fake-processing setTimeout theater', () => {
    const source = readFileSync(resolve(__dirname, './AIToolsPanel.tsx'), 'utf-8');
    expect(source).not.toMatch(/setTimeout/);
    expect(source).not.toMatch(/Simulate processing/i);
  });

  it('background removal dispatches the real operation with mapped params', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    fireEvent.click(screen.getByRole('button', { name: /process with background removal/i }));
    expect(runMock).toHaveBeenCalledWith('remove-background', {
      source_path: 'C:/outputs/x/img.png',
      edge_refinement: 50,
    });
  });

  it('upscale maps the face model onto face_enhance', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('AI Upscale'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'face' } });
    fireEvent.click(screen.getByRole('button', { name: /process with ai upscale/i }));
    expect(runMock).toHaveBeenCalledWith('upscale', {
      source_path: 'C:/outputs/x/img.png',
      scale: 2,
      model: 'general',
      face_enhance: true,
    });
  });

  it('upscale sends the anime model when selected', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('AI Upscale'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'anime' } });
    fireEvent.click(screen.getByText('4x'));
    fireEvent.click(screen.getByRole('button', { name: /process with ai upscale/i }));
    expect(runMock).toHaveBeenCalledWith('upscale', {
      source_path: 'C:/outputs/x/img.png',
      scale: 4,
      model: 'anime',
      face_enhance: false,
    });
  });

  it('face enhancement sends strength and offers no fake eye/skin knobs', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Face Enhancement'));
    expect(screen.queryByText(/eye enhancement/i)).toBeNull();
    expect(screen.queryByText(/skin smoothing/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /process with face enhancement/i }));
    expect(runMock).toHaveBeenCalledWith('restore-faces', {
      source_path: 'C:/outputs/x/img.png',
      strength: 50,
    });
  });

  it('background replacement dispatches a real guided pass with the typed prompt', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    const replaceButton = screen.getByRole('button', { name: /replace the background/i });
    expect(replaceButton).toBeDisabled(); // honest: no description, no run
    fireEvent.change(screen.getByPlaceholderText(/describe the new background/i), {
      target: { value: 'a beach at sunset' },
    });
    fireEvent.click(screen.getByRole('button', { name: /replace the background/i }));
    expect(runGuidedMock).toHaveBeenCalledWith('background-replace', {
      source_path: 'C:/outputs/x/img.png',
      prompt: 'a beach at sunset',
    });
  });

  it('apply is disabled without an image', () => {
    seedImage(null);
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    expect(
      screen.getByRole('button', { name: /process with background removal/i }),
    ).toBeDisabled();
  });

  it('apply is disabled for video sources', () => {
    seedImage('C:/outputs/x/clip.mp4');
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('AI Upscale'));
    expect(screen.getByRole('button', { name: /process with ai upscale/i })).toBeDisabled();
  });

  it('apply is disabled while another tool is running', () => {
    hookState.isRunning = true;
    hookState.runningOperation = 'upscale';
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    expect(
      screen.getByRole('button', { name: /process with background removal/i }),
    ).toBeDisabled();
  });

  it('the PR1 gating caption is gone - every tool is real now', () => {
    const source = readFileSync(resolve(__dirname, './AIToolsPanel.tsx'), 'utf-8');
    expect(source).not.toMatch(/Ships with the guided-pass update/i);
  });

  it('style transfer dispatches img2img with the preset modifier and strength', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Style Transfer'));
    fireEvent.click(screen.getByText('Monet'));
    fireEvent.change(screen.getByPlaceholderText(/add extra description/i), {
      target: { value: 'a castle' },
    });
    fireEvent.click(screen.getByRole('button', { name: /process with style transfer/i }));
    expect(runGuidedMock).toHaveBeenCalledWith('style-transfer', {
      source_path: 'C:/outputs/x/img.png',
      styleModifier: expect.stringContaining('Monet'),
      styleStrength: 75,
      prompt: 'a castle',
    });
  });

  it('generative fill requires a mask AND a prompt before dispatching inpaint', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Generative Fill'));
    const apply = screen.getByRole('button', { name: /process with generative fill/i });
    expect(apply).toBeDisabled(); // no mask, no prompt

    useAppStore.setState({ editAiMask: DRAWN_MASK });
    fireEvent.change(screen.getByPlaceholderText(/describe fill content/i), {
      target: { value: 'a red door' },
    });
    fireEvent.click(screen.getByRole('button', { name: /process with generative fill/i }));
    expect(runGuidedMock).toHaveBeenCalledWith('generative-fill', {
      source_path: 'C:/outputs/x/img.png',
      prompt: 'a red door',
      mask: DRAWN_MASK,
    });
  });

  it('object removal requires a mask and is honest about being inpainting', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Object Removal'));
    expect(screen.getByText(/masked area is repainted/i)).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: /process with object removal/i });
    expect(apply).toBeDisabled();
    expect(screen.getByText(/draw over the area on the image/i)).toBeInTheDocument();

    // Commit the out-of-band store mutation before clicking; unlike the
    // gen-fill case there is no intervening input change to flush it.
    act(() => {
      useAppStore.setState({ editAiMask: DRAWN_MASK });
    });
    fireEvent.click(screen.getByRole('button', { name: /process with object removal/i }));
    expect(runGuidedMock).toHaveBeenCalledWith('object-removal', {
      source_path: 'C:/outputs/x/img.png',
      mask: DRAWN_MASK,
    });
  });

  it('AI expand dispatches the outpaint pre-step and requires a direction', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('AI Expand'));
    fireEvent.change(screen.getByPlaceholderText(/describe expanded area/i), {
      target: { value: 'more meadow' },
    });
    fireEvent.click(screen.getByRole('button', { name: /process with ai expand/i }));
    expect(runGuidedMock).toHaveBeenCalledWith('ai-expand', {
      source_path: 'C:/outputs/x/img.png',
      prompt: 'more meadow',
      directions: ['right'],
      pixels: 256,
    });

    // Deselect the default direction: the apply gates honestly.
    fireEvent.click(screen.getByRole('button', { name: /^right$/i }));
    expect(screen.getByRole('button', { name: /process with ai expand/i })).toBeDisabled();
  });

  it('opening a mask tool turns canvas mask drawing on and off', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Generative Fill'));
    expect(useAppStore.getState().editAiMaskDrawing).toBe(true);
    fireEvent.click(screen.getByText('Generative Fill')); // collapse
    expect(useAppStore.getState().editAiMaskDrawing).toBe(false);
  });

  it('mask controls drive the shared mask state', () => {
    useAppStore.setState({ editAiMask: DRAWN_MASK });
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Object Removal'));
    fireEvent.click(screen.getByRole('button', { name: /^rectangle$/i }));
    expect(useAppStore.getState().editAiMaskTool).toBe('rectangle');
    fireEvent.click(screen.getByRole('button', { name: /clear mask/i }));
    expect(useAppStore.getState().editAiMask).toBeNull();
  });

  it('renders the honest error strip with a Foundry action', () => {
    hookState.error =
      "The AI upscale weights are not installed - install 'edit-realesrgan-x4plus' from the Foundry first.";
    render(<AIToolsPanel />);
    expect(screen.getByTestId('edit-tool-error')).toHaveTextContent(
      /install 'edit-realesrgan-x4plus'/,
    );
    expect(screen.getByRole('button', { name: /open foundry/i })).toBeInTheDocument();
  });

  it('hides the Foundry action for non-install errors', () => {
    hookState.error = 'The source image could not be read - re-export the frame and try again.';
    render(<AIToolsPanel />);
    expect(screen.getByTestId('edit-tool-error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open foundry/i })).toBeNull();
  });

  it('renders the zero-faces notice as a notice, not an error', () => {
    hookState.notice = 'No faces detected - the image is unchanged.';
    render(<AIToolsPanel />);
    expect(screen.getByTestId('edit-tool-notice')).toHaveTextContent(/no faces detected/i);
    expect(screen.queryByTestId('edit-tool-error')).toBeNull();
  });
});
