import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('Carbon Pro design tokens', () => {
  it('defines the Carbon Pro primary accent and capability palette', () => {
    expect(css).toContain('--color-accent-primary: #d7ff3f');
    expect(css).toContain('--color-accent-primary-muted: rgba(215, 255, 63, 0.09)');
    expect(css).toContain('--color-capability-image:');
    expect(css).toContain('--color-capability-video:');
    expect(css).toContain('--color-capability-edit:');
    expect(css).toContain('--color-capability-local:');
    expect(css).toContain('--color-capability-cloud:');
  });

  it('keeps red as a status/error alias instead of the primary brand accent', () => {
    expect(css).toContain('--color-status-error: #ef4444');
    expect(css).toContain('--color-red-primary: var(--color-status-error)');
    expect(css).toContain('--color-red-aura: var(--color-status-error-muted)');
  });
});
