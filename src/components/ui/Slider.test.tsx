import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Slider } from './Slider';

describe('Slider', () => {
  afterEach(cleanup);

  it('renders label and current value', () => {
    render(<Slider label="Steps" value={25} min={1} max={100} onChange={() => {}} />);

    expect(screen.getByText('Steps')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('25')).toHaveClass('text-accent-primary');
  });

  it('hides the value display when showValue is false', () => {
    render(<Slider label="Hidden Value" value={25} min={1} max={100} onChange={() => {}} showValue={false} />);

    expect(screen.getByText('Hidden Value')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Hidden Value' });
    expect(slider).toHaveAttribute('aria-valuenow', '25');
  });

  it('uses a custom value formatter', () => {
    render(
      <Slider
        label="Opacity"
        value={0.75}
        min={0}
        max={1}
        step={0.01}
        onChange={() => {}}
        valueFormatter={(v) => `${Math.round(v * 100)}%`}
      />
    );

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('exposes correct ARIA attributes', () => {
    render(<Slider label="CFG Scale" value={7.5} min={1} max={20} step={0.5} onChange={() => {}} />);

    const slider = screen.getByRole('slider', { name: 'CFG Scale' });
    expect(slider).toHaveAttribute('aria-valuemin', '1');
    expect(slider).toHaveAttribute('aria-valuemax', '20');
    expect(slider).toHaveAttribute('aria-valuenow', '7.5');
  });

  it('responds to ArrowRight keydown by incrementing the value', () => {
    const onChange = vi.fn();
    render(<Slider label="Increment Test" value={25} min={1} max={100} step={1} onChange={onChange} />);

    const slider = screen.getByRole('slider', { name: 'Increment Test' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith(26);
  });

  it('responds to ArrowLeft keydown by decrementing the value', () => {
    const onChange = vi.fn();
    render(<Slider label="Decrement Test" value={25} min={1} max={100} step={1} onChange={onChange} />);

    const slider = screen.getByRole('slider', { name: 'Decrement Test' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith(24);
  });

  it('clamps at min boundary', () => {
    const onChange = vi.fn();
    render(<Slider label="Min Clamp" value={1} min={1} max={100} step={1} onChange={onChange} />);

    const slider = screen.getByRole('slider', { name: 'Min Clamp' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('clamps at max boundary', () => {
    const onChange = vi.fn();
    render(<Slider label="Max Clamp" value={100} min={1} max={100} step={1} onChange={onChange} />);

    const slider = screen.getByRole('slider', { name: 'Max Clamp' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('jumps to min on Home key and max on End key', () => {
    const onChange = vi.fn();
    render(<Slider label="Home End Test" value={50} min={1} max={100} step={1} onChange={onChange} />);

    const slider = screen.getByRole('slider', { name: 'Home End Test' });

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(1);

    fireEvent.keyDown(slider, { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('displays min and max labels', () => {
    render(<Slider label="Range Display" value={50} min={5} max={95} onChange={() => {}} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();
  });
});
