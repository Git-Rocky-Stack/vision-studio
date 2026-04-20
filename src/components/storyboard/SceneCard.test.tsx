import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Scene } from '@/types/project';
import { SceneCard } from './SceneCard';
import { DEFAULT_GENERATION_CONFIG, DEFAULT_SCENE_METADATA, DEFAULT_SCENE_TRANSITION } from '@/types/project';

const mockScene: Scene = {
  id: 'scene-1',
  orderIndex: 0,
  name: 'Opening Shot',
  prompt: 'A cinematic opening scene',
  negativePrompt: 'blurry, low quality',
  generationConfig: DEFAULT_GENERATION_CONFIG,
  referenceImages: [],
  frames: [],
  regionLocks: [],
  transitions: DEFAULT_SCENE_TRANSITION,
  camera: [],
  metadata: {
    ...DEFAULT_SCENE_METADATA,
    duration: 5000,
    fps: 24,
    notes: '',
    created: '2026-04-01T00:00:00.000Z',
    modified: '2026-04-01T00:00:00.000Z',
  },
  status: 'draft',
  characterRefs: [],
  thumbnail: undefined,
};

const mockCompleteScene: Scene = {
  ...mockScene,
  id: 'scene-2',
  orderIndex: 1,
  name: 'Complete Scene',
  status: 'complete',
  thumbnail: 'data:image/png;base64,fakebase64image',
  metadata: {
    ...mockScene.metadata,
    duration: 12500,
  },
};

const mockQueuedScene: Scene = {
  ...mockScene,
  id: 'scene-3',
  orderIndex: 2,
  name: 'Queued Scene',
  status: 'queued',
};

const mockGeneratingScene: Scene = {
  ...mockScene,
  id: 'scene-4',
  orderIndex: 3,
  name: 'Generating Scene',
  status: 'generating',
};

const mockErrorScene: Scene = {
  ...mockScene,
  id: 'scene-5',
  orderIndex: 4,
  name: 'Error Scene',
  status: 'error',
};

