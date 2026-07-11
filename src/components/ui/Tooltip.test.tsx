import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

afterEach(cleanup);

describe('Tooltip', () => {
  describe('rendering', () => {
    it('renders children correctly', () => {
      render(
        <Tooltip content="Helpful info">
          <button>Hover me</button>
        </Tooltip>
      );
      expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
    });

    it('does not show tooltip initially', () => {
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Hover me</button>
        </Tooltip>
      );
      expect(screen.queryByText('Helpful info')).not.toBeInTheDocument();
    });
  });

  describe('hover behavior', () => {
    it('shows tooltip on hover after delay', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={100}>
          <button>Hover me</button>
        </Tooltip>
      );

      await user.hover(screen.getByRole('button'));
      await waitFor(() => {
        expect(screen.getByText('Helpful info')).toBeInTheDocument();
      });
    });

    it('hides tooltip when mouse leaves', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Hover me</button>
        </Tooltip>
      );

      const button = screen.getByRole('button');
      await user.hover(button);
      await waitFor(() => {
        expect(screen.getByText('Helpful info')).toBeInTheDocument();
      });

      await user.unhover(button);
      await waitFor(() => {
        expect(screen.queryByText('Helpful info')).not.toBeInTheDocument();
      });
    });
  });

  describe('focus behavior', () => {
    it('shows tooltip on focus (keyboard)', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Focus me</button>
        </Tooltip>
      );

      await user.tab();
      expect(screen.getByRole('button')).toHaveFocus();
      await waitFor(() => {
        expect(screen.getByText('Helpful info')).toBeInTheDocument();
      });
    });

    it('hides tooltip on blur', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Focus me</button>
        </Tooltip>
      );

      const button = screen.getByRole('button');
      await user.click(button);
      await waitFor(() => {
        expect(screen.getByText('Helpful info')).toBeInTheDocument();
      });

      await user.tab();
      await waitFor(() => {
        expect(screen.queryByText('Helpful info')).not.toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('tooltip has role="tooltip"', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Hover me</button>
        </Tooltip>
      );

      await user.hover(screen.getByRole('button'));
      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
      });
    });

    it('trigger element has aria-describedby linkage', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Hover me</button>
        </Tooltip>
      );

      const button = screen.getByRole('button');
      await user.hover(button);
      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        const tooltipId = tooltip.getAttribute('id');
        expect(tooltipId).toBeTruthy();
        expect(button).toHaveAttribute('aria-describedby', tooltipId);
      });
    });
  });

  describe('keyboard interaction', () => {
    // WAI-ARIA tooltip pattern: Enter/Space belong to the wrapped control.
    // The tooltip must never capture them, or keyboard users lose activation
    // of every tooltip-wrapped button (e.g. the NavBar workspace tabs).
    it('Enter activates the wrapped control instead of being captured', async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button onClick={onActivate}>Trigger me</button>
        </Tooltip>
      );

      await user.tab();
      await user.keyboard('{Enter}');

      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('Space activates the wrapped control instead of being captured', async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button onClick={onActivate}>Trigger me</button>
        </Tooltip>
      );

      await user.tab();
      await user.keyboard(' ');

      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('preserves the wrapped control keyboard handlers', async () => {
      const user = userEvent.setup();
      const onKeyDown = vi.fn();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button onKeyDown={onKeyDown}>Trigger me</button>
        </Tooltip>
      );

      await user.tab();
      await user.keyboard('{ArrowDown}');

      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });

    it('Escape key closes tooltip', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Helpful info" delay={0}>
          <button>Trigger me</button>
        </Tooltip>
      );

      const button = screen.getByRole('button');
      await user.hover(button);
      await waitFor(() => {
        expect(screen.getByText('Helpful info')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByText('Helpful info')).not.toBeInTheDocument();
      });
    });
  });

  describe('custom props', () => {
    it('respects custom placement prop', async () => {
      const user = userEvent.setup();
      render(
        <Tooltip content="Bottom tooltip" placement="bottom" delay={0}>
          <button>Hover me</button>
        </Tooltip>
      );

      await user.hover(screen.getByRole('button'));
      await waitFor(() => {
        const tooltip = screen.getByText('Bottom tooltip');
        expect(tooltip).toBeInTheDocument();
      });
    });

    it('respects custom delay prop', async () => {
      const user = userEvent.setup();
      const customDelay = 500;

      render(
        <Tooltip content="Delayed info" delay={customDelay}>
          <button>Hover me</button>
        </Tooltip>
      );

      await user.hover(screen.getByRole('button'));

      // Should not show immediately
      expect(screen.queryByText('Delayed info')).not.toBeInTheDocument();

      // Wait for delay to pass
      await waitFor(
        () => {
          expect(screen.getByText('Delayed info')).toBeInTheDocument();
        },
        { timeout: customDelay + 100 }
      );
    });
  });
});
