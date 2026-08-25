import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SecurityBadges } from './SecurityBadges';

describe('SecurityBadges', () => {
  afterEach(cleanup);

  it('renders warning + gated badges for a risky model', () => {
    render(
      <SecurityBadges record={{ format: 'pickle', trust_remote_code: true, gated: true, nsfw: true }} />,
    );
    expect(screen.getByTestId('badge-pickle')).toHaveTextContent('Pickle');
    expect(screen.getByTestId('badge-trust-remote-code')).toHaveTextContent('Remote code');
    expect(screen.getByTestId('badge-gated')).toHaveTextContent('Gated');
    expect(screen.getByTestId('badge-nsfw')).toHaveTextContent('NSFW');
  });

  // The tone is the security-carrying part of these badges: a pickle or
  // remote-code model rendered in the reassuring tone reads as safe at a glance
  // while executing code at load time. Presence alone cannot catch that.
  it('renders the code-execution risks in the warning tone, not the safe one', () => {
    render(
      <SecurityBadges record={{ format: 'pickle', trust_remote_code: true, gated: true, nsfw: true }} />,
    );
    expect(screen.getByTestId('badge-pickle')).toHaveClass('text-status-warning');
    expect(screen.getByTestId('badge-trust-remote-code')).toHaveClass('text-status-warning');
    expect(screen.getByTestId('badge-nsfw')).toHaveClass('text-status-warning');
    // Gated is licence friction, not a security risk - it must stay informational.
    expect(screen.getByTestId('badge-gated')).toHaveClass('text-text-body');
    expect(screen.getByTestId('badge-gated')).not.toHaveClass('text-status-warning');
  });

  it('shows only the safetensors badge for a clean model', () => {
    render(
      <SecurityBadges record={{ format: 'safetensors', trust_remote_code: false, gated: false, nsfw: false }} />,
    );
    expect(screen.getByTestId('badge-safetensors')).toHaveTextContent('Safetensors');
    expect(screen.getByTestId('badge-safetensors')).toHaveClass('text-text-muted');
    expect(screen.queryByTestId('badge-pickle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-trust-remote-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-nsfw')).not.toBeInTheDocument();
  });
});
