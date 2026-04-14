import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegionLockToolbar } from './RegionLockToolbar';
import type { RegionTool } from './RegionLockToolbar';

describe('RegionLockToolbar', () => {
  const defaultProps = {
    activeTool: 'rectangle' as RegionTool,
    brushSize: 20,
    isInverted: false,
    onToolChange: vi.fn(),
    onBrushSizeChange: vi.fn(),
    onInvertToggle: vi.fn(),
  };

  beforeEach(cleanup);

  it('renders all tool buttons', () => {
    render(<RegionLockToolbar {...defaultProps} />);
    expect(screen.getByLabelText(/select/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rectangle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lasso/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/brush/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/eraser/i)).toBeInTheDocument();
  });

  it('renders invert button', () => {
    render(<RegionLockToolbar {...defaultProps} />);
    expect(screen.getByLabelText('Invert mask')).toBeInTheDocument();
  });

  it('calls onToolChange when a tool is clicked', async () => {
    const onToolChange = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockToolbar {...defaultProps} onToolChange={onToolChange} />);
    await user.click(screen.getByLabelText(/lasso/i));
    expect(onToolChange).toHaveBeenCalledWith('polygon');
  });

  it('shows brush size controls when brush is active', () => {
    render(<RegionLockToolbar {...defaultProps} activeTool="brush" />);
    expect(screen.getByLabelText('Brush size')).toBeInTheDocument();
  });

  it('shows brush size controls when eraser is active', () => {
    render(<RegionLockToolbar {...defaultProps} activeTool="erase" />);
    expect(screen.getByLabelText('Brush size')).toBeInTheDocument();
  });

  it('hides brush size controls when rectangle is active', () => {
    render(<RegionLockToolbar {...defaultProps} activeTool="rectangle" />);
    expect(screen.queryByLabelText('Brush size')).not.toBeInTheDocument();
  });

  it('calls onBrushSizeChange when slider value changes', () => {
    const onBrushSizeChange = vi.fn();
    render(<RegionLockToolbar {...defaultProps} activeTool="brush" onBrushSizeChange={onBrushSizeChange} />);
    const slider = screen.getByLabelText('Brush size');
    fireEvent.change(slider, { target: { value: 50 } });
    expect(onBrushSizeChange).toHaveBeenCalledWith(50);
  });

  it('calls onInvertToggle when invert button is clicked', async () => {
    const onInvertToggle = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockToolbar {...defaultProps} onInvertToggle={onInvertToggle} />);
    await user.click(screen.getByLabelText('Invert mask'));
    expect(onInvertToggle).toHaveBeenCalledTimes(1);
  });

  it('shows active state on selected tool', () => {
    render(<RegionLockToolbar {...defaultProps} activeTool="rectangle" />);
    const rectBtn = screen.getByLabelText(/rectangle/i);
    expect(rectBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows active state on invert button when inverted', () => {
    render(<RegionLockToolbar {...defaultProps} isInverted={true} />);
    const invertBtn = screen.getByLabelText('Invert mask');
    expect(invertBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('displays current brush size', () => {
    render(<RegionLockToolbar {...defaultProps} activeTool="brush" brushSize={35} />);
    expect(screen.getByText('35px')).toBeInTheDocument();
  });

  it('has toolbar role and label', () => {
    render(<RegionLockToolbar {...defaultProps} />);
    expect(screen.getByRole('toolbar', { name: /region mask tools/i })).toBeInTheDocument();
  });
});