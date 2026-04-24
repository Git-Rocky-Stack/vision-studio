import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CharacterRef } from '@/types/project';
import { CharacterRefCard } from './CharacterRefCard';

const mockCharacter: CharacterRef = {
  id: 'char-1',
  projectId: 'proj-1',
  name: 'Captain Nova',
  description: 'A brave space captain',
  faceImages: ['face1.png', 'face2.png'],
  bodyImages: [],
  styleImages: [],
  lockedFeatures: ['face', 'body'],
  consistencyStrength: 0.85,
  color: '#e63946',
};

const mockCharacterNoImages: CharacterRef = {
  id: 'char-2',
  projectId: 'proj-1',
  name: 'Shadow Agent',
  description: 'Mysterious infiltrator',
  faceImages: [],
  bodyImages: [],
  styleImages: [],
  lockedFeatures: [],
  consistencyStrength: 0.7,
  color: '#6c5ce7',
};

describe('CharacterRefCard', () => {
  beforeEach(cleanup);

  describe('rendering', () => {
    it('renders character name', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={3}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByText('Captain Nova')).toBeInTheDocument();
    });

    it('renders face image when present', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      const img = screen.getByRole('img', { name: /captain nova/i });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'face1.png');
    });

    it('renders placeholder icon when no face images', () => {
      render(
        <CharacterRefCard
          character={mockCharacterNoImages}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      // User icon should be shown as placeholder
      const card = screen.getByTestId('character-ref-card');
      expect(card).toBeInTheDocument();
      // No img element since faceImages is empty
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders multi-image badge when multiple face images', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      // Shows "2" badge for 2 face images
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders color indicator', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      // Color indicator div should exist with the character's color
      const card = screen.getByTestId('character-ref-card');
      // The color bar exists (inline style)
      expect(card.querySelector('.w-1')).toBeInTheDocument();
    });

    it('renders scene count when > 0', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={3}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByText('3 scenes')).toBeInTheDocument();
    });

    it('renders singular scene count', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={1}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByText('1 scene')).toBeInTheDocument();
    });

    it('does not render scene count when 0', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      expect(screen.queryByText(/scene/)).not.toBeInTheDocument();
    });
  });

  describe('feature locks', () => {
    it('renders all four feature toggle buttons', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByLabelText('Face locked')).toBeInTheDocument();
      expect(screen.getByLabelText('Body locked')).toBeInTheDocument();
      expect(screen.getByLabelText('Style unlocked')).toBeInTheDocument();
      expect(screen.getByLabelText('Pose unlocked')).toBeInTheDocument();
    });

    it('shows locked style for locked features', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      const faceBtn = screen.getByLabelText('Face locked');
      expect(faceBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows unlocked style for unlocked features', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      const styleBtn = screen.getByLabelText('Style unlocked');
      expect(styleBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls onToggleFeature when feature button is clicked', async () => {
      const onToggleFeature = vi.fn();
      const user = userEvent.setup();
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
          onToggleFeature={onToggleFeature}
        />
      );
      const faceBtn = screen.getByLabelText('Face locked');
      await user.click(faceBtn);
      expect(onToggleFeature).toHaveBeenCalledWith('face');
    });

    it('does not propagate click when feature button is clicked', async () => {
      const onClick = vi.fn();
      const onToggleFeature = vi.fn();
      const user = userEvent.setup();
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={onClick}
          onToggleFeature={onToggleFeature}
        />
      );
      const faceBtn = screen.getByLabelText('Face locked');
      await user.click(faceBtn);
      expect(onToggleFeature).toHaveBeenCalledWith('face');
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('selection state', () => {
    it('applies selected ring when isSelected is true', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={true}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      const card = screen.getByTestId('character-ref-card');
      expect(card).toHaveClass('ring-red-primary');
    });

    it('does not apply selected ring when isSelected is false', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      const card = screen.getByTestId('character-ref-card');
      expect(card).not.toHaveClass('ring-red-primary');
    });
  });

  describe('interactions', () => {
    it('calls onClick when card is clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={onClick}
        />
      );
      await user.click(screen.getByTestId('character-ref-card'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when Enter key is pressed', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={onClick}
        />
      );
      screen.getByTestId('character-ref-card').focus();
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when delete button is clicked', async () => {
      const onClick = vi.fn();
      const onDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={onClick}
          onDelete={onDelete}
        />
      );
      // Hover to reveal delete button
      await user.hover(screen.getByTestId('character-ref-card'));
      const deleteBtn = screen.getByRole('button', { name: /delete captain nova/i });
      await user.click(deleteBtn);
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('delete button', () => {
    it('delete button is not rendered when onDelete is not provided', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('delete button renders with character name in aria-label', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: /delete captain nova/i })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('card has aria-label with character name and scene count', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={3}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('character-ref-card')).toHaveAttribute(
        'aria-label',
        'Captain Nova, 3 scenes'
      );
    });

    it('has aria-selected true when selected', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={true}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('character-ref-card')).toHaveAttribute('aria-selected', 'true');
    });

    it('has aria-selected false when not selected', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
        />
      );
      expect(screen.getByTestId('character-ref-card')).toHaveAttribute('aria-selected', 'false');
    });

    it('feature buttons have proper aria-pressed state', () => {
      render(
        <CharacterRefCard
          character={mockCharacter}
          isSelected={false}
          sceneCount={0}
          onClick={vi.fn()}
          onToggleFeature={vi.fn()}
        />
      );
      const faceBtn = screen.getByLabelText('Face locked');
      expect(faceBtn).toHaveAttribute('aria-pressed', 'true');

      const styleBtn = screen.getByLabelText('Style unlocked');
      expect(styleBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
