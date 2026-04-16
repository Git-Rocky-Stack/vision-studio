import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { EditPropertiesPanel } from './EditPropertiesPanel';

describe('EditPropertiesPanel', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('renders the initial adjustment tab without a runtime initialization error', () => {
    expect(() => render(<EditPropertiesPanel />)).not.toThrow();

    expect(screen.getByRole('tab', { name: /adjust/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('No layers')).not.toBeInTheDocument();
  });
});
