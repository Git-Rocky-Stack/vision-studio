import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChromeButton, Faceplate, Lcd, Led, MonoLabel } from './index';

describe('hardware primitives', () => {
  it('renders a MonoLabel with the .mono-label discipline class', () => {
    render(<MonoLabel>steps</MonoLabel>);
    const el = screen.getByText('steps');
    expect(el).toHaveClass('mono-label');
  });

  it('renders an LCD readout with its text content', () => {
    render(<Lcd color="play">FLUX.1-DEV</Lcd>);
    expect(screen.getByText('FLUX.1-DEV')).toBeInTheDocument();
  });

  it('renders a decorative LED as aria-hidden (not announced)', () => {
    const { container } = render(<Led color="rec" pulse />);
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot).not.toBeNull();
  });

  it('renders a ChromeButton with the vx-btn marker classes and click wiring', () => {
    render(<ChromeButton variant="chrome">generate</ChromeButton>);
    const btn = screen.getByRole('button', { name: 'generate' });
    expect(btn).toHaveClass('vx-btn');
    expect(btn).toHaveClass('vx-btn-chrome');
  });

  it('renders a Faceplate with its kicker and children', () => {
    render(
      <Faceplate kicker="GENERATE" stateLed="play" stateLabel="READY">
        <div>panel body</div>
      </Faceplate>
    );
    expect(screen.getByText('GENERATE')).toBeInTheDocument();
    expect(screen.getByText('READY')).toBeInTheDocument();
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });
});
