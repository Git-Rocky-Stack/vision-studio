import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

describe('Switch', () => {
  afterEach(cleanup);

  it('renders checked state correctly', () => {
    render(<Switch checked={true} onChange={() => {}} label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
    expect(switchEl).toHaveClass('bg-accent-primary');
  });

  it('renders unchecked state correctly', () => {
    render(<Switch checked={false} onChange={() => {}} label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
    expect(switchEl).toHaveClass('bg-surface');
    expect(switchEl).toHaveClass('border-border');
  });

  it('onChange callback fires on click with correct value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Toggle" />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles from checked to unchecked on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={true} onChange={onChange} label="Toggle" />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('keyboard activation works - Space key toggles state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Toggle" />);

    const switchEl = screen.getByRole('switch');
    switchEl.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keyboard activation works - Enter key toggles state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Toggle" />);

    const switchEl = screen.getByRole('switch');
    switchEl.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disabled state prevents interaction - click does not toggle', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Toggle" disabled />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled state renders with correct opacity and cursor', () => {
    render(<Switch checked={false} onChange={() => {}} label="Toggle" disabled />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveClass('opacity-40');
    expect(switchEl).toHaveClass('cursor-not-allowed');
  });

  it('aria-checked attribute reflects checked state', () => {
    const { rerender } = render(<Switch checked={true} onChange={() => {}} label="Toggle" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    rerender(<Switch checked={false} onChange={() => {}} label="Toggle" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('role="switch" attribute present', () => {
    render(<Switch checked={false} onChange={() => {}} label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeInTheDocument();
  });

  it('aria-label matches label prop', () => {
    render(<Switch checked={false} onChange={() => {}} label="Enable notifications" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('aria-label', 'Enable notifications');
  });

  it('focus ring appears on focus (focus-visible)', () => {
    render(<Switch checked={false} onChange={() => {}} label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveClass('focus-visible:outline-none');
    expect(switchEl).toHaveClass('focus-visible:ring-2');
    expect(switchEl).toHaveClass('focus-visible:ring-accent-primary');
  });

  it('label association works - clicking label toggles switch when wrapped', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <label>
        <Switch checked={false} onChange={onChange} label="Toggle" />
        <span>Toggle Option</span>
      </label>
    );

    const labelEl = container.querySelector('label');
    await user.click(labelEl!);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('composes custom className with base styles', () => {
    render(<Switch checked={false} onChange={() => {}} label="Toggle" className="custom-class" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveClass('custom-class');
    expect(switchEl).toHaveClass('w-9');
    expect(switchEl).toHaveClass('h-5');
  });
});
