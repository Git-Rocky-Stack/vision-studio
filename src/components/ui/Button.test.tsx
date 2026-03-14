import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  afterEach(cleanup);
  it('renders children text', () => {
    render(<Button>Generate</Button>);
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);

    await user.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows loading state and disables interaction', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button isLoading onClick={onClick}>Submit</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Loading...');

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders an icon on the left by default', () => {
    const TestIcon = ({ className }: { className?: string }) => (
      <svg data-testid="test-icon" className={className} />
    );
    render(<Button icon={TestIcon}>With Icon</Button>);

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('With Icon');
  });

  it('renders an icon on the right when iconPosition is right', () => {
    const TestIcon = ({ className }: { className?: string }) => (
      <svg data-testid="test-icon" className={className} />
    );
    render(<Button icon={TestIcon} iconPosition="right">Right Icon</Button>);

    const button = screen.getByRole('button');
    const icon = screen.getByTestId('test-icon');
    // Icon should come after the text in DOM order
    expect(button.lastElementChild).toBe(icon);
  });

  it('applies fullWidth class when prop is set', () => {
    render(<Button fullWidth>Full Width</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });
});
