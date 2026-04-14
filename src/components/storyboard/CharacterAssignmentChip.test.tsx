import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterAssignmentChip } from './CharacterAssignmentChip';

describe('CharacterAssignmentChip', () => {
  beforeEach(cleanup);

  it('renders character name', () => {
    render(
      <CharacterAssignmentChip
        name="Captain Nova"
        color="#e63946"
        lockedFeatures={['face', 'body']}
      />
    );
    expect(screen.getByText('Captain Nova')).toBeInTheDocument();
  });

  it('renders feature lock badges', () => {
    render(
      <CharacterAssignmentChip
        name="Captain Nova"
        color="#e63946"
        lockedFeatures={['face', 'body']}
      />
    );
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('does not render feature badges when none are locked', () => {
    render(
      <CharacterAssignmentChip
        name="Shadow Agent"
        color="#6c5ce7"
        lockedFeatures={[]}
      />
    );
    expect(screen.queryByText('F')).not.toBeInTheDocument();
  });

  it('renders remove button when onRemove is provided', () => {
    render(
      <CharacterAssignmentChip
        name="Captain Nova"
        color="#e63946"
        lockedFeatures={[]}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /remove captain nova/i })).toBeInTheDocument();
  });

  it('does not render remove button when onRemove is not provided', () => {
    render(
      <CharacterAssignmentChip
        name="Captain Nova"
        color="#e63946"
        lockedFeatures={[]}
      />
    );
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <CharacterAssignmentChip
        name="Captain Nova"
        color="#e63946"
        lockedFeatures={[]}
        onRemove={onRemove}
      />
    );
    await user.click(screen.getByRole('button', { name: /remove captain nova/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not propagate click when remove button is clicked', async () => {
    const onRemove = vi.fn();
    const parentClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={parentClick}>
        <CharacterAssignmentChip
          name="Captain Nova"
          color="#e63946"
          lockedFeatures={[]}
          onRemove={onRemove}
        />
      </div>
    );
    await user.click(screen.getByRole('button', { name: /remove captain nova/i }));
    // stopPropagation means parent click should not fire
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('renders color indicator dot', () => {
    render(
      <CharacterAssignmentChip
        name="Captain Nova"
        color="#e63946"
        lockedFeatures={[]}
      />
    );
    const chip = screen.getByTestId('character-chip');
    const colorDot = chip.querySelector('[style*="background-color"]');
    expect(colorDot).toBeInTheDocument();
  });

  it('truncates long names', () => {
    render(
      <CharacterAssignmentChip
        name="Extremely Long Character Name That Should Be Truncated"
        color="#e63946"
        lockedFeatures={[]}
      />
    );
    const nameEl = screen.getByText('Extremely Long Character Name That Should Be Truncated');
    expect(nameEl).toHaveClass('truncate');
  });

  it('renders all four feature types', () => {
    render(
      <CharacterAssignmentChip
        name="Test"
        color="#e63946"
        lockedFeatures={['face', 'body', 'style', 'pose']}
      />
    );
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
  });
});