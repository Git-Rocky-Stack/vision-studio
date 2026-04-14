import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransitionIndicator } from './TransitionIndicator';

describe('TransitionIndicator', () => {
  beforeEach(cleanup);

  describe('transition types', () => {
    it('renders cut transition', () => {
      render(<TransitionIndicator type="cut" />);
      expect(screen.getByText('Cut')).toBeInTheDocument();
    });

    it('renders fade transition', () => {
      render(<TransitionIndicator type="fade" />);
      expect(screen.getByText('Fade')).toBeInTheDocument();
    });

    it('renders dissolve transition', () => {
      render(<TransitionIndicator type="dissolve" />);
      expect(screen.getByText('Dissolve')).toBeInTheDocument();
    });

    it('renders wipe-left transition', () => {
      render(<TransitionIndicator type="wipe-left" />);
      expect(screen.getByText('Wipe Left')).toBeInTheDocument();
    });

    it('renders wipe-right transition', () => {
      render(<TransitionIndicator type="wipe-right" />);
      expect(screen.getByText('Wipe Right')).toBeInTheDocument();
    });

    it('renders zoom transition', () => {
      render(<TransitionIndicator type="zoom" />);
      expect(screen.getByText('Zoom')).toBeInTheDocument();
    });
  });

  describe('duration display', () => {
    it('renders duration in milliseconds when < 1s', () => {
      render(<TransitionIndicator type="fade" duration={500} />);
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    it('renders duration in seconds when >= 1s', () => {
      render(<TransitionIndicator type="fade" duration={2000} />);
      expect(screen.getByText('2.0s')).toBeInTheDocument();
    });

    it('does not render duration when undefined', () => {
      render(<TransitionIndicator type="cut" />);
      expect(screen.queryByText(/ms|s$/)).not.toBeInTheDocument();
    });

    it('does not render duration when 0', () => {
      render(<TransitionIndicator type="cut" duration={0} />);
      expect(screen.queryByText(/ms|s$/)).not.toBeInTheDocument();
    });

    it('renders fractional seconds correctly', () => {
      render(<TransitionIndicator type="dissolve" duration={1500} />);
      expect(screen.getByText('1.5s')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClick when clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(<TransitionIndicator type="cut" onClick={onClick} />);
      await user.click(screen.getByTestId('transition-indicator'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('has cursor-pointer when onClick is provided', () => {
      render(<TransitionIndicator type="cut" onClick={vi.fn()} />);
      const indicator = screen.getByTestId('transition-indicator');
      expect(indicator).toHaveClass('cursor-pointer');
    });

    it('has cursor-default when onClick is not provided', () => {
      render(<TransitionIndicator type="cut" />);
      const indicator = screen.getByTestId('transition-indicator');
      expect(indicator).toHaveClass('cursor-default');
    });
  });

  describe('accessibility', () => {
    it('has aria-label with transition type and duration', () => {
      render(<TransitionIndicator type="fade" duration={1500} />);
      expect(screen.getByTestId('transition-indicator')).toHaveAttribute(
        'aria-label',
        'Fade transition, 1.5s'
      );
    });

    it('has aria-label with transition type only when no duration', () => {
      render(<TransitionIndicator type="cut" />);
      expect(screen.getByTestId('transition-indicator')).toHaveAttribute(
        'aria-label',
        'Cut transition'
      );
    });

    it('is a button element for accessibility', () => {
      render(<TransitionIndicator type="cut" onClick={vi.fn()} />);
      expect(screen.getByTestId('transition-indicator').tagName).toBe('BUTTON');
    });
  });
});