import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelSelector } from './ModelSelector';

describe('ModelSelector', () => {
  afterEach(cleanup);

  it('renders selected model router metadata', () => {
    render(<ModelSelector value="flux-dev" generationType="image" onChange={vi.fn()} />);

    expect(screen.getByText('FLUX.1 [dev]')).toBeInTheDocument();
    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('BYOM')).toBeInTheDocument();
    expect(screen.getByText(/Import required/)).toBeInTheDocument();
  });

  it('shows video profiles and keeps existing model ids on select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ModelSelector value="ltx-video" generationType="video" onChange={onChange} />);

    await user.click(screen.getByTestId('model-selector-trigger'));
    expect(screen.getByText('Video routing')).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /AnimateDiff/i }));

    expect(onChange).toHaveBeenCalledWith('animatediff');
  });
});
