import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/generate/PromptArea', () => ({
  PromptArea: ({
    prompt,
    onPromptChange,
    onEnhance,
  }: {
    prompt: string;
    onPromptChange: (value: string) => void;
    onEnhance: () => void;
  }) => (
    <div>
      <label htmlFor="mock-prompt-input">Prompt</label>
      <input
        id="mock-prompt-input"
        data-testid="mock-prompt-input"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
      />
      <button type="button" onClick={onEnhance}>
        Enhance Prompt
      </button>
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

vi.mock('@/features/timeline/runTimelineClipGeneration', () => ({
  runTimelineClipGeneration: vi.fn(),
}));

import { useAppStore } from '@/store/appStore';
import { computeDimensions } from '@/types/resolution';
import { runTimelineClipGeneration } from '@/features/timeline/runTimelineClipGeneration';

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

function installElectronGenerationMock() {
  window.electron = {
    app: {
      getPath: vi.fn().mockResolvedValue('C:/Users/User/AppData/Roaming/VisionStudio'),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        defaultOutputPath: '',
      }),
    },
    accounts: {
      list: vi.fn().mockResolvedValue({
        activeAccountId: 'account-primary',
        accounts: [
          {
            id: 'account-primary',
            name: 'Primary',
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:00.000Z',
            preferences: {
              promptEnhancementProvider: 'local',
              openRouterModel: '',
              imageGenerationProvider: 'local',
              videoGenerationProvider: 'local',
              openRouterImageModel: '',
              huggingFaceModel: '',
              huggingFaceImageModel: '',
              huggingFaceVideoModel: '',
              fallbackProvider: null,
            },
            openRouter: {
              apiKeyStored: false,
              keyLabel: null,
              lastValidatedAt: null,
            },
            huggingFace: {
              tokenStored: false,
              keyLabel: null,
              lastValidatedAt: null,
            },
          },
        ],
      }),
    },
    generation: {
      generateImage: vi.fn().mockResolvedValue({ success: true, jobId: 'job-generate-image-1' }),
      generateVideo: vi.fn().mockResolvedValue({ success: true, jobId: 'job-generate-video-1' }),
      enhancePrompt: vi.fn().mockResolvedValue({
        success: true,
        prompt: 'enhanced prompt from service',
        variations: [],
      }),
      getStatus: vi.fn().mockResolvedValue({
        job_id: 'job-generate-image-1',
        status: 'completed',
        type: 'image',
        created_at: '2026-04-23T00:00:00.000Z',
        completed_at: '2026-04-23T00:00:03.000Z',
        progress: 100,
        result: {
          images: ['/outputs/job-generate-image-1/frame.png'],
        },
      }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
    },
    notifications: {
      notify: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as typeof window.electron;
}

function seedTimelineTargetClip() {
  const state = useAppStore.getState();
  const project = state.createProject('Timeline Board');
  const sequence = state.ensureTimelineSequenceForProject(project.id)!;
  const track = useAppStore.getState().timelineTracks.find((item) => item.sequenceId === sequence.id)!;

  state.upsertMediaAsset({
    id: 'timeline-source-image',
    legacyAssetId: null,
    jobId: null,
    name: 'Storyboard Frame',
    type: 'image',
    source: 'generated',
    path: 'C:/vision-studio-output/frames/shot.png',
    previewUrl: 'file:///C:/vision-studio-output/frames/shot.png',
    thumbnailUrl: 'file:///C:/vision-studio-output/frames/shot.png',
    posterUrl: null,
    width: 1024,
    height: 576,
    metadata: {},
    createdAt: '2026-04-22T00:00:00.000Z',
  });

  const clip = state.createTimelineClip({
    trackId: track.id,
    mediaAssetId: 'timeline-source-image',
    startMs: 0,
    durationMs: 2000,
    label: 'Opening Shot',
  });

  state.setActiveTimelineClip(clip?.id ?? null);
}

function seedCanvasControlLayerScene(options?: { invalidControlnet?: boolean }) {
  const state = useAppStore.getState();
  const project = state.createProject('Canvas Controls');
  const scene = state.addScene(project.id, { name: 'Canvas Shot' });

  state.setActiveProject(project.id);
  state.setActiveScene(scene.id);
  useAppStore.setState({
    currentImageAssetPath: 'C:/vision-studio-output/current/canvas-base.png',
  });

  state.upsertMediaAsset({
    id: 'canvas-controlnet-source',
    legacyAssetId: null,
    jobId: null,
    name: 'Pose Map',
    type: 'image',
    source: 'imported',
    path: 'C:/vision-studio-inputs/pose-map.png',
    previewUrl: 'file:///C:/vision-studio-inputs/pose-map.png',
    thumbnailUrl: 'file:///C:/vision-studio-inputs/pose-map.png',
    posterUrl: null,
    width: 1024,
    height: 1024,
    metadata: {},
    createdAt: '2026-04-23T00:00:00.000Z',
  });

  useAppStore.setState((current) => ({
    referenceSets: [
      ...current.referenceSets,
      {
        id: 'canvas-reference-set',
        name: 'Canvas Reference',
        scope: 'scene',
        projectId: project.id,
        sceneId: scene.id,
        clipId: null,
        items: [
          {
            id: 'canvas-reference-item',
            slot: 'composition',
            mediaAssetId: 'canvas-controlnet-source',
            path: 'C:/vision-studio-inputs/reference-style.png',
            label: 'Reference style',
            orderIndex: 0,
          },
        ],
        notes: '',
        tags: [],
        createdAt: '2026-04-23T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
      },
    ],
  }));

  const latestState = useAppStore.getState();
  latestState.createCanvasControlLayer(scene.id, {
    name: 'Pose Guide',
    type: 'controlnet',
    sourceMediaAssetId: options?.invalidControlnet ? undefined : 'canvas-controlnet-source',
    preprocessor: 'openpose',
    mask: {
      type: 'rectangle',
      points: [
        { x: 32, y: 48 },
        { x: 256, y: 48 },
        { x: 256, y: 224 },
        { x: 32, y: 224 },
      ],
      bounds: { x: 32, y: 48, width: 224, height: 176 },
      featherRadius: 2,
      blendEdges: true,
    },
  });
  latestState.createCanvasControlLayer(scene.id, {
    name: 'Reference Area',
    type: 'reference-image',
    referenceSetId: 'canvas-reference-set',
    mask: {
      type: 'rectangle',
      points: [
        { x: 320, y: 64 },
        { x: 512, y: 64 },
        { x: 512, y: 240 },
        { x: 320, y: 240 },
      ],
      bounds: { x: 320, y: 64, width: 192, height: 176 },
      featherRadius: 2,
      blendEdges: true,
    },
  });
  latestState.createCanvasControlLayer(scene.id, {
    name: 'Fill Mask',
    type: 'inpaint-mask',
    prompt: 'repair the missing sleeve',
    mask: {
      type: 'rectangle',
      points: [
        { x: 540, y: 120 },
        { x: 680, y: 120 },
        { x: 680, y: 280 },
        { x: 540, y: 280 },
      ],
      bounds: { x: 540, y: 120, width: 140, height: 160 },
      featherRadius: 2,
      blendEdges: true,
    },
  });
}

describe('GeneratePanel', () => {
  beforeEach(() => {
    resetStore();
    installElectronGenerationMock();
    vi.mocked(runTimelineClipGeneration).mockReset();
  });

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

  it('uses the selected timeline image clip as the motion source for SVD', () => {
    seedTimelineTargetClip();
    render(<GeneratePanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Video$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use SVD' }));

    expect(screen.getByTestId('generate-target-summary')).toHaveTextContent('Opening Shot');
    expect(screen.queryByTestId('generate-preflight-warning')).not.toBeInTheDocument();
    expect(screen.getByText(/Primary motion reference ready: Storyboard Frame\./)).toBeInTheDocument();
  });

  it('routes video through the HuggingFace video model when the account selects HuggingFace', async () => {
    (window.electron.accounts.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      activeAccountId: 'account-primary',
      accounts: [
        {
          id: 'account-primary',
          name: 'Primary',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
          preferences: {
            promptEnhancementProvider: 'local',
            openRouterModel: '',
            imageGenerationProvider: 'local',
            videoGenerationProvider: 'huggingface',
            openRouterImageModel: '',
            huggingFaceModel: '',
            huggingFaceImageModel: '',
            huggingFaceVideoModel: 'Lightricks/LTX-Video',
            fallbackProvider: null,
          },
          openRouter: { apiKeyStored: false, keyLabel: null, lastValidatedAt: null },
          huggingFace: { tokenStored: true, keyLabel: null, lastValidatedAt: null },
        },
      ],
    });

    render(<GeneratePanel />);

    fireEvent.click(screen.getByRole('button', { name: /^Video$/ }));
    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'an ocean wave' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'an ocean wave', model: 'Lightricks/LTX-Video' }),
      );
    });
  });

  it('treats a HuggingFace still-image route as hosted in the preflight while the backend is offline', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));
    (window.electron.accounts.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      activeAccountId: 'account-primary',
      accounts: [
        {
          id: 'account-primary',
          name: 'Primary',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
          preferences: {
            promptEnhancementProvider: 'local',
            openRouterModel: '',
            imageGenerationProvider: 'huggingface',
            videoGenerationProvider: 'local',
            openRouterImageModel: '',
            huggingFaceModel: '',
            huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
            huggingFaceVideoModel: '',
            fallbackProvider: null,
          },
          openRouter: { apiKeyStored: false, keyLabel: null, lastValidatedAt: null },
          huggingFace: { tokenStored: true, keyLabel: null, lastValidatedAt: null },
        },
      ],
    });

    render(<GeneratePanel />);

    // The preflight reflects the hosted HF model, not the local checkpoint id.
    await waitFor(() => {
      expect(screen.getByTestId('generate-preflight-summary')).toHaveTextContent(
        'black-forest-labs/FLUX.1-schnell',
      );
    });
    // A hosted route must never surface the local backend-offline warning.
    expect(screen.queryByTestId('generate-preflight-warning')).not.toBeInTheDocument();
  });

  it('warns that the HuggingFace still-image route is prompt-only when canvas control layers are present', async () => {
    seedCanvasControlLayerScene();
    (window.electron.accounts.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      activeAccountId: 'account-primary',
      accounts: [
        {
          id: 'account-primary',
          name: 'Primary',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
          preferences: {
            promptEnhancementProvider: 'local',
            openRouterModel: '',
            imageGenerationProvider: 'huggingface',
            videoGenerationProvider: 'local',
            openRouterImageModel: '',
            huggingFaceModel: '',
            huggingFaceImageModel: 'black-forest-labs/FLUX.1-schnell',
            huggingFaceVideoModel: '',
            fallbackProvider: null,
          },
          openRouter: { apiKeyStored: false, keyLabel: null, lastValidatedAt: null },
          huggingFace: { tokenStored: true, keyLabel: null, lastValidatedAt: null },
        },
      ],
    });

    render(<GeneratePanel />);

    // The footer preflight must reflect the prompt-only policy (matching the
    // click-time guard), not advertise ControlNet/inpaint support.
    await waitFor(() => {
      expect(screen.getByTestId('generate-preflight-warning')).toHaveTextContent(
        'HuggingFace still-image routing supports prompt-only generations. Switch the active account back to Local for ControlNet, inpaint, or reference-image passes.',
      );
    });

    // And the click-time guard rejects the same guided generation rather than
    // submitting an unsupported payload to the hosted provider.
    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'guided portrait pass' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).not.toHaveBeenCalled();
    });
  });

  it('routes generation through the timeline runner when a timeline target is selected', async () => {
    seedTimelineTargetClip();
    vi.mocked(runTimelineClipGeneration).mockResolvedValue({
      cancelled: false,
      clipId: 'clip-variant-1',
      outputAssetId: 'job-1::/outputs/variant.png',
      bindingId: 'binding-1',
      retakeTakeId: null,
    });

    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'hero frame variant' },
    });
    expect(screen.getByTestId('generate-button')).toHaveTextContent('Generate Clip Variant');
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(runTimelineClipGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'generate',
          clipId: expect.any(String),
          sequenceId: expect.any(String),
          input: expect.objectContaining({
            prompt: 'hero frame variant',
            generationType: 'image',
          }),
        }),
      );
    });
  });

  it('resolves visible canvas control layers into the image generation payload', async () => {
    seedCanvasControlLayerScene();
    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'cinematic portrait pass' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'cinematic portrait pass',
          controlnet: [
            expect.objectContaining({
              layer_name: 'Pose Guide',
              source_path: 'C:/vision-studio-inputs/pose-map.png',
              preprocessor: 'openpose',
            }),
          ],
          reference_images: [
            expect.objectContaining({
              layer_name: 'Reference Area',
              source_path: 'C:/vision-studio-inputs/reference-style.png',
            }),
          ],
          image_path: 'C:/vision-studio-output/current/canvas-base.png',
          inpaint: expect.objectContaining({
            layer_name: 'Fill Mask',
          }),
        }),
      );
    });
  });

  it('blocks generation when a visible canvas control layer is invalid', async () => {
    seedCanvasControlLayerScene({ invalidControlnet: true });
    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'broken control layer run' },
    });

    expect(screen.getByTestId('generate-preflight-warning')).toHaveTextContent(
      'Pose Guide needs a source image or reference target.',
    );

    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).not.toHaveBeenCalled();
      expect(screen.getByText('Pose Guide needs a source image or reference target.')).toBeInTheDocument();
    });
  });

  it('surfaces prompt enhancement errors instead of failing silently', async () => {
    window.electron.generation.enhancePrompt = vi.fn().mockResolvedValue({
      success: false,
      error: 'OpenRouter key is invalid.',
    });

    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'hero close-up' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enhance Prompt' }));

    await waitFor(() => {
      expect(window.electron.generation.enhancePrompt).toHaveBeenCalledWith({
        prompt: 'hero close-up',
        mode: 'clarify',
      });
      expect(screen.getByText('OpenRouter key is invalid.')).toBeInTheDocument();
    });
  });

  it('allows still-image generation through OpenRouter when the local backend is offline', async () => {
    useAppStore.setState((state) => ({
      systemInfo: {
        ...state.systemInfo,
        backendConnected: false,
      },
    }));
    window.electron.accounts.list = vi.fn().mockResolvedValue({
      activeAccountId: 'account-primary',
      accounts: [
        {
          id: 'account-primary',
          name: 'Primary',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
          preferences: {
            promptEnhancementProvider: 'local',
            openRouterModel: '',
            imageGenerationProvider: 'openrouter',
            videoGenerationProvider: 'local',
            openRouterImageModel: 'google/gemini-2.5-flash-image',
            huggingFaceModel: '',
            huggingFaceImageModel: '',
            huggingFaceVideoModel: '',
            fallbackProvider: null,
          },
          openRouter: {
            apiKeyStored: true,
            keyLabel: 'Primary Key',
            lastValidatedAt: '2026-04-24T00:00:00.000Z',
          },
          huggingFace: {
            tokenStored: false,
            keyLabel: null,
            lastValidatedAt: null,
          },
        },
      ],
    });

    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'hero close-up in warm window light' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'hero close-up in warm window light',
          model: 'google/gemini-2.5-flash-image',
        }),
      );
    });
    expect(await screen.findByText('OpenRouter Still Image Route')).toBeInTheDocument();
  });
});
