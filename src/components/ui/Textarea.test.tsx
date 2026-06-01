import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  afterEach(cleanup);

  it('renders with value and placeholder', () => {
    render(<Textarea readOnly value="test content" placeholder="Enter text" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('test content');
    expect(textarea).toHaveAttribute('placeholder', 'Enter text');
  });

  it('calls onChange with correct value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea onChange={onChange} />);

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
    render(<Textarea disabled placeholder="Disabled textarea" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveClass('disabled:opacity-50');
  });

  it('sets correct height with rows prop', () => {
    const { rerender } = render(<Textarea rows={3} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '3');

    rerender(<Textarea rows={10} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '10');
  });

  it('applies autoFocus, required, and readOnly props', async () => {
    const user = userEvent.setup();
    render(<Textarea autoFocus required readOnly value="readonly content" />);
    const textarea = screen.getByRole('textbox');

    // autoFocus sets focus automatically (check via document.activeElement)
    expect(document.activeElement).toBe(textarea);
    expect(textarea).toHaveAttribute('required');
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea).toHaveValue('readonly content');

    // Verify readOnly prevents typing
    await user.type(textarea, 'test');
    expect(textarea).toHaveValue('readonly content');
  });

  it('handles keyboard input with newlines', async () => {
    const user = userEvent.setup();
    render(<Textarea defaultValue="" placeholder="Type here" />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'line 1');
    await user.keyboard('{Enter}');
    await user.type(textarea, 'line 2');

    expect(textarea).toHaveValue('line 1\nline 2');
  });

  it('renders label correctly when provided and associates it with the textarea', () => {
    render(<Textarea label="Description" />);
    const label = screen.getByText('Description');
    const textarea = screen.getByRole('textbox');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('text-label');
    expect(label).toHaveAttribute('for');
    expect(label.getAttribute('for')).toBe(textarea.getAttribute('id'));
  });

  it('uses explicit id when provided and connects label', () => {
    render(<Textarea label="Bio" id="bio-input" />);
    const label = screen.getByText('Bio');
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('id', 'bio-input');
    expect(label).toHaveAttribute('for', 'bio-input');
  });

  it('auto-generates id for label association when no id provided', () => {
    render(<Textarea label="Notes" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('id');
    expect(textarea.getAttribute('id')).toBeTruthy();
    expect(screen.getByText('Notes').getAttribute('for')).toBe(textarea.getAttribute('id'));
  });

  it('uses Carbon Pro accent styling for normal focus state', () => {
    render(<Textarea />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('focus:border-accent-primary');
    expect(textarea).toHaveClass('focus:ring-accent-primary/35');
  });

  it('displays error message when error prop provided', () => {
    render(<Textarea error="Description is required" />);
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(screen.getByText('Description is required')).toHaveClass('text-status-error');
  });

  it('displays helper text when helper prop provided', () => {
    render(<Textarea helper="Max 500 characters" />);
    expect(screen.getByText('Max 500 characters')).toBeInTheDocument();
    expect(screen.getByText('Max 500 characters')).toHaveClass('text-text-muted');
  });

  it('hides helper text when error is shown', () => {
    render(<Textarea helper="Helper text" error="Error message" />);
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.queryByText('Helper text')).not.toBeInTheDocument();
  });

  it('applies resize-none class', () => {
    render(<Textarea />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('resize-none');
  });

  it('applies error border styling when error prop provided', () => {
    render(<Textarea error="Invalid input" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('border-status-error');
  });

  it('maintains accessibility with aria attributes', () => {
    render(<Textarea label="Comments" aria-label="Enter your comments" aria-describedby="comments-help" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('aria-label', 'Enter your comments');
    // aria-describedby composes: external ref + generated message ids
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toContain('comments-help');
  });

  it('associates error message via aria-describedby', () => {
    render(<Textarea error="Description is required" />);
    const textarea = screen.getByRole('textbox');
    const errorMsg = screen.getByText('Description is required');
    expect(textarea.getAttribute('aria-describedby')).toBe(errorMsg.getAttribute('id'));
  });

  it('associates helper text via aria-describedby', () => {
    render(<Textarea helper="Max 500 characters" />);
    const textarea = screen.getByRole('textbox');
    const helperMsg = screen.getByText('Max 500 characters');
    expect(textarea.getAttribute('aria-describedby')).toBe(helperMsg.getAttribute('id'));
  });

  it('prefers error aria-describedby over helper when both are provided', () => {
    render(<Textarea helper="Helper text" error="Error message" />);
    const textarea = screen.getByRole('textbox');
    const errorMsg = screen.getByText('Error message');
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toBe(errorMsg.getAttribute('id'));
    expect(screen.queryByText('Helper text')).not.toBeInTheDocument();
  });

  it('composes custom className with base styles', () => {
    render(<Textarea className="custom-class another-class" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('custom-class');
    expect(textarea).toHaveClass('another-class');
    expect(textarea).toHaveClass('bg-elevated');
    expect(textarea).toHaveClass('border-border');
  });
});