describe('SceneCard', () => {
  beforeEach(cleanup);

  describe('rendering', () => {
    it('renders scene name', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByText('Opening Shot')).toBeInTheDocument();
    });

    it('renders scene number', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      // orderIndex 0 → scene number 1
      expect(screen.getByText('01')).toBeInTheDocument();
    });

    it('renders duration as mm:ss', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      // 5000ms = 5s = 00:05
      expect(screen.getByText('00:05')).toBeInTheDocument();
    });

    it('renders duration over an hour correctly', () => {
      const longScene: Scene = {
        ...mockScene,
        metadata: { ...mockScene.metadata, duration: 3665000 }, // 1h 1m 5s
      };
      render(<SceneCard scene={longScene} isSelected={false} onClick={vi.fn()} />);
      // 3665000ms = 61m 5s = 01:01:05
      expect(screen.getByText('01:01:05')).toBeInTheDocument();
    });

    it('renders thumbnail image when present', () => {
      render(<SceneCard scene={mockCompleteScene} isSelected={false} onClick={vi.fn()} />);
      const img = screen.getByRole('img', { name: /scene thumbnail/i });
      expect(img).toBeInTheDocument();
    });

    it('renders placeholder when no thumbnail', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      // Should show a placeholder icon for missing thumbnail
      const placeholder = screen.getByTestId('scene-card-placeholder');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('renders draft status badge', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByText('draft')).toBeInTheDocument();
    });

    it('renders queued status badge', () => {
      render(<SceneCard scene={mockQueuedScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByText('queued')).toBeInTheDocument();
    });

    it('renders generating status badge with animation', () => {
      render(<SceneCard scene={mockGeneratingScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByText('generating')).toBeInTheDocument();
    });

    it('renders complete status badge', () => {
      render(<SceneCard scene={mockCompleteScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByText('complete')).toBeInTheDocument();
    });

    it('renders error status badge', () => {
      render(<SceneCard scene={mockErrorScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });

  describe('selection state', () => {
    it('applies selected class when isSelected is true', () => {
      render(<SceneCard scene={mockScene} isSelected={true} onClick={vi.fn()} />);
      const card = screen.getByTestId('scene-card');
      expect(card).toHaveClass('ring-red-primary');
    });

    it('does not apply selected class when isSelected is false', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      const card = screen.getByTestId('scene-card');
      expect(card).not.toHaveClass('ring-red-primary');
    });
  });

  describe('interactions', () => {
    it('calls onClick when card is clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(<SceneCard scene={mockScene} isSelected={false} onClick={onClick} />);
      await user.click(screen.getByTestId('scene-card'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when delete button is clicked', async () => {
      const onClick = vi.fn();
      const onDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <SceneCard scene={mockScene} isSelected={false} onClick={onClick} onDelete={onDelete} />
      );
      // Hover to reveal delete button
      await user.hover(screen.getByTestId('scene-card'));
      const deleteBtn = screen.getByRole('button', { name: /delete scene/i });
      await user.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('delete button visibility', () => {
    it('delete button is hidden when onDelete is not provided', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /delete scene/i })).not.toBeInTheDocument();
    });

    it('delete button exists in DOM but is visually hidden when not hovered or selected', () => {
      render(
        <SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} onDelete={vi.fn()} />
      );
      // Button is in DOM but hidden via opacity/pointer-events
      expect(screen.queryByRole('button', { name: /delete scene/i })).toBeInTheDocument();
    });

    it('action buttons container becomes visible when hovered', async () => {
      const user = userEvent.setup();
      render(
        <SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} onDelete={vi.fn()} />
      );
      await user.hover(screen.getByTestId('scene-card'));
      // The action buttons container gains opacity-100 and pointer-events-auto on hover
      const container = screen.getByRole('button', { name: /delete scene/i }).parentElement;
      expect(container).toHaveClass('opacity-100');
      expect(container).toHaveClass('pointer-events-auto');
    });
  });

  describe('duplicate button', () => {
    it('renders duplicate button when onDuplicate is provided', () => {
      render(
        <SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} onDuplicate={vi.fn()} />
      );
      expect(screen.getByRole('button', { name: /duplicate scene/i })).toBeInTheDocument();
    });

    it('does not render duplicate button when onDuplicate is not provided', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /duplicate scene/i })).not.toBeInTheDocument();
    });

    it('calls onDuplicate when duplicate button is clicked', async () => {
      const onDuplicate = vi.fn();
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <SceneCard scene={mockScene} isSelected={false} onClick={onClick} onDuplicate={onDuplicate} />
      );
      await user.hover(screen.getByTestId('scene-card'));
      const duplicateBtn = screen.getByRole('button', { name: /duplicate scene/i });
      await user.click(duplicateBtn);
      expect(onDuplicate).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('calls reorder callbacks from keyboard-accessible move buttons', async () => {
      const onMoveUp = vi.fn();
      const onMoveDown = vi.fn();
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <SceneCard
          scene={mockScene}
          isSelected={false}
          onClick={onClick}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp
          canMoveDown
        />
      );

      await user.hover(screen.getByTestId('scene-card'));
      await user.click(screen.getByRole('button', { name: /move scene up/i }));
      await user.click(screen.getByRole('button', { name: /move scene down/i }));

      expect(onMoveUp).toHaveBeenCalledTimes(1);
      expect(onMoveDown).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('card has aria-label with scene name and status', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByTestId('scene-card')).toHaveAttribute(
        'aria-label',
        'Scene 01: Opening Shot, draft'
      );
    });

    it('has aria-selected when selected', () => {
      render(<SceneCard scene={mockScene} isSelected={true} onClick={vi.fn()} />);
      expect(screen.getByTestId('scene-card')).toHaveAttribute('aria-selected', 'true');
    });

    it('has aria-selected false when not selected', () => {
      render(<SceneCard scene={mockScene} isSelected={false} onClick={vi.fn()} />);
      expect(screen.getByTestId('scene-card')).toHaveAttribute('aria-selected', 'false');
    });
  });
});
