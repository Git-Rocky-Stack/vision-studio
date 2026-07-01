import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SecurityBadges } from './SecurityBadges';

describe('SecurityBadges', () => {
  afterEach(cleanup);

  it('renders warning + gated badges for a risky model', () => {
    render(
      <SecurityBadges record={{ format: 'pickle', trust_remote_code: true, gated: true, nsfw: true }} />,
    );
    expect(screen.getByTestId('badge-pickle')).toBeInTheDocument();
    expect(screen.getByTestId('badge-trust-remote-code')).toBeInTheDocument();
    expect(screen.getByTestId('badge-gated')).toBeInTheDocument();
    expect(screen.getByTestId('badge-nsfw')).toBeInTheDocument();
  });

  it('shows only the safetensors badge for a clean model', () => {
    render(
      <SecurityBadges record={{ format: 'safetensors', trust_remote_code: false, gated: false, nsfw: false }} />,
    );
    expect(screen.getByTestId('badge-safetensors')).toBeInTheDocument();
    expect(screen.queryByTestId('badge-pickle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-trust-remote-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge-nsfw')).not.toBeInTheDocument();
  });
});
