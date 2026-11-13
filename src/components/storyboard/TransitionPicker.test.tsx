import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SceneTransition } from '@/types/project';

import {
  DEFAULT_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS,
  TRANSITION_TYPES,
  TransitionPicker,
  withTransitionType,
} from './TransitionPicker';

afterEach(cleanup);

function Harness({
  initial = { type: 'cut', duration: 0 },
  onChange,
}: {
  initial?: SceneTransition;
  onChange?: (sceneId: string, transition: SceneTransition) => void;
}) {
  const [transition, setTransition] = useState<SceneTransition>(initial);
  return (
    <>
      <button type="button">Outside</button>
      <TransitionPicker
        sceneId="scene-1"
        sceneName="Opening"
        transition={transition}
        onChange={(sceneId, next) => {
          onChange?.(sceneId, next);
          setTransition(next);
        }}
      />
    </>
  );
}

describe('withTransitionType', () => {
  it('zeroes a cut and gives other types a usable duration', () => {
    expect(withTransitionType({ type: 'fade', duration: 800 }, 'cut')).toEqual({ type: 'cut', duration: 0 });
    expect(withTransitionType({ type: 'cut', duration: 0 }, 'fade')).toEqual({
      type: 'fade',
      duration: DEFAULT_TRANSITION_DURATION_MS,
    });
    expect(withTransitionType({ type: 'fade', duration: 1200 }, 'zoom')).toEqual({ type: 'zoom', duration: 1200 });
  });
});

describe('TransitionPicker', () => {
  it('opens a labelled popover listing every transition type with the current one checked', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ type: 'dissolve', duration: 700 }} />);
    const trigger = screen.getByTestId('transition-indicator');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    const picker = screen.getByRole('dialog', { name: 'Transition after Opening' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', picker.id);
    expect(screen.getAllByRole('radio')).toHaveLength(TRANSITION_TYPES.length);
    expect(screen.getByRole('radio', { name: 'Dissolve' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dissolve' })).toHaveFocus();
  });

  it('applies a type with a default duration and lets the duration be edited and clamped', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByTestId('transition-indicator'));

    const duration = screen.getByLabelText('Duration (s)');
    expect(duration).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Fade' }));
    expect(onChange).toHaveBeenLastCalledWith('scene-1', { type: 'fade', duration: DEFAULT_TRANSITION_DURATION_MS });
    expect(duration).toBeEnabled();
    expect(duration).toHaveValue(0.5);

    fireEvent.change(duration, { target: { value: '1.2' } });
    fireEvent.keyDown(duration, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('scene-1', { type: 'fade', duration: 1200 });

    fireEvent.change(duration, { target: { value: '99' } });
    fireEvent.blur(duration);
    expect(onChange).toHaveBeenLastCalledWith('scene-1', { type: 'fade', duration: MAX_TRANSITION_DURATION_MS });
    expect(screen.getByTestId('transition-indicator')).toHaveAccessibleName('Fade transition, 5.0s');
  });

  it('moves between types with the arrow keys (native radio group)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByTestId('transition-indicator'));
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('scene-1', { type: 'fade', duration: DEFAULT_TRANSITION_DURATION_MS });
  });

  it('closes on Escape, returns focus to the indicator and keeps the key from the workspace', async () => {
    const user = userEvent.setup();
    const windowHandler = vi.fn();
    window.addEventListener('keydown', windowHandler);
    try {
      render(<Harness />);
      const trigger = screen.getByTestId('transition-indicator');
      await user.click(trigger);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(windowHandler).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    } finally {
      window.removeEventListener('keydown', windowHandler);
    }
  });

  it('closes when the user clicks outside or presses Done', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('transition-indicator'));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('transition-indicator'));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('transition-indicator')).toHaveFocus();
  });
});
