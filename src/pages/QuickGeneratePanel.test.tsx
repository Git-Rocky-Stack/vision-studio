import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { QuickGeneratePanel } from './QuickGeneratePanel';

describe('QuickGeneratePanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  it('renders as a Carbon Pro inspector without legacy red primary chrome', () => {
    const { container } = render(<QuickGeneratePanel />);

    expect(screen.getByRole('heading', { name: 'Quick Generate' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prompt')).toHaveClass('focus:border-accent-primary');
    expect(screen.getByText('Model Router')).toBeInTheDocument();
    expect(container.querySelector('.text-red-primary, .bg-red-aura')).not.toBeInTheDocument();
  });
});
