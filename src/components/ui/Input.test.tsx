import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  afterEach(cleanup);

  it('renders with value and placeholder', () => {
    render(<Input value="test" placeholder="Enter text" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test');
    expect(input).toHaveAttribute('placeholder', 'Enter text');
  });

  it('calls onChange with correct value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'hello');
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          value: expect.any(String)
        })
      })
    );
    // Verify final value
    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('renders disabled state correctly', () => {
    render(<Input disabled placeholder="Disabled input" />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:opacity-50');
  });

  it('passes through type attribute (text, email, password, number)', () => {
    const { rerender, container } = render(<Input type="text" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text');

    rerender(<Input type="email" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');

    // Password inputs don't have 'textbox' role - query container directly
    rerender(<Input type="password" />);
    expect(container.querySelector('input[type="password"]')).toHaveAttribute('type', 'password');

    rerender(<Input type="number" />);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number');
  });

  it('applies autoFocus, required, and readOnly props', async () => {
    const user = userEvent.setup();
    render(<Input autoFocus required readOnly value="readonly value" />);
    const input = screen.getByRole('textbox');

    // autoFocus sets focus automatically (check via document.activeElement)
    expect(document.activeElement).toBe(input);
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveValue('readonly value');

    // Verify readOnly prevents typing
    await user.type(input, 'test');
    expect(input).toHaveValue('readonly value');
  });

  it('handles keyboard input correctly', async () => {
    const user = userEvent.setup();
    render(<Input defaultValue="" placeholder="Type here" />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'test input');

    expect(input).toHaveValue('test input');
  });

  it('renders label correctly when provided', () => {
    render(<Input label="Test Label" />);
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Test Label')).toHaveClass('text-label');
  });

  it('uses Carbon Pro accent styling for normal focus state', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('focus:border-accent-primary');
    expect(input).toHaveClass('focus:ring-accent-primary/35');
  });

  it('displays error message when error prop provided', () => {
    render(<Input error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByText('This field is required')).toHaveClass('text-red-primary');
  });

  it('displays helper text when helper prop provided', () => {
    render(<Input helper="Enter your email address" />);
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address')).toHaveClass('text-text-muted');
  });

  it('hides helper text when error is shown', () => {
    render(<Input helper="Helper text" error="Error message" />);
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.queryByText('Helper text')).not.toBeInTheDocument();
  });

  it('renders icon when icon prop provided', () => {
    const TestIcon = ({ className }: { className?: string }) => (
      <svg data-testid="input-icon" className={className} />
    );
    render(<Input icon={TestIcon} placeholder="With icon" />);

    expect(screen.getByTestId('input-icon')).toBeInTheDocument();
    expect(screen.getByTestId('input-icon')).toHaveClass('absolute');

    // Verify input has padding-left for icon
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('pl-10');
  });

  it('applies error border styling when error prop provided', () => {
    render(<Input error="Invalid input" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-red-primary');
  });

  it('maintains accessibility with aria attributes', () => {
    render(<Input label="Email" aria-label="Email address" aria-describedby="email-help" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-label', 'Email address');
    expect(input).toHaveAttribute('aria-describedby', 'email-help');
  });
});
