import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/generate/PromptArea', () => ({
  PromptArea: ({
    prompt,
    onPromptChange,
  }: {
    prompt: string;
    onPromptChange: (value: string) => void;
  }) => (
    <div>
      <label htmlFor="mock-prompt-input">Prompt</label>
      <input
        id="mock-prompt-input"
        data-testid="mock-prompt-input"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/generate/StylePresetsBar', () => ({
  StylePresetsBar: () => <div>Style Presets</div>,
}));

vi.mock('@/components/generate/ModelSelector', () => ({
  ModelSelector: ({
    value,
    onChange,
    generationType,
  }: {
    value: string;
    onChange: (value: string) => void;
    generationType: 'image' | 'video';
  }) => (
    <div>
      <p data-testid="mock-model-value">{value}</p>
      {generationType === 'image' ? (
        <button type="button" onClick={() => onChange('sd-1-5')}>
          Use SD 1.5
        </button>
      ) : (
        <button type="button" onClick={() => onChange('svd')}>
          Use SVD
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/generate/AdvancedGenerationSettings', () => ({
  AdvancedGenerationSettings: () => <div>Advanced Settings Content</div>,
}));

vi.mock('@/components/reference/ReferenceMediaPanel', () => ({
  ReferenceMediaPanel: ({ title }: { title: string }) => <div>{title} Reference Panel</div>,
}));

vi.mock('@/components/generate/ControlNetPanel', () => ({
  ControlNetPanel: () => <div>ControlNet Panel</div>,
}));

vi.mock('@/components/generate/LoRAMixer', () => ({
  LoRAMixer: () => <div>LoRA Mixer</div>,
}));

vi.mock('@/components/generate/PromptHistory', () => ({
  PromptHistory: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Prompt History Overlay</div> : null,
}));

vi.mock('@/components/generate/AspectRatioPicker', () => ({
  AspectRatioPicker: () => <div>Aspect Ratio Picker</div>,
}));

vi.mock('@/components/generate/CompactImageDropZone', () => ({
  CompactImageDropZone: ({ label }: { label: string }) => <div>{label} Drop Zone</div>,
}));

vi.mock('@/components/generate/VideoControls', () => ({
  VideoControls: () => <div>Video Controls</div>,
}));

vi.mock('@/utils/animation', () => ({
  useMotionConfig: () => ({
    reduced: true,
    transition: { duration: 0 },
  }),
}));

import { useAppStore } from '@/store/appStore';
import { computeDimensions } from '@/types/resolution';

import { GeneratePanel } from './GeneratePanel';

function resetStore() {
  const initialState = useAppStore.getInitialState();
  useAppStore.setState({
    ...initialState,
    systemInfo: {
      ...initialState.systemInfo,
      gpuAvailable: true,
      backendConnected: true,
    },
  });
}

function seedDurableReferenceImage() {
  useAppStore.setState((state) => ({
    mediaAssets: [
      ...state.mediaAssets,
      {
        id: 'media-reference-1',
        legacyAssetId: null,
        jobId: null,
        name: 'Hero reference',
        type: 'image',
        source: 'generated',
        path: 'C:/vision-studio-output/refs/hero.png',
        previewUrl: 'file:///C:/vision-studio-output/refs/hero.png',
        thumbnailUrl: 'file:///C:/vision-studio-output/refs/hero.png',
        posterUrl: 'file:///C:/vision-studio-output/refs/hero.png',
        width: 1024,
        height: 1024,
        metadata: {},
        createdAt: '2026-04-22T00:00:00.000Z',
      },
    ],
    referenceSets: [
      ...state.referenceSets,
      {
        id: 'reference-set-1',
        name: 'Current Run',
        scope: 'adhoc',
        projectId: null,
        sceneId: null,
        clipId: null,
        items: [
          {
            id: 'reference-item-1',
            slot: 'composition',
            mediaAssetId: 'media-reference-1',
            path: 'C:/vision-studio-output/refs/hero.png',
            label: 'Hero reference',
            orderIndex: 0,
          },
        ],
        notes: '',
        tags: [],
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
    ],
  }));
}

describe('GeneratePanel', () => {
  beforeEach(resetStore);

  afterEach(cleanup);

  it('defaults the advanced section collapsed and restores it from store state', async () => {
    const state = useAppStore.getState();
    const dimensions = computeDimensions(
      state.aspectRatio,
      state.resolutionTier,
      state.customWidth,
      state.customHeight,
    );

    const { unmount } = render(<GeneratePanel />);

    expect(screen.queryByText('Advanced Settings Content')).not.toBeInTheDocument();
    expect(screen.getByTestId('generate-preflight-summary')).toHaveTextContent(
      `flux-dev / ${dimensions.width} x ${dimensions.height}`,
    );

    fireEvent.click(screen.getByTestId('toggle-generate-section-advanced'));

    await waitFor(() => {
      expect(screen.getByText('Advanced Settings Content')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(useAppStore.getState().layoutPreferences.collapsedGenerateSections).not.toContain(
        'advanced',
      );
    });

    unmount();
    render(<GeneratePanel />);

    await waitFor(() => {
      expect(screen.getByText('Advanced Settings Content')).toBeInTheDocument();
    });
  });

  it('persists collapsed reference inputs across remounts', () => {
    const { unmount } = render(<GeneratePanel />);

    expect(screen.getByText('Current Run Reference Panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-generate-section-reference-inputs'));

    expect(screen.queryByText('Current Run Reference Panel')).not.toBeInTheDocument();
    expect(useAppStore.getState().layoutPreferences.collapsedGenerateSections).toContain(
      'reference-inputs',
    );

    unmount();
    render(<GeneratePanel />);

    expect(screen.queryByText('Current Run Reference Panel')).not.toBeInTheDocument();
  });

  it('shows a preflight warning when Stable Video Diffusion needs a reference image', () => {
    render(<GeneratePanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Video$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use SVD' }));

    expect(screen.getByTestId('generate-preflight-summary')).toHaveTextContent('svd');
    expect(screen.getByRole('heading', { name: 'Motion' })).toBeInTheDocument();
    expect(screen.getByTestId('generate-preflight-warning')).toHaveTextContent(
      'Stable Video Diffusion requires a reference image.',
    );
  });

  it('accepts a durable reference set for Stable Video Diffusion preflight', () => {
    seedDurableReferenceImage();
    render(<GeneratePanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Video$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use SVD' }));

    expect(screen.getByTestId('generate-preflight-summary')).toHaveTextContent('svd');
    expect(screen.queryByTestId('generate-preflight-warning')).not.toBeInTheDocument();
    expect(screen.getByText(/Primary motion reference ready: Hero reference\./)).toBeInTheDocument();
  });
});
