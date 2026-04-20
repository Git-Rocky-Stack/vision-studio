import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { TemplateCreator } from './TemplateCreator';

describe('TemplateCreator', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('renders as an accessible modal dialog', () => {
    render(<TemplateCreator onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Create Template' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close template creator' })).toBeInTheDocument();
  });
});
