import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AIToolsPanel } from './AIToolsPanel';
import { useAppStore } from '@/store/appStore';
import type { EditOperation } from '@/features/edit/runEditTool';

const runMock = vi.fn().mockResolvedValue({ ok: true });
const hookState = {
  run: runMock,
  cancel: vi.fn(),
  isRunning: false,
  runningOperation: null as EditOperation | null,
  progress: 0,
  error: null as string | null,
  notice: null as string | null,
  clearFeedback: vi.fn(),
};

vi.mock('@/features/edit/useEditTool', () => ({
  useEditTool: () => hookState,
}));

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
    hookState.isRunning = false;
    hookState.runningOperation = null;
    hookState.error = null;
    hookState.notice = null;
    seedImage('C:/outputs/x/img.png');
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

  it('background removal offers no fake replace-background prompt', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Background Removal'));
    expect(screen.queryByPlaceholderText(/describe new background/i)).toBeNull();
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

  it('guided tools are gated honestly until PR2', () => {
    render(<AIToolsPanel />);
    fireEvent.click(screen.getByText('Style Transfer'));
    expect(screen.getByRole('button', { name: /process with style transfer/i })).toBeDisabled();
    expect(screen.getAllByText(/ships with the guided-pass update/i).length).toBeGreaterThan(0);
    expect(runMock).not.toHaveBeenCalled();
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
