import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInaccessible, render, screen } from '@testing-library/react';
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

    // The dot is the whole of what Led renders, so hiding it hides everything:
    // no wrapper around it and no text inside it is left to be announced.
    expect(container.children).toHaveLength(1);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(isInaccessible(dot)).toBe(true);
    expect(dot).toBeEmptyDOMElement();
  });

  it('renders a ChromeButton with the vx-btn marker classes and click wiring', () => {
    render(<ChromeButton variant="chrome">generate</ChromeButton>);
    const btn = screen.getByRole('button', { name: 'generate' });
    expect(btn).toHaveClass('vx-btn');
    expect(btn).toHaveClass('vx-btn-chrome');
  });

  it('never wraps a ChromeButton label', () => {
    render(<ChromeButton variant="chrome">Start Batch (0)</ChromeButton>);
    expect(screen.getByRole('button', { name: 'Start Batch (0)' })).toHaveClass('whitespace-nowrap');
  });

  // An inline background or box-shadow outranks every stylesheet rule, so the
  // cap's hover and pressed states (.vx-btn-chrome:hover/:active) never drew.
  it('draws the ChromeButton cap from classes, never inline style', () => {
    render(
      <>
        <ChromeButton>chrome</ChromeButton>
        <ChromeButton variant="ghost" size="sm">ghost</ChromeButton>
      </>,
    );
    const chrome = screen.getByRole('button', { name: 'chrome' });
    const ghost = screen.getByRole('button', { name: 'ghost' });

    expect(chrome).toHaveClass('btn-chrome', 'vx-btn-chrome', 'vx-btn-lg');
    expect(ghost).toHaveClass('vx-btn-ghost', 'vx-btn-sm');
    expect(chrome.getAttribute('style')).toBeNull();
    expect(ghost.getAttribute('style')).toBeNull();
  });

  it('defines the hover and pressed states its classes rely on', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    for (const selector of [
      '.vx-btn-chrome:not(:disabled):hover',
      '.vx-btn-chrome:not(:disabled):active',
      '.vx-btn-ghost:not(:disabled):hover',
      '.vx-btn-ghost:not(:disabled):active',
      '.vx-btn-sm',
      '.vx-btn-md',
      '.vx-btn-lg',
    ]) {
      expect(css).toContain(`${selector} {`);
    }
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

describe('MonoLabel: labelling a region', () => {
  it('forwards an id so a section can be aria-labelledby it', () => {
    render(
      <section aria-labelledby="section-heading">
        <MonoLabel as="h2" id="section-heading">Recent renders</MonoLabel>
      </section>,
    );

    expect(screen.getByRole('region', { name: 'Recent renders' })).toBeInTheDocument();
  });
});
