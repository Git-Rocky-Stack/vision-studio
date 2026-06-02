import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenePlaybackStrip } from './ScenePlaybackStrip';
import type { Scene } from '@/types/project';
import { DEFAULT_GENERATION_CONFIG, DEFAULT_SCENE_METADATA, DEFAULT_SCENE_TRANSITION } from '@/types/project';

const mockScene: Scene = {
  id: 'scene-1',
  orderIndex: 0,
  name: 'Opening Shot',
  prompt: 'A cinematic opening',
  negativePrompt: '',
  generationConfig: DEFAULT_GENERATION_CONFIG,
  referenceImages: [],
  frames: [],
  regionLocks: [],
  transitions: DEFAULT_SCENE_TRANSITION,
  camera: [],
  metadata: { ...DEFAULT_SCENE_METADATA, duration: 3000 },
  canvasControlLayers: [],
  activeCanvasControlLayerId: null,
  timelineClipIds: [],
  status: 'complete',
  characterRefs: [],
  thumbnail: 'data:image/png;base64,fake',
};

const mockScene2: Scene = {
  ...mockScene,
  id: 'scene-2',
  orderIndex: 1,
  name: 'Chase Scene',
  metadata: { ...DEFAULT_SCENE_METADATA, duration: 5000 },
  transitions: { type: 'fade', duration: 500 },
};

const mockScene3: Scene = {
  ...mockScene,
  id: 'scene-3',
  orderIndex: 2,
  name: 'Finale',
  metadata: { ...DEFAULT_SCENE_METADATA, duration: 4000 },
  transitions: { type: 'dissolve', duration: 1000 },
};

describe('ScenePlaybackStrip', () => {
  const defaultProps = {
    scenes: [mockScene, mockScene2, mockScene3],
    activeSceneId: 'scene-1',
    onSceneSelect: vi.fn(),
  };

  beforeEach(cleanup);

  describe('rendering', () => {
    it('renders scene thumbnails', () => {
      render(<ScenePlaybackStrip {...defaultProps} />);
      expect(screen.getByLabelText('Scene 1: Opening Shot')).toBeInTheDocument();
      expect(screen.getByLabelText('Scene 2: Chase Scene')).toBeInTheDocument();
      expect(screen.getByLabelText('Scene 3: Finale')).toBeInTheDocument();
    });

    it('renders playback controls', () => {
      render(<ScenePlaybackStrip {...defaultProps} />);
      expect(screen.getByLabelText('Skip to beginning')).toBeInTheDocument();
      expect(screen.getByLabelText(/play/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Skip to end')).toBeInTheDocument();
    });

    it('renders transition indicators between scenes', () => {
      render(<ScenePlaybackStrip {...defaultProps} />);
      // Cut transition after scene 1
      expect(screen.getByText('Cut')).toBeInTheDocument();
      // Fade transition after scene 2
      expect(screen.getByText('Fade')).toBeInTheDocument();
    });

    it('renders scene count', () => {
      render(<ScenePlaybackStrip {...defaultProps} />);
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });

    it('renders empty state when no scenes', () => {
      render(<ScenePlaybackStrip scenes={[]} activeSceneId={null} onSceneSelect={vi.fn()} />);
      expect(screen.getByText(/no scenes to play/i)).toBeInTheDocument();
    });

    it('renders placeholder for scenes without thumbnails', () => {
      const noThumbScene = { ...mockScene, thumbnail: undefined };
      render(
        <ScenePlaybackStrip
          scenes={[noThumbScene]}
          activeSceneId="scene-1"
          onSceneSelect={vi.fn()}
        />
      );
      expect(screen.getByLabelText('Scene 1: Opening Shot')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onSceneSelect when scene thumbnail is clicked', async () => {
      const onSceneSelect = vi.fn();
      const user = userEvent.setup();
      render(<ScenePlaybackStrip {...defaultProps} onSceneSelect={onSceneSelect} />);
      await user.click(screen.getByLabelText('Scene 2: Chase Scene'));
      expect(onSceneSelect).toHaveBeenCalledWith('scene-2');
    });

    it('calls onSceneSelect when skip to start is clicked', async () => {
      const onSceneSelect = vi.fn();
      const user = userEvent.setup();
      render(<ScenePlaybackStrip {...defaultProps} onSceneSelect={onSceneSelect} />);
      await user.click(screen.getByLabelText('Skip to beginning'));
      expect(onSceneSelect).toHaveBeenCalledWith('scene-1');
    });

    it('calls onSceneSelect when skip to end is clicked', async () => {
      const onSceneSelect = vi.fn();
      const user = userEvent.setup();
      render(<ScenePlaybackStrip {...defaultProps} onSceneSelect={onSceneSelect} />);
      await user.click(screen.getByLabelText('Skip to end'));
      expect(onSceneSelect).toHaveBeenCalledWith('scene-3');
    });

    it('toggles play/pause button state', async () => {
      render(<ScenePlaybackStrip {...defaultProps} />);
      const playBtn = screen.getByLabelText(/play/i);
      expect(playBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('active state', () => {
    it('applies active styling to selected scene', () => {
      render(<ScenePlaybackStrip {...defaultProps} activeSceneId="scene-2" />);
      const scene2Btn = screen.getByLabelText('Scene 2: Chase Scene');
      expect(scene2Btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('applies inactive styling to non-selected scenes', () => {
      render(<ScenePlaybackStrip {...defaultProps} activeSceneId="scene-1" />);
      const scene2Btn = screen.getByLabelText('Scene 2: Chase Scene');
      expect(scene2Btn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('transitions', () => {
    it('calls onTransitionClick when transition is clicked', async () => {
      const onTransitionClick = vi.fn();
      const user = userEvent.setup();
      render(<ScenePlaybackStrip {...defaultProps} onTransitionClick={onTransitionClick} />);
      // Click the Cut transition indicator
      await user.click(screen.getByText('Cut'));
      expect(onTransitionClick).toHaveBeenCalledWith('scene-1');
    });

    it('renders duration for transitions with duration', () => {
      render(<ScenePlaybackStrip {...defaultProps} />);
      // Fade transition has 500ms duration
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });
  });
});
